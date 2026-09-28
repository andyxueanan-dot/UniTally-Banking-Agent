const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createBankStore } = require('../bank/store');
const storeModule = require.resolve('../bank/store');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-store-quality-'));
  const file = path.join(directory, 'state.json');
  const store = createBankStore(file);
  store.transact(db => { db.sessions.test = { balance: 1000, receipts: [] }; });
  return { directory, file, store };
}
function child(script, args = []) {
  const result = spawnSync(process.execPath, ['-e', script, storeModule, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.error, undefined, String(result.error));
  return result;
}

test('two long-lived store instances reload within the transaction and cannot overwrite committed money', () => {
  const { file, store: first } = fixture(); const second = createBankStore(file);
  first.transact(db => { db.sessions.test.balance -= 100; db.sessions.test.receipts.push('A'); });
  second.transact(db => { db.sessions.test.balance -= 200; db.sessions.test.receipts.push('B'); });
  assert.equal(first.read().sessions.test.balance, 700);
  assert.deepEqual(second.read().sessions.test.receipts, ['A', 'B']);
});
test('transactions across independent processes preserve both commits and refresh old readers', () => {
  const { file, store } = fixture();
  const result = child(`const {createBankStore}=require(process.argv[1]);const s=createBankStore(process.argv[2]);s.transact(db=>{db.sessions.test.balance-=100;db.sessions.test.receipts.push('child');});`, [file]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(store.read().sessions.test.balance, 900);
  store.transact(db => { db.sessions.test.balance -= 200; db.sessions.test.receipts.push('parent'); });
  assert.equal(createBankStore(file).read().sessions.test.balance, 700);
  assert.deepEqual(store.read().sessions.test.receipts, ['child', 'parent']);
});
test('nested writer cannot steal a live same-process lock or partially commit', () => {
  const { file, store } = fixture(); const second = createBankStore(file);
  store.transact(db => {
    db.sessions.test.balance -= 100;
    assert.throws(() => second.transact(other => { other.sessions.test.balance -= 900; }), { code: 'STORE_BUSY' });
    assert.equal(second.read().sessions.test.balance, 1000);
  });
  assert.equal(second.read().sessions.test.balance, 900);
});
test('a live child-process lock fails closed and releases without killing any process', async () => {
  const { file, store, directory } = fixture(); const releaseFile = path.join(directory, 'release-signal');
  const code = `const fs=require('node:fs');const {createBankStore}=require(process.argv[1]);const s=createBankStore(process.argv[2]);s.transact(db=>{process.send('locked');const end=Date.now()+10000;while(!fs.existsSync(process.argv[3])&&Date.now()<end)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);db.sessions.test.balance-=100;});`;
  const running = spawn(process.execPath, ['-e', code, storeModule, file, releaseFile], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  const exited = once(running, 'exit');
  try {
    const [message] = await once(running, 'message'); assert.equal(message, 'locked');
    assert.throws(() => store.transact(db => { db.sessions.test.balance = 0; }), { code: 'STORE_BUSY' });
    assert.equal(store.read().sessions.test.balance, 1000);
  } finally { fs.writeFileSync(releaseFile, 'release'); }
  const [exit] = await exited; assert.equal(exit, 0); assert.equal(store.read().sessions.test.balance, 900);
});
test('a verified dead process lock is recovered without replaying its incomplete mutation', () => {
  const { file, store } = fixture();
  const result = child(`const {createBankStore}=require(process.argv[1]);createBankStore(process.argv[2]).transact(db=>{db.sessions.test.balance=0;process.exit(23);});`, [file]);
  assert.equal(result.status, 23); assert.ok(fs.existsSync(`${file}.lock`));
  assert.equal(store.read().sessions.test.balance, 1000);
  store.transact(db => { db.sessions.test.balance -= 100; });
  assert.equal(store.read().sessions.test.balance, 900); assert.equal(fs.existsSync(`${file}.lock`), false);
  assert.ok(store.diagnostics().warnings.includes('DEAD_PROCESS_LOCK_RECOVERED'));
});
test('empty, malformed, and foreign locks are never guessed stale or deleted', () => {
  for (const variant of ['empty', 'malformed', 'foreign']) {
    const { file, store } = fixture(); const lock = `${file}.lock`; fs.mkdirSync(lock);
    if (variant !== 'empty') fs.writeFileSync(path.join(lock, 'owner-99999999-00000000-0000-0000-0000-000000000000.json'), variant === 'malformed' ? '{bad' : JSON.stringify({ marker: 'another-tool', pid: 99999999 }));
    const before = fs.readdirSync(lock);
    assert.throws(() => store.transact(db => { db.sessions.test.balance = 0; }), { code: 'STORE_BUSY' });
    assert.deepEqual(fs.readdirSync(lock), before); assert.equal(store.read().sessions.test.balance, 1000);
  }
});
test('crash after temp fsync but before rename keeps old committed data and never promotes the orphan', () => {
  const { file, store, directory } = fixture();
  const result = child(`const fs=require('node:fs');const {createBankStore}=require(process.argv[1]);const io={...fs,renameSync(){process.exit(24);}};createBankStore(process.argv[2],{fsImpl:io}).transact(db=>{db.sessions.test.balance=0;});`, [file]);
  assert.equal(result.status, 24); assert.equal(store.read().sessions.test.balance, 1000);
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 1);
  store.transact(db => { db.sessions.test.balance -= 100; });
  assert.equal(store.read().sessions.test.balance, 900);
});
test('crash immediately after atomic replacement exposes the committed result on restart', () => {
  const { file, store } = fixture();
  const result = child(`const fs=require('node:fs');const {createBankStore}=require(process.argv[1]);const io={...fs,renameSync(from,to){fs.renameSync(from,to);process.exit(25);}};createBankStore(process.argv[2],{fsImpl:io}).transact(db=>{db.sessions.test.balance-=100;db.sessions.test.receipts.push('committed');});`, [file]);
  assert.equal(result.status, 25); assert.equal(store.read().sessions.test.balance, 900);
  assert.deepEqual(store.read().sessions.test.receipts, ['committed']);
  store.transact(db => { db.sessions.test.receipts.push('checked'); });
  assert.deepEqual(store.read().sessions.test.receipts, ['committed', 'checked']);
});
test('failed file flush or rename rolls back without leaving a half-updated state', () => {
  for (const method of ['fsyncSync', 'renameSync']) {
    const { file, store, directory } = fixture();
    const io = { ...fs, [method]() { throw Object.assign(new Error('injected failure'), { code: 'EIO' }); } };
    const failing = createBankStore(file, { fsImpl: io });
    assert.throws(() => failing.transact(db => { db.sessions.test.balance = 0; }), { code: 'EIO' });
    assert.equal(store.read().sessions.test.balance, 1000); assert.equal(fs.existsSync(`${file}.lock`), false);
    assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp')), false);
  }
});
test('post-commit lock cleanup failure warns rather than falsely reporting rollback', () => {
  const { file, store } = fixture();
  let ownerFile;
  const io = { ...fs, unlinkSync(target) { if (target.includes('.lock')) { ownerFile = target; throw Object.assign(new Error('injected cleanup failure'), { code: 'EACCES' }); } return fs.unlinkSync(target); } };
  const warningStore = createBankStore(file, { fsImpl: io });
  const result = warningStore.transact(db => { db.sessions.test.balance -= 100; return { committed: true }; });
  assert.deepEqual(result, { committed: true }); assert.equal(store.read().sessions.test.balance, 900);
  assert.ok(warningStore.diagnostics().warnings.includes('LOCK_RELEASE_REQUIRES_ATTENTION'));
  assert.throws(() => store.transact(() => null), { code: 'STORE_BUSY' });
  // This test created the retained lock in its own temporary fixture.
  fs.unlinkSync(ownerFile); fs.rmdirSync(`${file}.lock`);
});
test('uncloneable result, async callback, and mutation errors fail before the commit point', () => {
  const { file, store } = fixture();
  assert.throws(() => store.transact(db => { db.sessions.test.balance = 0; return () => null; }), { name: 'DataCloneError' });
  assert.throws(() => store.transact(async db => { db.sessions.test.balance = 0; }), { code: 'ASYNC_TRANSACTION_REJECTED' });
  assert.throws(() => store.transact(async () => { throw new Error('refused async failure'); }), { code: 'ASYNC_TRANSACTION_REJECTED' });
  assert.throws(() => store.transact(db => { db.sessions.test.balance = 0; throw new Error('rollback'); }), /rollback/);
  assert.equal(store.read().sessions.test.balance, 1000); assert.equal(fs.existsSync(`${file}.lock`), false);
});
test('corrupt or missing committed files are not silently reset or overwritten', () => {
  const { file, store } = fixture(); fs.writeFileSync(file, '{broken');
  assert.throws(() => store.read(), { code: 'STORE_CORRUPT' });
  assert.throws(() => store.transact(() => null), { code: 'STORE_CORRUPT' }); assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  fs.unlinkSync(file);
  assert.throws(() => store.read(), { code: 'STORE_MISSING' }); assert.throws(() => store.transact(() => null), { code: 'STORE_MISSING' });
});
test('read and result are independent snapshots, with honest Windows durability diagnostics', () => {
  const { store } = fixture(); const copy = store.read(); copy.sessions.test.balance = 0;
  assert.equal(store.read().sessions.test.balance, 1000);
  const result = store.transact(db => db.sessions.test); result.balance = 0;
  assert.equal(store.read().sessions.test.balance, 1000);
  assert.equal(store.diagnostics().fileFsync, true);
  if (process.platform === 'win32') assert.equal(store.diagnostics().directoryFsync, 'unsupported-on-windows');
});
test('memory store does not expose its committed state through escaped callback references', () => {
  const store = createBankStore(); let escaped;
  store.transact(db => { db.sessions.test = { balance: 1000 }; escaped = db; });
  escaped.sessions.test.balance = 0;
  assert.equal(store.read().sessions.test.balance, 1000);
});
