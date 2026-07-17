-- Booty Clicker leaderboard — Cloudflare D1 (SQLite). Spec §5 M5.
-- Apply: npx wrangler d1 execute booty-clicker --file=./schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY,
  nickname    TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 16),
  best_time_s INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_best_time ON scores (best_time_s ASC);
