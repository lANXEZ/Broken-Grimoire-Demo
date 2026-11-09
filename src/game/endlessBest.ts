/**
 * Endless mode's best score on this computer: the most rooms cleared in one endless run. "New account" wipes it
 * (it lives under the game's storage prefix).
 */
const KEY = 'broken-grimoire/endless-best/v1';

export function endlessBest(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Record an endless run that cleared `cleared` rooms; returns the best so far (this run included). */
export function recordEndlessBest(cleared: number): number {
  const best = Math.max(endlessBest(), cleared);
  try {
    localStorage.setItem(KEY, String(best));
  } catch {
    // Storage blocked: the best just isn't kept.
  }
  return best;
}
