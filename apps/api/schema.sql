-- Booty Clicker leaderboard — Cloudflare D1 (SQLite). Spec §5 M5 / §9.7.
-- Apply: npx wrangler d1 execute booty-clicker --file=./schema.sql

-- v1: boss-kill time metric (lower = better). Kept intact alongside v2.
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY,
  nickname    TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 16),
  best_time_s INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_best_time ON scores (best_time_s ASC);

-- v2: endless `maxZone` metric (higher = better; §7.4/§9.7, behebt B8).
-- PRIMARY KEY on nickname is the UNIQUE target for the per-nickname upsert.
CREATE TABLE IF NOT EXISTS scores_v2 (
  nickname   TEXT PRIMARY KEY,
  max_zone   INTEGER NOT NULL,
  souls      REAL NOT NULL,
  ascensions INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_v2_max_zone ON scores_v2 (max_zone DESC);
