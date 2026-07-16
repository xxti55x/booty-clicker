/**
 * Booty Clicker leaderboard API — Cloudflare Worker (Hono).
 *
 * STUB: fully implemented in milestone M5. The game is offline-first, so this
 * service is always optional (client calls are fail-silent). Contract (spec §6):
 *   POST /api/scores       Body { nickname, bestTimeS } -> 201 { rank } | 400 | 429
 *   GET  /api/scores/top?limit=50 -> 200 [{ nickname, bestTimeS, createdAt }]
 */

export default {
  fetch(): Response {
    return new Response('Booty Clicker API — implemented in M5', {
      status: 501,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
