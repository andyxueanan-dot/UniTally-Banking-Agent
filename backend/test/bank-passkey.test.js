const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, createHash, sign } = require('node:crypto');
const sdk = require('@simplewebauthn/server');
const { isoCBOR } = require('@simplewebauthn/server/helpers');
const { createPasskey, bindingHash } = require('../bank/passkey');
const digest = value => createHash('sha256').update(value).digest();
const b64 = value => Buffer.from(value).toString('base64url');

// Protocol fixtures sign with a local software key, NOT Windows Hello or a
// real user's credential. Signature verification uses the real installed SDK.
function softwareTestDevice() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const publicKeyBytes = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]));
  const idBytes = randomBytes(16); const id = b64(idBytes);
  function authData({ rpID = 'localhost', counter = 0, flags = 5 } = {}) {
    const count = Buffer.alloc(4); count.writeUInt32BE(counter);
    return Buffer.concat([digest(rpID), Buffer.from([flags]), count]);
  }
  const data = (type, challenge, origin = 'http://localhost:5091', extra = {}) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));
  return {
    id,
    registration(options, { origin = 'http://localhost:5091', flags = 0x45, rpID = 'localhost', challenge = options.challenge } = {}) {
      const length = Buffer.alloc(2); length.writeUInt16BE(idBytes.length);
      const bytes = Buffer.concat([authData({ flags, rpID }), Buffer.alloc(16), length, idBytes, Buffer.from(publicKeyBytes)]);
      return { id, rawId: id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {}, response: {
        clientDataJSON: b64(data('webauthn.create', challenge, origin)),
        attestationObject: b64(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(bytes)]]))), transports: ['internal'],
      } };
    },
    authentication(options, { origin = 'http://localhost:5091', counter = 1, flags = 5, rpID = 'localhost', challenge = options.challenge, userHandle, extraClient = {} } = {}) {
      const client = data('webauthn.get', challenge, origin, extraClient); const auth = authData({ counter, flags, rpID });
      return { id, rawId: id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {}, response: {
        clientDataJSON: b64(client), authenticatorData: b64(auth), signature: b64(sign('sha256', Buffer.concat([auth, digest(client)]), privateKey)), userHandle: userHandle ?? null,
      } };
    },
  };
}
async function fixture(extra = {}) {
  let now = Date.parse('2026-09-26T10:00:00Z');
  const passkey = createPasskey({ now: () => now, ...extra }); const userID = passkey.createUserID();
  const device = softwareTestDevice();
  const registration = await passkey.registrationOptions({ userID });
  const credential = await passkey.verifyRegistration({ pending: registration.pending, response: device.registration(registration.options) });
  const binding = { sessionId: 'fictional-session-a', taskId: 'task-a', intentVersion: 1, action: { type: 'transfer', recipientId: 'wang', cents: 120000, reserveCents: 100000 }, expiresAt: now + 600000 };
  const auth = await passkey.authenticationOptions({ binding, credentials: [credential] });
  return { passkey, device, credential, binding, auth, registration, userID, tick: ms => { now += ms; },
    verify: (overrides = {}) => passkey.verifyAuthentication({ pending: auth.pending, response: device.authentication(auth.options), credential, binding, ...overrides }) };
}

test('real SDK registers a software test credential and verifies a task-bound P-256 signature', async () => {
  const f = await fixture();
  assert.equal(f.credential.id, f.device.id); assert.equal(f.credential.counter, 0); assert.equal(f.credential.userID, f.userID);
  assert.equal(f.registration.options.authenticatorSelection.userVerification, 'required');
  assert.equal(f.registration.options.attestation, 'none'); assert.equal(f.auth.options.userVerification, 'required');
  const result = await f.verify(); assert.equal(result.challengeId, f.auth.pending.id); assert.equal(result.newCounter, 1); assert.equal(result.oldCounter, 0);
  assert.equal(result.bindingHash, bindingHash(f.binding)); assert.equal(result.userVerified, true);
  assert.equal(f.auth.pending.consumedAt, undefined, 'caller transaction, not verifier, owns consumption');
  const challengeBytes = Buffer.from(f.auth.options.challenge, 'base64url'); assert.equal(challengeBytes.length, 64);
  assert.equal(b64(challengeBytes.subarray(32)), bindingHash(f.binding));
});
test('challenge nonce changes each ceremony even for identical task bindings', async () => {
  const f = await fixture(); const next = await f.passkey.authenticationOptions({ binding: f.binding, credentials: [f.credential] });
  assert.notEqual(next.options.challenge, f.auth.options.challenge); assert.equal(next.pending.bindingHash, f.auth.pending.bindingHash);
});
test('every material task field changes authorization, with stable object-key ordering', async () => {
  const f = await fixture();
  const alternateOrder = { expiresAt: f.binding.expiresAt, action: { reserveCents: 100000, cents: 120000, recipientId: 'wang', type: 'transfer' }, intentVersion: 1, taskId: 'task-a', sessionId: 'fictional-session-a' };
  assert.equal(bindingHash(alternateOrder), bindingHash(f.binding));
  for (const change of [{ sessionId: 'fictional-session-b' }, { taskId: 'task-b' }, { intentVersion: 2 }, { expiresAt: f.binding.expiresAt + 1 },
    { action: { ...f.binding.action, cents: 120001 } }, { action: { ...f.binding.action, recipientId: 'li' } }, { action: { ...f.binding.action, reserveCents: 1 } }]) {
    await assert.rejects(f.verify({ binding: { ...f.binding, ...change } }), { code: 'PASSKEY_TASK_CHANGED' });
  }
});
test('wrong origin, wrong challenge and cross-origin iframe context are rejected', async () => {
  const f = await fixture();
  for (const params of [{ origin: 'http://localhost:8091' }, { challenge: b64(randomBytes(32)) }, { extraClient: { crossOrigin: true } }, { extraClient: { topOrigin: 'http://localhost:5091' } }]) {
    await assert.rejects(f.verify({ response: f.device.authentication(f.auth.options, params) }), { code: 'PASSKEY_CONTEXT_MISMATCH' });
  }
});
test('real SDK rejects wrong RP hash, absent presence, absent user verification, and corrupted signature', async () => {
  const f = await fixture();
  for (const params of [{ rpID: 'evil.example' }, { flags: 1 }, { flags: 4 }]) {
    await assert.rejects(f.verify({ response: f.device.authentication(f.auth.options, params) }), { code: 'PASSKEY_VERIFICATION_FAILED' });
  }
  const response = f.device.authentication(f.auth.options); const signature = Buffer.from(response.response.signature, 'base64url'); signature[signature.length - 1] ^= 1; response.response.signature = b64(signature);
  await assert.rejects(f.verify({ response }), { code: 'PASSKEY_VERIFICATION_FAILED' });
});
test('registration enforces origin, UV and RP through the same official verifier', async () => {
  const passkey = createPasskey(); const device = softwareTestDevice(); const { options, pending } = await passkey.registrationOptions({ userID: passkey.createUserID() });
  await assert.rejects(passkey.verifyRegistration({ pending, response: device.registration(options, { origin: 'https://evil.example' }) }), { code: 'PASSKEY_CONTEXT_MISMATCH' });
  await assert.rejects(passkey.verifyRegistration({ pending, response: device.registration(options, { flags: 0x41 }) }), { code: 'PASSKEY_VERIFICATION_FAILED' });
  await assert.rejects(passkey.verifyRegistration({ pending, response: device.registration(options, { rpID: 'evil.example' }) }), { code: 'PASSKEY_VERIFICATION_FAILED' });
});
test('expired, future-issued, consumed and wrong-purpose pending challenges are rejected', async () => {
  const f = await fixture();
  for (const change of [{ kind: 'registration' }, { issuedAt: f.auth.pending.issuedAt + 1000 }, { consumedAt: f.auth.pending.issuedAt }, { used: true }, { origin: 'https://evil.example' }]) {
    await assert.rejects(f.verify({ pending: { ...f.auth.pending, ...change } }), { code: 'PASSKEY_INVALID_CHALLENGE' });
  }
  f.tick(120000); await assert.rejects(f.verify(), { code: 'PASSKEY_CHALLENGE_EXPIRED' });
});
test('different credential, account user handle and malformed public key fail closed', async () => {
  const f = await fixture();
  await assert.rejects(f.verify({ credential: { ...f.credential, id: b64(randomBytes(16)) } }), { code: 'PASSKEY_CREDENTIAL_MISMATCH' });
  await assert.rejects(f.verify({ credential: { ...f.credential, userID: b64(randomBytes(32)) } }), { code: 'PASSKEY_CREDENTIAL_MISMATCH' });
  await assert.rejects(f.verify({ response: f.device.authentication(f.auth.options, { userHandle: b64(randomBytes(32)) }) }), { code: 'PASSKEY_CREDENTIAL_MISMATCH' });
  await assert.rejects(f.verify({ credential: { ...f.credential, publicKey: 'not base64' } }), { code: 'PASSKEY_INVALID_CREDENTIAL' });
});
test('signature counter rollback fails, while supported all-zero counters still require fresh challenges', async () => {
  const f = await fixture();
  await assert.rejects(f.verify({ credential: { ...f.credential, counter: 1 } }), { code: 'PASSKEY_VERIFICATION_FAILED' });
  const zero = await f.verify({ response: f.device.authentication(f.auth.options, { counter: 0 }) }); assert.equal(zero.newCounter, 0);
  const next = await f.passkey.authenticationOptions({ binding: f.binding, credentials: [f.credential] });
  await assert.rejects(f.verify({ pending: next.pending }), { code: 'PASSKEY_CONTEXT_MISMATCH' });
});
test('only one credential can be registered, and task auth requires that existing credential', async () => {
  const f = await fixture();
  await assert.rejects(f.passkey.registrationOptions({ userID: f.userID, credentials: [f.credential] }), { code: 'PASSKEY_ALREADY_REGISTERED' });
  await assert.rejects(f.passkey.authenticationOptions({ binding: f.binding, credentials: [] }), { code: 'PASSKEY_NOT_REGISTERED' });
  await assert.rejects(f.passkey.authenticationOptions({ binding: { ...f.binding, expiresAt: 1 }, credentials: [f.credential] }), { code: 'PASSKEY_TASK_EXPIRED' });
});
test('IP, remote domain and malformed origins are rejected; explicit localhost test ports work', () => {
  for (const origin of ['http://127.0.0.1:5091', 'http://localhost.evil:5091', 'https://evil.example', 'http://localhost:5091/', 'http://user:pass@localhost:5091']) {
    assert.throws(() => createPasskey({ origin }), { code: 'PASSKEY_INVALID_CONFIG' });
  }
  assert.equal(createPasskey({ origin: 'http://localhost:5999' }).origin, 'http://localhost:5999');
});
test('SDK injection can observe required verification policy and expiry after an async verification', async () => {
  const real = await fixture(); let now = real.auth.pending.issuedAt;
  const injected = createPasskey({ now: () => now, sdk: { verifyAuthenticationResponse: async options => {
    assert.equal(options.requireUserVerification, true); assert.equal(options.expectedRPID, 'localhost'); assert.equal(options.expectedOrigin, 'http://localhost:5091');
    assert.ok(options.credential.publicKey instanceof Uint8Array); now += 120000;
    return { verified: true, authenticationInfo: { credentialID: real.credential.id, newCounter: 1, userVerified: true } };
  } } });
  await assert.rejects(injected.verifyAuthentication({ pending: real.auth.pending, response: real.device.authentication(real.auth.options), credential: real.credential, binding: real.binding }), { code: 'PASSKEY_CHALLENGE_EXPIRED' });
});
test('injected verifier cannot authorize with verified false or UV false', async () => {
  const real = await fixture();
  for (const [verified, userVerified] of [[false, true], [true, false]]) {
    const injected = createPasskey({ now: () => real.auth.pending.issuedAt, sdk: { verifyAuthenticationResponse: async () => ({ verified, authenticationInfo: { userVerified, credentialID: real.credential.id, newCounter: 1 } }) } });
    await assert.rejects(injected.verifyAuthentication({ pending: real.auth.pending, response: real.device.authentication(real.auth.options), credential: real.credential, binding: real.binding }), { code: 'PASSKEY_VERIFICATION_FAILED' });
  }
});
test('unsafe task shapes and oversized user identifiers do not reach cryptographic operations', async () => {
  const f = await fixture();
  for (const binding of [{}, { ...f.binding, intentVersion: -1 }, { ...f.binding, action: { cents: NaN } }, { ...f.binding, action: { run: () => true } }, { ...f.binding, action: { text: 'a'.repeat(17000) } }]) {
    assert.throws(() => bindingHash(binding), { code: 'PASSKEY_INVALID_BINDING' });
  }
  await assert.rejects(f.passkey.registrationOptions({ userID: b64(randomBytes(65)) }), { code: 'PASSKEY_INVALID_REGISTRATION' });
});
test('registration rejects authentication-purpose challenges and invalid stored user handles', async () => {
  const f = await fixture();
  await assert.rejects(f.passkey.verifyRegistration({ pending: f.auth.pending, response: f.device.registration(f.registration.options) }), { code: 'PASSKEY_INVALID_CHALLENGE' });
  await assert.rejects(f.passkey.verifyRegistration({ pending: { ...f.registration.pending, userID: b64(randomBytes(65)) }, response: f.device.registration(f.registration.options) }), { code: 'PASSKEY_INVALID_CHALLENGE' });
});
test('credentials are public serializable data and survive a JSON persistence round trip', async () => {
  const f = await fixture(); const credential = JSON.parse(JSON.stringify(f.credential));
  assert.ok(!Object.keys(credential).some(key => /private|secret/i.test(key)));
  const response = await f.verify({ credential }); assert.equal(response.newCounter, 1);
});
