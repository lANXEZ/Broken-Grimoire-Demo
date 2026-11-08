import { encryptRunes, isRuneMap, makeCipher, randomRuneMap, type RuneCipher, type RuneEffect } from '../engine';

/**
 * Made at random the first time the game runs on a computer, saved, and the same for every run after that (so the
 * player's notes keep working). Clearing the game's saved data makes new ones.
 * - The rune mapping: which of the 6 rune cards does what.
 * - The rune alphabet (engine/cipher.ts): a symbol for every English letter, for the hidden messages (`inRunes`).
 *   Rune cards show the art team's fragments instead (config/art.ts `fragmentArt`).
 */
const RUNES_KEY = 'broken-grimoire/runes/v1';
const CIPHER_KEY = 'broken-grimoire/cipher/v1';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: it lasts until the game closes.
  }
}

let map: RuneEffect[] | null = null;
let cipher: RuneCipher | null = null;

/** Which rune card (symbol index) does what. */
export function runeMap(): RuneEffect[] {
  if (map) return map;
  const saved = read(RUNES_KEY);
  if (isRuneMap(saved)) return (map = saved);
  map = randomRuneMap(Math.random);
  write(RUNES_KEY, map);
  return map;
}

/** This computer's rune alphabet. A saved one is kept; anything it's missing (a rune added later) is filled in. */
export function runeCipher(): RuneCipher {
  if (cipher) return cipher;
  const saved = read(CIPHER_KEY);
  cipher = makeCipher(Math.random, saved);
  if (JSON.stringify(cipher) !== JSON.stringify(saved)) write(CIPHER_KEY, cipher);
  return cipher;
}

/** The symbol drawn on rune card `symbol`. */
export function runeGlyphOf(symbol: number): string {
  const effect = runeMap()[symbol];
  return effect ? runeCipher().runes[effect] : '?';
}

/** English written in this computer's runes, for hidden messages (letters only; the rest stays as written). */
export function inRunes(text: string): string {
  return encryptRunes(runeCipher(), text);
}
