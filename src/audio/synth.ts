/**
 * [SOUND] Every sound effect in the game, made in code with the Web Audio API (no sound files): each recipe builds a
 * few oscillators and filtered noise bursts at time `t` into `o.dest`. They work on any audio context, so the same
 * recipes can be rendered offline (to check how loud they are). PLACEHOLDER-friendly: a recorded sound can replace any
 * one of them later (audio/audio.ts plays them by name). Loudness of each: config/sound.ts.
 */

/** Where a recipe plays: the context, the node it connects to, and a shared white-noise buffer. */
export interface Out {
  ac: BaseAudioContext;
  dest: AudioNode;
  noise: AudioBuffer;
}

/** Two seconds of white noise, made once per context. */
export function makeNoise(ac: BaseAudioContext): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** `x` give or take `amount` (a fraction), so repeated sounds don't sound identical. */
const vary = (x: number, amount = 0.06) => x * (1 + (Math.random() * 2 - 1) * amount);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const SILENT = 0.0001;

/** A gain node that swells to `peak` over `attack` and fades out over `decay`. */
function envelope(o: Out, t: number, peak: number, attack: number, decay: number, dest: AudioNode = o.dest): GainNode {
  const g = o.ac.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay);
  g.connect(dest);
  return g;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide to this pitch over the sound (or over `glide` seconds). */
  to?: number;
  glide?: number;
  attack?: number;
  decay: number;
  gain: number;
  dest?: AudioNode;
}

function tone(o: Out, t: number, p: ToneOpts): void {
  const attack = p.attack ?? 0.005;
  const osc = o.ac.createOscillator();
  osc.type = p.type ?? 'sine';
  osc.frequency.setValueAtTime(p.freq, t);
  if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to, t + (p.glide ?? attack + p.decay));
  osc.connect(envelope(o, t, p.gain, attack, p.decay, p.dest));
  osc.start(t);
  osc.stop(t + attack + p.decay + 0.05);
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq?: number;
  /** Sweep the filter to this frequency over the sound (or over `sweep` seconds). */
  to?: number;
  sweep?: number;
  q?: number;
  attack?: number;
  decay: number;
  gain: number;
  dest?: AudioNode;
  /** Wobble the loudness this many times a second (sand, bubbling). */
  tremolo?: number;
}

function noise(o: Out, t: number, p: NoiseOpts): void {
  const attack = p.attack ?? 0.005;
  const end = t + attack + p.decay + 0.05;
  const src = o.ac.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  const f = o.ac.createBiquadFilter();
  f.type = p.filter ?? 'lowpass';
  f.frequency.setValueAtTime(p.freq ?? 2000, t);
  if (p.to) f.frequency.exponentialRampToValueAtTime(p.to, t + (p.sweep ?? attack + p.decay));
  f.Q.value = p.q ?? 0.7;
  const env = envelope(o, t, p.gain, attack, p.decay, p.dest);
  if (p.tremolo) {
    const trem = o.ac.createGain();
    trem.gain.value = 0.5;
    const lfo = o.ac.createOscillator();
    lfo.frequency.value = p.tremolo;
    const depth = o.ac.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    lfo.start(t);
    lfo.stop(end);
    src.connect(f).connect(trem).connect(env);
  } else src.connect(f).connect(env);
  src.start(t, Math.random() * 1.5);
  src.stop(end);
}

/** `count` tiny pops spread over `len` seconds (fire crackle, falling grit). */
function crackle(o: Out, t: number, len: number, count: number, gain: number, freq: [number, number] = [2000, 5000]): void {
  for (let i = 0; i < count; i++) noise(o, t + Math.random() * len, { filter: 'bandpass', freq: rand(...freq), q: 3, decay: rand(0.01, 0.03), gain: gain * rand(0.5, 1) });
}

/** A few notes one after another (chimes, fanfares). */
function arpeggio(o: Out, t: number, notes: number[], gap: number, p: Omit<ToneOpts, 'freq'>): void {
  notes.forEach((freq, i) => tone(o, t + i * gap, { ...p, freq }));
}

// ---------------------------------------------------------------------------------------------------------------
// The recipes. `len` = how long the thing it goes with lasts, in seconds (a spell's travel); most ignore it.

type Recipe = (o: Out, t: number, len: number) => void;

const element = {
  fire(o: Out, t: number, len: number) {
    tone(o, t, { freq: vary(120), to: 50, decay: 0.4, gain: 0.5 });
    noise(o, t, { freq: 300, to: 2600, sweep: 0.12, attack: 0.04, decay: Math.max(0.35, len), gain: 0.55 });
    crackle(o, t + 0.05, Math.max(0.3, len), 9, 0.3);
  },
  water(o: Out, t: number, len: number) {
    noise(o, t, { filter: 'bandpass', freq: 1400, to: 450, q: 1.2, attack: 0.02, decay: Math.max(0.4, len * 0.8), gain: 0.7 });
    for (let i = 0; i < 6; i++) {
      const at = t + 0.05 + Math.random() * Math.max(0.3, len);
      const f = rand(350, 700);
      tone(o, at, { freq: f, to: f * 2.2, decay: 0.07, gain: 0.12 });
    }
  },
  earth(o: Out, t: number, len: number) {
    tone(o, t, { freq: vary(75), to: 38, decay: 0.55, gain: 0.8 });
    noise(o, t, { freq: 450, to: 140, decay: Math.max(0.5, len), gain: 0.7 });
    noise(o, t + 0.04, { filter: 'bandpass', freq: 900, q: 3, decay: 0.14, gain: 0.45 });
    crackle(o, t + 0.1, Math.max(0.3, len), 6, 0.2, [1200, 3000]);
  },
  wind(o: Out, t: number, len: number) {
    const d = Math.max(0.45, len);
    noise(o, t, { filter: 'bandpass', freq: 500, to: 2400, q: 2.5, attack: d * 0.35, decay: d * 0.75, gain: 0.7 });
    noise(o, t + 0.03, { filter: 'bandpass', freq: 1100, to: 3600, q: 4, attack: d * 0.3, decay: d * 0.6, gain: 0.3 });
  },
  fog(o: Out, t: number) {
    noise(o, t, { filter: 'highpass', freq: 2200, attack: 0.3, decay: 1.1, gain: 0.25 });
    noise(o, t, { freq: 700, attack: 0.25, decay: 1.0, gain: 0.3 });
    tone(o, t, { type: 'triangle', freq: 220, attack: 0.3, decay: 0.9, gain: 0.07 });
    tone(o, t, { type: 'triangle', freq: 233, attack: 0.3, decay: 0.9, gain: 0.05 });
  },
  magma(o: Out, t: number, len: number) {
    noise(o, t, { freq: 260, to: 180, decay: Math.max(0.9, len), gain: 0.8 });
    element.fire(o, t, len * 0.6);
    for (let i = 0; i < 7; i++) {
      const at = t + 0.1 + Math.random() * Math.max(0.6, len);
      const f = rand(90, 160);
      tone(o, at, { freq: f, to: f * 1.9, decay: 0.09, gain: 0.3 });
    }
  },
  quicksand(o: Out, t: number) {
    noise(o, t, { filter: 'bandpass', freq: 800, to: 400, q: 1.5, attack: 0.08, decay: 1.0, gain: 0.6, tremolo: 17 });
    tone(o, t, { freq: 300, to: 110, decay: 0.8, gain: 0.12 });
    crackle(o, t + 0.05, 0.8, 10, 0.12, [1500, 3500]);
  },
};

/** One tile of a spell going off: a short element-flavoured puff (a bolt travelling, a wall rising). */
const tileTick: Record<keyof typeof element, Recipe> = {
  fire: (o, t) => noise(o, t, { freq: 1600, to: 500, decay: 0.12, gain: 0.25 }),
  water: (o, t) => noise(o, t, { filter: 'bandpass', freq: vary(1000, 0.15), q: 2, decay: 0.1, gain: 0.3 }),
  earth: (o, t) => {
    tone(o, t, { freq: vary(95), to: 55, decay: 0.12, gain: 0.35 });
    noise(o, t, { freq: 700, decay: 0.08, gain: 0.25 });
  },
  wind: (o, t) => noise(o, t, { filter: 'bandpass', freq: vary(2200, 0.15), q: 3, attack: 0.02, decay: 0.1, gain: 0.25 }),
  fog: (o, t) => noise(o, t, { filter: 'highpass', freq: 2500, attack: 0.03, decay: 0.15, gain: 0.08 }),
  magma: (o, t) => noise(o, t, { freq: 400, decay: 0.15, gain: 0.3 }),
  quicksand: (o, t) => noise(o, t, { filter: 'bandpass', freq: 900, q: 2, decay: 0.12, gain: 0.2 }),
};

export const RECIPES = {
  // ------------------------------------------------------------ menus and cards
  click: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 2600, q: 2, decay: 0.03, gain: 0.5 });
    tone(o, t, { freq: 900, to: 600, decay: 0.04, gain: 0.12 });
  },
  cardPick: (o, t) => noise(o, t, { filter: 'bandpass', freq: 3000, to: 6000, q: 1.5, decay: 0.07, gain: 0.35 }),
  cardPlace: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 1800, to: 900, q: 1.2, decay: 0.08, gain: 0.5 });
    tone(o, t, { freq: 180, decay: 0.05, gain: 0.12 });
  },
  cardReturn: (o, t) => noise(o, t, { filter: 'bandpass', freq: 2500, to: 4500, q: 1.5, decay: 0.08, gain: 0.3 }),
  cardMark: (o, t) => tone(o, t, { type: 'triangle', freq: 1200, decay: 0.06, gain: 0.12 }),
  /** New cards into the hand: a short riffle. */
  draw: (o, t) => {
    for (let i = 0; i < 3; i++) noise(o, t + i * 0.06, { filter: 'bandpass', freq: vary(3200, 0.2), q: 1.5, decay: 0.05, gain: 0.25 });
  },
  reroll: (o, t) => {
    for (let i = 0; i < 7; i++) noise(o, t + i * 0.035, { filter: 'bandpass', freq: vary(3500, 0.25), q: 1.5, decay: 0.04, gain: 0.25 });
    RECIPES.cardPlace(o, t + 0.3);
  },

  // ------------------------------------------------------------ spells (cast start; `len` = how long it travels)
  fire: element.fire,
  water: element.water,
  earth: element.earth,
  wind: element.wind,
  fog: element.fog,
  magma: element.magma,
  quicksand: element.quicksand,
  unstable: (o, t) => {
    noise(o, t, { freq: 3000, to: 180, decay: 1.2, gain: 1.0 });
    tone(o, t, { freq: 95, to: 28, decay: 0.9, gain: 0.9 });
    crackle(o, t + 0.05, 0.8, 14, 0.35);
  },
  /** Nothing happened: a puff of smoke and a sad little drop in pitch. */
  fizzle: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 1500, to: 350, q: 1, attack: 0.02, decay: 0.5, gain: 0.35 });
    tone(o, t + 0.05, { type: 'triangle', freq: 520, to: 190, decay: 0.35, gain: 0.07 });
  },
  tickFire: tileTick.fire,
  tickWater: tileTick.water,
  tickEarth: tileTick.earth,
  tickWind: tileTick.wind,
  tickFog: tileTick.fog,
  tickMagma: tileTick.magma,
  tickQuicksand: tileTick.quicksand,

  // ------------------------------------------------------------ what spells hit
  hit: (o, t) => {
    tone(o, t, { freq: vary(170), to: 60, decay: 0.16, gain: 0.7 });
    noise(o, t, { freq: 1300, decay: 0.06, gain: 0.45 });
  },
  /** The spell couldn't touch it: a dull metallic tink. */
  immune: (o, t) => {
    tone(o, t, { type: 'triangle', freq: vary(1800, 0.03), decay: 0.28, gain: 0.14 });
    tone(o, t, { type: 'sine', freq: vary(2730, 0.03), decay: 0.2, gain: 0.08 });
  },
  kill: (o, t) => {
    RECIPES.hit(o, t);
    noise(o, t + 0.05, { filter: 'bandpass', freq: 900, to: 180, q: 1, attack: 0.02, decay: 0.55, gain: 0.4 });
    tone(o, t + 0.05, { type: 'triangle', freq: 330, to: 80, decay: 0.5, gain: 0.14 });
  },
  pillarChip: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 2200, q: 2, decay: 0.08, gain: 0.4 });
    crackle(o, t + 0.02, 0.2, 4, 0.18, [1500, 3500]);
  },
  pillarBreak: (o, t) => {
    tone(o, t, { freq: 65, to: 35, decay: 0.45, gain: 0.6 });
    noise(o, t, { freq: 900, to: 180, decay: 0.85, gain: 0.7 });
    crackle(o, t + 0.05, 0.6, 9, 0.25, [1200, 3200]);
  },
  /** A pushed unit hits a wall, a pillar or another unit. */
  bump: (o, t) => {
    tone(o, t, { freq: 110, to: 50, decay: 0.13, gain: 0.55 });
    noise(o, t, { freq: 600, decay: 0.09, gain: 0.35 });
  },

  // ------------------------------------------------------------ runes
  /** The rune's symbol glowing on the floor: a shimmer of chimes over a low hum. */
  sigil: (o, t) => {
    arpeggio(o, t, [660, 990, 1320, 1760], 0.07, { type: 'triangle', attack: 0.04, decay: 1.0, gain: 0.08 });
    tone(o, t, { freq: 165, attack: 0.25, decay: 0.9, gain: 0.16 });
    tone(o, t, { freq: 166.5, attack: 0.25, decay: 0.9, gain: 0.1 });
  },
  amplify: (o, t) => {
    tone(o, t, { freq: 230, to: 55, decay: 0.32, gain: 0.75 });
    noise(o, t, { freq: 4000, to: 300, decay: 0.3, gain: 0.5 });
    tone(o, t, { type: 'triangle', freq: 880, to: 440, decay: 0.3, gain: 0.08 });
  },
  siphon: (o, t) => {
    tone(o, t, { freq: 380, to: 1500, decay: 0.6, gain: 0.12 });
    arpeggio(o, t + 0.15, [784, 988, 1175, 1568], 0.08, { type: 'triangle', decay: 0.3, gain: 0.07 });
    noise(o, t, { filter: 'bandpass', freq: 1500, to: 4000, q: 3, attack: 0.3, decay: 0.4, gain: 0.15 });
  },
  volatile: (o, t) => {
    noise(o, t, { freq: 2600, to: 250, decay: 0.55, gain: 0.8 });
    tone(o, t, { freq: 140, to: 45, decay: 0.4, gain: 0.6 });
    tone(o, t + 0.25, { type: 'sawtooth', freq: 900, to: 140, decay: 0.22, gain: 0.08 });
    crackle(o, t, 0.5, 8, 0.25);
  },
  /** The mana comes back. */
  free: (o, t) => arpeggio(o, t, [523, 659, 784, 1047], 0.06, { type: 'triangle', decay: 0.45, gain: 0.1 }),
  runeFizzle: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 1200, to: 300, q: 1, attack: 0.05, decay: 0.8, gain: 0.35 });
    tone(o, t, { type: 'triangle', freq: 440, to: 150, decay: 0.6, gain: 0.08 });
  },

  // ------------------------------------------------------------ the mage and the monsters
  step: (o, t) => {
    noise(o, t, { freq: vary(520, 0.15), decay: 0.07, gain: 0.3 });
    tone(o, t, { freq: vary(95, 0.1), decay: 0.05, gain: 0.1 });
  },
  enemyStep: (o, t) => noise(o, t, { freq: vary(380, 0.2), decay: 0.06, gain: 0.25 }),
  hurt: (o, t) => {
    RECIPES.hit(o, t);
    tone(o, t + 0.02, { type: 'triangle', freq: 280, to: 120, decay: 0.26, gain: 0.18 });
  },
  heal: (o, t) => arpeggio(o, t, [440, 554, 659], 0.08, { decay: 0.35, gain: 0.12 }),
  loot: (o, t) => arpeggio(o, t, [1320, 1760, 2093], 0.065, { type: 'triangle', decay: 0.25, gain: 0.09 }),
  meditate: (o, t) => {
    tone(o, t, { freq: 196, attack: 0.35, decay: 1.2, gain: 0.14 });
    tone(o, t, { freq: 294, attack: 0.4, decay: 1.1, gain: 0.08 });
    tone(o, t + 0.3, { type: 'triangle', freq: 784, attack: 0.05, decay: 0.9, gain: 0.04 });
  },
  /** Sinking into quicksand. */
  stuck: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 600, to: 220, q: 1.5, decay: 0.6, gain: 0.5, tremolo: 15 });
    tone(o, t, { freq: 220, to: 90, decay: 0.5, gain: 0.12 });
  },
  /** Climbing out of it. */
  escape: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 400, to: 1300, q: 2, decay: 0.22, gain: 0.45 });
    tone(o, t + 0.1, { freq: 160, to: 420, decay: 0.15, gain: 0.15 });
  },
  /** A monster appears. */
  spawn: (o, t) => {
    noise(o, t, { freq: 200, to: 1400, attack: 0.15, decay: 0.3, gain: 0.35 });
    tone(o, t, { type: 'sawtooth', freq: 70, to: 110, attack: 0.1, decay: 0.35, gain: 0.05 });
  },

  // ------------------------------------------------------------ how the game moves on
  enemyTurn: (o, t) => {
    tone(o, t, { freq: 72, to: 46, decay: 0.6, gain: 0.75 });
    noise(o, t, { freq: 220, decay: 0.3, gain: 0.4 });
    tone(o, t + 0.2, { freq: 66, to: 44, decay: 0.7, gain: 0.5 });
    noise(o, t + 0.2, { freq: 200, decay: 0.3, gain: 0.25 });
  },
  playerTurn: (o, t) => {
    tone(o, t, { type: 'triangle', freq: 587, decay: 0.9, gain: 0.11 });
    tone(o, t, { freq: 880, decay: 0.7, gain: 0.05 });
  },
  /** A new room (or the lectern's or the camp's): a low, slow bell. */
  roomEnter: (o, t) => {
    tone(o, t, { type: 'triangle', freq: 196, decay: 1.8, gain: 0.14 });
    tone(o, t, { freq: 293.7, decay: 1.5, gain: 0.07 });
    tone(o, t, { freq: 98, decay: 1.6, gain: 0.12 });
  },
  cleared: (o, t) => {
    arpeggio(o, t, [392, 494, 587, 784], 0.1, { type: 'triangle', decay: 0.7, gain: 0.11 });
    tone(o, t + 0.3, { freq: 196, attack: 0.1, decay: 1.2, gain: 0.12 });
  },
  victory: (o, t) => {
    arpeggio(o, t, [392, 523, 659, 784], 0.13, { type: 'triangle', decay: 0.6, gain: 0.11 });
    for (const f of [523, 659, 784, 1047]) tone(o, t + 0.6, { type: 'triangle', freq: f, attack: 0.05, decay: 2.2, gain: 0.07 });
    tone(o, t + 0.6, { freq: 131, attack: 0.1, decay: 2.2, gain: 0.15 });
  },
  defeat: (o, t) => {
    arpeggio(o, t, [330, 294, 262, 196], 0.28, { type: 'triangle', decay: 0.9, gain: 0.1 });
    tone(o, t, { freq: 55, attack: 0.5, decay: 2.2, gain: 0.25 });
  },
  /** Walking through a door into the next stop. */
  door: (o, t) => {
    const creak = o.ac.createBiquadFilter();
    creak.type = 'bandpass';
    creak.frequency.value = 700;
    creak.Q.value = 3;
    creak.connect(o.dest);
    tone(o, t, { type: 'sawtooth', freq: 95, to: 70, attack: 0.08, decay: 0.6, gain: 0.18, dest: creak });
    tone(o, t + 0.55, { freq: 80, to: 45, decay: 0.25, gain: 0.45 });
    noise(o, t + 0.55, { freq: 400, decay: 0.15, gain: 0.3 });
  },
  /** The dungeon notices the mage: the torches flare up. */
  torches: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: 400, to: 1800, q: 1, attack: 0.1, decay: 0.4, gain: 0.4 });
    noise(o, t + 0.18, { filter: 'bandpass', freq: 450, to: 2000, q: 1, attack: 0.1, decay: 0.4, gain: 0.3 });
    crackle(o, t + 0.15, 0.6, 8, 0.15);
  },
  /** Eyes closing: a slow breath out. */
  eyesClose: (o, t, len) => noise(o, t, { freq: 1200, to: 250, attack: 0.3, decay: Math.max(0.8, len - 0.3), gain: 0.22 }),
  /** Waking: a breath in and a faint bell. */
  wake: (o, t) => {
    noise(o, t, { freq: 300, to: 1300, attack: 0.6, decay: 0.8, gain: 0.2 });
    tone(o, t + 0.4, { freq: 440, attack: 0.4, decay: 1.4, gain: 0.05 });
    tone(o, t + 0.4, { freq: 660, attack: 0.5, decay: 1.2, gain: 0.025 });
  },
  /** The black screen after a defeat: a deep swell under the rune message. */
  fate: (o, t) => {
    tone(o, t, { freq: 55, attack: 1.5, decay: 3.5, gain: 0.3 });
    tone(o, t, { freq: 82.4, attack: 1.8, decay: 3.2, gain: 0.14 });
    noise(o, t, { freq: 320, attack: 1.5, decay: 3, gain: 0.18 });
  },
  /** One rune letter of the fate message appearing: a breathy whisper. */
  whisper: (o, t) => noise(o, t, { filter: 'bandpass', freq: vary(2400, 0.3), q: 4, attack: 0.02, decay: 0.12, gain: 0.08 }),
  /** Endless mode's curse taking hold. */
  curse: (o, t) => {
    const lp = o.ac.createBiquadFilter();
    lp.frequency.value = 900;
    lp.connect(o.dest);
    tone(o, t, { type: 'sawtooth', freq: 110, attack: 1.0, decay: 1.6, gain: 0.12, dest: lp });
    tone(o, t, { type: 'sawtooth', freq: 116.5, attack: 1.0, decay: 1.6, gain: 0.12, dest: lp });
    tone(o, t, { freq: 55, attack: 1.0, decay: 1.8, gain: 0.3 });
  },

  // ------------------------------------------------------------ the background's own little events (audio.ts)
  cricket: (o, t) => {
    const f = rand(4100, 4700);
    for (let i = 0; i < 3; i++) tone(o, t + i * 0.045, { freq: f, decay: 0.025, gain: 0.05 });
  },
  owl: (o, t) => {
    tone(o, t, { freq: 370, to: 335, attack: 0.06, decay: 0.45, gain: 0.07 });
    tone(o, t + 0.75, { freq: 360, to: 330, attack: 0.04, decay: 0.22, gain: 0.05 });
    tone(o, t + 1.05, { freq: 365, to: 320, attack: 0.05, decay: 0.5, gain: 0.06 });
  },
  /** A drop falling into a pool: a quick upward "plip" and the faint ring of the water. */
  drip: (o, t) => {
    const f = rand(700, 1300);
    tone(o, t, { freq: f, to: f * 2.2, glide: 0.05, decay: 0.07, gain: 0.08 });
    tone(o, t + 0.01, { freq: f * 1.5, decay: 0.16, gain: 0.02 });
  },
  /** A few small stones skittering down somewhere in the cave. */
  pebbles: (o, t) => {
    const n = 3 + Math.floor(Math.random() * 4);
    let at = t;
    for (let i = 0; i < n; i++) {
      const g = 0.16 * (1 - i / (n + 1));
      noise(o, at, { filter: 'bandpass', freq: rand(1400, 3200), q: 4, decay: rand(0.015, 0.035), gain: g });
      tone(o, at, { freq: rand(180, 320), decay: 0.04, gain: g * 0.4 });
      at += rand(0.06, 0.22);
    }
  },
  /** Something heavy shifting far away in the dungeon. */
  rumble: (o, t) => noise(o, t, { freq: 140, to: 90, attack: 1.0, decay: 2.2, gain: 0.25 }),
  pop: (o, t) => noise(o, t, { filter: 'bandpass', freq: rand(1500, 5000), q: 3, decay: rand(0.005, 0.03), gain: rand(0.05, 0.22) }),
  snap: (o, t) => {
    noise(o, t, { filter: 'bandpass', freq: rand(1200, 2500), q: 2, decay: 0.04, gain: 0.3 });
    crackle(o, t + 0.02, 0.15, 3, 0.12);
  },
} satisfies Record<string, Recipe>;

/** A short stereo "room" echo for the dungeon: decaying noise. */
export function makeImpulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  return buf;
}

export type SoundName = keyof typeof RECIPES;

/** The cast sound and the per-tile tick of a spell's look. */
export type SpellLook = keyof typeof element;
export const TICK: Record<SpellLook, SoundName> = {
  fire: 'tickFire',
  water: 'tickWater',
  earth: 'tickEarth',
  wind: 'tickWind',
  fog: 'tickFog',
  magma: 'tickMagma',
  quicksand: 'tickQuicksand',
};
