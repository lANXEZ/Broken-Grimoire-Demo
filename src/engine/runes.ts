import type { RuneEffect } from './types';

/**
 * Runes: fragments written in the dungeon's gibberish. The player only ever sees the symbol and its made-up name;
 * what each one does is shuffled once per computer (the app saves the mapping) and never shown.
 */
export const RUNE_EFFECTS: RuneEffect[] = ['echo', 'amplify', 'widen', 'siphon', 'volatile', 'free', 'backfire', 'fizzle'];

/** The 8 symbols. `glyph` is placeholder art until the artist draws them. */
export const RUNE_SYMBOLS: { glyph: string; name: string }[] = [
  { glyph: 'ᚠ', name: 'Vreth' },
  { glyph: 'ᚢ', name: 'Ulmo' },
  { glyph: 'ᚦ', name: 'Thask' },
  { glyph: 'ᚨ', name: 'Azzri' },
  { glyph: 'ᚱ', name: 'Rhoun' },
  { glyph: 'ᚲ', name: 'Kesh' },
  { glyph: 'ᚷ', name: 'Gyvel' },
  { glyph: 'ᛉ', name: 'Zhoth' },
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

/** True if `map` is a valid mapping (each of the 8 effects exactly once). */
export function isRuneMap(map: unknown): map is RuneEffect[] {
  return Array.isArray(map) && map.length === RUNE_EFFECTS.length && RUNE_EFFECTS.every((e) => map.includes(e));
}
