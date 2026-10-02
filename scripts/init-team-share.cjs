const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const origin = process.argv[2];
if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin || '')) throw Error('Expected the exact assigned temporary tunnel URL');
const dir = path.resolve(__dirname, '../.cache/team-share');
fs.mkdirSync(dir, { recursive: true });
const config = { origin, password: randomBytes(18).toString('base64url'), expiresAt: Date.now() + 24 * 3600000, maxDailyCalls: 20 };
// Intentionally local-only. This generated credential must never enter Git/build output.
fs.writeFileSync(path.join(dir, 'access.json'), JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ origin, expiresAt: new Date(config.expiresAt).toISOString(), maxDailyCalls: config.maxDailyCalls, credentialFile: path.join(dir, 'access.json') }));
