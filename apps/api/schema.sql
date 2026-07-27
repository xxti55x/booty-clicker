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

-- X4 (ROADMAP-V2): keyed boards alongside the all-time board above. `scores_v2`
-- stays EXACTLY as it is — the all-time best-zone board keeps its table, its SQL
-- and its data; a request without a `board` (or with `board=all`) never touches
-- this table. Everything else lands here, keyed by board:
--   `weekly-<ISO week index>`  — the game's weekly board (A5)
-- A weekly board therefore resets by itself: next Monday the key changes and the
-- new board starts empty. No cron job, no truncate, no season bookkeeping.
CREATE TABLE IF NOT EXISTS scores_boards (
  board      TEXT NOT NULL,
  nickname   TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 16),
  max_zone   INTEGER NOT NULL,
  souls      REAL NOT NULL,
  ascensions INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (board, nickname)
);

CREATE INDEX IF NOT EXISTS idx_scores_boards_rank ON scores_boards (board, max_zone DESC);
