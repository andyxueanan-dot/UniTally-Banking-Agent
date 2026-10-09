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
  // Raised for the review period (评委会自由输入)；每个演示账户另有 aiCallsPerSession 上限，一个访客用不完全天额度。
  if (!Number.isInteger(maxDailyCalls) || maxDailyCalls < 0 || maxDailyCalls > 1000) throw Error('Team AI daily limit must be 0-1000');
  const sessions = authSessions || new Map();
  let loginAttempts = [];
  let requests = [];
  const expected = digest(password);
  const app = express();
  app.disable('x-powered-by');
  const error = (res, status, code, message) => res.status(status).json({ code, message });
  app.get('/healthz', (_req, res) => { try { if (persistent) store.read(); res.set('Cache-Control', 'no-store').json({ ok: true, service: 'unitally-team', product: 'Orbit', storage: persistent ? 'postgres' : 'local', sandbox: true,
    release: /^[a-f0-9]{40}$/.test(process.env.RENDER_GIT_COMMIT || '') ? process.env.RENDER_GIT_COMMIT : 'local', features: { calendarVersion: 1, feedback: true, compatiblePlanner: true, riskQuestionnaire: 'suzhou-v202308-finp-v1' } }); } catch { res.status(503).json({ ok: false }); } });
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
  // Login gate in the same visual language as the V2 interface: white paper, ink, hairlines.
  const loginPage = (failed = false) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit · 团队体验</title><style>:root{--ink:#1a1a18;--ink-2:#4c4c47;--ink-3:#7c7c75;--rule:#e6e6e1;--rule-2:#c8c8c1;--red:#a8321f}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100dvh;display:flex;flex-direction:column}main{width:100%;max-width:420px;margin:auto;padding:48px 24px 40px}.wordmark{display:flex;align-items:center;gap:10px}.wordmark svg{width:30px;height:30px;color:#0b5cad;flex:none}.wordmark span{font:500 30px/1.1 "Palatino Linotype","Book Antiqua",Palatino,Georgia,"Noto Serif","Songti SC",serif;letter-spacing:-.3px}.kicker{display:block;font-size:12px;color:var(--ink-3);letter-spacing:.6px;margin-top:8px}h1{font-size:22px;font-weight:600;letter-spacing:-.2px;margin:36px 0 10px}p{margin:0;color:var(--ink-2);line-height:1.7}form{margin-top:28px;padding-top:24px;border-top:1px solid var(--rule)}label{display:block;font-size:13px;color:var(--ink-2);margin-bottom:8px}input{width:100%;min-height:48px;padding:11px 14px;border:1px solid var(--rule-2);border-radius:2px;font:inherit;font-size:16px;color:var(--ink);background:#fff}input:focus{outline:2px solid var(--ink);outline-offset:1px;border-color:var(--ink)}button{width:100%;min-height:48px;margin-top:14px;border:1px solid var(--ink);border-radius:2px;background:var(--ink);color:#fff;font:inherit;font-size:15px;font-weight:600;letter-spacing:.2px;cursor:pointer}button:hover{background:#000}.warn{border-left:2px solid var(--red);padding:6px 0 6px 12px;color:var(--ink);margin:16px 0 0}.note{margin-top:28px;padding-top:18px;border-top:1px solid var(--rule);font-size:12px;color:var(--ink-3)}.note b{color:var(--ink-2);font-weight:600}footer{padding:16px 24px calc(16px + env(safe-area-inset-bottom));font-size:12px;color:var(--ink-3);text-align:center}</style><main><div class="wordmark"><svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M24 128 A104 104 0 1 0 232 128 A104 104 0 1 0 24 128 Z M76 118 A66 66 0 1 0 208 118 A66 66 0 1 0 76 118 Z"/></svg><span>Orbit</span></div><small class="kicker">团队体验 · 比赛原型 · 仅模拟资金</small><h1>欢迎来体验</h1><p>请输入组长提供的团队口令。这里的账户、资金、产品和订单全部是模拟数据；请勿填写真实银行卡号、身份证或密码。</p>${failed ? '<p role="alert" class="warn">口令不正确，请重新输入。</p>' : ''}<form action="/team/login" method="post"><label for="password">团队访问口令</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required><button>进入演示</button></form><p class="note"><b>关于 AI 调用</b>：AI 对话会发送给后端配置的模型供应商，团队每日合计最多 ${maxDailyCalls} 次；页面内验证码不是短信验证。链接临时有效，电脑离线即不可用。</p></main><footer>Orbit Banking Lab · 国内赛题原型 · 非真实金融服务</footer></html>`;
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
  const PUBLIC_ASSETS = new Set(['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/maskable-512.png', '/site.webmanifest']);
  const publicAssets = express.static(staticDir, { dotfiles: 'deny', index: false, fallthrough: true, maxAge: 0 });
  app.use((req, res, next) => {
    const token = (req.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
    const key = digest(token).toString('hex');
    if (!sessions.has(key)) {
      if (req.path.startsWith('/api/')) return error(res, 401, 'TEAM_LOGIN_REQUIRED', '团队登录已失效，请刷新页面重新输入访问口令。');
      // Brand icons and the web manifest are public: the login page's tab icon and "add to home screen" need them before any login.
      if (req.method === 'GET' && PUBLIC_ASSETS.has(req.path)) return publicAssets(req, res, next);
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
  app.get('/team', (_req, res) => res.type('html').send('<!doctype html><meta charset="utf-8"><h1>Orbit 团队演示</h1><p>临时分享，仅模拟资金。</p><a href="/">返回演示</a><form method="post" action="/team/logout"><button>退出团队登录</button></form>'));
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
