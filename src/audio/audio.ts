import { useSyncExternalStore } from 'react';
import { SOUND } from '../config/sound';
import { RECIPES, makeImpulse, makeNoise, type SoundName } from './synth';

/**
 * [SOUND] The game's audio: one Web Audio context, the player's volume and mute (saved on this computer), a light
 * dungeon echo on the effects, and the background sounds (ambience). Effects are played by name (audio/synth.ts);
 * what plays when is decided in audio/gameSounds.ts and App.tsx.
 *
 * Browsers only start audio once the player has clicked or pressed a key on the page; until then everything is
 * silent. The desktop game is allowed to play at once (electron/main.cjs). Hidden window: the audio pauses.
 */

// ---------------------------------------------------------------------------------------------------------------
// The player's settings

const SETTINGS_KEY = 'broken-grimoire/sound/v1';

export interface SoundSettings {
  /** 0-1. */
  volume: number;
  muted: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function loadSettings(): SoundSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<SoundSettings> | null;
    if (s && typeof s.volume === 'number') return { volume: clamp01(s.volume), muted: !!s.muted };
  } catch {
    // No storage, or something unreadable: the defaults.
  }
  return { volume: SOUND.defaultVolume, muted: false };
}

let settings = loadSettings();
const listeners = new Set<() => void>();

export function setSoundSettings(patch: Partial<SoundSettings>): void {
  settings = { ...settings, ...patch, volume: clamp01(patch.volume ?? settings.volume) };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered; fine.
  }
  applyVolume();
  listeners.forEach((l) => l());
}

/** The player's volume and mute, kept up to date (for the Settings controls). */
export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The audio graph: effects (with an echo send) and ambience into the master volume, then a limiter.

interface Engine {
  ac: AudioContext;
  master: GainNode;
  sfx: GainNode;
  amb: GainNode;
  /** Into the echo (the drips use it too). */
  send: GainNode;
  noise: AudioBuffer;
}

let engine: Engine | null = null;
let failed = false;

function init(): Engine | null {
  if (engine || failed) return engine;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    failed = true;
    return null;
  }
  try {
    const ac = new AC();
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 6;
    limiter.connect(ac.destination);
    const master = ac.createGain();
    master.connect(limiter);
    const reverb = ac.createConvolver();
    reverb.buffer = makeImpulse(ac, SOUND.reverbTime);
    reverb.connect(master);
    const send = ac.createGain();
    send.gain.value = SOUND.reverb;
    send.connect(reverb);
    const sfx = ac.createGain();
    sfx.gain.value = SOUND.effects;
    sfx.connect(master);
    sfx.connect(send);
    const amb = ac.createGain();
    amb.connect(master);
    engine = { ac, master, sfx, amb, send, noise: makeNoise(ac) };
    applyVolume();

    const unlock = () => {
      if (ac.state === 'suspended' && !document.hidden) void ac.resume();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => void (document.hidden ? ac.suspend() : ac.resume()));
    return engine;
  } catch {
    failed = true;
    return null;
  }
}

function applyVolume(): void {
  if (!engine) return;
  // Squared: the slider feels even (ears hear loudness roughly that way).
  const v = settings.muted ? 0 : settings.volume ** 2;
  engine.master.gain.setTargetAtTime(v, engine.ac.currentTime, 0.03);
}

// ---------------------------------------------------------------------------------------------------------------
// Effects

const lastAt = new Map<SoundName, number>();

export interface PlayOpts {
  /** How long the thing it goes with lasts, in seconds (a spell's travel). */
  len?: number;
  /** Louder or quieter than its level in config/sound.ts. */
  gain?: number;
  dest?: AudioNode;
}

/** Play an effect now, or `delayMs` from now. Silent until audio is allowed (see above). */
export function play(name: SoundName, delayMs = 0, opts: PlayOpts = {}): void {
  const e = init();
  if (!e || e.ac.state !== 'running') return;
  const t = e.ac.currentTime + 0.01 + Math.max(0, delayMs) / 1000;
  const last = lastAt.get(name);
  if (last !== undefined && Math.abs(t - last) < SOUND.sameSoundGap) return;
  lastAt.set(name, t);
  const g = e.ac.createGain();
  g.gain.value = (SOUND.levels[name] ?? 1) * (opts.gain ?? 1);
  g.connect(opts.dest ?? e.sfx);
  RECIPES[name]({ ac: e.ac, dest: g, noise: e.noise }, t, opts.len ?? 0);
  // Let it go once it has surely finished.
  window.setTimeout(() => g.disconnect(), delayMs + (opts.len ?? 0) * 1000 + 6000);
}

/** Effects that can be cut short together (a rune cast the player skips). */
export interface SoundGroup {
  play: (name: SoundName, delayMs?: number, opts?: PlayOpts) => void;
  stop: () => void;
}

export function soundGroup(): SoundGroup {
  const e = init();
  if (!e) return { play: () => {}, stop: () => {} };
  const g = e.ac.createGain();
  g.connect(e.sfx);
  return {
    play: (name, delayMs = 0, opts = {}) => play(name, delayMs, { ...opts, dest: g }),
    stop: () => {
      g.gain.setTargetAtTime(0, e.ac.currentTime, 0.05);
      window.setTimeout(() => g.disconnect(), 600);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ambience: layers that fade in and out. Each is built the first time it's wanted and then kept.

export type AmbienceLayer = 'forest' | 'dungeon' | 'campfire';

interface Layer {
  gain: GainNode;
  on: boolean;
  /** Its little events (a cricket, a drip): which, how often (seconds between, min-max), and when next. */
  events: { name: SoundName; every: [number, number]; next: number; echo?: boolean }[];
}

const layers: Partial<Record<AmbienceLayer, Layer>> = {};
let ticker = 0;

/** A looping noise source through a filter into `dest`, optionally swaying (an LFO on the filter or the level). */
function bed(e: Pick<Engine, 'ac' | 'noise'>, dest: AudioNode, p: { filter: BiquadFilterType; freq: number; q?: number; gain: number; sway?: { rate: number; freq?: number; gain?: number } }): void {
  const src = e.ac.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const f = e.ac.createBiquadFilter();
  f.type = p.filter;
  f.frequency.value = p.freq;
  f.Q.value = p.q ?? 0.5;
  const g = e.ac.createGain();
  g.gain.value = p.gain;
  src.connect(f).connect(g).connect(dest);
  if (p.sway) {
    const lfo = e.ac.createOscillator();
    lfo.frequency.value = p.sway.rate;
    if (p.sway.freq) {
      const depth = e.ac.createGain();
      depth.gain.value = p.sway.freq;
      lfo.connect(depth).connect(f.frequency);
    }
    if (p.sway.gain) {
      const depth = e.ac.createGain();
      depth.gain.value = p.sway.gain;
      lfo.connect(depth).connect(g.gain);
    }
    lfo.start();
  }
  src.start(0, Math.random() * 1.5);
}

function drone(e: Pick<Engine, 'ac' | 'noise'>, dest: AudioNode, freqs: [number, OscillatorType, number][], cutoff: number): void {
  const lp = e.ac.createBiquadFilter();
  lp.frequency.value = cutoff;
  lp.connect(dest);
  for (const [freq, type, gain] of freqs) {
    const osc = e.ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = e.ac.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(lp);
    osc.start();
  }
}

function buildLayer(e: Engine, kind: AmbienceLayer): Layer {
  const gain = e.ac.createGain();
  gain.gain.value = 0;
  gain.connect(e.amb);
  const now = e.ac.currentTime;
  buildBeds(e, gain, kind);
  const events: Layer['events'] =
    kind === 'forest'
      ? [
          { name: 'cricket', every: [0.35, 1.4], next: now + 1 },
          { name: 'owl', every: [16, 40], next: now + 6 },
        ]
      : kind === 'dungeon'
        ? [
            { name: 'drip', every: [2.5, 8], next: now + 2, echo: true },
            { name: 'rumble', every: [25, 55], next: now + 20 },
          ]
        : [
            { name: 'pop', every: [0.04, 0.35], next: now },
            { name: 'snap', every: [2, 6], next: now + 1.5 },
          ];
  return { gain, on: false, events };
}

/** A layer's steady sounds, into `dest` (exported to check how loud they are). */
export function buildBeds(e: Pick<Engine, 'ac' | 'noise'>, gain: AudioNode, kind: AmbienceLayer): void {
  if (kind === 'forest') {
    // Wind in the trees, a gust now and then, leaves.
    bed(e, gain, { filter: 'lowpass', freq: 450, q: 0.4, gain: 0.5, sway: { rate: 0.07, freq: 250 } });
    bed(e, gain, { filter: 'bandpass', freq: 900, q: 0.8, gain: 0.12, sway: { rate: 0.11, gain: 0.1 } });
    bed(e, gain, { filter: 'highpass', freq: 4500, gain: 0.025, sway: { rate: 0.23, gain: 0.015 } });
    return;
  }
  if (kind === 'dungeon') {
    // A low drone and the air moving through the halls; water dripping somewhere, something heavy far away.
    drone(e, gain, [[55, 'sine', 0.09], [55.35, 'sine', 0.07], [82.5, 'triangle', 0.03], [110, 'triangle', 0.025]], 300);
    bed(e, gain, { filter: 'lowpass', freq: 170, gain: 0.3, sway: { rate: 0.05, gain: 0.12 } });
    // Air through the halls, in a range small speakers can play.
    bed(e, gain, { filter: 'bandpass', freq: 380, q: 1.2, gain: 0.08, sway: { rate: 0.035, gain: 0.04, freq: 80 } });
    return;
  }
  // The campfire: a soft roar, pops and the odd snap.
  bed(e, gain, { filter: 'lowpass', freq: 260, gain: 0.3, sway: { rate: 0.3, gain: 0.08 } });
  bed(e, gain, { filter: 'bandpass', freq: 700, q: 0.6, gain: 0.1 });
}

/** Fire the layers' little events when they're due (every ~100 ms while any layer is on). */
function tick(): void {
  const e = engine;
  if (!e || e.ac.state !== 'running') return;
  const now = e.ac.currentTime;
  for (const layer of Object.values(layers)) {
    if (!layer?.on) continue;
    for (const ev of layer.events) {
      if (ev.next > now) continue;
      play(ev.name, 0, { dest: ev.echo ? echoed(e, layer.gain) : layer.gain });
      const [lo, hi] = ev.every;
      ev.next = now + lo + Math.random() * (hi - lo);
    }
  }
}

/** A node into both the layer and the dungeon's echo (so a drip rings down the halls). */
function echoed(e: Engine, layerGain: GainNode): AudioNode {
  const split = e.ac.createGain();
  split.connect(layerGain);
  const wet = e.ac.createGain();
  wet.gain.value = 2;
  split.connect(wet).connect(e.send);
  window.setTimeout(() => split.disconnect(), 4000);
  return split;
}

/** Which background layers should be playing; the others fade out. */
export function setAmbience(on: Partial<Record<AmbienceLayer, boolean>>): void {
  const e = init();
  if (!e) return;
  const fade = SOUND.ambience.fade / 3;
  for (const kind of ['forest', 'dungeon', 'campfire'] as const) {
    const want = !!on[kind];
    let layer = layers[kind];
    if (!layer && !want) continue;
    layer ??= layers[kind] = buildLayer(e, kind);
    if (layer.on === want) continue;
    layer.on = want;
    layer.gain.gain.setTargetAtTime(want ? SOUND.ambience[kind] : 0, e.ac.currentTime, fade);
  }
  const any = Object.values(layers).some((l) => l?.on);
  if (any && !ticker) ticker = window.setInterval(tick, 100);
  if (!any && ticker) {
    window.clearInterval(ticker);
    ticker = 0;
  }
}
