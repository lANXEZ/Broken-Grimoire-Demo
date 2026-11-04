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
  /** Echo: pause before the second pass. */
  echoGap: 0.12,
  /** Amplify: everything is this much bigger (plus a white flash). */
  amplifyScale: 1.35,
  /** Siphon motes take this long to drift back to the wizard. */
  siphonTime: 0.55,

  /** Camera shake: off switch, and how hard (world units) and long (seconds) each kind shakes. */
  shake: {
    enabled: true,
    unstable: { strength: 0.16, time: 0.45 },
    amplify: { strength: 0.06, time: 0.25 },
    volatile: { strength: 0.08, time: 0.25 },
    pillarBreak: { strength: 0.05, time: 0.2 },
  },

  colors: {
    /** Echo's second pass is tinted toward this. */
    echo: '#b48cff',
    siphon: '#7dffa0',
    /** Sparks on the wizard for Volatile and Free. */
    selfHurt: '#ff4a3a',
    fizzle: '#8f7fb0',
    scorch: '#1a0d06',
    spark: '#fff4d6',
    dust: '#9a8466',
    debris: '#8f8679',
    fireCore: '#ffd36b',
  },
} as const;
