const path = require('node:path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
function requireDatabaseUrl(value, direct = false) {
  const url = new URL(value || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.password || !['require','verify-full'].includes(url.searchParams.get('sslmode'))) throw Error('A TLS-enabled Neon connection string is required');
  if (direct && url.hostname.includes('-pooler.')) throw Error('Migrations require the direct database connection');
  return value;
}
async function migrateDatabase(connectionString) {
  const pool = new Pool({ connectionString: requireDatabaseUrl(connectionString, true), max: 1, connectionTimeoutMillis: 15000, query_timeout: 15000 });
  try { await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, 'migrations') }); }
  finally { await pool.end(); }
}
module.exports = { requireDatabaseUrl, migrateDatabase };
