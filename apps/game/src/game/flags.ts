/**
 * Build-time feature flags — one dependency-free place to gate *scaffolded* systems
 * out of live play until their milestone flips them on.
 *
 * M14 ships the **Transzendenz** layer (Schicht 3, spec §4.5.3) as a *scaffold*:
 * pure, tested formulas in `transcend.ts`, but the layer itself switched **off** —
 * no `ChState` slice, no save field, no UI. `TRANSCEND_ENABLED` is the single source
 * of truth; M15 turns it on once the L1/L2 live-data tuning (§11, open question #5)
 * is settled, WITHOUT reworking the math. The guard test asserts the constant is
 * `false`, so the half-built layer can never leak into a shipped build by accident.
 *
 * This module deliberately imports nothing from the game so any layer (formulas,
 * glue, UI) can read a flag without risking an import cycle. Flags are compile-time
 * constants; an optional, defensive `VITE_<FLAG>` env override exists for local dev
 * only and never throws. Note the override reads `import.meta.env` by a **computed**
 * key (`import.meta.env[`VITE_${key}`]`), which Vite does **not** statically replace —
 * so it resolves at runtime (to `undefined` in a production build, where no such vars
 * exist), leaving the compile-time `FLAGS` default as the shipped value. It can never
 * change a shipped build; today the module has no live importer at all.
 */

/** Master switch for the Transzendenz layer (Schicht 3, §4.5.3). Ships OFF (M14). */
export const TRANSCEND_ENABLED = false;

/** The typed flag registry — extend this as new scaffolds land behind a switch. */
export interface FeatureFlags {
  /** Transzendenz (Schicht 3) — formulas live in M14, wiring + UI arrive with M15. */
  readonly transcend: boolean;
}

/** The compile-time flag defaults (the values a shipped build uses). */
export const FLAGS: FeatureFlags = {
  transcend: TRANSCEND_ENABLED,
};

/**
 * Read a `VITE_<KEY>` env override for a flag, defensively. Returns `undefined`
 * when the var is unset or unparseable (so the compile-time default wins) and NEVER
 * throws, even where `import.meta.env` is absent. Dev-only affordance for flipping a
 * scaffold on locally; a production build has no such vars and uses the constants.
 */
function envOverride(key: string): boolean | undefined {
  let raw: unknown;
  try {
    raw = import.meta.env?.[`VITE_${key}`];
  } catch {
    return undefined;
  }
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  return undefined;
}

/** Resolve a flag: the dev env override if present and valid, else the default. */
function resolveFlag(key: keyof FeatureFlags, envKey: string): boolean {
  return envOverride(envKey) ?? FLAGS[key];
}

/**
 * Whether the Transzendenz layer (Schicht 3, §4.5.3) is active. `false` in every
 * shipped M14 build (see `TRANSCEND_ENABLED`); a dev may force it on with
 * `VITE_TRANSCEND=1`. M15's wiring gates all Transzendenz state/UI on this accessor.
 */
export function isTranscendEnabled(): boolean {
  return resolveFlag('transcend', 'TRANSCEND');
}
