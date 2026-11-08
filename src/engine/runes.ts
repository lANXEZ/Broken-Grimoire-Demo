import type { RuneEffect } from './types';

/**
 * Runes: fragments written in the dungeon's gibberish. The player sees a rune letter and a made-up name; what each
 * one does is never shown. Which of the 6 rune cards does what is shuffled once per computer, and so is the rune
 * alphabet used for the hidden messages (engine/cipher.ts); the app saves both (game/runeMap.ts).
 *
 * Six runes, one per rune fragment the art team drew (team decision, Nov 9: Widen and Backfire were cut).
 */
export const RUNE_EFFECTS: RuneEffect[] = ['echo', 'amplify', 'siphon', 'volatile', 'free', 'fizzle'];

/** The 6 rune cards' made-up names. A name stays with its card, so it says nothing about what the rune does. */
export const RUNE_SYMBOLS: { name: string }[] = [
  { name: 'Vreth' },
  { name: 'Ulmo' },
  { name: 'Thask' },
  { name: 'Azzri' },
  { name: 'Rhoun' },
  { name: 'Kesh' },
];

export function runeName(symbol: number): string {
  return RUNE_SYMBOLS[symbol]?.name ?? '???';
}

/** A fresh random mapping, symbol index → effect. `rand` returns [0, 1). */
export function randomRuneMap(rand: () => number): RuneEffect[] {
  const map = [...RUNE_EFFECTS];
  for (let i = map.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [map[i], map[j]] = [map[j], map[i]];
  }
  return map;
}

/** True if `map` is a valid mapping (each of the 6 effects exactly once). */
export function isRuneMap(map: unknown): map is RuneEffect[] {
  return Array.isArray(map) && map.length === RUNE_EFFECTS.length && RUNE_EFFECTS.every((e) => map.includes(e));
}
