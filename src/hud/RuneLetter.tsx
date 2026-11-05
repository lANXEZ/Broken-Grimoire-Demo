import { inRunes, runeGlyphOf } from '../game/runeMap';

/** The symbol on a rune card: this computer's rune for the first letter of what it does (engine/cipher.ts). */
export function RuneLetter({ symbol }: { symbol: number }) {
  return <span className="rune-letter">{runeGlyphOf(symbol)}</span>;
}

/**
 * A hidden message: write it in English, it shows in this computer's runes. Players who've worked out enough of the
 * rune alphabet (from the rune cards) can read it. E.g. `<RuneText text="The grimoire lies" />`.
 */
export function RuneText({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`rune-text ${className}`}>{inRunes(text)}</span>;
}
