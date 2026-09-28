const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, createHash, sign } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const realSdk = require('@simplewebauthn/server');
const { isoCBOR } = require('@simplewebauthn/server/helpers');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { createBankApp } = require('../bank-server');
const hash = value => createHash('sha256').update(value).digest();
const b64 = value => Buffer.from(value).toString('base64url');
const ORIGIN = 'http://localhost:5091';

// An ephemeral software test device, not a real person's platform credential.
function softwareDevice() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }); const rawId = randomBytes(16); const id = b64(rawId);
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]));
  const client = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
  function auth(flags, counter) { const count = Buffer.alloc(4); count.writeUInt32BE(counter); return Buffer.concat([hash('localhost'), Buffer.from([flags]), count]); }
  return {
    id,
    register(options) {
      const size = Buffer.alloc(2); size.writeUInt16BE(rawId.length);
      const authData = Buffer.concat([auth(0x45, 0), Buffer.alloc(16), size, rawId, Buffer.from(cose)]);
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(client('webauthn.create', options.challenge)),
        transports: ['internal'], attestationObject: b64(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]))) } };
    },
    authenticate(options, counter = 1, corrupt = false) {
      const authData = auth(5, counter); const data = client('webauthn.get', options.challenge);
      const signature = sign('sha256', Buffer.concat([authData, hash(data)]), privateKey); if (corrupt) signature[signature.length - 1] ^= 1;
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(data), authenticatorData: b64(authData), signature: b64(signature), userHandle: null } };
    },
  };
}
function fixture(options = {}) {
  let time = Date.parse('2026-09-26T10:00:00Z'); let actions = [];
  const sdk = { ...realSdk, ...options.sdk };
  const store = options.store || createBankStore();
  const planner = { configured: true, model: 'test-only-no-AI', plan: async () => ({ actions, question: '', meta: { mode: 'test' } }) };
  const now = () => time;
  const service = new BankService({ store, planner, now, passkeySdk: sdk, ...options });
  const { token } = service.create(); const device = softwareDevice();
  return { sdk, service, store, token, device, planner, now,
    tick: ms => { time += ms; },
    setActions: next => { actions = next; },
    task: () => service.get(token).tasks[0],
    internal: () => Object.values(store.read().sessions)[0],
    prepare: async (action = { type: 'freeze_card', cardLast4: '8806' }) => service.prepareManual(token, action),
    async enroll() {
      const registration = await service.passkeyRegistrationOptions(token);
      const result = await service.passkeyRegistrationVerify(token, { response: device.register(registration.options) });
      assert.equal(result.registered, true); return result;
    },
  };
}
async function ready(options) { const f = fixture(options); await f.enroll(); await f.prepare(); const challenge = await f.service.passkeyOptions(f.token, f.task().id); return { ...f, challenge }; }

test('real signed registration enables passkey and sensitive execution shares normal business transaction', async () => {
  const f = await ready(); const taskId = f.task().id;
  const result = await f.service.passkeyConfirm(f.token, taskId, { confirmed: true, response: f.device.authenticate(f.challenge.options) });
  assert.equal(result.task.status, 'SUCCEEDED'); assert.equal(result.state.cards[0].status, 'FROZEN');
  assert.equal(result.task.verificationMethod, 'passkey'); assert.equal(f.internal().passkeyCredential.counter, 1);
  assert.equal(f.internal().tasks[0].passkeyPending, undefined);
});
test('registered session cannot downgrade via old OTP, challenge endpoint or client verified flag', async () => {
  const f = fixture(); await f.prepare(); const taskId = f.task().id; const oldOtp = f.service.challenge(f.token, taskId);
  await f.enroll(); assert.equal(f.internal().tasks[0].challenge, undefined);
  assert.throws(() => f.service.challenge(f.token, taskId), { code: 'PASSKEY_REQUIRED' });
  const denied = f.service.confirm(f.token, taskId, { confirmed: true, code: oldOtp.demoCode, verified: true, authentication: 'passkey' });
  assert.equal(denied.error.code, 'PASSKEY_REQUIRED'); assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE');
});
test('unregistered sessions retain explicit demo OTP while yellow actions do not demand passkeys', async () => {
  const f = fixture(); await f.prepare(); const task = f.task(); const otp = f.service.challenge(f.token, task.id);
  assert.equal(f.service.confirm(f.token, task.id, { confirmed: true, code: otp.demoCode }).task.verificationMethod, 'demo_otp');
  await f.enroll(); await f.prepare({ type: 'transfer', recipient: '王明', amount: '200' });
  assert.equal(f.service.confirm(f.token, f.task().id, { confirmed: true }).task.verificationMethod, 'explicit_confirmation');
});
test('public state and health expose summary only, never credential key or pending challenge', async () => {
  const f = await ready(); const state = f.service.get(f.token);
  assert.deepEqual(state.auth, { mode: 'passkey', canRegister: false, origin: ORIGIN });
  const serialized = JSON.stringify({ state, health: f.service.metadata() });
  assert.ok(!serialized.includes(f.internal().passkeyCredential.publicKey)); assert.ok(!serialized.includes(f.challenge.options.challenge));
  assert.ok(!serialized.includes('passkeyPending')); assert.ok(!serialized.includes('passkeyCredential'));
});
test('parallel confirmations of one signed challenge execute and increment counter only once', async () => {
  const f = await ready(); const body = { confirmed: true, response: f.device.authenticate(f.challenge.options) };
  const results = await Promise.all([f.service.passkeyConfirm(f.token, f.task().id, body), f.service.passkeyConfirm(f.token, f.task().id, body)]);
  assert.equal(results.filter(r => r.idempotent).length, 1); assert.equal(f.internal().passkeyCredential.counter, 1);
  assert.equal(f.internal().audit.filter(a => a.event === 'EXECUTION_SUCCEEDED').length, 1);
});
test('registration is one-time and a concurrent replay cannot replace the credential', async () => {
  const f = fixture(); const registration = await f.service.passkeyRegistrationOptions(f.token); const body = { response: f.device.register(registration.options) };
  const results = await Promise.allSettled([f.service.passkeyRegistrationVerify(f.token, body), f.service.passkeyRegistrationVerify(f.token, body)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.internal().passkeyCredential.id, f.device.id);
  await assert.rejects(f.service.passkeyRegistrationOptions(f.token), { code: 'PASSKEY_ALREADY_REGISTERED' });
  await assert.rejects(f.service.passkeyRegistrationVerify(f.token, body), { code: 'PASSKEY_ALREADY_REGISTERED' });
});
test('options generation CAS rejects old task after a new chat arrives during await', async () => {
  const f = fixture(); await f.enroll(); await f.prepare(); const old = f.task();
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.sdk.generateAuthenticationOptions = async options => { await gate; return realSdk.generateAuthenticationOptions(options); };
  const generating = f.service.passkeyOptions(f.token, old.id);
  f.setActions([{ type: 'balance' }]); await f.service.chat(f.token, { text: '查询余额' }); release();
  await assert.rejects(generating, { code: 'TASK_NOT_ACTIONABLE' }); assert.equal(f.internal().tasks[0].passkeyPending, undefined);
});
test('signature validation CAS rejects task cancellation or replacement during await', async () => {
  for (const mode of ['cancel', 'new_intent']) {
    const f = await ready(); const old = f.task(); let release;
    const gate = new Promise(resolve => { release = resolve; });
    f.sdk.verifyAuthenticationResponse = async options => { await gate; return realSdk.verifyAuthenticationResponse(options); };
    const confirming = f.service.passkeyConfirm(f.token, old.id, { confirmed: true, response: f.device.authenticate(f.challenge.options) });
    if (mode === 'cancel') f.service.cancel(f.token, old.id);
    else { f.setActions([{ type: 'balance' }]); await f.service.chat(f.token, { text: '查询余额' }); }
    release(); await assert.rejects(confirming, { code: 'TASK_NOT_ACTIONABLE' });
    assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE'); assert.equal(f.internal().passkeyCredential.counter, 0);
  }
});
test('signature validation CAS rejects counter changes, parameter changes and newer challenge', async () => {
  for (const mode of ['counter', 'action', 'challenge']) {
    const f = await ready(); const old = f.task(); let release; const gate = new Promise(resolve => { release = resolve; });
    f.sdk.verifyAuthenticationResponse = async options => { await gate; return realSdk.verifyAuthenticationResponse(options); };
    const confirming = f.service.passkeyConfirm(f.token, old.id, { confirmed: true, response: f.device.authenticate(f.challenge.options) });
    if (mode === 'counter') f.store.transact(db => { Object.values(db.sessions)[0].passkeyCredential.counter = 7; });
    else if (mode === 'action') f.store.transact(db => { Object.values(db.sessions)[0].tasks[0].action.cardId = 'card-6219'; });
    else await f.service.passkeyOptions(f.token, old.id);
    release(); await assert.rejects(confirming, { code: 'PASSKEY_REQUEST_CHANGED' }); assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE');
  }
});
test('invalid signatures consume their challenge and three failures lock sensitive operations', async () => {
  const f = await ready(); const taskId = f.task().id; let challenge = f.challenge;
  for (let i = 0; i < 3; i++) {
    const result = await f.service.passkeyConfirm(f.token, taskId, { confirmed: true, response: f.device.authenticate(challenge.options, 1, true) });
    assert.equal(result.error.code, i === 2 ? 'SAFETY_LOCKED' : 'PASSKEY_VERIFICATION_FAILED'); assert.equal(f.internal().tasks[0].passkeyPending, undefined);
    if (i < 2) challenge = await f.service.passkeyOptions(f.token, taskId);
  }
  await assert.rejects(f.service.passkeyOptions(f.token, taskId), { code: 'SAFETY_LOCKED' });
  assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE');
});
test('insufficient reserve at final execution rolls back counter and challenge consumption atomically', async () => {
  const f = fixture(); await f.enroll(); await f.prepare({ type: 'transfer', recipient: '王明', amount: '1200', reserveAmount: '11000' });
  const task = f.task(); const challenge = await f.service.passkeyOptions(f.token, task.id);
  f.store.transact(db => { Object.values(db.sessions)[0].balance = 1200000; });
  await assert.rejects(f.service.passkeyConfirm(f.token, task.id, { confirmed: true, response: f.device.authenticate(challenge.options) }), { code: 'RESERVE_NOT_MET' });
  assert.equal(f.internal().passkeyCredential.counter, 0); assert.ok(f.internal().tasks[0].passkeyPending); assert.equal(f.internal().ledger.length, 0);
});
test('passkey timeout path reserves once and standard reconciliation never reauthorizes or double charges', async () => {
  const f = fixture(); await f.enroll(); f.setActions([{ type: 'transfer', recipient: '王明', amount: '1200' }]);
  await f.service.chat(f.token, { text: '转1200元', simulateTimeout: true }); const task = f.task(); const challenge = await f.service.passkeyOptions(f.token, task.id);
  const body = { confirmed: true, response: f.device.authenticate(challenge.options) };
  assert.equal((await f.service.passkeyConfirm(f.token, task.id, body)).task.status, 'PENDING_REVIEW');
  assert.equal((await f.service.passkeyConfirm(f.token, task.id, body)).idempotent, true);
  assert.equal(f.service.reconcile(f.token, task.id).task.status, 'SUCCEEDED'); assert.equal(f.internal().ledger.length, 1);
});
test('passkey counter and registration survive reopening the file-backed service', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-passkey-service-')), 'state.json');
  const f = await ready({ store: createBankStore(file) }); const task = f.task();
  await f.service.passkeyConfirm(f.token, task.id, { confirmed: true, response: f.device.authenticate(f.challenge.options) });
  const restored = new BankService({ store: createBankStore(file), planner: f.planner, now: f.now });
  assert.equal(restored.get(f.token).auth.mode, 'passkey');
  await restored.prepareManual(f.token, { type: 'unfreeze_card', cardLast4: '8806' }); const next = restored.get(f.token).tasks[0];
  const challenge = await restored.passkeyOptions(f.token, next.id);
  assert.equal((await restored.passkeyConfirm(f.token, next.id, { confirmed: true, response: f.device.authenticate(challenge.options, 2) })).task.status, 'SUCCEEDED');
});
test('cross-session task and registration access never grants the other account credential', async () => {
  const f = await ready(); const other = f.service.create();
  await assert.rejects(f.service.passkeyOptions(other.token, f.task().id), { code: 'TASK_NOT_FOUND' });
  await assert.rejects(f.service.passkeyConfirm(other.token, f.task().id, { confirmed: true, response: f.device.authenticate(f.challenge.options) }), { code: 'TASK_NOT_FOUND' });
  const otherRegistration = await f.service.passkeyRegistrationOptions(other.token);
  const response = f.device.register(otherRegistration.options);
  await assert.rejects(f.service.passkeyRegistrationVerify(other.token, { response }), { code: 'PASSKEY_CREDENTIAL_IN_USE' });
  assert.equal(f.service.get(other.token).auth.mode, 'demo_otp');
});
test('HTTP passkey endpoints require exact configured Host and Origin and provide IP guidance', async t => {
  const f = fixture(); const { app } = createBankApp({ store: f.store, planner: f.planner, now: f.now });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); }); const base = `http://127.0.0.1:${server.address().port}`;
  // Node's fetch may rewrite Host; a low-level local request tests exact headers.
  const fetch = (url, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    }); req.on('error', reject); req.end(options.body);
  });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token}` };
  for (const extra of [{}, { Origin: ORIGIN }, { Origin: ORIGIN, Host: 'localhost:8091' }]) {
    const response = await fetch(`${base}/api/bank/passkey/register/options`, { method: 'POST', headers: { ...headers, ...extra }, body: '{}' });
    assert.equal(response.status, 403); const body = await response.json(); assert.equal(body.code, 'PASSKEY_LOCALHOST_REQUIRED'); assert.equal(body.origin, ORIGIN);
  }
  const state = await (await fetch(`${base}/api/bank/state`, { headers })).json(); assert.equal(state.auth.canRegister, false);
  const allowed = { ...headers, Origin: ORIGIN, Host: 'localhost:5091' };
  const optionsResponse = await fetch(`${base}/api/bank/passkey/register/options`, { method: 'POST', headers: allowed, body: '{}' });
  assert.equal(optionsResponse.status, 200); const registeredOptions = await optionsResponse.json();
  const verified = await fetch(`${base}/api/bank/passkey/register/verify`, { method: 'POST', headers: allowed, body: JSON.stringify({ response: f.device.register(registeredOptions.options) }) });
  assert.equal(verified.status, 200); assert.equal((await verified.json()).registered, true);
  await f.prepare(); const taskId = f.task().id;
  const authOptions = await (await fetch(`${base}/api/bank/tasks/${taskId}/passkey/options`, { method: 'POST', headers: allowed, body: '{}' })).json();
  const confirmed = await fetch(`${base}/api/bank/tasks/${taskId}/passkey/confirm`, { method: 'POST', headers: allowed, body: JSON.stringify({ confirmed: true, response: f.device.authenticate(authOptions.options), verified: true, action: { type: 'transfer', cents: 99999 } }) });
  assert.equal(confirmed.status, 200); const body = await confirmed.json(); assert.equal(body.task.action.type, 'freeze_card'); assert.equal(body.task.status, 'SUCCEEDED');
});
test('natural language cancellation cancels unexecuted workflow nodes permanently and preserves prior effects', async () => {
  const f = fixture(); f.setActions([{ type: 'transfer', recipient: '王明', amount: '200' }, { type: 'freeze_card', cardLast4: '8806' }]);
  await f.service.chat(f.token, { text: '先转账再挂失' }); const flowId = f.service.get(f.token).workflows[0].id;
  f.service.confirm(f.token, f.task().id, { confirmed: true }); f.service.workflowControl(f.token, flowId, 'advance');
  f.setActions([{ type: 'cancel_task' }]); const cancelled = await f.service.chat(f.token, { text: '取消刚才的任务' });
  assert.equal(cancelled.state.workflows[0].status, 'CANCELLED'); assert.equal(cancelled.state.tasks[0].status, 'CANCELLED');
  assert.equal(cancelled.state.balance, 1266000); assert.equal(cancelled.state.workflows[0].nodes[0].status, 'SUCCEEDED');
  assert.throws(() => f.service.workflowControl(f.token, flowId, 'resume'), { code: 'WORKFLOW_NOT_PAUSED' });
});
test('expired signed challenge never executes or resets authentication failures', async () => {
  const f = await ready(); f.store.transact(db => { Object.values(db.sessions)[0].authFailures = 1; });
  f.tick(120000);
  const result = await f.service.passkeyConfirm(f.token, f.task().id, { confirmed: true, response: f.device.authenticate(f.challenge.options) });
  assert.equal(result.error.code, 'PASSKEY_CHALLENGE_EXPIRED'); assert.equal(f.internal().authFailures, 1);
  assert.equal(f.internal().tasks[0].passkeyPending, undefined); assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE');
});
test('competing registration option generations use CAS and reject the older completion', async () => {
  const f = fixture(); let first = true; let release; const gate = new Promise(resolve => { release = resolve; });
  f.sdk.generateRegistrationOptions = async options => { if (first) { first = false; await gate; } return realSdk.generateRegistrationOptions(options); };
  const older = f.service.passkeyRegistrationOptions(f.token); const latest = await f.service.passkeyRegistrationOptions(f.token);
  release(); await assert.rejects(older, { code: 'PASSKEY_REQUEST_CHANGED' });
  assert.equal(f.internal().passkeyRegistrationPending.challenge, latest.options.challenge);
});
test('registration, authentication challenge and retry quotas cannot grow state without bound', async () => {
  const f = fixture({ limits: { passkeyRegistrations: 1, challengesPerTask: 1 } });
  const registration = await f.service.passkeyRegistrationOptions(f.token);
  await assert.rejects(f.service.passkeyRegistrationOptions(f.token), { code: 'PASSKEY_REGISTRATION_LIMIT' });
  await f.service.passkeyRegistrationVerify(f.token, { response: f.device.register(registration.options) });
  await f.prepare(); const challenge = await f.service.passkeyOptions(f.token, f.task().id);
  await assert.rejects(f.service.passkeyOptions(f.token, f.task().id), { code: 'CHALLENGE_LIMIT' });
  assert.equal((await f.service.passkeyConfirm(f.token, f.task().id, { confirmed: true, response: f.device.authenticate(challenge.options) })).task.status, 'SUCCEEDED');
});
test('an explicit confirmation is still required even when a valid device signature is provided', async () => {
  const f = await ready(); await assert.rejects(f.service.passkeyConfirm(f.token, f.task().id, { response: f.device.authenticate(f.challenge.options), verified: true }), { code: 'CONFIRMATION_REQUIRED' });
  assert.equal(f.internal().passkeyCredential.counter, 0); assert.ok(f.internal().tasks[0].passkeyPending);
});
