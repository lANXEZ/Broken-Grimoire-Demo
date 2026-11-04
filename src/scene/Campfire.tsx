import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Mesh, type MeshBasicMaterial, type PointLight, type Vector3 } from 'three';
import type { Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { Obstacle } from './Obstacle';
import { tileHandlers, type TilePointer } from './Board';

/**
 * PLACEHOLDER: the camp's fire, in the middle of its room: a ring of stones, crossed logs, flickering flames, rising
 * embers and a warm light; plus the logs to sit on around it (each blocks its tile). Fire and logs are <Obstacle>s,
 * so they fade when the wizard stands behind them.
 */
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

export function Campfire({ pos, seats, seatStyle = 'log', room, lit, out = false, pointer, unitFeet, pointerOnBoard }: {
  pos: Pos;
  seats: Pos[];
  /** Logs (the camp) or a rock (room 0). */
  seatStyle?: 'log' | 'rock';
  room: RoomSize;
  /** Burning brightly while you're here; it dies down once you've made your choice. */
  lit: boolean;
  /** Put out by a Water or Earth spell: no flames, a thin trail of smoke, until a Fire spell lights it again. */
  out?: boolean;
  pointer: TilePointer;
  unitFeet: Vector3[];
  pointerOnBoard: { current: boolean };
}) {
  const at = tileToWorld(pos, room, TILE_TOP);
  const C = PLACEHOLDER_COLORS;
  const flames = useRef<(Mesh | null)[]>([]);
  const embers = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const smoke = useRef<(Mesh | null)[]>([]);
  const burst = useRef<Mesh>(null);
  const r = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ a: i * 2.4, s: 0.6 + ((i * 37) % 10) / 20, d: (i * 0.13) % 1 })), []);
  // How lit the fire is right now (eases between 0 = out and 1), and when it last went out or caught.
  const level = useRef(out ? 0 : 1);
  const change = useRef<{ at: number; to: 'out' | 'lit' } | null>(null);
  const was = useRef(out);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (was.current !== out) {
      was.current = out;
      change.current = { at: t, to: out ? 'out' : 'lit' };
    }
    // Douse: the flames drop at once. Relight: they catch over a moment and flare.
    level.current += ((out ? 0 : 1) - level.current) * Math.min(1, dt * (out ? 14 : 4));
    const since = change.current ? t - change.current.at : 99;
    const flare = change.current?.to === 'lit' ? 1 + 0.9 * Math.max(0, 1 - since / 0.6) : 1;
    const k = (lit ? 1 : 0.55) * level.current * flare;
    flames.current.forEach((m, i) => {
      if (!m) return;
      const flick = 0.85 + 0.2 * Math.sin(t * (9 + i * 2.3) + i) + 0.08 * Math.sin(t * 23 + i * 5);
      m.visible = k > 0.02;
      m.scale.set(Math.max(0.01, level.current), Math.max(0.01, flick * k), Math.max(0.01, level.current));
      (m.material as MeshBasicMaterial).opacity = (0.75 - i * 0.15) * (0.8 + 0.2 * Math.sin(t * 13 + i));
    });
    embers.current.forEach((m, i) => {
      if (!m) return;
      const u = (t * 0.6 * r[i].s + r[i].d) % 1;
      m.position.set(Math.cos(r[i].a + t) * 0.12 * (1 + u), 0.25 + u * 1.1 * Math.max(k, 0.3), Math.sin(r[i].a + t) * 0.12 * (1 + u));
      (m.material as MeshBasicMaterial).opacity = (1 - u) * Math.min(1, k);
    });
    // Put out: a thin trail of grey smoke keeps rising.
    smoke.current.forEach((m, i) => {
      if (!m) return;
      const u = (t * 0.35 + i / smoke.current.length) % 1;
      m.visible = out;
      m.position.set(0.05 * Math.sin(t + i * 2), 0.15 + u * 1.2, 0.05 * Math.cos(t * 0.8 + i));
      m.scale.setScalar(0.6 + u * 1.6);
      (m.material as MeshBasicMaterial).opacity = 0.16 * (1 - u);
    });
    // The moment it changes: a cloud of steam (put out) or a bright flash (lit).
    if (burst.current) {
      const u = since / 0.9;
      burst.current.visible = u < 1;
      const mat = burst.current.material as MeshBasicMaterial;
      mat.color.set(change.current?.to === 'out' ? C.campSteam : C.campFlameCore);
      burst.current.scale.setScalar(0.4 + u * (change.current?.to === 'out' ? 2.2 : 1.4));
      mat.opacity = (change.current?.to === 'out' ? 0.55 : 0.8) * Math.max(0, 1 - u);
    }
    if (light.current) light.current.intensity = Math.max(0.15, (lit ? 2.2 : 1.1) * level.current * flare + 0.35 * level.current * Math.sin(t * 11) + 0.2 * level.current * Math.sin(t * 27));
  });

  return (
    <group>
      <Obstacle position={at} size={{ width: 0.75, depth: 0.75, height: 0.75 }} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} handlers={tileHandlers(pos, pointer)}>
        {/* Ring of stones. */}
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32]} rotation={[0, a, 0]} castShadow>
              <dodecahedronGeometry args={[0.075]} />
              <meshStandardMaterial color={C.campStone} roughness={0.95} />
            </mesh>
          );
        })}
        {/* Crossed firewood. */}
        {[0, Math.PI / 2.4, -Math.PI / 2.4].map((a, i) => (
          <mesh key={i} position={[0, 0.07, 0]} rotation={[0, a, Math.PI / 2 - 0.25]}>
            <cylinderGeometry args={[0.035, 0.04, 0.42, 6]} />
            <meshStandardMaterial color={C.campLogDark} roughness={0.9} />
          </mesh>
        ))}
        {/* Flames: three nested cones, flickering. */}
        {[
          { r: 0.2, h: 0.62, c: C.campFlameOuter },
          { r: 0.13, h: 0.46, c: C.campFlame },
          { r: 0.07, h: 0.3, c: C.campFlameCore },
        ].map((f, i) => (
          <mesh key={i} ref={(m) => { flames.current[i] = m; }} position={[0, 0.08, 0]} raycast={() => null}>
            <coneGeometry args={[f.r, f.h, 12, 1, true]} />
            <meshBasicMaterial color={f.c} {...glow} />
          </mesh>
        ))}
        {r.map((_, i) => (
          <mesh key={`e${i}`} ref={(m) => { embers.current[i] = m; }} raycast={() => null}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshBasicMaterial color={C.campFlameCore} {...glow} />
          </mesh>
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={`s${i}`} ref={(m) => { smoke.current[i] = m; }} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.08, 10, 8]} />
            <meshBasicMaterial color={C.campSmoke} transparent depthWrite={false} opacity={0} />
          </mesh>
        ))}
        <mesh ref={burst} position={[0, 0.35, 0]} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshBasicMaterial color={C.campSteam} transparent depthWrite={false} opacity={0} />
        </mesh>
      </Obstacle>
      <pointLight ref={light} position={[at[0], TILE_TOP + 0.6, at[2]]} color={C.campLight} intensity={2} distance={4.5} decay={1.6} />

      {/* A rock to sit on (room 0). */}
      {seatStyle === 'rock' &&
        seats.map((p, i) => (
          <Obstacle key={i} position={tileToWorld(p, room, TILE_TOP)} size={{ width: 0.7, depth: 0.6, height: 0.45 }} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} handlers={tileHandlers(p, pointer)}>
            <mesh position={[0, 0.2, 0]} scale={[1.25, 0.75, 1]} rotation={[0, 0.6, 0]} castShadow>
              <dodecahedronGeometry args={[0.28, 1]} />
              <meshStandardMaterial color={C.campStone} roughness={0.95} flatShading />
            </mesh>
          </Obstacle>
        ))}
      {/* Logs to sit on, each lying across its tile, turned toward the fire. */}
      {seatStyle === 'log' && seats.map((p, i) => {
        const w = tileToWorld(p, room, TILE_TOP);
        const facing = Math.atan2(w[2] - at[2], w[0] - at[0]);
        return (
          <Obstacle key={i} position={w} size={{ width: 0.8, depth: 0.35, height: 0.3 }} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} handlers={tileHandlers(p, pointer)}>
            <group rotation={[0, -facing + Math.PI / 2, 0]}>
              <mesh position={[0, 0.13, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.13, 0.14, 0.78, 12]} />
                <meshStandardMaterial color={C.campLog} roughness={0.85} />
              </mesh>
              {[-0.39, 0.39].map((x) => (
                <mesh key={x} position={[x, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.115, 0.115, 0.012, 12]} />
                  <meshStandardMaterial color={C.campLogEnd} roughness={0.9} />
                </mesh>
              ))}
            </group>
          </Obstacle>
        );
      })}
    </group>
  );
}
