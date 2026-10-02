const { pgTable, text, jsonb, integer } = require('drizzle-orm/pg-core');
// Whole-state transactions preserve the sandbox's existing synchronous policy engine.
// Deliberately bounded to a small team; not a scalable banking schema.
const appState = pgTable('unitally_app_state', {
  key: text('key').primaryKey(),
  payload: jsonb('payload').notNull(),
  revision: integer('revision').notNull().default(0),
});
module.exports = { appState };
