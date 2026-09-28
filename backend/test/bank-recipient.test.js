const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRecipient, replaceDemoPhones } = require('../bank/recipient');
const { seedSession } = require('../bank/seed');
const { hasPrivateData } = require('../bank/privacy');
const contacts = seedSession(Date.now()).contacts;
test('explicit fictional phone and contact note resolve to an exact contact', () => {
  assert.equal(resolveRecipient('00000001028', contacts).matches[0].id, 'wang');
  assert.equal(resolveRecipient('项目队友', contacts).matches[0].id, 'li');
  assert.equal(resolveRecipient('室友小王', contacts).matches[0].id, 'wang');
});
test('fictional-phone translation occurs locally without allowing unknown real-format data', () => {
  const r = replaceDemoPhones('给演示手机号00000001028转200元', contacts);
  assert.equal(r.text.includes('00000001028'), false); assert.match(r.text, /王明/); assert.equal(r.replacements.length, 1); assert.equal(hasPrivateData(r.text), false);
  const unknown = replaceDemoPhones('给13800138000转200元', contacts); assert.equal(hasPrivateData(unknown.text), true); assert.equal(unknown.replacements.length, 0);
});
test('embedded digits do not pass as known fixture phones and duplicate notes stay ambiguous', () => {
  assert.equal(replaceDemoPhones('1000000010287', contacts).replacements.length, 0);
  const copies = contacts.map(c => ({ ...c, note: '同组' })); assert.equal(resolveRecipient('同组', copies).matches.length, 4);
});
