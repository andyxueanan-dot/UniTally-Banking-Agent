const { randomBytes, randomUUID, createHash } = require('node:crypto');

class PasskeyError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new PasskeyError(code, message, status); };
const plain = value => Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const b64 = value => text(value, 16384) && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value;
const hash = value => createHash('sha256').update(value).digest('base64url');
function stable(value, depth = 0) {
  if (depth > 8) fail('PASSKEY_INVALID_BINDING', '任务绑定结构过深。');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => stable(item, depth + 1));
  if (!plain(value)) fail('PASSKEY_INVALID_BINDING', '任务绑定只能包含明确的业务数据。');
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key], depth + 1)]));
}
function bindingHash(binding) {
  if (!plain(binding) || !text(binding.sessionId, 128) || !text(binding.taskId, 128) ||
      !Number.isSafeInteger(binding.intentVersion) || binding.intentVersion < 0 || !plain(binding.action) ||
      !Number.isSafeInteger(binding.expiresAt) || binding.expiresAt <= 0) fail('PASSKEY_INVALID_BINDING', '缺少完整的会话、任务、版本、操作或到期时间绑定。');
  const encoded = JSON.stringify(stable(binding));
  if (encoded.length > 16384) fail('PASSKEY_INVALID_BINDING', '任务绑定内容过长。');
  return hash(encoded);
}
function clientData(response, expectedType, expectedOrigin, expectedChallenge) {
  if (!plain(response) || !b64(response.id) || response.id.length > 2048 || response.rawId !== response.id || response.type !== 'public-key' ||
      !plain(response.response) || !b64(response.response.clientDataJSON) || response.response.clientDataJSON.length > 8192) fail('PASSKEY_INVALID_RESPONSE', '设备验证响应格式不正确。');
  let data;
  try { data = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')); }
  catch { fail('PASSKEY_INVALID_RESPONSE', '设备验证响应无法解析。'); }
  if (!plain(data) || data.type !== expectedType || data.origin !== expectedOrigin || data.challenge !== expectedChallenge ||
      data.crossOrigin === true || data.topOrigin !== undefined) fail('PASSKEY_CONTEXT_MISMATCH', '设备验证的用途、网站或挑战不匹配。', 403);
  return data;
}
function validateCredential(credential) {
  if (!plain(credential) || !b64(credential.id) || credential.id.length > 2048 || !b64(credential.publicKey) ||
      !Number.isSafeInteger(credential.counter) || credential.counter < 0 || !b64(credential.userID)) fail('PASSKEY_INVALID_CREDENTIAL', '保存的公钥凭据无效，不能继续验证。');
  return credential;
}

// This module never consumes challenges or moves money. The caller must store
// pending server-side, then atomically recheck + consume it + update the counter
// alongside task execution AFTER awaiting verifyAuthentication().
function createPasskey({ rpID = 'localhost', origin = 'http://localhost:5091', now = Date.now, sdk, ttlMs = 120000 } = {}) {
  let parsed;
  try { parsed = new URL(origin); } catch { fail('PASSKEY_INVALID_CONFIG', 'Passkey 网站配置无效。'); }
  if (rpID !== 'localhost' || parsed.hostname !== rpID || parsed.protocol !== 'http:' || parsed.origin !== origin || parsed.username || parsed.password) {
    fail('PASSKEY_INVALID_CONFIG', '此本地原型的 Passkey 仅支持明确的 http://localhost 端口，不接受 IP 地址或外部域名。');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 120000) fail('PASSKEY_INVALID_CONFIG', '挑战有效期须为 1～120 秒。');
  const protocol = () => sdk || require('@simplewebauthn/server');
  function pending(kind, challenge, extra = {}, deadline = now() + ttlMs) {
    return { id: randomUUID(), kind, challenge, issuedAt: now(), expiresAt: deadline, rpID, origin, ...extra };
  }
  function checkPending(value, kind) {
    if (!plain(value) || value.kind !== kind || !text(value.id, 128) || !b64(value.challenge) || value.rpID !== rpID || value.origin !== origin ||
        !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > ttlMs ||
        value.issuedAt > now() || value.used === true || value.consumed === true || value.usedAt != null || value.consumedAt != null) {
      fail('PASSKEY_INVALID_CHALLENGE', '设备验证挑战无效、已使用或用途不匹配。', 403);
    }
    if (value.expiresAt <= now()) fail('PASSKEY_CHALLENGE_EXPIRED', '设备验证已过期，请重新发起。', 403);
  }
  async function checked(operation) {
    try { return await operation(); }
    catch (error) { if (error instanceof PasskeyError) throw error; fail('PASSKEY_VERIFICATION_FAILED', '设备签名验证失败；未获得业务执行授权。', 403); }
  }
  return {
    rpID, origin,
    createUserID: () => randomBytes(32).toString('base64url'),
    bindingHash,
    async registrationOptions({ userID, userName = 'UniTally 虚构演示账户', credentials = [] }) {
      if (!b64(userID) || Buffer.from(userID, 'base64url').length > 64 || !text(userName, 100) || !Array.isArray(credentials)) fail('PASSKEY_INVALID_REGISTRATION', '演示账户注册参数无效。');
      if (credentials.length) fail('PASSKEY_ALREADY_REGISTERED', '此演示账户已注册一个 Passkey，不能凭会话令牌直接替换设备。', 409);
      const options = await protocol().generateRegistrationOptions({ rpName: 'UniTally 银行演示', rpID, userID: new Uint8Array(Buffer.from(userID, 'base64url')), userName,
        timeout: ttlMs, attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' } });
      return { options, pending: pending('registration', options.challenge, { userID }) };
    },
    async verifyRegistration({ pending: challenge, response }) {
      checkPending(challenge, 'registration');
      if (!b64(challenge.userID) || Buffer.from(challenge.userID, 'base64url').length > 64) fail('PASSKEY_INVALID_CHALLENGE', '注册账户标识无效。');
      clientData(response, 'webauthn.create', origin, challenge.challenge);
      const result = await checked(() => protocol().verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge,
        expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: [-7, -257] }));
      checkPending(challenge, 'registration');
      const info = result.registrationInfo;
      if (result.verified !== true || !info || info.userVerified !== true || info.credential?.id !== response.id) fail('PASSKEY_VERIFICATION_FAILED', '未取得有效的设备注册验证。', 403);
      const credential = { id: info.credential.id, publicKey: Buffer.from(info.credential.publicKey).toString('base64url'), counter: info.credential.counter,
        transports: info.credential.transports || [], userID: challenge.userID,
        deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp, createdAt: now() };
      validateCredential(credential);
      return credential;
    },
    async authenticationOptions({ binding, credentials }) {
      const digest = bindingHash(binding);
      if (binding.expiresAt <= now()) fail('PASSKEY_TASK_EXPIRED', '业务任务已过期，不能继续验证。', 409);
      if (!Array.isArray(credentials) || credentials.length !== 1) fail('PASSKEY_NOT_REGISTERED', '请先为此演示账户注册一个 Passkey。', 409);
      credentials.forEach(validateCredential);
      const challengeBytes = Buffer.concat([randomBytes(32), Buffer.from(digest, 'base64url')]);
      const options = await protocol().generateAuthenticationOptions({ rpID, challenge: new Uint8Array(challengeBytes), timeout: Math.min(ttlMs, binding.expiresAt - now()),
        userVerification: 'required', allowCredentials: credentials.map(c => ({ id: c.id, transports: c.transports })) });
      if (binding.expiresAt <= now()) fail('PASSKEY_TASK_EXPIRED', '业务任务已过期，不能继续验证。', 409);
      return { options, pending: pending('authentication', options.challenge, { bindingHash: digest, credentialIds: credentials.map(c => c.id), userID: credentials[0].userID }, Math.min(now() + ttlMs, binding.expiresAt)) };
    },
    async verifyAuthentication({ pending: challenge, response, credential, binding }) {
      checkPending(challenge, 'authentication'); validateCredential(credential);
      const digest = bindingHash(binding);
      if (challenge.bindingHash !== digest || binding.expiresAt <= now()) fail('PASSKEY_TASK_CHANGED', '任务内容、版本或会话已经变化，不能沿用旧设备授权。', 409);
      if (!Array.isArray(challenge.credentialIds) || challenge.credentialIds.length !== 1 || !challenge.credentialIds.includes(credential.id) ||
          response?.id !== credential.id || challenge.userID !== credential.userID) fail('PASSKEY_CREDENTIAL_MISMATCH', '此设备凭据不属于本次验证账户。', 403);
      clientData(response, 'webauthn.get', origin, challenge.challenge);
      if (response.response.userHandle != null && response.response.userHandle !== credential.userID) fail('PASSKEY_CREDENTIAL_MISMATCH', '设备返回的用户标识与此账户不一致。', 403);
      const result = await checked(() => protocol().verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: origin,
        expectedRPID: rpID, requireUserVerification: true, credential: { id: credential.id, publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
          counter: credential.counter, transports: credential.transports } }));
      checkPending(challenge, 'authentication');
      const info = result.authenticationInfo;
      if (result.verified !== true || !info || info.userVerified !== true || info.credentialID !== credential.id ||
          !Number.isSafeInteger(info.newCounter) || info.newCounter < 0) fail('PASSKEY_VERIFICATION_FAILED', '未取得有效的设备签名验证。', 403);
      return { challengeId: challenge.id, bindingHash: digest, credentialId: credential.id, oldCounter: credential.counter, newCounter: info.newCounter,
        verifiedAt: now(), userVerified: true, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp };
    },
  };
}
module.exports = { createPasskey, PasskeyError, bindingHash };
