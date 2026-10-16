// Start the Feishu long connection when configured. Off by default; secrets come from the environment.
const { createFeishuTransport } = require('./feishu-transport');
function startFeishu(im, env = process.env) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) { console.warn('IM_CHANNEL=feishu but FEISHU_APP_ID / FEISHU_APP_SECRET are missing; Feishu channel not started.'); return null; }
  const transport = createFeishuTransport({ appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET });
  transport.start(im.handleInbound).then(() => console.log('Feishu channel connected (long connection).'), e => console.error('Feishu channel failed to start:', e?.message || e));
  return transport;
}
module.exports = { startFeishu };
