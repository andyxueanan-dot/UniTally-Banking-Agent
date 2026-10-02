const { parentPort, workerData } = require('node:worker_threads');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { eq, sql } = require('drizzle-orm');
const { appState } = require('./schema');
const pool = new Pool({ connectionString: workerData.connectionString, max: 1, connectionTimeoutMillis: 12000, query_timeout: 15000, idleTimeoutMillis: 10000 });
pool.on('error', () => {}); // Never log provider details/credentials.
let client;
async function command(op, payload) {
  if (op === 'init') {
    await drizzle(pool).insert(appState).values({ key: workerData.key, payload: { version: 1, sessions: {}, usage: {} } }).onConflictDoNothing(); return true;
  }
  if (op === 'read') {
    const [row] = await drizzle(pool).select().from(appState).where(eq(appState.key, workerData.key));
    if (!row) throw Object.assign(Error(), { code: 'STORE_MISSING' });
    return row.payload;
  }
  if (op === 'begin') {
    if (client) throw Error('Nested transaction');
    client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      const [row] = await drizzle(client).select().from(appState).where(eq(appState.key, workerData.key)).for('update');
      if (!row) throw Object.assign(Error(), { code: 'STORE_MISSING' });
      return row.payload;
    } catch (e) { await rollback(); throw e; }
  }
  if (op === 'commit') {
    if (!client) throw Error('No transaction');
    let committed = false;
    try {
      await drizzle(client).update(appState).set({ payload, revision: sql`${appState.revision} + 1` }).where(eq(appState.key, workerData.key));
      await client.query('COMMIT'); committed = true; return true;
    } finally { client.release(!committed); client = undefined; }
  }
  if (op === 'rollback') { await rollback(); return true; }
  if (op === 'close') { await rollback(); await pool.end(); return true; }
  throw Error('Unknown operation');
}
async function rollback() {
  if (!client) return;
  try { await client.query('ROLLBACK'); } finally { client.release(true); client = undefined; }
}
parentPort.on('message', async ({ op, payload, buffer }) => {
  const flags = new Int32Array(buffer, 0, 2); const output = new Uint8Array(buffer, 8);
  let response;
  try { response = { ok: true, value: await command(op, payload) }; }
  catch (e) {
    try { await rollback(); } catch { /* Connection failure: no positive receipt. */ }
    response = { ok: false, code: ['55P03','STORE_MISSING'].includes(e.code) ? e.code : 'STORE_UNAVAILABLE' };
  }
  let bytes = Buffer.from(JSON.stringify(response));
  if (bytes.length > output.length) bytes = Buffer.from(JSON.stringify({ ok: false, code: 'STORE_SIZE_LIMIT' }));
  output.set(bytes); Atomics.store(flags, 1, bytes.length); Atomics.store(flags, 0, 1); Atomics.notify(flags, 0);
});
