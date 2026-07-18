/**
 * Leaderboard client v2 (spec §7.4/§9.7, M13) — completely fail-silent (P5). Every
 * call resolves to `null` on a network error, a non-2xx status, a timeout, an
 * invalid nickname, or when no API is configured, so the game is fully playable
 * offline and a submit prompt never throws.
 *
 * The v2 metric is the endless `maxZone` (= `lifetimeMaxZone`), submitted with the
 * display stats `souls`/`ascensions`; the Worker upserts per nickname and only
 * raises a stored `maxZone` (§9.7, already merged + tested server-side).
 *
 * Default-OFF discipline (M5): the API base comes from `VITE_API_BASE` (empty by
 * default ⇒ leaderboard disabled ⇒ every call is a no-op returning `null`). Tests
 * inject a fake `fetch` + base via the options argument, so the success/failure/
 * disabled paths are all deterministic without touching the environment.
 */

/** A leaderboard row returned by the v2 top endpoint (§9.7). */
export interface ScoreEntry {
  nickname: string;
  maxZone: number;
  souls: number;
  ascensions: number;
  updatedAt: string;
}

/** The score payload submitted for a nickname (§9.7). */
export interface ScorePayload {
  maxZone: number;
  souls: number;
  ascensions: number;
}

/** The minimal shape of a fetch response this client consumes. */
interface ResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

/** A `fetch`-compatible function (the real `fetch` satisfies this). */
type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

/** Per-call overrides — production defaults come from the environment + global `fetch`. */
export interface LeaderboardOpts {
  /** API base URL (defaults to `VITE_API_BASE`). Empty ⇒ disabled ⇒ `null`. */
  base?: string;
  /** Injected fetch (defaults to the global `fetch`) — for tests. */
  fetchImpl?: FetchLike;
  /** Abort timeout in ms (defaults to {@link TIMEOUT_MS}). */
  timeoutMs?: number;
}

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 3000;

/** True when a leaderboard API is configured (so submit/top UI is worth showing). */
export function isLeaderboardEnabled(): boolean {
  return API_BASE.length > 0;
}

const NICK_RE = /^[a-zA-Z0-9_ ]{2,16}$/;

/** Client-side nickname check mirroring the Worker's filter. Returns trimmed value or null. */
export function validateClientNickname(v: string): string | null {
  const t = v.trim();
  return NICK_RE.test(t) ? t : null;
}

/** Resolve the effective base for a call, trimming trailing slashes. */
function resolveBase(opts?: LeaderboardOpts): string {
  const b = opts?.base ?? API_BASE;
  return b.replace(/\/+$/, '');
}

/**
 * Fail-silent fetch: returns `null` when the base is empty (disabled — WITHOUT
 * calling fetch), on any thrown error, on abort/timeout, or when the response is
 * not `ok`. Never throws.
 */
async function safeFetch(
  path: string,
  init: RequestInit,
  opts: LeaderboardOpts | undefined,
): Promise<ResponseLike | null> {
  const base = resolveBase(opts);
  if (!base) return null; // disabled ⇒ no network call
  const doFetch: FetchLike = opts?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof doFetch !== 'function') return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await doFetch(base + path, { ...init, signal: ctrl.signal });
    return res && res.ok ? res : null;
  } catch {
    return null; // network error / abort — fail silent
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a score for `nickname` (§9.7): `POST /api/v2/scores`. Validates the
 * nickname client-side first (returns `null` without a network call if invalid).
 * Resolves to `{ rank }` on success, or `null` on any failure / when disabled.
 */
export async function submitScore(
  nickname: string,
  payload: ScorePayload,
  opts?: LeaderboardOpts,
): Promise<{ rank: number } | null> {
  const nick = validateClientNickname(nickname);
  if (nick === null) return null;
  const res = await safeFetch(
    '/api/v2/scores',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: nick,
        maxZone: payload.maxZone,
        souls: payload.souls,
        ascensions: payload.ascensions,
      }),
    },
    opts,
  );
  if (!res) return null;
  try {
    return (await res.json()) as { rank: number };
  } catch {
    return null;
  }
}

/**
 * Fetch the top scores (`GET /api/v2/scores/top`), ordered maxZone-desc by the
 * Worker. Resolves to the rows on success, or `null` on any failure / when disabled.
 */
export async function fetchTop(limit = 50, opts?: LeaderboardOpts): Promise<ScoreEntry[] | null> {
  const res = await safeFetch(`/api/v2/scores/top?limit=${limit}`, { method: 'GET' }, opts);
  if (!res) return null;
  try {
    return (await res.json()) as ScoreEntry[];
  } catch {
    return null;
  }
}
