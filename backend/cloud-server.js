const path = require('node:path');
const { createHash } = require('node:crypto');
const { migrateDatabase, requireDatabaseUrl } = require('./cloud/migrate');
const { createPgStore, persistentSessions } = require('./cloud/pg-store');
const { createTeamShare } = require('./team-share-server');
async function main() {
  const origin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  const password = process.env.TEAM_ACCESS_PASSWORD;
  const port = Number(process.env.PORT || 10000);
  if (!origin || !password || password.length < 24 || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('Missing or invalid cloud configuration');
  requireDatabaseUrl(process.env.DATABASE_URL);
  // Startup watchdog: a hung database connection used to leave Render waiting 15 minutes with no log line.
  // Fail fast and say which stage stalled (no secrets are printed).
  const watchdog = setTimeout(() => { console.error('Cloud startup watchdog: database migration/connection did not finish within 90s. Check the database (Neon) status and DATABASE_URL_UNPOOLED, then redeploy.'); process.exit(1); }, 90000);
  console.log('Cloud startup: migrating database...');
  await migrateDatabase(process.env.DATABASE_URL_UNPOOLED);
  console.log('Cloud startup: database ready; starting gateway...');
  const store = createPgStore({ connectionString: process.env.DATABASE_URL });
  const loginStore = createPgStore({ connectionString: process.env.DATABASE_URL, key: 'team-logins' });
  const authSessions = persistentSessions(loginStore, createHash('sha256').update(password).digest('hex').slice(0, 24));
  const { app } = createTeamShare({ origin, password, persistent: true, authSessions, store,
    staticDir: path.join(__dirname, '../dist-mobile'), maxDailyCalls: Number(process.env.BANK_MAX_AI_CALLS_PER_DAY || 20) });
  const server = app.listen(port, '0.0.0.0', () => { clearTimeout(watchdog); console.log('Orbit cloud gateway ready; Postgres persistence; simulated funds only.'); });
  server.requestTimeout = 70000; server.headersTimeout = 15000;
  const stop = () => { server.close(() => { store.close(); loginStore.close(); process.exit(0); }); setTimeout(() => process.exit(1), 25000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (require.main === module) main().catch(() => { console.error('Cloud startup failed. Check required secret variables and database availability. No secrets are logged.'); process.exit(1); });
module.exports = { main };
