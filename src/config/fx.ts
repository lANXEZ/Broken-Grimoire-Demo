/**
 * [FX] Spell effects (scene/SpellFx.tsx). Times are in seconds. PLACEHOLDER visuals: glowing shapes and particles
 * drawn in code; the artist's sprite effects can replace them later, one look at a time.
 */
export const FX = {
  /** How long one tile's effect plays. */
  tileTime: 0.6,
  /** Delay between neighbouring tiles as a bolt or wave travels outward from the wizard. */
  stepDelay: 0.07,
  /** The bolt leaves the wizard this long before the first tile erupts. */
  lead: 0.08,
  /** Wall: extra delay before the second row. */
  wallRowDelay: 0.12,
  /** Siphon motes take this long to drift back to the wizard. */
  siphonTime: 0.55,

  /**
   * A cast with a rune plays in two parts: the spell itself, then (after the rune's symbol glows on the floor for
   * `sigilTime`) the rune's own part in purple. `strike` = when the rune's part hits after it starts; `time` = how
   * long the rune's part lasts for effects without their own timing. `spellHold` = how much of the spell part's
   * effect plays before the sigil appears (0-1).
   */
  rune: { sigilTime: 1.0, strike: 0.12, time: 1.0, spellHold: 0.8 },

  /** Camera shake: off switch, and how hard (world units) and long (seconds) each kind shakes. */
  shake: {
    enabled: true,
    unstable: { strength: 0.16, time: 0.45 },
    amplify: { strength: 0.06, time: 0.25 },
    volatile: { strength: 0.08, time: 0.25 },
    pillarBreak: { strength: 0.05, time: 0.2 },
  },

  colors: {
    /** Everything a rune does (its part of a rune cast, the floor sigil, its damage numbers). */
    rune: '#b05cff',
    runeLight: '#e4c8ff',
    siphon: '#7dffa0',
    /** Sparks on the wizard for Volatile and Free. */
    selfHurt: '#ff4a3a',
    fizzle: '#8f7fb0',
    /** A rune on a table that makes no spell: the cards failed, so grey smoke, no purple. */
    dud: '#8a8580',
    scorch: '#1a0d06',
    spark: '#fff4d6',
    dust: '#9a8466',
    debris: '#8f8679',
    fireCore: '#ffd36b',
  },
} as const;
