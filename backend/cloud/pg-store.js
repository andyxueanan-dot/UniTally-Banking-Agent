const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { requireDatabaseUrl } = require('./migrate');
const MAX_BYTES = 8 * 1024 * 1024;
function failure(code) {
  return Object.assign(new Error('云端账本暂不可用，请查询原任务状态；不要重复创建付款。未返回成功回执。'), { code, status: code === 'STORE_BUSY' ? 409 : 503 });
}
function valid(s) { return s?.version === 1 && s.sessions && typeof s.sessions === 'object' && !Array.isArray(s.sessions) && s.usage && typeof s.usage === 'object' && !Array.isArray(s.usage); }
function createPgStore({ connectionString, key = 'bank-state' }) {
  requireDatabaseUrl(connectionString);
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(key)) throw Error('Invalid state namespace');
  const worker = new Worker(path.join(__dirname, 'pg-worker.js'), { workerData: { connectionString, key }, env: {} });
  let closed = false; let active = false;
  worker.on('error', () => { closed = true; });
  function call(op, payload) {
    if (closed) throw failure('STORE_CLOSED');
    const buffer = new SharedArrayBuffer(MAX_BYTES + 8); const flags = new Int32Array(buffer, 0, 2);
    worker.postMessage({ op, payload, buffer });
    if (Atomics.wait(flags, 0, 0, 30000) === 'timed-out') {
      closed = true; void worker.terminate(); throw failure('STORE_OUTCOME_UNKNOWN');
    }
    const response = JSON.parse(Buffer.from(new Uint8Array(buffer, 8, Atomics.load(flags, 1))).toString());
    if (!response.ok) throw failure(response.code === '55P03' ? 'STORE_BUSY' : response.code);
    return response.value;
  }
  try { call('init'); } catch (e) { closed = true; void worker.terminate(); throw e; }
  return {
    read() { const value = call('read'); if (!valid(value)) throw failure('STORE_INVALID_STATE'); return value; },
    diagnostics: () => ({ storage: 'postgres-row-locked-json', smallTeamOnly: true, maximumStateBytes: MAX_BYTES }),
    transact(fn) {
      if (active) throw failure('NESTED_TRANSACTION_REJECTED');
      active = true;
      let began = false;
      try {
        const state = call('begin'); began = true;
        if (!valid(state)) throw failure('STORE_INVALID_STATE');
        const result = fn(state);
        if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw failure('ASYNC_TRANSACTION_REJECTED'); }
        const safe = structuredClone(result);
        if (!valid(state)) throw failure('STORE_INVALID_STATE');
        if (Buffer.byteLength(JSON.stringify(state)) > MAX_BYTES - 1024) throw failure('STORE_SIZE_LIMIT');
        call('commit', state); began = false;
        return safe;
      } catch (e) { if (began && !closed) try { call('rollback'); } catch { /* Preserve original error. */ } throw e; }
      finally { active = false; }
    },
    close() { if (!closed) { try { call('close'); } finally { closed = true; void worker.terminate(); } } },
  };
}
function persistentSessions(store, passwordVersion) {
  const load = () => store.read().sessions;
  const owned = key => passwordVersion + ':' + key;
  return {
    get size() { return Object.keys(load()).filter(k => k.startsWith(passwordVersion + ':')).length; },
    has(key) { return Object.hasOwn(load(), owned(key)); },
    set(key, value) { store.transact(s => { s.sessions[owned(key)] = value; }); },
    delete(key) { store.transact(s => { delete s.sessions[owned(key)]; }); },
    *[Symbol.iterator]() { for (const [key,value] of Object.entries(load())) { if (key.startsWith(passwordVersion + ':')) yield [key.slice(passwordVersion.length + 1),value]; } },
  };
}
module.exports = { createPgStore, persistentSessions };
