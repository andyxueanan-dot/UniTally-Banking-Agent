// Temporary, password-protected team demo. Never expose bank-server.js directly.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { createBankApp } = require('./bank-server');
const { createBankStore } = require('./bank/store');
const COOKIE = '__Host-unitally_team';
const digest = value => createHash('sha256').update(value).digest();

function createTeamShare({ origin, password, expiresAt, now = Date.now, store, planner, staticDir, maxDailyCalls = 20, persistent = false, authSessions }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || !/^[a-z0-9.-]+$/.test(url.hostname)) throw Error('An exact HTTPS public origin is required');
  if (typeof password !== 'string' || password.length < 24) throw Error('Use a randomly generated team password of at least 24 characters');
  if (persistent) {
    if (!authSessions || !store) throw Error('Persistent sharing requires a durable bank store and durable login sessions');
    expiresAt = Number.MAX_SAFE_INTEGER;
  } else if (!Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + 24 * 3600000) throw Error('Sharing must expire within 24 hours');
  if (!Number.isInteger(maxDailyCalls) || maxDailyCalls < 0 || maxDailyCalls > 20) throw Error('Team AI daily limit must be 0-20');
  const sessions = authSessions || new Map();
  let loginAttempts = [];
  let requests = [];
  const expected = digest(password);
  const app = express();
  app.disable('x-powered-by');
  const error = (res, status, code, message) => res.status(status).json({ code, message });
  app.get('/healthz', (_req, res) => { try { if (persistent) store.read(); res.set('Cache-Control', 'no-store').json({ ok: true, service: 'unitally-team', storage: persistent ? 'postgres' : 'local', sandbox: true }); } catch { res.status(503).json({ ok: false }); } });
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), publickey-credentials-create=(), publickey-credentials-get=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    if (req.get('host') !== url.host) return error(res, 403, 'HOST_REJECTED', '分享地址不匹配。');
    if (now() >= expiresAt) return error(res, 410, 'SHARE_EXPIRED', '本次团队演示已到期，请联系组长重新开启。');
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return error(res, 405, 'METHOD_REJECTED', '不支持的请求方式。');
    if ((req.get('origin') && req.get('origin') !== origin) || (req.method === 'POST' && req.get('origin') !== origin)) return error(res, 403, 'ORIGIN_REJECTED', '请求来源不匹配，请从分享链接打开。');
    // Bounded global limiter: does not trust spoofable forwarded IP headers.
    requests = requests.filter(t => t > now() - 60000);
    if (requests.length >= 600) return error(res, 429, 'SHARE_RATE_LIMIT', '团队演示请求过多，请一分钟后重试。');
    requests.push(now());
    for (const [key, expiry] of sessions) if (expiry <= now()) sessions.delete(key);
    next();
  });
  const loginPage = (failed = false) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniTally · 团队体验</title><style>body{margin:0;background:#edf0e7;color:#303b2b;font:17px system-ui;display:grid;min-height:100dvh;place-items:center}main{margin:24px;padding:30px;max-width:420px;background:white;border-radius:24px;box-shadow:0 12px 50px #303b2b15}p{line-height:1.8;color:#66715c}input,button{box-sizing:border-box;width:100%;padding:16px;margin:12px 0;border:1px solid #ccd2c4;border-radius:12px;font:inherit}button{background:#33452d;color:white;cursor:pointer}.warn{color:#a65e21}label{display:block}</style><main><small>UniTally / TEAM PREVIEW</small><h1>欢迎来体验</h1><p>请输入组长提供的团队口令。这里是比赛原型，账户和资金全部为模拟；请勿填写真实银行卡号、身份证或密码。</p>${failed ? '<p role="alert" class="warn">口令不正确，请重新输入。</p>' : ''}<form action="/team/login" method="post"><label for="password">团队访问口令</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required><button>进入演示</button></form><p>AI 对话会发送给 DeepSeek。团队共享每日最多 ${maxDailyCalls} 次 AI 调用；页面内验证码不是短信验证。链接临时有效，电脑离线即不可用。</p></main></html>`;
  const renderLogin = failed => persistent ? loginPage(failed).replace('链接临时有效，电脑离线即不可用。', '固定云端地址，免费服务空闲后可能休眠，再次打开需等待唤醒。') : loginPage(failed);
  app.get('/team/login', (_req, res) => res.type('html').send(renderLogin()));
  app.post('/team/login', express.urlencoded({ extended: false, limit: '1kb' }), (req, res) => {
    loginAttempts = loginAttempts.filter(t => t > now() - 60000);
    if (loginAttempts.length >= 20) return error(res, 429, 'LOGIN_RATE_LIMIT', '口令尝试过多，请一分钟后重试。');
    loginAttempts.push(now());
    const input = typeof req.body.password === 'string' ? req.body.password : '';
    if (!timingSafeEqual(digest(input), expected)) return res.status(401).type('html').send(renderLogin(true));
    if (sessions.size >= 30) return error(res, 429, 'TEAM_SESSION_LIMIT', '团队登录设备已达上限。');
    const token = randomBytes(32).toString('hex');
    const expiry = Math.min(expiresAt, now() + 8 * 3600000);
    sessions.set(digest(token).toString('hex'), expiry);
    res.cookie(COOKIE, token, { secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiry - now() });
    res.redirect(303, '/');
  });
  app.use((req, res, next) => {
    const token = (req.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
    const key = digest(token).toString('hex');
    if (!sessions.has(key)) {
      if (req.path.startsWith('/api/')) return error(res, 401, 'TEAM_LOGIN_REQUIRED', '团队登录已失效，请刷新页面重新输入访问口令。');
      return res.redirect(303, '/team/login');
    }
    req.teamSessionKey = key;
    next();
  });
  app.post('/team/logout', (req, res) => {
    sessions.delete(req.teamSessionKey);
    res.clearCookie(COOKIE, { secure: true, httpOnly: true, sameSite: 'lax', path: '/' });
    res.redirect(303, '/team/login');
  });
  app.get('/team', (_req, res) => res.type('html').send('<!doctype html><meta charset="utf-8"><h1>UniTally 团队演示</h1><p>临时分享，仅模拟资金。</p><a href="/">返回演示</a><form method="post" action="/team/logout"><button>退出团队登录</button></form>'));
  const bank = createBankApp({ store, planner, now, maxDailyCalls, limits: { maxSessions: 30, maxConcurrentPlans: 2 } });
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    // Remote demo deliberately excludes native credential enrollment and code execution.
    if (!req.path.startsWith('/api/bank/') || /\/passkey(?:\/|$)|\/sandbox(?:\/|$)/i.test(req.path)) return error(res, 403, 'TEAM_CAPABILITY_DISABLED', '团队分享版不开放设备密钥注册或代码执行；不是生产银行认证。');
    // Only authenticated, origin-checked requests reach the existing loopback-only app.
    req.headers.host = 'localhost:5091';
    delete req.headers.origin;
    const json = res.json.bind(res);
    res.json = value => {
      for (const state of [value, value?.state]) if (state?.auth) state.auth.canRegister = false;
      return json(value);
    };
    bank.app(req, res, next);
  });
  app.use(express.static(staticDir, { dotfiles: 'deny', index: 'index.html', fallthrough: true, maxAge: 0 }));
  app.get(['/', '/mobile', '/bank-agent'], (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  app.use((_req, res) => error(res, 404, 'NOT_FOUND', '页面不存在。'));
  app.use((err, _req, res, _next) => error(res, err.status || 500, 'SHARE_REQUEST_FAILED', '请求未完成，请稍后重试。'));
  return { app, service: bank.service };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, '.cache/team-share/access.json'), 'utf8'));
  const { app } = createTeamShare({ ...config, store: createBankStore(path.join(__dirname, 'data/team-share.json')), staticDir: path.join(root, 'dist-mobile') });
  const server = app.listen(5093, '127.0.0.1', () => console.log('Password-protected team gateway ready on loopback port 5093.'));
  server.requestTimeout = 70000;
  server.headersTimeout = 15000;
}
module.exports = { createTeamShare };
