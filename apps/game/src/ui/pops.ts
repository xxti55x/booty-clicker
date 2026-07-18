/**
 * Floating-number pops with pooling + batching (spec §8.3, B7). Two pure,
 * unit-tested pieces plus a thin DOM renderer:
 *
 *  - `PopBatcher` throttles the click hot-path to at most one pop per
 *    `POP_INTERVAL_MS`; suppressed hits accumulate into a running sum + count
 *    shown as e.g. "-12.4K ×7".
 *  - `NodePool` recycles a fixed ring of ≤ `POP_POOL_MAX` DOM nodes, so a burst
 *    never does `createElement` per click and never exceeds the node budget.
 *
 * The pure parts never touch the DOM (node-testable); `Pops` wires them to the
 * page and is the only DOM-touching export.
 */
import { fmt } from './format';

/** Max live pop DOM nodes (spec §8 AC2 — pool ≤ 24). */
export const POP_POOL_MAX = 24;
/** Minimum ms between rendered damage pops (the rest batch into the next one). */
export const POP_INTERVAL_MS = 80;

/** One raw hit fed to the batcher. */
export interface PopHit {
  value: number;
  crit: boolean;
  onBeat: boolean;
  x: number;
  y: number;
}

/** A batched pop ready to render (aggregate of the hits since the last emit). */
export interface PopEmit {
  value: number;
  count: number;
  crit: boolean;
  onBeat: boolean;
  x: number;
  y: number;
}

/**
 * Throttling accumulator: at most one emit per `intervalMs`. Hits arriving inside
 * the window fold into `value`/`count`; `crit`/`onBeat` stick if any hit had them;
 * the position tracks the most recent hit. Pure — `now` is injected.
 */
export class PopBatcher {
  private sum = 0;
  private count = 0;
  private crit = false;
  private onBeat = false;
  private x = 0;
  private y = 0;
  private lastEmit = -Infinity;

  constructor(private readonly intervalMs = POP_INTERVAL_MS) {}

  /** Feed a hit; returns a pop to render now, or null if it was batched. */
  push(hit: PopHit, now: number): PopEmit | null {
    this.sum += hit.value;
    this.count += 1;
    this.crit = this.crit || hit.crit;
    this.onBeat = this.onBeat || hit.onBeat;
    this.x = hit.x;
    this.y = hit.y;
    return this.maybeEmit(now);
  }

  /** Emit any pending batch once the throttle window has elapsed (call per frame). */
  flush(now: number): PopEmit | null {
    return this.maybeEmit(now);
  }

  private maybeEmit(now: number): PopEmit | null {
    if (this.count === 0) return null;
    if (now - this.lastEmit < this.intervalMs) return null;
    const out: PopEmit = {
      value: this.sum,
      count: this.count,
      crit: this.crit,
      onBeat: this.onBeat,
      x: this.x,
      y: this.y,
    };
    this.sum = 0;
    this.count = 0;
    this.crit = false;
    this.onBeat = false;
    this.lastEmit = now;
    return out;
  }
}

/**
 * Fixed-size round-robin object pool. `acquire()` hands out the next slot,
 * lazily building it via `factory` only the first time — so at most `max`
 * objects are ever created. Pure & generic (the DOM factory is injected).
 */
export class NodePool<T> {
  private readonly slots: (T | null)[];
  private idx = 0;
  private created = 0;

  constructor(
    private readonly max: number,
    private readonly factory: () => T,
  ) {
    this.slots = new Array<T | null>(max).fill(null);
  }

  acquire(): T {
    let node = this.slots[this.idx];
    if (node === null) {
      node = this.factory();
      this.slots[this.idx] = node;
      this.created += 1;
    }
    this.idx = (this.idx + 1) % this.max;
    return node;
  }

  /** How many objects the pool has actually created (never exceeds `max`). */
  get size(): number {
    return this.created;
  }
}

/** Format a batched emit into its floating-number label. */
export function popLabel(emit: PopEmit, sign: '+' | '-'): string {
  const prefix = `${emit.crit ? 'CRIT ' : ''}${emit.onBeat ? '♪ ' : ''}`;
  const suffix = emit.count > 1 ? ` ×${emit.count}` : '';
  return `${prefix}${sign}${fmt(emit.value)}${suffix}`;
}

/**
 * DOM renderer: batches damage pops, recycles ≤ `POP_POOL_MAX` nodes, and never
 * calls `createElement` in the click hot-path after warm-up. Replaces the old
 * per-click `ch-hud.spawnPop`.
 */
export class Pops {
  private readonly batcher = new PopBatcher();
  private readonly pool = new NodePool<HTMLElement>(POP_POOL_MAX, () => {
    const el = document.createElement('div');
    el.className = 'pop';
    document.body.appendChild(el);
    return el;
  });

  /** Feed a click's damage; renders (batched) if the throttle window allows. */
  damage(hit: PopHit, now: number): void {
    const emit = this.batcher.push(hit, now);
    if (emit) this.render(emit, '-');
  }

  /** Flush a pending damage batch (call once per frame so trailing hits appear). */
  frame(now: number): void {
    const emit = this.batcher.flush(now);
    if (emit) this.render(emit, '-');
  }

  /** A one-off gold pop (zone-clear reward) — unbatched, but still pooled. */
  gold(value: number, x: number, y: number): void {
    this.render({ value, count: 1, crit: false, onBeat: false, x, y }, '+');
  }

  /** Live DOM node count (for smoke/pool-budget checks) — never exceeds the pool. */
  get liveNodes(): number {
    return this.pool.size;
  }

  private render(emit: PopEmit, sign: '+' | '-'): void {
    const el = this.pool.acquire();
    el.className = `pop${emit.crit ? ' crit' : ''}${emit.onBeat ? ' onbeat' : ''}${
      sign === '+' ? ' gold' : ''
    }`;
    el.textContent = popLabel(emit, sign);
    el.style.left = `${emit.x}px`;
    el.style.top = `${emit.y}px`;
    // Restart the CSS rise animation on a recycled node.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
}
