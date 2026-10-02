CREATE TABLE IF NOT EXISTS "unitally_app_state" (
  "key" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL
);
