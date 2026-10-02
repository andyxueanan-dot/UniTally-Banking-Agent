const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { createTeamShare } = require('../team-share-server');
const { createBankStore } = require('../bank/store');
const origin = 'https://unitally-test.trycloudflare.com';
const password = 'only-for-unit-tests-not-a-real-password';
async function fixture(t, daily = 20) {
  let time = Date.now(); let calls = 0;
  const { app } = createTeamShare({ origin, password, expiresAt: time + 3600000, now: () => time,
    store: createBankStore(), staticDir: path.resolve(__dirname, '../../dist-mobile'), maxDailyCalls: daily,
    planner: { configured: true, model: 'test-not-real', plan: async () => { calls++; return { actions: [{ type: 'balance' }], question: '', meta: { mode: 'test' } }; } } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  // Node fetch ignores custom Host; use raw HTTP to emulate the tunnel faithfully.
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method: options.method || 'GET', headers: { Host: new URL(origin).host, ...options.headers } }, res => {
      const chunks = []; res.on('data', data => chunks.push(data)); res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: { get: key => { const v = res.headers[key.toLowerCase()]; return Array.isArray(v) ? v.join(',') : v; } }, json: async () => JSON.parse(body), text: async () => body });
      });
    });
    r.on('error', reject); r.end(options.body?.toString());
  });
  const login = async () => {
    const r = await request('/team/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });
    assert.equal(r.status, 303); const set = r.headers.get('set-cookie'); assert.match(set, /Secure/); assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Lax/);
    return set.split(';')[0];
  };
  return { request, login, calls: () => calls, advance: ms => time += ms };
}
test('unauthenticated API/assets denied; wrong host/origin rejected; login form contains no application assets', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/bank/health')).status, 401);
  assert.equal((await f.request('/assets/no.js')).status, 303);
  assert.equal((await f.request('/team/login', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await f.request('/team/login', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/team/login', { method: 'POST' })).status, 403);
  const loginPage = await f.request('/team/login');
  assert.equal(loginPage.status, 200);
  // no-referrer makes browser form POST Origin null, breaking strict CSRF checks.
  assert.equal(loginPage.headers.get('referrer-policy'), 'same-origin');
  assert.equal(f.calls(), 0);
});
test('authenticated UI/API work; session isolation, CSRF, blocked capabilities and static secrets', async t => {
  const f = await fixture(t); const cookie = await f.login();
  const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
  assert.equal((await f.request('/', { headers })).status, 200);
  assert.equal((await f.request('/api/bank/health', { headers }).then(r => r.json())).auth.canRegister, false);
  const create = () => f.request('/api/bank/sessions', { method: 'POST', headers, body: '{}' }).then(r => r.json());
  const a = await create(); const b = await create(); assert.notEqual(a.token, b.token);
  assert.equal(a.state.balance, 1286000); assert.equal(a.state.auth.canRegister, false);
  assert.equal((await f.request('/api/bank/sessions', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  assert.equal((await f.request('/api/bank/passkey/register/options', { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal((await f.request('/api/bank/sandbox/compute', { method: 'POST', headers, body: '{}' })).status, 403);
  for (const route of ['/backend/.env.bank.local', '/.cache/team-share/access.json', '/backend/data/team-share.json']) assert.equal((await f.request(route, { headers })).status, 404);
  assert.equal(f.calls(), 0);
});
test('logout revokes cookie, tampering is rejected, and share expiry fails closed', async t => {
  const f = await fixture(t); const cookie = await f.login();
  assert.equal((await f.request('/api/bank/health', { headers: { Cookie: cookie + 'bad' } })).status, 401);
  assert.equal((await f.request('/team/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })).status, 303);
  assert.equal((await f.request('/api/bank/health', { headers: { Cookie: cookie } })).status, 401);
  const other = await f.login(); f.advance(3600001);
  assert.equal((await f.request('/api/bank/health', { headers: { Cookie: other } })).status, 410);
});
test('wrong password is rejected and global brute-force quota is bounded', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 20; i++) assert.equal((await f.request('/team/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=wrong' })).status, 401);
  assert.equal((await f.request('/team/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=wrong' })).status, 429);
});
test('shared AI quota enforced with mock planner, no paid calls', async t => {
  const f = await fixture(t, 1); const cookie = await f.login();
  const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
  const s = await f.request('/api/bank/sessions', { method: 'POST', headers, body: '{}' }).then(r => r.json());
  headers.Authorization = 'Bearer ' + s.token;
  const ask = () => f.request('/api/bank/chat', { method: 'POST', headers, body: JSON.stringify({ text: '查询模拟余额' }) });
  assert.equal((await ask()).status, 200);
  const rejected = await ask(); assert.equal(rejected.status, 429); assert.equal((await rejected.json()).code, 'AI_BUDGET_LIMIT'); assert.equal(f.calls(), 1);
});
