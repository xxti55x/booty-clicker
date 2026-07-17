import { Hono } from 'hono';
import { cors } from 'hono/cors';

/**
 * Booty Clicker leaderboard API — Cloudflare Worker (Hono). Spec §5 M5 / §6.
 *
 *   POST /api/scores       { nickname, bestTimeS } -> 201 { rank } | 400 | 429
 *   GET  /api/scores/top?limit=50 -> 200 [{ nickname, bestTimeS, createdAt }]
 *
 * Storage (D1) and the per-IP rate limiter (KV) sit behind small interfaces so
 * the request logic is unit-testable with in-memory fakes (no wrangler needed).
 * No PII beyond the freely chosen nickname (spec §2, §4.5).
 */

export interface ScoreRow {
  nickname: string;
  bestTimeS: number;
  createdAt: string;
}

export interface ScoreRepo {
  insert(row: ScoreRow): Promise<void>;
  /** 1-based rank: how many stored times beat `bestTimeS`, plus one (lower = better). */
  rankFor(bestTimeS: number): Promise<number>;
  top(limit: number): Promise<ScoreRow[]>;
}

export interface RateLimiter {
  /** Returns true if this IP is still under its per-minute budget. */
  allow(ip: string): Promise<boolean>;
}

/** Max submissions per IP per minute (spec §5 M5). */
export const RATE_LIMIT_PER_MIN = 5;

const NICK_RE = /^[a-zA-Z0-9_ ]{2,16}$/;

/** Nickname filter: only `[a-zA-Z0-9_ ]`, length 2–16 (trimmed). Returns null if invalid. */
export function validateNickname(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return NICK_RE.test(t) ? t : null;
}

/** Boss-kill time in whole seconds, 1..86400. Returns null if invalid. */
export function validateTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 86_400 ? v : null;
}

export type EnvFactory<E, T> = (env: E) => T;

/**
 * Build the Hono app from repo + limiter factories (which receive the Worker
 * env). Exported so tests can inject fakes; production wires D1 + KV below.
 */
export function createApp<E extends object>(
  makeRepo: EnvFactory<E, ScoreRepo>,
  makeLimiter: EnvFactory<E, RateLimiter>,
): Hono<{ Bindings: E }> {
  const app = new Hono<{ Bindings: E }>();
  app.use('/api/*', cors());

  app.post('/api/scores', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'anonymous';
    if (!(await makeLimiter(c.env).allow(ip))) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const nickname = validateNickname(b.nickname);
    const bestTimeS = validateTime(b.bestTimeS);
    if (nickname === null || bestTimeS === null) {
      return c.json({ error: 'validation' }, 400);
    }

    const repo = makeRepo(c.env);
    await repo.insert({ nickname, bestTimeS, createdAt: new Date().toISOString() });
    const rank = await repo.rankFor(bestTimeS);
    return c.json({ rank }, 201);
  });

  app.get('/api/scores/top', async (c) => {
    const raw = Number(c.req.query('limit') ?? '50');
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 50;
    const rows = await makeRepo(c.env).top(limit);
    return c.json(rows, 200);
  });

  return app;
}

// ---------- production adapters (D1 + KV) ----------

interface Bindings {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
}

function d1Repo(env: Bindings): ScoreRepo {
  return {
    async insert(row) {
      await env.DB.prepare(
        'INSERT INTO scores (nickname, best_time_s, created_at) VALUES (?, ?, ?)',
      )
        .bind(row.nickname, row.bestTimeS, row.createdAt)
        .run();
    },
    async rankFor(bestTimeS) {
      const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE best_time_s < ?')
        .bind(bestTimeS)
        .first<{ c: number }>();
      return (r?.c ?? 0) + 1;
    },
    async top(limit) {
      const res = await env.DB.prepare(
        'SELECT nickname, best_time_s AS bestTimeS, created_at AS createdAt FROM scores ORDER BY best_time_s ASC LIMIT ?',
      )
        .bind(limit)
        .all<ScoreRow>();
      return res.results ?? [];
    },
  };
}

function kvLimiter(env: Bindings): RateLimiter {
  return {
    async allow(ip) {
      const key = `rl:${ip}`;
      const current = Number((await env.RATE_LIMIT.get(key)) ?? '0');
      if (current >= RATE_LIMIT_PER_MIN) return false;
      await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 });
      return true;
    },
  };
}

export default createApp<Bindings>(d1Repo, kvLimiter);
