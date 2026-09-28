const { normalized } = require('./privacy');

// Name and tail are independent constraints; a contradictory identifier never wins.
function resolveRecipient(input, contacts) {
  const text = normalized(input).trim();
  const direct = contacts.filter(c => c.id === text || c.alias.includes(text) || (c.demoPhone && c.demoPhone === text) || (c.note && c.note === text));
  if (direct.length && direct.some(c => c.demoPhone === text || c.note === text)) return { matches: direct };
  const tails = [...text.matchAll(/(?<!\d)\d{4}(?!\d)/g)].map(match => match[0]);
  const named = contacts.filter(c => c.alias.some(alias => text.includes(alias)));
  const tailMatches = contacts.filter(c => tails.includes(c.last4));
  if (tails.length > 1 || new Set(named.map(c => c.name)).size > 1 || (named.length && tails.length && !named.some(c => tailMatches.includes(c)))) return { conflict: true, matches: [] };
  if (named.length && tails.length) return { matches: named.filter(c => tailMatches.includes(c)) };
  if (direct.length) return { matches: direct };
  if (tails.length) {
    // Permit only an explicit tail with neutral account wording, not an unknown name.
    const residue = text.replace(/\d{4}/g, '').replace(/账户|账号|银行卡|卡号|收款人|收款|尾号|尾数|后四位|后4位|卡|[\s:：()（）,，·-]/g, '');
    return residue ? { conflict: true, matches: [] } : { matches: tailMatches };
  }
  return { matches: [] };
}
// Only the explicitly fictional, invalid-as-real-phone 000-prefixed fixture
// numbers are replaced locally. Unknown phone/account numbers stay blocked by
// the privacy boundary; no raw phone number is sent to the model.
function replaceDemoPhones(input, contacts) {
  let text = normalized(input);
  const replacements = [];
  for (const c of contacts) {
    if (!/^000\d{8}$/.test(c.demoPhone || '')) continue;
    const pattern = new RegExp(`(?<!\\d)${c.demoPhone}(?!\\d)`, 'g');
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0; text = text.replace(pattern, `${c.name}（账户尾号${c.last4}）`);
    replacements.push({ recipientId: c.id, last4: c.last4 });
  }
  return { text, replacements };
}
module.exports = { resolveRecipient, replaceDemoPhones };
