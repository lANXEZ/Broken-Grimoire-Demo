import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { DIR_VECTORS, mergeHazard, spellDamage, type CastFx, type Pos, type RuneEffect } from '../engine';
import { runeCipher, runeGlyphOf } from '../game/runeMap';
import { ELEMENT_COLOR, HAZARD_COLOR, UNIT_SPRITE } from '../config/art';
import { FX } from '../config/fx';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/**
 * [FX] Spell effects. Each cast plays on exactly the tiles it really hit (engine `castFx`: Widen's lanes and
 * Backfire's own tile included), shaped by how the spell travels and coloured by what it is:
 * - Beam and Cross: a bolt runs out from the wizard and each tile erupts as it passes. Wall: the front row
 *   erupts from its centre outwards, then the back row. Unstable Fire: a ring blast over the 3×3, with a shake.
 * - Fire: flame column, rising embers, a scorch mark. Water: splash and ripples. Earth: rock spikes and dust.
 *   Wind: streaks blowing the push direction. Merges show their hazard forming (fog, magma, quicksand).
 * - Units hit get a spark; chipped pillars throw debris (a broken one collapses in dust); a pushed unit that
 *   hits something kicks up dust.
 * - A cast with a rune plays in two parts (App.tsx runs the timeline): first the spell itself, exactly like a cast
 *   without the rune (`cast` event); then the rune's symbol glows purple on the 3×3 floor around the wizard
 *   (`sigil`); then the rune's own part, in purple (`rune`): Echo replays the spell, Amplify strikes each target,
 *   Widen hits the extra tiles, Siphon draws wisps back to you, Volatile blasts the targets again and lashes back,
 *   Free gives the mana back, Backfire hits your own tile, Fizzle smokes. A rune on a table that makes no spell
 *   just puffs grey smoke (no sigil: the cards failed, not the rune).
 * Purely visual: the board shows the matching game state for each part.
 * PLACEHOLDER looks, all drawn in code. Timing and colours live in config/fx.ts.
 */

/** One cast (or the spell part of a rune cast) to show, with what it did that the effect needs to know. */
export interface CastEvent {
  type: 'cast';
  id: number;
  fx: CastFx;
  /** Pillars the cast broke. */
  broken: Pos[];
  /** Where a pushed unit hit something (wall, pillar or unit), with the direction it was going. */
  bumps: { at: Pos; dir: Pos }[];
  /** A rune on a table that makes no spell: grey smoke instead of purple. */
  grey?: boolean;
}

/** The rune's symbol glowing on the floor under the wizard, between the two parts of a rune cast. */
export interface SigilEvent {
  type: 'sigil';
  id: number;
  origin: Pos;
  symbol: number;
}

/** The rune's own part of a rune cast. */
export interface RuneEvent {
  type: 'rune';
  id: number;
  effect: RuneEffect;
  /** The real cast (rune included) and the spell part alone (null for Fizzle). */
  fx: CastFx;
  base: CastFx | null;
  /** Where the enemies the rune acts on stand after the spell part (Amplify, Volatile, Siphon). */
  targets: Pos[];
  /** Widen: the tiles the rune added. */
  extra: Pos[];
  /** Pillars the rune's part broke. */
  broken: Pos[];
}

export type FxEvent = CastEvent | SigilEvent | RuneEvent;

type Look = 'fire' | 'water' | 'earth' | 'wind' | 'fog' | 'magma' | 'quicksand';

const UNIT_MID = TILE_TOP + UNIT_SPRITE.footY + UNIT_SPRITE.height * 0.5;

/** Deterministic pseudo-random numbers, so an effect looks the same on every re-render. */
function rng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;
const soft = { transparent: true, depthWrite: false, toneMapped: false } as const;

// ---------------------------------------------------------------------------------------------------------------
// Timing: when each tile erupts

function lookOf(fx: CastFx): Look {
  const s = fx.spell!;
  if (s.kind === 'unstable') return 'fire';
  if (s.kind === 'merge') return mergeHazard(s.elements);
  return s.element;
}

function colorOf(fx: CastFx): string {
  const s = fx.spell;
  if (!s || s.kind === 'unstable') return ELEMENT_COLOR.fire;
  if (s.kind === 'merge') return HAZARD_COLOR[mergeHazard(s.elements)];
  return ELEMENT_COLOR[s.element];
}

/** Seconds after the pass starts that this tile erupts. */
function tileDelay(fx: CastFx, p: Pos): number {
  const s = fx.spell!;
  const dx = p.x - fx.origin.x;
  const dy = p.y - fx.origin.y;
  if (dx === 0 && dy === 0) return FX.lead; // Backfire: your own tile
  if (s.kind === 'unstable') return FX.lead;
  const d = fx.dir ? DIR_VECTORS[fx.dir] : null;
  if (s.shape === 'wall' && d) {
    const row = dx * d.x + dy * d.y;
    const side = Math.abs(dx * -d.y + dy * d.x);
    return FX.lead + side * FX.stepDelay * 1.4 + (row - 1) * FX.wallRowDelay;
  }
  if (s.shape === 'beam' && d) return FX.lead + (dx * d.x + dy * d.y - 1) * FX.stepDelay;
  // Cross: outward along each arm (Widen's diagonals with the first ring).
  return FX.lead + (Math.max(Math.abs(dx), Math.abs(dy)) - 1) * FX.stepDelay + (dx && dy ? FX.stepDelay * 0.5 : 0);
}

/** How long one pass takes, until its last tile has finished. */
function passTime(fx: CastFx): number {
  if (!fx.area) return 0;
  const all = [...fx.area.tiles.map((t) => t.pos), ...fx.area.pillars, ...(fx.area.self ? [fx.area.self.pos] : [])];
  return Math.max(FX.lead, ...all.map((p) => tileDelay(fx, p))) + FX.tileTime;
}

/** How long the rune's part lasts, in seconds. */
function runeTime(e: RuneEvent): number {
  const R = FX.rune;
  switch (e.effect) {
    case 'echo':
      return e.base ? passTime(e.base) + FX.tileTime : R.time;
    case 'widen':
      return e.base ? Math.max(0, ...e.extra.map((p) => tileDelay(e.fx, p) - FX.lead)) + FX.tileTime * 1.6 : R.time;
    case 'siphon':
      return R.strike + FX.siphonTime + 0.35;
    default:
      return R.time;
  }
}

/** How long an event lasts, in milliseconds (App removes it after this, and times a rune cast's parts with it). */
export function fxEventDuration(e: FxEvent): number {
  if (e.type === 'cast') return fxDuration(e.fx);
  if (e.type === 'sigil') return FX.rune.sigilTime * 1000;
  return runeTime(e) * 1000;
}

/** How long a cast's effect lasts, in milliseconds. */
export function fxDuration(fx: CastFx): number {
  if (fx.kind === 'fizzle') return 1100;
  // (A rune's own part is a separate event; see runeTime.)
  return (passTime(fx) + FX.tileTime) * 1000; // + room for scorch marks and dust to fade
}

// ---------------------------------------------------------------------------------------------------------------
// Shared clock and camera shake

/** Seconds since the effect started (set on its first frame). */
function useFxClock(t0: MutableRefObject<number | null>, fn: (t: number) => void) {
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    fn(clock.elapsedTime - t0.current);
  });
}

const shake = { start: 0, time: 0, strength: 0 };

function requestShake(kind: keyof typeof FX.shake) {
  const s = FX.shake[kind];
  if (!FX.shake.enabled || typeof s === 'boolean') return;
  const now = performance.now() / 1000;
  const left = shake.start + shake.time - now;
  // A stronger shake takes over; a weaker one doesn't cut a strong one short.
  if (left > 0 && shake.strength > s.strength) return;
  Object.assign(shake, { start: now, time: s.time, strength: s.strength });
}

/** Shakes the camera when an effect asks for it, then puts it back exactly where it was. */
export function CameraShake() {
  const camera = useThree((s) => s.camera);
  const base = useRef<Vector3 | null>(null);
  useFrame(() => {
    const k = (performance.now() / 1000 - shake.start) / Math.max(0.001, shake.time);
    if (k >= 0 && k < 1) {
      if (!base.current) base.current = camera.position.clone();
      const a = shake.strength * (1 - k);
      camera.position.set(base.current.x + (Math.random() - 0.5) * 2 * a, base.current.y + (Math.random() - 0.5) * 2 * a, base.current.z + (Math.random() - 0.5) * 2 * a);
    } else if (base.current) {
      camera.position.copy(base.current);
      base.current = null;
    }
  });
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Building blocks

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 → 1 → 0 over a local time u in [0, 1]. */
const hump = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));

/** Something that only exists between `delay` and `delay + span` seconds, animated by `animate(u)`, u ∈ [0, 1]. */
function Timed({ t0, delay, span, animate, children }: {
  t0: MutableRefObject<number | null>;
  delay: number;
  span: number;
  animate: (u: number, g: Group) => void;
  children: ReactNode;
}) {
  const g = useRef<Group>(null);
  useFxClock(t0, (t) => {
    if (!g.current) return;
    const u = (t - delay) / span;
    g.current.visible = u > 0 && u < 1;
    if (g.current.visible) animate(u, g.current);
  });
  return (
    <group ref={g} visible={false}>
      {children}
    </group>
  );
}

const fade = (m: Mesh | null, o: number) => {
  if (m) (m.material as MeshBasicMaterial).opacity = o;
};

// ---------------------------------------------------------------------------------------------------------------
// Tile looks

interface TileProps {
  t0: MutableRefObject<number | null>;
  at: [number, number, number];
  delay: number;
  color: string;
  scale: number;
  seed: number;
  /** Wind: push direction in world space (x, z), or null. */
  push: [number, number] | null;
}

function FireTile({ t0, at, delay, color, scale, seed }: TileProps) {
  const flame = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  const scorch = useRef<Mesh>(null);
  const embers = useRef<(Mesh | null)[]>([]);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: 6 }, () => ({ x: (rand() - 0.5) * 0.6, z: (rand() - 0.5) * 0.6, v: 0.8 + rand() * 0.7, d: rand() * 0.25 }));
  }, [seed]);
  const T = FX.tileTime;
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={T} animate={(u) => {
        const h = hump(u);
        if (flame.current) flame.current.scale.set(0.6 + 0.4 * h, Math.max(0.01, h * 1.1), 0.6 + 0.4 * h);
        if (core.current) core.current.scale.set(0.5 + 0.3 * h, Math.max(0.01, h * 0.8), 0.5 + 0.3 * h);
        fade(flame.current, 0.85 * h);
        fade(core.current, h);
        embers.current.forEach((m, i) => {
          if (!m) return;
          const k = clamp01((u - r[i].d) / (1 - r[i].d));
          m.position.set(r[i].x, TILE_TOP + k * r[i].v, r[i].z);
          fade(m, k > 0 ? 1 - k : 0);
        });
      }}>
        <mesh ref={flame} position={[0, TILE_TOP + 0.45, 0]}>
          <coneGeometry args={[0.34, 0.9, 14, 1, true]} />
          <meshBasicMaterial color={color} {...additive} />
        </mesh>
        <mesh ref={core} position={[0, TILE_TOP + 0.3, 0]}>
          <coneGeometry args={[0.2, 0.6, 12, 1, true]} />
          <meshBasicMaterial color={FX.colors.fireCore} {...additive} />
        </mesh>
        {r.map((_, i) => (
          <mesh key={i} ref={(m) => { embers.current[i] = m; }}>
            <sphereGeometry args={[0.035, 6, 6]} />
            <meshBasicMaterial color={FX.colors.fireCore} {...additive} />
          </mesh>
        ))}
      </Timed>
      {/* The scorch mark outlives the flame. */}
      <Timed t0={t0} delay={delay + T * 0.3} span={T * 2} animate={(u) => fade(scorch.current, 0.55 * (1 - u))}>
        <mesh ref={scorch} position={[0, TILE_TOP + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.38, 24]} />
          <meshBasicMaterial color={FX.colors.scorch} {...soft} />
        </mesh>
      </Timed>
    </group>
  );
}

function WaterTile({ t0, at, delay, color, scale, seed }: TileProps) {
  const rings = useRef<(Mesh | null)[]>([]);
  const column = useRef<Mesh>(null);
  const drops = useRef<(Mesh | null)[]>([]);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: 7 }, () => ({ a: rand() * Math.PI * 2, d: 0.25 + rand() * 0.25, h: 0.35 + rand() * 0.3 }));
  }, [seed]);
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime} animate={(u) => {
        rings.current.forEach((m, i) => {
          if (!m) return;
          const k = clamp01(u * 1.3 - i * 0.3);
          m.scale.setScalar(0.3 + k * 1.1);
          fade(m, k > 0 ? 0.9 * (1 - k) : 0);
        });
        if (column.current) column.current.scale.set(1, Math.max(0.01, hump(clamp01(u * 1.6))), 1);
        fade(column.current, 0.8 * hump(clamp01(u * 1.6)));
        drops.current.forEach((m, i) => {
          if (!m) return;
          const k = clamp01(u * 1.2);
          m.position.set(Math.cos(r[i].a) * r[i].d * k, TILE_TOP + r[i].h * 4 * k * (1 - k), Math.sin(r[i].a) * r[i].d * k);
          fade(m, 1 - k);
        });
      }}>
        {[0, 1].map((i) => (
          <mesh key={i} ref={(m) => { rings.current[i] = m; }} position={[0, TILE_TOP + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.37, 32]} />
            <meshBasicMaterial color={color} {...additive} />
          </mesh>
        ))}
        <mesh ref={column} position={[0, TILE_TOP + 0.3, 0]}>
          <cylinderGeometry args={[0.18, 0.08, 0.6, 14, 1, true]} />
          <meshBasicMaterial color="#cfeeff" {...additive} />
        </mesh>
        {r.map((_, i) => (
          <mesh key={i} ref={(m) => { drops.current[i] = m; }}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshBasicMaterial color="#cfeeff" {...additive} />
          </mesh>
        ))}
      </Timed>
    </group>
  );
}

function EarthTile({ t0, at, delay, color, scale, seed }: TileProps) {
  const spikes = useRef<(Mesh | null)[]>([]);
  const dust = useRef<Mesh>(null);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: 4 }, () => ({ x: (rand() - 0.5) * 0.5, z: (rand() - 0.5) * 0.5, h: 0.4 + rand() * 0.35, tilt: (rand() - 0.5) * 0.5 }));
  }, [seed]);
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime} animate={(u) => {
        const rise = u < 0.2 ? u / 0.2 : u > 0.65 ? Math.max(0, 1 - (u - 0.65) / 0.35) : 1;
        spikes.current.forEach((m, i) => {
          if (!m) return;
          m.position.y = TILE_TOP - r[i].h / 2 + rise * r[i].h;
          m.scale.setScalar(Math.max(0.01, rise));
        });
        if (dust.current) dust.current.scale.setScalar(0.4 + u * 0.9);
        fade(dust.current, 0.45 * (1 - u));
      }}>
        {r.map((s, i) => (
          <mesh key={i} ref={(m) => { spikes.current[i] = m; }} position={[s.x, TILE_TOP, s.z]} rotation={[s.tilt, 0, -s.tilt]}>
            <coneGeometry args={[0.11, s.h, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        ))}
        <mesh ref={dust} position={[0, TILE_TOP + 0.2, 0]}>
          <sphereGeometry args={[0.45, 12, 10]} />
          <meshBasicMaterial color={FX.colors.dust} {...soft} />
        </mesh>
      </Timed>
    </group>
  );
}

function WindTile({ t0, at, delay, color, scale, push }: TileProps) {
  const streaks = useRef<(Mesh | null)[]>([]);
  const swirl = useRef<Mesh>(null);
  const yaw = push ? Math.atan2(-push[1], push[0]) : 0;
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime} animate={(u) => {
        streaks.current.forEach((m, i) => {
          if (!m) return;
          const k = clamp01(u * 1.4 - i * 0.15);
          m.position.x = -0.55 + k * 1.1;
          fade(m, 0.9 * hump(k));
        });
        if (swirl.current) swirl.current.rotation.z = u * 9;
        fade(swirl.current, 0.7 * hump(u));
      }}>
        {push && (
          <group rotation={[0, yaw, 0]}>
            {[0.18, 0.42, 0.66].map((h, i) => (
              <mesh key={i} ref={(m) => { streaks.current[i] = m; }} position={[0, TILE_TOP + h, (i - 1) * 0.18]}>
                <boxGeometry args={[0.5, 0.025, 0.025]} />
                <meshBasicMaterial color={color} {...additive} />
              </mesh>
            ))}
          </group>
        )}
        <mesh ref={swirl} position={[0, TILE_TOP + 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.02, 6, 28, Math.PI * 1.4]} />
          <meshBasicMaterial color={color} {...additive} />
        </mesh>
      </Timed>
    </group>
  );
}

function FogTile({ t0, at, delay, color, scale, seed }: TileProps) {
  const puffs = useRef<(Mesh | null)[]>([]);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: 4 }, () => ({ x: (rand() - 0.5) * 0.5, z: (rand() - 0.5) * 0.5, s: 0.22 + rand() * 0.12, d: rand() * 0.2 }));
  }, [seed]);
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime * 1.3} animate={(u) => {
        puffs.current.forEach((m, i) => {
          if (!m) return;
          const k = clamp01((u - r[i].d) / (1 - r[i].d));
          m.scale.setScalar(0.3 + k * 1.2);
          m.position.y = TILE_TOP + 0.15 + k * 0.25;
          fade(m, 0.55 * hump(k));
        });
      }}>
        {r.map((p, i) => (
          <mesh key={i} ref={(m) => { puffs.current[i] = m; }} position={[p.x, TILE_TOP + 0.15, p.z]}>
            <sphereGeometry args={[p.s, 12, 10]} />
            <meshBasicMaterial color={color} {...soft} />
          </mesh>
        ))}
      </Timed>
    </group>
  );
}

function MagmaTile({ t0, at, delay, color, scale, seed }: TileProps) {
  const cracks = useRef<(Mesh | null)[]>([]);
  const pool = useRef<Mesh>(null);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: 4 }, () => ({ rot: rand() * Math.PI, len: 0.4 + rand() * 0.45, x: (rand() - 0.5) * 0.3, z: (rand() - 0.5) * 0.3 }));
  }, [seed]);
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime * 1.2} animate={(u) => {
        cracks.current.forEach((m, i) => {
          if (!m) return;
          const grow = clamp01(u * 2.5 - i * 0.15);
          m.scale.set(Math.max(0.01, grow), 1, 1);
          fade(m, u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
        });
        const flood = clamp01((u - 0.35) / 0.5);
        if (pool.current) pool.current.scale.setScalar(Math.max(0.01, flood));
        fade(pool.current, 0.9 * hump(clamp01((u - 0.35) / 0.65)));
      }}>
        {r.map((c, i) => (
          <mesh key={i} ref={(m) => { cracks.current[i] = m; }} position={[c.x, TILE_TOP + 0.015, c.z]} rotation={[-Math.PI / 2, 0, c.rot]}>
            <planeGeometry args={[c.len, 0.045]} />
            <meshBasicMaterial color={FX.colors.fireCore} {...additive} />
          </mesh>
        ))}
        <mesh ref={pool} position={[0, TILE_TOP + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial color={color} {...additive} />
        </mesh>
      </Timed>
    </group>
  );
}

function QuicksandTile({ t0, at, delay, color, scale }: TileProps) {
  const swirl = useRef<Mesh>(null);
  const disc = useRef<Mesh>(null);
  return (
    <group position={at} scale={scale}>
      <Timed t0={t0} delay={delay} span={FX.tileTime * 1.2} animate={(u) => {
        if (swirl.current) {
          swirl.current.rotation.z = u * 12;
          swirl.current.scale.setScalar(1.2 - u * 0.8);
        }
        fade(swirl.current, 0.9 * hump(u));
        if (disc.current) disc.current.scale.setScalar(Math.max(0.01, clamp01(u * 1.5)));
        fade(disc.current, 0.85 * hump(clamp01(u * 0.8)));
      }}>
        <mesh ref={disc} position={[0, TILE_TOP + 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.43, 28]} />
          <meshBasicMaterial color={color} {...soft} />
        </mesh>
        <mesh ref={swirl} position={[0, TILE_TOP + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.3, 28, 1, 0, Math.PI * 1.5]} />
          <meshBasicMaterial color="#5e4220" {...soft} />
        </mesh>
      </Timed>
    </group>
  );
}

const TILE_LOOK: Record<Look, (p: TileProps) => ReactNode> = {
  fire: FireTile,
  water: WaterTile,
  earth: EarthTile,
  wind: WindTile,
  fog: FogTile,
  magma: MagmaTile,
  quicksand: QuicksandTile,
};

// ---------------------------------------------------------------------------------------------------------------
// Bolts, sparks, debris, dust and rune extras

/** A glowing bolt running from the wizard to the end of one lane. */
function Bolt({ t0, from, to, start, travel, color, scale }: {
  t0: MutableRefObject<number | null>;
  from: [number, number, number];
  to: [number, number, number];
  start: number;
  travel: number;
  color: string;
  scale: number;
}) {
  const head = useRef<Mesh>(null);
  const tail = useRef<(Mesh | null)[]>([]);
  const at = (k: number) => [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[2] - from[2]) * k] as const;
  return (
    <Timed t0={t0} delay={start} span={travel + 0.12} animate={(u) => {
      const k = clamp01((u * (travel + 0.12)) / travel);
      const end = k >= 1 ? 1 - (u * (travel + 0.12) - travel) / 0.12 : 1;
      if (head.current) head.current.position.set(...at(k));
      fade(head.current, end);
      tail.current.forEach((m, i) => {
        if (!m) return;
        m.position.set(...at(Math.max(0, k - (i + 1) * 0.08)));
        fade(m, end * (0.6 - i * 0.15));
      });
    }}>
      <mesh ref={head} scale={scale}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color={color} {...additive} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { tail.current[i] = m; }} scale={scale * (0.8 - i * 0.18)}>
          <sphereGeometry args={[0.11, 8, 8]} />
          <meshBasicMaterial color={color} {...additive} />
        </mesh>
      ))}
    </Timed>
  );
}

/** A quick star-burst on a unit that was hit. */
function Spark({ t0, at, delay, color, small = false }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number; color: string; small?: boolean }) {
  const star = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const size = small ? 0.6 : 1;
  return (
    <Timed t0={t0} delay={delay} span={0.32} animate={(u) => {
      star.current?.scale.setScalar(size * (0.3 + 1.1 * hump(clamp01(u * 1.4))));
      if (star.current) star.current.rotation.y = u * 3;
      fade(star.current, 1 - u);
      ring.current?.scale.setScalar(size * (0.3 + u * 1.3));
      fade(ring.current, 0.8 * (1 - u));
    }}>
      <mesh ref={star} position={at}>
        <octahedronGeometry args={[0.2]} />
        <meshBasicMaterial color={FX.colors.spark} {...additive} />
      </mesh>
      <mesh ref={ring} position={at}>
        <torusGeometry args={[0.28, 0.025, 6, 24]} />
        <meshBasicMaterial color={color} {...additive} />
      </mesh>
    </Timed>
  );
}

/** Chips flying off a pillar (more of them, and a dust cloud, when it breaks). */
function Debris({ t0, at, delay, broken, seed }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number; broken: boolean; seed: number }) {
  const bits = useRef<(Mesh | null)[]>([]);
  const cloud = useRef<Mesh>(null);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: broken ? 12 : 6 }, () => ({ a: rand() * Math.PI * 2, v: 0.5 + rand() * 0.8, up: 0.6 + rand() * 0.9, h: 0.3 + rand() * 0.9, spin: rand() * 8 }));
  }, [seed, broken]);
  const span = broken ? 0.9 : 0.6;
  return (
    <Timed t0={t0} delay={delay} span={span} animate={(u) => {
      const s = u * span;
      bits.current.forEach((m, i) => {
        if (!m) return;
        const b = r[i];
        m.position.set(Math.cos(b.a) * b.v * s, Math.max(TILE_TOP, TILE_TOP + b.h + b.up * s - 4.5 * s * s), Math.sin(b.a) * b.v * s);
        m.rotation.set(b.spin * s, b.spin * s * 0.7, 0);
      });
      if (cloud.current) cloud.current.scale.setScalar(0.5 + u * 1.2);
      fade(cloud.current, (broken ? 0.6 : 0.3) * (1 - u));
    }}>
      <group position={at}>
        {r.map((_, i) => (
          <mesh key={i} ref={(m) => { bits.current[i] = m; }}>
            <boxGeometry args={[0.09, 0.07, 0.08]} />
            <meshStandardMaterial color={FX.colors.debris} roughness={0.9} />
          </mesh>
        ))}
        <mesh ref={cloud} position={[0, TILE_TOP + (broken ? 0.5 : 0.8), 0]}>
          <sphereGeometry args={[0.5, 12, 10]} />
          <meshBasicMaterial color={FX.colors.dust} {...soft} />
        </mesh>
      </group>
    </Timed>
  );
}

/** A puff of dust (a pushed unit hitting something). */
function Puff({ t0, at, delay, color = FX.colors.dust }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number; color?: string }) {
  const m = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={0.5} animate={(u) => {
      m.current?.scale.setScalar(0.3 + u * 0.9);
      fade(m.current, 0.6 * (1 - u));
    }}>
      <mesh ref={m} position={at}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshBasicMaterial color={color} {...soft} />
      </mesh>
    </Timed>
  );
}

/** Little lights drifting from one point to another (Siphon), or bursting outward (Volatile, Free, a fizzle). */
function Motes({ t0, from, to, delay, span, color, count, seed, burst = false }: {
  t0: MutableRefObject<number | null>;
  from: [number, number, number];
  to?: [number, number, number];
  delay: number;
  span: number;
  color: string;
  count: number;
  seed: number;
  burst?: boolean;
}) {
  const ms = useRef<(Mesh | null)[]>([]);
  const r = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: count }, () => ({ a: rand() * Math.PI * 2, lag: rand() * 0.3, lift: 0.2 + rand() * 0.5, d: 0.3 + rand() * 0.4 }));
  }, [seed, count]);
  return (
    <Timed t0={t0} delay={delay} span={span} animate={(u) => {
      ms.current.forEach((m, i) => {
        if (!m) return;
        const b = r[i];
        const k = clamp01((u - b.lag) / (1 - b.lag));
        if (burst || !to) {
          m.position.set(from[0] + Math.cos(b.a) * b.d * k, from[1] + b.lift * k, from[2] + Math.sin(b.a) * b.d * k);
        } else {
          const arc = Math.sin(Math.PI * k) * b.lift;
          m.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k + arc, from[2] + (to[2] - from[2]) * k);
        }
        fade(m, k > 0 ? (burst ? 1 - k : hump(k)) : 0);
      });
    }}>
      {r.map((_, i) => (
        <mesh key={i} ref={(m) => { ms.current[i] = m; }}>
          <sphereGeometry args={[burst ? 0.05 : 0.06, 8, 8]} />
          <meshBasicMaterial color={color} {...additive} />
        </mesh>
      ))}
    </Timed>
  );
}

/** Unstable Fire: a ring blasting outward from the wizard and a white flash over the 3×3. */
function Blast({ t0, at, delay }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number }) {
  const ring = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={0.5} animate={(u) => {
      ring.current?.scale.setScalar(0.3 + u * 2.2);
      fade(ring.current, 1 - u);
      fade(flash.current, 0.7 * Math.max(0, 1 - u * 3));
    }}>
      <mesh ref={ring} position={[at[0], TILE_TOP + 0.3, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.6, 0.08, 8, 40]} />
        <meshBasicMaterial color={ELEMENT_COLOR.fire} {...additive} />
      </mesh>
      <mesh ref={flash} position={[at[0], TILE_TOP + 0.05, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, 3]} />
        <meshBasicMaterial color="#ffffff" {...additive} />
      </mesh>
    </Timed>
  );
}

/** A flash on a tile. */
function TileFlash({ t0, at, delay, color = '#ffffff', span = 0.25 }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number; color?: string; span?: number }) {
  const m = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={span} animate={(u) => fade(m.current, 0.85 * (1 - u))}>
      <mesh ref={m} position={[at[0], TILE_TOP + 0.03, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial color={color} {...additive} />
      </mesh>
    </Timed>
  );
}

/** Fires a camera shake once when the effect reaches `delay`. */
function ShakeAt({ t0, delay, kind }: { t0: MutableRefObject<number | null>; delay: number; kind: keyof typeof FX.shake }) {
  const done = useRef(false);
  useFxClock(t0, (t) => {
    if (!done.current && t >= delay) {
      done.current = true;
      requestShake(kind);
    }
  });
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// One cast

/** Lanes a bolt runs down: Beam lanes (Widen adds two) and Cross arms. Each runs from the wizard to its far end. */
function lanes(fx: CastFx): { from: Pos; to: Pos; steps: number }[] {
  const s = fx.spell!;
  if (!fx.area || s.kind === 'unstable' || s.shape === 'wall') return [];
  const ends = [...fx.area.tiles.map((t) => t.pos), ...fx.area.pillars];
  const o = fx.origin;
  const out: { from: Pos; to: Pos; steps: number }[] = [];
  if (s.shape === 'beam' && fx.dir) {
    const d = DIR_VECTORS[fx.dir];
    const side = { x: -d.y, y: d.x };
    for (const k of [-1, 0, 1]) {
      const inLane = ends.filter((p) => (p.x - o.x) * side.x + (p.y - o.y) * side.y === k);
      if (!inLane.length) continue;
      const far = inLane.reduce((a, b) => ((b.x - o.x) * d.x + (b.y - o.y) * d.y > (a.x - o.x) * d.x + (a.y - o.y) * d.y ? b : a));
      out.push({ from: { x: o.x + side.x * k, y: o.y + side.y * k }, to: far, steps: Math.abs(far.x - o.x) + Math.abs(far.y - o.y) - Math.abs(k) });
    }
  } else {
    for (const d of Object.values(DIR_VECTORS)) {
      const arm = ends.filter((p) => (d.x ? p.y === o.y && Math.sign(p.x - o.x) === d.x : p.x === o.x && Math.sign(p.y - o.y) === d.y));
      if (!arm.length) continue;
      const far = arm.reduce((a, b) => (Math.abs(b.x - o.x) + Math.abs(b.y - o.y) > Math.abs(a.x - o.x) + Math.abs(a.y - o.y) ? b : a));
      out.push({ from: o, to: far, steps: Math.abs(far.x - o.x) + Math.abs(far.y - o.y) });
    }
  }
  return out;
}


function CastEffect({ event, room, tint }: { event: CastEvent; room: RoomSize; tint?: string }) {
  const t0 = useRef<number | null>(null);
  const { fx } = event;
  const world = (p: Pos, y = 0) => tileToWorld(p, room, y);
  const origin = world(fx.origin);

  // No spell (a rune on a table that makes nothing): grey smoke on the wizard. The rune's price (Volatile, Free)
  // is still paid, so it still sparks red.
  if (fx.kind === 'fizzle' || !fx.area || !fx.spell) {
    const smoke = event.grey ? FX.colors.dud : FX.colors.fizzle;
    return (
      <group>
        <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.6)} delay={0} color={smoke} />
        <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.9)} delay={0.15} color={smoke} />
        <Motes t0={t0} from={world(fx.origin, TILE_TOP + 0.6)} delay={0.05} span={0.7} color={smoke} count={8} seed={event.id} burst />
        {(fx.rune === 'volatile' || fx.rune === 'free') && (
          <Motes t0={t0} from={world(fx.origin, UNIT_MID)} delay={0.3} span={0.5} color={FX.colors.selfHurt} count={10} seed={event.id + 7} burst />
        )}
      </group>
    );
  }

  const look = lookOf(fx);
  const color = tint ?? colorOf(fx);
  const unstable = fx.spell.kind === 'unstable';
  const pass = passTime(fx);
  const tiles = [...fx.area.tiles, ...(fx.area.self ? [fx.area.self] : [])];
  const Tile = TILE_LOOK[look];
  const toWorldDir = (p: Pos | null): [number, number] | null => (p ? [p.x, -p.y] : null);

  return (
    <group>
      {lanes(fx).map((l, j) => (
        <Bolt
          key={j}
          t0={t0}
          from={world(l.from, TILE_TOP + 0.45)}
          to={world(l.to, TILE_TOP + 0.45)}
          start={0}
          travel={FX.lead + Math.max(0, l.steps - 1) * FX.stepDelay}
          color={color}
          scale={1}
        />
      ))}
      {tiles.map((t, j) => (
        <Tile key={j} t0={t0} at={world(t.pos)} delay={tileDelay(fx, t.pos)} color={color} scale={unstable ? 1.15 : 1} seed={event.id * 97 + j * 13} push={toWorldDir(t.push)} />
      ))}
      {tint && tiles.map((t, j) => <TileFlash key={`f${j}`} t0={t0} at={world(t.pos)} delay={tileDelay(fx, t.pos)} color={tint} span={0.4} />)}
      {fx.hits.map((h) => (
        <Spark key={h.id} t0={t0} at={world(h.pos, UNIT_MID)} delay={tileDelay(fx, h.pos) + 0.1} color={h.immune ? '#9a9a9a' : color} small={h.immune} />
      ))}
      {fx.area.self && <Spark t0={t0} at={world(fx.origin, UNIT_MID)} delay={FX.lead + 0.1} color={color} />}
      {/* Damaging spells chip the pillars in their way. */}
      {spellDamage(fx.spell) > 0 &&
        fx.area.pillars.map((p, j) => {
          const broken = event.broken.some((b) => b.x === p.x && b.y === p.y);
          return <Debris key={`p${j}`} t0={t0} at={world(p)} delay={tileDelay(fx, p)} broken={broken} seed={event.id * 31 + j * 7} />;
        })}

      {unstable && (
        <>
          <Blast t0={t0} at={origin} delay={FX.lead * 0.5} />
          <ShakeAt t0={t0} delay={FX.lead * 0.5} kind="unstable" />
        </>
      )}
      {event.broken.length > 0 && <ShakeAt t0={t0} delay={pass - FX.tileTime * 0.8} kind="pillarBreak" />}

      {/* A pushed unit that hit something kicks up dust where it hit. */}
      {event.bumps.map((b, j) => (
        <Puff key={`b${j}`} t0={t0} at={[world(b.at)[0] + b.dir.x * 0.45, UNIT_MID * 0.7, world(b.at)[2] - b.dir.y * 0.45]} delay={FX.lead + FX.stepDelay * 2 + 0.1} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Runes

/** The rune's symbol in a glowing circle, drawn once per symbol onto a canvas (it's used as a floor decal). */
function sigilTexture(symbol: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const mid = 256;
  const glow = g.createRadialGradient(mid, mid, 10, mid, mid, 256);
  glow.addColorStop(0, 'rgba(214, 170, 255, 0.95)');
  glow.addColorStop(0.42, 'rgba(160, 90, 255, 0.5)');
  glow.addColorStop(0.8, 'rgba(110, 50, 220, 0.18)');
  glow.addColorStop(1, 'rgba(90, 30, 200, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(240, 225, 255, 0.95)';
  g.shadowColor = '#c78cff';
  g.shadowBlur = 18;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(mid, mid, 214, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(mid, mid, 180, 0, Math.PI * 2);
  g.stroke();
  // The other runes, small, around the ring.
  g.font = '34px "Segoe UI Historic", "Noto Sans Runic", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(240, 225, 255, 0.85)';
  // (The rune alphabet's first 16 letters, A to P.)
  const letters = Object.values(runeCipher().letters).map((s) => s[0]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.save();
    g.translate(mid + Math.cos(a) * 197, mid + Math.sin(a) * 197);
    g.rotate(a + Math.PI / 2);
    g.fillText(letters[i % letters.length], 0, 0);
    g.restore();
  }
  // The rune itself, big, in the middle.
  g.font = 'bold 250px "Segoe UI Historic", "Noto Sans Runic", serif';
  g.shadowBlur = 36;
  g.fillStyle = '#ffffff';
  g.fillText(runeGlyphOf(symbol), mid, mid + 10);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** The rune's symbol glowing purple on the 3×3 floor around the wizard, before the rune's part plays. */
function Sigil({ event, room }: { event: SigilEvent; room: RoomSize }) {
  const t0 = useRef<number | null>(null);
  const tex = useMemo(() => sigilTexture(event.symbol), [event.symbol]);
  useEffect(() => () => tex.dispose(), [tex]);
  const disc = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const at = tileToWorld(event.origin, room);
  const T = FX.rune.sigilTime;
  useFxClock(t0, (t) => {
    const u = clamp01(t / T);
    // Fade in fast, pulse, fade out at the end.
    const o = Math.min(1, u / 0.2) * Math.min(1, (1 - u) / 0.2);
    const pulse = 0.85 + 0.15 * Math.sin(t * 9);
    if (disc.current) {
      fade(disc.current, o * pulse);
      disc.current.scale.setScalar(0.85 + 0.15 * Math.min(1, u / 0.25));
      disc.current.rotation.z = -t * 0.35;
    }
    if (halo.current) {
      fade(halo.current, 0.35 * o * pulse);
      halo.current.scale.set(1, 0.6 + 0.4 * Math.min(1, u / 0.3), 1);
    }
  });
  return (
    <group position={[at[0], 0, at[2]]}>
      {/* Turned so the symbol reads upright from the camera. */}
      <group rotation={[0, -Math.PI / 4, 0]}>
        <mesh ref={disc} position={[0, TILE_TOP + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[3.1, 3.1]} />
          <meshBasicMaterial map={tex} {...additive} opacity={0} />
        </mesh>
      </group>
      {/* A low column of purple light rising off it. */}
      <mesh ref={halo} position={[0, TILE_TOP + 0.6, 0]} raycast={() => null}>
        <cylinderGeometry args={[1.25, 1.45, 1.2, 32, 1, true]} />
        <meshBasicMaterial color={FX.colors.rune} side={2} {...additive} opacity={0} />
      </mesh>
      <Motes t0={t0} from={[0, TILE_TOP + 0.1, 0]} delay={0.1} span={T - 0.1} color={FX.colors.runeLight} count={14} seed={event.id * 5 + 1} burst />
    </group>
  );
}

/** Amplify: a purple bolt striking down onto a target. */
function Strike({ t0, at, delay }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number }) {
  const glow = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={0.5} animate={(u) => {
      const grow = Math.min(1, u * 6);
      glow.current?.scale.set(1 + u * 0.8, grow, 1 + u * 0.8);
      core.current?.scale.set(1 - u * 0.7, grow, 1 - u * 0.7);
      fade(glow.current, 0.9 * (1 - u));
      fade(core.current, 1 - u);
    }}>
      {/* A wide purple glow around a thin bright core, so it reads purple even over bright tiles. */}
      <mesh ref={glow} position={[at[0], at[1] + 1.4, at[2]]}>
        <cylinderGeometry args={[0.2, 0.32, 2.8, 12, 1, true]} />
        <meshBasicMaterial color={FX.colors.rune} side={2} {...soft} />
      </mesh>
      <mesh ref={core} position={[at[0], at[1] + 1.4, at[2]]}>
        <cylinderGeometry args={[0.04, 0.08, 2.8, 8, 1, true]} />
        <meshBasicMaterial color={FX.colors.runeLight} side={2} {...additive} />
      </mesh>
    </Timed>
  );
}

/** A purple ring blasting out from a point (Volatile's second blast, Backfire). */
function Ring({ t0, at, delay, size = 1 }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number; size?: number }) {
  const ring = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={0.45} animate={(u) => {
      ring.current?.scale.setScalar(size * (0.3 + u * 1.6));
      fade(ring.current, 1 - u);
    }}>
      <mesh ref={ring} position={[at[0], TILE_TOP + 0.25, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.07, 8, 36]} />
        <meshBasicMaterial color={FX.colors.rune} {...additive} />
      </mesh>
    </Timed>
  );
}

/** The rune's own part of a rune cast, in purple. */
function RuneFx({ event, room }: { event: RuneEvent; room: RoomSize }) {
  const t0 = useRef<number | null>(null);
  const world = (p: Pos, y = 0) => tileToWorld(p, room, y);
  const { fx, base } = event;
  const purple = FX.colors.rune;
  const S = FX.rune.strike;
  const me = world(fx.origin, UNIT_MID);

  switch (event.effect) {
    case 'echo':
      // The whole spell again, in purple.
      return base ? <CastEffect event={{ type: 'cast', id: event.id, fx: base, broken: event.broken, bumps: [] }} room={room} tint={purple} /> : null;

    case 'amplify':
      return (
        <group>
          {event.targets.map((p, j) => (
            <group key={j}>
              <Strike t0={t0} at={world(p, UNIT_MID)} delay={S + j * 0.06} />
              <TileFlash t0={t0} at={world(p)} delay={S + j * 0.06} color={purple} span={0.45} />
              <Spark t0={t0} at={world(p, UNIT_MID)} delay={S + 0.05 + j * 0.06} color={purple} />
            </group>
          ))}
          <ShakeAt t0={t0} delay={S} kind="amplify" />
        </group>
      );

    case 'widen': {
      if (!fx.spell) return null;
      const Tile = TILE_LOOK[lookOf(fx)];
      const pushOf = (p: Pos) => fx.area?.tiles.find((t) => t.pos.x === p.x && t.pos.y === p.y)?.push ?? null;
      const first = Math.min(...event.extra.map((p) => tileDelay(fx, p)));
      return (
        <group>
          {event.extra.map((p, j) => {
            const d = tileDelay(fx, p) - first + 0.05;
            const push = pushOf(p);
            return (
              <group key={j}>
                <TileFlash t0={t0} at={world(p)} delay={d} color={purple} span={0.5} />
                <Tile t0={t0} at={world(p)} delay={d} color={purple} scale={1} seed={event.id * 17 + j} push={push ? [push.x, -push.y] : null} />
              </group>
            );
          })}
          {fx.hits
            .filter((h) => event.extra.some((p) => p.x === h.pos.x && p.y === h.pos.y))
            .map((h) => (
              <Spark key={h.id} t0={t0} at={world(h.pos, UNIT_MID)} delay={tileDelay(fx, h.pos) - first + 0.15} color={h.immune ? '#9a9a9a' : purple} small={h.immune} />
            ))}
        </group>
      );
    }

    case 'siphon':
      return (
        <group>
          {event.targets.map((p, j) => (
            <group key={j}>
              <Spark t0={t0} at={world(p, UNIT_MID)} delay={0.05 + j * 0.05} color={purple} small />
              <Motes t0={t0} from={world(p, UNIT_MID)} to={me} delay={S} span={FX.siphonTime} color={FX.colors.runeLight} count={7} seed={event.id * 11 + j} />
            </group>
          ))}
          <Spark t0={t0} at={me} delay={S + FX.siphonTime} color={FX.colors.siphon} />
          <Ring t0={t0} at={world(fx.origin)} delay={S + FX.siphonTime - 0.05} size={0.8} />
        </group>
      );

    case 'volatile':
      return (
        <group>
          {event.targets.map((p, j) => (
            <group key={j}>
              <Ring t0={t0} at={world(p)} delay={S + j * 0.05} />
              <TileFlash t0={t0} at={world(p)} delay={S + j * 0.05} color={purple} span={0.45} />
              <Puff t0={t0} at={world(p, UNIT_MID)} delay={S + 0.05 + j * 0.05} color={purple} />
              <Spark t0={t0} at={world(p, UNIT_MID)} delay={S + 0.05 + j * 0.05} color={purple} />
            </group>
          ))}
          <ShakeAt t0={t0} delay={S} kind="volatile" />
          {/* The backlash on the wizard. */}
          <Ring t0={t0} at={world(fx.origin)} delay={S + 0.4} size={0.9} />
          <Motes t0={t0} from={me} delay={S + 0.4} span={0.5} color={purple} count={12} seed={event.id + 3} burst />
          <Spark t0={t0} at={me} delay={S + 0.42} color={FX.colors.selfHurt} />
        </group>
      );

    case 'free':
      return (
        <group>
          {/* The mana flows back (the mana orb glows purple meanwhile, see hud/Controls.tsx), then the price in HP. */}
          <Motes t0={t0} from={world(fx.origin, TILE_TOP + 0.2)} to={world(fx.origin, TILE_TOP + 2.4)} delay={0.05} span={0.6} color={FX.colors.runeLight} count={14} seed={event.id * 3} />
          <Ring t0={t0} at={world(fx.origin)} delay={0.55} size={0.9} />
          <Motes t0={t0} from={me} delay={0.6} span={0.45} color={purple} count={10} seed={event.id + 9} burst />
          <Spark t0={t0} at={me} delay={0.62} color={FX.colors.selfHurt} />
        </group>
      );

    case 'backfire': {
      if (!fx.spell) return null;
      const Tile = TILE_LOOK[lookOf(fx)];
      const back = fx.area?.self?.push ?? null;
      return (
        <group>
          <TileFlash t0={t0} at={world(fx.origin)} delay={S} color={purple} span={0.5} />
          <Tile t0={t0} at={world(fx.origin)} delay={S} color={purple} scale={1.1} seed={event.id * 7} push={back ? [back.x, -back.y] : null} />
          <Ring t0={t0} at={world(fx.origin)} delay={S + 0.05} />
          <Spark t0={t0} at={me} delay={S + 0.12} color={purple} />
          <ShakeAt t0={t0} delay={S} kind="volatile" />
        </group>
      );
    }

    default:
      // Fizzle: the gathered magic collapses into purple smoke.
      return (
        <group>
          <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.6)} delay={0} color={purple} />
          <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.95)} delay={0.15} color={purple} />
          <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.4)} delay={0.3} color={FX.colors.fizzle} />
          <Motes t0={t0} from={world(fx.origin, TILE_TOP + 0.6)} delay={0.05} span={0.8} color={FX.colors.runeLight} count={12} seed={event.id} burst />
        </group>
      );
  }
}

/** Every spell effect playing right now. */
export function SpellFxLayer({ events, room }: { events: FxEvent[]; room: RoomSize }) {
  return (
    <group>
      {events.map((e) =>
        e.type === 'cast' ? (
          <CastEffect key={e.id} event={e} room={room} />
        ) : e.type === 'sigil' ? (
          <Sigil key={e.id} event={e} room={room} />
        ) : (
          <RuneFx key={e.id} event={e} room={room} />
        ),
      )}
    </group>
  );
}
