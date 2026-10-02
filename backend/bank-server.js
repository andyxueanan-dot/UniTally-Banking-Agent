const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '.env.bank.local') });
const { createBankStore } = require('./bank/store');
const { plannerFromEnvironment } = require('./bank/planner');
const { BankService } = require('./bank/service');
const { runWasmCalculation, LIMITS } = require('./bank/code-sandbox');

function createBankApp({ store, planner, now, maxDailyCalls, limits, passkeySdk, passkeyOrigin = 'http://localhost:5091' } = {}) {
  const app = express();
  const service = new BankService({ store: store || createBankStore(process.env.BANK_DATA_PATH || path.join(__dirname, 'data', 'bank-agent.json')),
    planner: planner || plannerFromEnvironment(), now, limits, passkeySdk, passkeyOrigin, maxDailyCalls: maxDailyCalls ?? Number(process.env.BANK_MAX_AI_CALLS_PER_DAY || 80) });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), publickey-credentials-create=(self), publickey-credentials-get=(self)');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.get('host') || '')) return res.status(403).json({ code: 'LOCAL_ONLY', message: '仅允许本机访问。' });
    const origin = req.get('origin');
    if (origin && origin !== service.passkey.origin && !/^http:\/\/(127\.0\.0\.1|localhost):(5091|8091)$/.test(origin)) return res.status(403).json({ code: 'ORIGIN_REJECTED', message: '来源不受信任。' });
    if (req.path.startsWith('/api/bank/passkey/') || /^\/api\/bank\/tasks\/[^/]+\/passkey\//.test(req.path)) {
      if (origin !== service.passkey.origin || req.get('host') !== new URL(service.passkey.origin).host) return res.status(403).json({
        code: 'PASSKEY_LOCALHOST_REQUIRED', message: '设备验证必须在固定的 localhost 页面完成；IP 入口不能注册或降级绕过 Passkey。', origin: service.passkey.origin,
      });
    }
    if (req.path.startsWith('/api/bank')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const token = req => (req.get('authorization') || '').replace(/^Bearer /, '');
  const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const send = (req, res, payload, status = 200) => {
    for (const snapshot of [payload, payload?.state]) if (snapshot?.auth) snapshot.auth.canRegister = snapshot.auth.canRegister && req.get('host') === new URL(service.passkey.origin).host;
    return res.status(status).json(payload);
  };
  const result = (req, res, value) => send(req, res, value.error ? { ...value.error, state: value.state } : value, value.error?.status || 200);
  let sandboxProbe; let sandboxProbeAt = 0;
  const sandboxStatus = async () => {
    if (!sandboxProbe || Date.now() - sandboxProbeAt > 15000) {
      sandboxProbeAt = Date.now();
      sandboxProbe = runWasmCalculation({ wat: '(module (func (export "calculate") (param i64 i64) (result i64) local.get 0))', inputs: [0, 0] });
    }
    const probe = await sandboxProbe;
    return { installed: probe.ok && probe.metrics.runtimeVersion === '49.0.0', runtime: 'wasmtime', version: '49.0.0', limits: LIMITS, trustedForLedger: false,
      statusNote: probe.ok ? '已实测运行时，不是仅检测文件存在。' : probe.error.message,
      installCommands: process.platform === 'win32' ? ['py -3 -m venv .venv-sandbox', '.\\.venv-sandbox\\Scripts\\python.exe -m pip install -r sandbox-requirements.txt'] : ['python3 -m venv .venv-sandbox', './.venv-sandbox/bin/python -m pip install -r sandbox-requirements.txt'] };
  };
  app.get('/api/bank/health', (req, res) => send(req, res, { ok: true, service: 'unitally-bank-sandbox', ...service.metadata() }));
  app.post('/api/bank/sessions', wrap((req, res) => send(req, res, service.create(req.body), 201)));
  app.get('/api/bank/state', wrap((req, res) => send(req, res, service.get(token(req)))));
  app.post('/api/bank/chat', wrap(async (req, res) => send(req, res, await service.chat(token(req), req.body))));
  app.post('/api/bank/prepare', wrap(async (req, res) => send(req, res, await service.prepareManual(token(req), req.body.action))));
  app.post('/api/bank/feedback', wrap((req, res) => send(req, res, service.feedback(token(req), req.body))));
  app.get('/api/bank/feedback', wrap((req, res) => send(req, res, service.feedbackExport(token(req)))));
  app.get('/api/bank/sandbox/status', wrap(async (req, res) => { service.get(token(req)); return send(req, res, await sandboxStatus()); }));
  app.post('/api/bank/sandbox/compute', wrap(async (req, res) => send(req, res, await service.compute(token(req), req.body))));
  app.post('/api/bank/workflows/:id/:action', wrap((req, res) => send(req, res, service.workflowControl(token(req), req.params.id, req.params.action))));
  app.post('/api/bank/passkey/register/options', wrap(async (req, res) => result(req, res, await service.passkeyRegistrationOptions(token(req)))));
  app.post('/api/bank/passkey/register/verify', wrap(async (req, res) => result(req, res, await service.passkeyRegistrationVerify(token(req), req.body))));
  app.post('/api/bank/tasks/:id/passkey/options', wrap(async (req, res) => result(req, res, await service.passkeyOptions(token(req), req.params.id))));
  app.post('/api/bank/tasks/:id/passkey/confirm', wrap(async (req, res) => result(req, res, await service.passkeyConfirm(token(req), req.params.id, req.body))));
  for (const name of ['challenge', 'confirm', 'cancel', 'reconcile']) {
    app.post(`/api/bank/tasks/:id/${name}`, wrap((req, res) => {
      result(req, res, service[name](token(req), req.params.id, req.body));
    }));
  }
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: '未开放的接口。' }));
  const dist = path.join(__dirname, '..', 'dist');
  // The standalone bank service must never fall back into the legacy login/Firebase app.
  app.get(['/', '/index.html'], (_req, res) => res.redirect(302, '/bank-agent'));
  app.use(express.static(dist));
  app.get(['/bank-agent', '/mobile'], (_req, res) => fs.existsSync(path.join(dist, 'index.html')) ? res.sendFile(path.join(dist, 'index.html')) : res.status(503).send('Please run npm run build first.'));
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code?.startsWith('AI_') || err.code === 'INVALID_AI_PLAN' ? 503 : 500);
    res.status(status).json({ code: err.code || 'INTERNAL_ERROR', message: status === 500 ? '后台暂时出错，没有生成成功回执。请刷新查询状态。' : err.message });
  });
  return { app, service };
}
if (require.main === module) {
  const { app } = createBankApp();
  const port = Number(process.env.BANK_PORT || 5091);
  app.listen(port, '127.0.0.1', () => console.log(`UniTally banking sandbox: http://127.0.0.1:${port}/bank-agent (fictional data only)`));
}
module.exports = { createBankApp };
