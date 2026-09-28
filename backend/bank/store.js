const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const OWNER_MARKER = 'unitally-bank-store-lock-v1';
const initialState = () => ({ version: 1, sessions: {}, usage: {} });
function storeError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}
function validState(state) {
  return state && typeof state === 'object' && !Array.isArray(state) && state.version === 1 &&
    state.sessions && typeof state.sessions === 'object' && !Array.isArray(state.sessions) &&
    state.usage && typeof state.usage === 'object' && !Array.isArray(state.usage);
}

// One JSON file, many local Node processes. Every writer must use this store.
// The atomic directory lock is fail-closed; no timeout permits stealing a live lock.
function createBankStore(filePath, { fsImpl = fs } = {}) {
  const io = fsImpl;
  const resolved = filePath ? path.resolve(filePath) : null;
  let state = initialState();
  let hasPersisted = false;
  const diagnostics = { storage: resolved ? 'local-json-atomic-replace' : 'memory', lastCommitAt: null,
    fileFsync: Boolean(resolved), directoryFsync: process.platform === 'win32' ? 'unsupported-on-windows' : 'not-yet-attempted', warnings: [] };
  function warn(code) {
    diagnostics.warnings = [...new Set([...diagnostics.warnings, code])].slice(-8);
  }
  function load() {
    if (!resolved) return structuredClone(state);
    let text;
    try { text = io.readFileSync(resolved, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT' && !hasPersisted) return initialState();
      throw storeError(error.code === 'ENOENT' ? 'STORE_MISSING' : 'STORE_READ_FAILED', '演示账户数据暂时无法读取，已停止操作；不会自动重建或清空历史。');
    }
    let loaded;
    try { loaded = JSON.parse(text); }
    catch { throw storeError('STORE_CORRUPT', '演示账户数据格式损坏，已停止操作；请保留原文件恢复，不能自动清空。'); }
    if (!validState(loaded)) throw storeError('STORE_CORRUPT', '演示账户数据结构不受支持，已停止操作；不会覆盖原文件。');
    hasPersisted = true;
    return loaded;
  }
  function release(lock) {
    // Only the process that owns this random filename may unlink it. If unlink
    // fails, do not remove the directory (it may now belong to another owner).
    try { io.unlinkSync(lock.ownerFile); }
    catch { warn('LOCK_RELEASE_REQUIRES_ATTENTION'); return; }
    try { io.rmdirSync(lock.directory); }
    catch { warn('LOCK_RELEASE_REQUIRES_ATTENTION'); }
  }
  function recoverDeadOwner(directory) {
    // A corrupt or empty lock is ambiguous (including a crash while acquiring).
    // Leave it untouched for inspection instead of guessing who owns it.
    let names; let owner; let ownerFile;
    try {
      const stat = io.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
      names = io.readdirSync(directory);
      if (names.length !== 1 || !/^owner-\d+-[a-f0-9-]{36}\.json$/.test(names[0])) return false;
      ownerFile = path.join(directory, names[0]);
      const ownerStat = io.lstatSync(ownerFile);
      if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.size > 4096) return false;
      owner = JSON.parse(io.readFileSync(ownerFile, 'utf8'));
    } catch { return false; }
    if (owner.marker !== OWNER_MARKER || owner.filePath !== resolved || owner.hostname !== os.hostname() ||
        !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.nonce !== 'string' ||
        names[0] !== `owner-${owner.pid}-${owner.nonce}.json`) return false;
    try { process.kill(owner.pid, 0); return false; }
    catch (error) { if (error.code !== 'ESRCH') return false; }
    // Unique-filename unlink is our recovery claim. Competing recoverers that
    // lose it must not rmdir a directory which a new writer might have acquired.
    try { io.unlinkSync(ownerFile); }
    catch { return false; }
    try { io.rmdirSync(directory); warn('DEAD_PROCESS_LOCK_RECOVERED'); return true; }
    catch { return false; }
  }
  function acquire() {
    io.mkdirSync(path.dirname(resolved), { recursive: true });
    const directory = `${resolved}.lock`;
    const nonce = randomUUID();
    const ownerFile = path.join(directory, `owner-${process.pid}-${nonce}.json`);
    let acquired = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { io.mkdirSync(directory, { mode: 0o700 }); acquired = true; break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw storeError('STORE_LOCK_FAILED', '无法取得账户存储锁，未执行本次变更。');
        if (attempt !== 0 || !recoverDeadOwner(directory)) break;
      }
    }
    if (!acquired) throw storeError('STORE_BUSY', '账户存储正在被另一进程使用，或锁归属无法确认；本次操作未执行，请稍后查询状态。', 409);
    try {
      io.writeFileSync(ownerFile, JSON.stringify({ marker: OWNER_MARKER, pid: process.pid, nonce, hostname: os.hostname(), filePath: resolved, createdAt: Date.now() }), { flag: 'wx', mode: 0o600 });
    } catch {
      // We acquired this directory; only remove our own partial owner file.
      try { io.unlinkSync(ownerFile); } catch { /* It may never have been created. */ }
      try { io.rmdirSync(directory); } catch { /* Keep uncertain state locked. */ }
      throw storeError('STORE_LOCK_FAILED', '无法写入账户存储锁标识，未执行本次变更。');
    }
    return { directory, ownerFile };
  }
  function flushDirectory() {
    // Node/Windows does not expose a portable fsync on directory handles. The
    // data file is fsynced before rename; no claim of full power-loss durability.
    if (process.platform === 'win32') return;
    let descriptor;
    try { descriptor = io.openSync(path.dirname(resolved), 'r'); io.fsyncSync(descriptor); diagnostics.directoryFsync = 'completed'; }
    catch { diagnostics.directoryFsync = 'failed'; warn('DIRECTORY_FSYNC_FAILED_AFTER_COMMIT'); }
    finally { if (descriptor !== undefined) try { io.closeSync(descriptor); } catch { warn('DIRECTORY_CLOSE_FAILED_AFTER_COMMIT'); } }
  }
  state = load();
  return {
    read() { state = load(); return structuredClone(state); },
    diagnostics: () => structuredClone(diagnostics),
    transact(fn) {
      const lock = resolved ? acquire() : null;
      let temporary; let descriptor;
      try {
        // Reload only after owning the lock. A prior read or another store
        // instance's snapshot must never overwrite a more recent commit.
        const draft = load();
        const result = fn(draft);
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).catch(() => {}); // Avoid an unrelated unhandled rejection after refusing the transaction.
          throw storeError('ASYNC_TRANSACTION_REJECTED', '存储事务必须同步完成，本次变更未提交。', 500);
        }
        const safeResult = structuredClone(result); // Fail BEFORE commit if invalid.
        if (!validState(draft)) throw storeError('STORE_INVALID_STATE', '变更将破坏账户数据结构，已拒绝提交。', 500);
        const committedState = structuredClone(draft);
        if (resolved) {
          const encoded = JSON.stringify(committedState);
          temporary = `${resolved}.txn-${process.pid}-${randomUUID()}.tmp`;
          descriptor = io.openSync(temporary, 'wx', 0o600);
          io.writeFileSync(descriptor, encoded, 'utf8');
          io.fsyncSync(descriptor);
          io.closeSync(descriptor); descriptor = undefined;
          io.renameSync(temporary, resolved); // The single logical commit point.
          temporary = undefined; hasPersisted = true;
          // No throwing operations after commit: callers must not retry a
          // completed transfer because cleanup/directory flush was unsuccessful.
          flushDirectory();
        }
        state = committedState;
        diagnostics.lastCommitAt = Date.now();
        return safeResult;
      } finally {
        if (descriptor !== undefined) try { io.closeSync(descriptor); } catch { warn('TEMP_CLOSE_FAILED'); }
        if (temporary) try { io.unlinkSync(temporary); } catch { warn('TEMP_CLEANUP_REQUIRES_ATTENTION'); }
        if (lock) release(lock);
      }
    },
  };
}
module.exports = { createBankStore };
