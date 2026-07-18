/**
 * Seedable, counter-based RNG (splitmix32 finalizer) — pure & deterministic.
 *
 * The stream is a pure function of `(seed, cursor)`: the n-th draw is
 * `hash32((seed + n) | 0)`. Because a draw depends only on the counter, the
 * persisted `{ seed, cursor }` pair resumes the *identical* subsequent sequence
 * in O(1) — no replay loop (unlike a stateful mulberry32, which would have to
 * re-run `cursor` steps on load). This keeps gameplay rolls (crits now; loot,
 * quests, gilds later) fully reproducible and save-scum-proof.
 *
 * `Math.random`/`Date.now` are used ONLY inside `randomSeed()` — seed creation
 * is the single sanctioned source of non-determinism. Every gameplay roll must
 * draw from here; `Math.random` stays reserved for cosmetic-only randomness
 * (particle directions, camera-shake offsets, choreography).
 */

/** The serializable RNG state. `cursor` = number of draws taken so far. */
export interface RngState {
  seed: number;
  cursor: number;
}

/**
 * splitmix32 finalizer: maps a 32-bit integer to a float in [0, 1). Consecutive
 * inputs (seed, seed+1, …) are well-distributed — the property splitmix exists
 * for, so a counter is a valid stream source.
 */
export function hash32(x: number): number {
  let t = (x + 0x9e3779b9) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  t = t ^ (t >>> 15);
  return (t >>> 0) / 4294967296;
}

/** Pure draw at a given cursor — float in [0, 1). O(1), no replay. */
export function floatAt(seed: number, cursor: number): number {
  return hash32((seed + cursor) | 0);
}

/**
 * Create a fresh 32-bit seed. This is the ONLY function allowed to be
 * non-deterministic (mixes `Math.random` + `Date.now`).
 */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0x1_0000_0000) ^ (Date.now() | 0)) | 0;
}

/** A brand-new RNG state (random seed unless one is supplied), cursor at 0. */
export function createRngState(seed: number = randomSeed()): RngState {
  return { seed: seed | 0, cursor: 0 };
}

/**
 * Small stateful wrapper for the game loop: `next()` draws and advances the
 * cursor; `seed`/`cursor` are readable; `toState()` serializes for the save.
 */
export class Rng {
  private _seed: number;
  private _cursor: number;

  constructor(state?: RngState) {
    this._seed = (state?.seed ?? randomSeed()) | 0;
    this._cursor = Math.max(0, Math.trunc(state?.cursor ?? 0));
  }

  get seed(): number {
    return this._seed;
  }

  get cursor(): number {
    return this._cursor;
  }

  /** Draw the next float in [0, 1) and advance the cursor by one. */
  next(): number {
    const v = floatAt(this._seed, this._cursor);
    this._cursor += 1;
    return v;
  }

  /** A serializable snapshot for persistence. */
  toState(): RngState {
    return { seed: this._seed, cursor: this._cursor };
  }
}
