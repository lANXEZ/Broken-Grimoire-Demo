import { RUNE_EFFECTS } from './runes';
import type { RuneEffect } from './types';

/**
 * The rune alphabet: a secret cipher between English letters and rune symbols, made at random the first time the game
 * runs on a computer (game/runeMap.ts saves it). Every letter A–Z gets its own symbol. A rune card shows the symbol
 * of the first letter of what it does (Amplify → A's symbol), so a player who works out the runes learns part of the
 * alphabet, and can use it to read the developer's hidden messages, which are written with the same symbols
 * (`encryptRunes`).
 *
 * Two runes starting with the same letter (Free and Fizzle) can't share a symbol, or they'd look the same: the later
 * one in RUNE_EFFECTS gets an extra symbol, which also means that letter. Messages always use a letter's first
 * symbol.
 */
export interface RuneCipher {
  /** Each letter's symbols: the first one is the letter's own, any more were added for a rune's clash. */
  letters: Record<string, string[]>;
  /** The symbol on each rune card. */
  runes: Record<RuneEffect, string>;
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * The symbols the cipher draws from: the 24 runes of the oldest rune alphabet (Elder Futhark) plus 9 Anglo-Saxon
 * ones that look clearly different from them. 33 symbols: 26 letters plus room for 7 clashes. PLACEHOLDER art: the
 * runes are drawn with the system's rune font until the artist draws them.
 */
export const CIPHER_SYMBOLS: string[] = [...'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ', ...'ᚪᚫᚣᛡᛠᛣᛥᚸᛢ'];

const firstLetter = (effect: RuneEffect) => effect.charAt(0).toUpperCase();

/**
 * A complete cipher. Keeps whatever of `saved` is still valid (so a computer's alphabet never changes) and fills in
 * anything missing at random (`rand` returns [0, 1)): a whole new cipher on first launch, or just a symbol for a rune
 * added in a later version.
 */
export function makeCipher(rand: () => number, saved?: unknown): RuneCipher {
  const old = (saved && typeof saved === 'object' ? saved : {}) as Partial<RuneCipher>;
  const used = new Set<string>();
  const take = (sym: unknown): sym is string => {
    if (typeof sym !== 'string' || !CIPHER_SYMBOLS.includes(sym) || used.has(sym)) return false;
    used.add(sym);
    return true;
  };

  const letters: Record<string, string[]> = {};
  for (const l of ALPHABET) {
    const had: unknown = old.letters?.[l];
    letters[l] = Array.isArray(had) ? had.filter(take) : [];
  }
  const spare = CIPHER_SYMBOLS.filter((s) => !used.has(s));
  for (let i = spare.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [spare[i], spare[j]] = [spare[j], spare[i]];
  }
  const next = () => {
    const s = spare.pop();
    if (!s) throw new Error('Out of rune symbols: add more to CIPHER_SYMBOLS.');
    return s;
  };
  for (const l of ALPHABET) if (letters[l].length === 0) letters[l].push(next());

  const runes = {} as Record<RuneEffect, string>;
  const onCards = new Set<string>();
  for (const e of RUNE_EFFECTS) {
    const had: unknown = old.runes?.[e];
    if (typeof had === 'string' && letters[firstLetter(e)].includes(had) && !onCards.has(had)) {
      runes[e] = had;
      onCards.add(had);
    }
  }
  for (const e of RUNE_EFFECTS) {
    if (runes[e]) continue;
    const mine = letters[firstLetter(e)];
    let sym = mine.find((s) => !onCards.has(s));
    if (!sym) {
      sym = next();
      mine.push(sym);
    }
    runes[e] = sym;
    onCards.add(sym);
  }
  return { letters, runes };
}

/** English text written in runes: each letter becomes its symbol; spaces, digits and punctuation stay as they are. */
export function encryptRunes(cipher: RuneCipher, text: string): string {
  return [...text].map((c) => cipher.letters[c.toUpperCase()]?.[0] ?? c).join('');
}

/** Runes back to (upper-case) English, for checking a hidden message. Every symbol of a letter reads as it. */
export function decryptRunes(cipher: RuneCipher, text: string): string {
  const back = new Map<string, string>();
  for (const l of ALPHABET) for (const s of cipher.letters[l]) back.set(s, l);
  return [...text].map((c) => back.get(c) ?? c).join('');
}
