// Feishu (飞书) long-connection transport. The process connects out to Feishu over WebSocket, so no
// public webhook is needed and the team password gate stays untouched. Only parses inbound events and
// sends text; all decisions live in gateway.js. Enabled only when IM_CHANNEL=feishu and app credentials
// are present (FEISHU_APP_ID / FEISHU_APP_SECRET, from the Feishu open platform; never committed).
function parseInbound(data) {
  const m = data?.message; const openId = data?.sender?.sender_id?.open_id;
  if (!m || !openId || data?.sender?.sender_type === 'app') return null;
  let text = '';
  if (m.message_type === 'text') { try { text = String(JSON.parse(m.content).text || ''); } catch { text = ''; } }
  else text = '[暂不支持图片、语音等消息，请发送文字]';
  text = text.replace(/@_user_\d+\s*/g, '').trim();
  return { channel: 'feishu', appId: data.app_id || null, openId, chatId: m.chat_id, chatType: m.chat_type, messageId: m.message_id, text, displayName: null };
}

function createFeishuTransport({ appId, appSecret, sdk = require('@larksuiteoapi/node-sdk'), log = console }) {
  if (!appId || !appSecret) throw new Error('FEISHU_APP_ID / FEISHU_APP_SECRET are required');
  const client = new sdk.Client({ appId, appSecret });
  const ws = new sdk.WSClient({ appId, appSecret, loggerLevel: sdk.LoggerLevel.warn });
  async function send(chatId, text) {
    await client.im.v1.message.create({ params: { receive_id_type: 'chat_id' }, data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) } });
  }
  function start(onInbound) {
    const dispatcher = new sdk.EventDispatcher({}).register({
      // Acknowledge immediately and work in the background: Feishu redelivers slow events,
      // and the gateway de-duplicates by message_id.
      'im.message.receive_v1': data => {
        const msg = parseInbound(data); if (!msg) return;
        setImmediate(async () => {
          try { for (const r of await onInbound(msg)) await send(r.chatId, r.text); }
          catch (e) { log.error('IM reply failed', e?.code || e?.message || 'unknown'); }
        });
      },
    });
    return ws.start({ eventDispatcher: dispatcher });
  }
  return { start, send, close: () => ws.close({ force: true }) };
}
module.exports = { createFeishuTransport, parseInbound };
