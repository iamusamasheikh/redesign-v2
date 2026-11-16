import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});

export const q = (text, params) => pool.query(text, params);

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  collection  TEXT        NOT NULL,
  id          TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  sort        INTEGER     NOT NULL DEFAULT 0,
  published   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS documents_collection_sort ON documents (collection, sort);

CREATE TABLE IF NOT EXISTS leads (
  id          BIGSERIAL   PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  phone       TEXT        NOT NULL DEFAULT '',
  service     TEXT        NOT NULL DEFAULT '',
  message     TEXT        NOT NULL DEFAULT '',
  estimate    TEXT        NOT NULL DEFAULT '',
  page        TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'new',
  notes       TEXT        NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at DESC);

CREATE TABLE IF NOT EXISTS media (
  id          TEXT        PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  filename    TEXT        NOT NULL,
  mime        TEXT        NOT NULL,
  width       INTEGER,
  height      INTEGER,
  bytes       BYTEA       NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGSERIAL   PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok          BOOLEAN     NOT NULL,
  ip          TEXT        NOT NULL DEFAULT ''
);
`;

export async function migrate() {
  await pool.query(SCHEMA);
}
