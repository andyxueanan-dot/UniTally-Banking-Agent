// Heuristic guard for a fictional-data-only demo, not a general PII detector.
function normalized(value) {
  return String(value || '').normalize('NFKC').replace(/[\u200B-\u200F\u2060\uFEFF]/g, '');
}
function hasPrivateData(value) {
  const text = normalized(value);
  if (/sk-[a-zA-Z0-9]{12,}/i.test(text)) return true;
  return /(?<!\d)\d(?:[\s\-–—().]*\d){10,}(?!\d)/u.test(text);
}
function safeHistory(history) {
  return history.map(message => ({ role: message.role, content: hasPrivateData(message.text)
    ? '[历史内容包含疑似敏感数据，未发送给模型；请重新提供虚构业务信息。]' : message.text }));
}
module.exports = { normalized, hasPrivateData, safeHistory };
