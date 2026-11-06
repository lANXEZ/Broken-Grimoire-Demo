import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Mesh, type MeshBasicMaterial, type PointLight } from 'three';
import { PLACEHOLDER_COLORS } from '../config/art';

/**
 * PLACEHOLDER: a torch in an iron bracket on a pillar's face. Drawn in the pillar's own space (the pillar's base
 * centre at the origin): `side` picks which of the two faces the camera sees it goes on, `half` is half the
 * pillar's width and `y` the height of the bracket.
 *
 * Unlit, it's a cold rag on a stick. When `lit` turns on (after `delay` seconds) it catches with a flare and keeps
 * flickering, with a warm light on the floor around the pillar. Rooms start with their torches out the first time
 * the wizard walks in; the dungeon lights them a moment later (App.tsx, `reveal`).
 */
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

export function Torch({ side, half, y, lit, delay = 0, seed = 0 }: {
  side: 'left' | 'front';
  half: number;
  y: number;
  lit: boolean;
  delay?: number;
  seed?: number;
}) {
  const C = PLACEHOLDER_COLORS;
  const flames = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const flash = useRef<Mesh>(null);
  const level = useRef(lit ? 1 : 0);
  // When it last caught (clock seconds), for the flare.
  const caught = useRef<number | null>(null);
  const wasLit = useRef(lit);
  const litSince = useRef<number | null>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (lit !== wasLit.current) {
      wasLit.current = lit;
      litSince.current = lit ? t : null;
      if (!lit) caught.current = null;
    }
    const burning = lit && (litSince.current === null || t - litSince.current >= delay);
    if (burning && litSince.current !== null && caught.current === null) caught.current = t;
    level.current += ((burning ? 1 : 0) - level.current) * Math.min(1, dt * (burning ? 6 : 20));
    const since = caught.current === null ? 99 : t - caught.current;
    const flare = 1 + 0.8 * Math.max(0, 1 - since / 0.45);
    const k = level.current * flare;
    flames.current.forEach((m, i) => {
      if (!m) return;
      const flick = 0.85 + 0.18 * Math.sin(t * (10 + i * 3.1) + seed) + 0.08 * Math.sin(t * 25 + seed * 3 + i);
      m.visible = k > 0.02;
      m.scale.set(Math.max(0.01, level.current), Math.max(0.01, flick * k), Math.max(0.01, level.current));
      (m.material as MeshBasicMaterial).opacity = 0.8 - i * 0.2;
    });
    if (flash.current) {
      const u = since / 0.5;
      flash.current.visible = u < 1;
      flash.current.scale.setScalar(0.4 + u * 1.3);
      (flash.current.material as MeshBasicMaterial).opacity = 0.7 * Math.max(0, 1 - u);
    }
    if (light.current) light.current.intensity = k * (1.5 + 0.25 * Math.sin(t * 12 + seed) + 0.15 * Math.sin(t * 29 + seed));
  });

  const head: [number, number, number] = [0, y + 0.24, half + 0.15];
  return (
    <group rotation={[0, side === 'left' ? -Math.PI / 2 : 0, 0]}>
      {/* Iron bracket on the face, and the handle leaning out of it. */}
      <mesh position={[0, y, half + 0.02]} castShadow>
        <boxGeometry args={[0.09, 0.12, 0.05]} />
        <meshStandardMaterial color={C.torchIron} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, y + 0.1, half + 0.08]} rotation={[0.45, 0, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.02, 0.3, 8]} />
        <meshStandardMaterial color={C.torchWood} roughness={0.9} />
      </mesh>
      <mesh position={[0, y + 0.21, half + 0.135]} rotation={[0.45, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.035, 0.09, 8]} />
        <meshStandardMaterial color={C.torchRag} roughness={1} />
      </mesh>
      {/* Flame: two nested cones. */}
      {[
        { r: 0.07, h: 0.26, c: C.torchFlame },
        { r: 0.04, h: 0.16, c: C.torchFlameCore },
      ].map((f, i) => (
        <mesh key={i} ref={(m) => { flames.current[i] = m; }} position={[head[0], head[1] + f.h / 2 - 0.02, head[2]]} visible={false} raycast={() => null}>
          <coneGeometry args={[f.r, f.h, 10, 1, true]} />
          <meshBasicMaterial color={f.c} {...glow} />
        </mesh>
      ))}
      <mesh ref={flash} position={head} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshBasicMaterial color={C.torchFlameCore} {...glow} opacity={0} />
      </mesh>
      <pointLight ref={light} position={[head[0], head[1] + 0.1, head[2] + 0.25]} color={C.torchLight} intensity={0} distance={3.6} decay={1.5} />
    </group>
  );
}
