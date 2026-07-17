/**
 * Leaderboard client (spec §5 M5) — completely fail-silent (§4.4). Every call
 * returns null on timeout, network error, or when no API is configured, so the
 * game is fully playable offline. The API base URL comes from `VITE_API_BASE`
 * (empty by default → leaderboard disabled); the Worker lives in `apps/api`.
 */

export interface ScoreEntry {
  nickname: string;
  bestTimeS: number;
  createdAt: string;
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

async function safeFetch(path: string, init?: RequestInit): Promise<Response | null> {
  if (!API_BASE) return null;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(API_BASE + path, { ...init, signal: ctrl.signal });
  } catch {
    return null; // network error / abort — fail silent
  } finally {
    window.clearTimeout(timer);
  }
}

/** Submit a boss-kill time. Returns the rank, or null on any failure. */
export async function submitScore(
  nickname: string,
  bestTimeS: number,
): Promise<{ rank: number } | null> {
  const res = await safeFetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, bestTimeS }),
  });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as { rank: number };
  } catch {
    return null;
  }
}

/** Fetch the top scores (ascending by time). Returns null on any failure. */
export async function fetchTop(limit = 50): Promise<ScoreEntry[] | null> {
  const res = await safeFetch(`/api/scores/top?limit=${limit}`);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as ScoreEntry[];
  } catch {
    return null;
  }
}
