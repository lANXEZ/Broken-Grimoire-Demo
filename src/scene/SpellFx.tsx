import { useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Color, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { DIR_VECTORS, mergeHazard, spellDamage, type CastFx, type Pos } from '../engine';
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
 * - Runes, revealed by the cast: Echo replays it in purple, Amplify is bigger and flashes, Siphon sends green
 *   motes back to you, Volatile and Free spark red on you, a fizzle just puffs purple smoke.
 * The game state has already changed when this plays (damage numbers appear at once); it's purely visual.
 * PLACEHOLDER looks, all drawn in code. Timing and colours live in config/fx.ts.
 */

/** One cast to show, with what it did that the effect needs to know. */
export interface FxEvent {
  id: number;
  fx: CastFx;
  /** Pillars the cast broke. */
  broken: Pos[];
  /** Where a pushed unit hit something (wall, pillar or unit), with the direction it was going. */
  bumps: { at: Pos; dir: Pos }[];
}

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

/** How long the whole effect lasts, in milliseconds (App removes it after this). */
export function fxDuration(fx: CastFx): number {
  if (fx.kind === 'fizzle') return 1100;
  const pass = passTime(fx);
  let t = fx.passes * pass + (fx.passes - 1) * FX.echoGap;
  if (fx.rune === 'siphon') t += FX.siphonTime;
  return (t + FX.tileTime) * 1000; // + room for scorch marks and dust to fade
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

/** Amplify: a white flash on a tile. */
function TileFlash({ t0, at, delay }: { t0: MutableRefObject<number | null>; at: [number, number, number]; delay: number }) {
  const m = useRef<Mesh>(null);
  return (
    <Timed t0={t0} delay={delay} span={0.25} animate={(u) => fade(m.current, 0.8 * (1 - u))}>
      <mesh ref={m} position={[at[0], TILE_TOP + 0.03, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial color="#ffffff" {...additive} />
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

function mix(a: string, b: string, k: number): string {
  return `#${new Color(a).lerp(new Color(b), k).getHexString()}`;
}

function CastEffect({ event, room }: { event: FxEvent; room: RoomSize }) {
  const t0 = useRef<number | null>(null);
  const { fx } = event;
  const world = (p: Pos, y = 0) => tileToWorld(p, room, y);
  const origin = world(fx.origin);

  // A fizzle: purple smoke and a few sparks on the wizard, nothing else.
  if (fx.kind === 'fizzle' || !fx.area || !fx.spell) {
    return (
      <group>
        <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.6)} delay={0} color={FX.colors.fizzle} />
        <Puff t0={t0} at={world(fx.origin, TILE_TOP + 0.9)} delay={0.15} color={FX.colors.fizzle} />
        <Motes t0={t0} from={world(fx.origin, TILE_TOP + 0.6)} delay={0.05} span={0.7} color={FX.colors.fizzle} count={8} seed={event.id} burst />
        {(fx.rune === 'volatile' || fx.rune === 'free') && (
          <Motes t0={t0} from={world(fx.origin, UNIT_MID)} delay={0.3} span={0.5} color={FX.colors.selfHurt} count={10} seed={event.id + 7} burst />
        )}
      </group>
    );
  }

  const look = lookOf(fx);
  const base = colorOf(fx);
  const scale = fx.rune === 'amplify' ? FX.amplifyScale : 1;
  const unstable = fx.spell.kind === 'unstable';
  const pass = passTime(fx);
  const tiles = [...fx.area.tiles, ...(fx.area.self ? [fx.area.self] : [])];
  const Tile = TILE_LOOK[look];
  const toWorldDir = (p: Pos | null): [number, number] | null => (p ? [p.x, -p.y] : null);
  const passEnd = fx.passes * pass + (fx.passes - 1) * FX.echoGap;

  return (
    <group>
      {Array.from({ length: fx.passes }, (_, i) => {
        const start = i * (pass + FX.echoGap);
        const color = i === 0 ? base : mix(base, FX.colors.echo, 0.65);
        return (
          <group key={i}>
            {lanes(fx).map((l, j) => (
              <Bolt
                key={j}
                t0={t0}
                from={world(l.from, TILE_TOP + 0.45)}
                to={world(l.to, TILE_TOP + 0.45)}
                start={start}
                travel={FX.lead + Math.max(0, l.steps - 1) * FX.stepDelay}
                color={color}
                scale={scale}
              />
            ))}
            {tiles.map((t, j) => (
              <Tile key={j} t0={t0} at={world(t.pos)} delay={start + tileDelay(fx, t.pos)} color={color} scale={scale * (unstable ? 1.15 : 1)} seed={event.id * 97 + j * 13 + i} push={toWorldDir(t.push)} />
            ))}
            {fx.rune === 'amplify' && tiles.map((t, j) => <TileFlash key={`f${j}`} t0={t0} at={world(t.pos)} delay={start + tileDelay(fx, t.pos)} />)}
            {fx.hits.map((h) => (
              <Spark key={h.id} t0={t0} at={world(h.pos, UNIT_MID)} delay={start + tileDelay(fx, h.pos) + 0.1} color={h.immune ? '#9a9a9a' : color} small={h.immune} />
            ))}
            {fx.area!.self && <Spark t0={t0} at={world(fx.origin, UNIT_MID)} delay={start + FX.lead + 0.1} color={color} />}
            {/* Damaging spells chip the pillars in their way. */}
            {spellDamage(fx.spell!, fx.rune) > 0 &&
              fx.area!.pillars.map((p, j) => {
                const broken = i === fx.passes - 1 && event.broken.some((b) => b.x === p.x && b.y === p.y);
                return <Debris key={`p${j}`} t0={t0} at={world(p)} delay={start + tileDelay(fx, p)} broken={broken} seed={event.id * 31 + j * 7 + i} />;
              })}
          </group>
        );
      })}

      {unstable && (
        <>
          <Blast t0={t0} at={origin} delay={FX.lead * 0.5} />
          <ShakeAt t0={t0} delay={FX.lead * 0.5} kind="unstable" />
        </>
      )}
      {fx.rune === 'amplify' && <ShakeAt t0={t0} delay={FX.lead} kind="amplify" />}
      {event.broken.length > 0 && <ShakeAt t0={t0} delay={passEnd - FX.tileTime * 0.8} kind="pillarBreak" />}

      {/* A pushed unit that hit something kicks up dust where it hit. */}
      {event.bumps.map((b, j) => (
        <Puff key={`b${j}`} t0={t0} at={[world(b.at)[0] + b.dir.x * 0.45, UNIT_MID * 0.7, world(b.at)[2] - b.dir.y * 0.45]} delay={FX.lead + FX.stepDelay * 2 + 0.1} />
      ))}

      {fx.rune === 'siphon' &&
        fx.hits
          .filter((h) => !h.immune)
          .map((h, j) => (
            <Motes key={`s${j}`} t0={t0} from={world(h.pos, UNIT_MID)} to={world(fx.origin, UNIT_MID)} delay={passEnd - FX.tileTime * 0.5} span={FX.siphonTime} color={FX.colors.siphon} count={5} seed={event.id * 11 + j} />
          ))}
      {(fx.rune === 'volatile' || fx.rune === 'free') && (
        <>
          <Motes t0={t0} from={world(fx.origin, UNIT_MID)} delay={passEnd - FX.tileTime * 0.6} span={0.5} color={FX.colors.selfHurt} count={10} seed={event.id + 3} burst />
          {fx.rune === 'volatile' && <ShakeAt t0={t0} delay={passEnd - FX.tileTime * 0.6} kind="volatile" />}
        </>
      )}
    </group>
  );
}

/** Every spell effect playing right now. */
export function SpellFxLayer({ events, room }: { events: FxEvent[]; room: RoomSize }) {
  return (
    <group>
      {events.map((e) => (
        <CastEffect key={e.id} event={e} room={room} />
      ))}
    </group>
  );
}
