import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Group, type MeshBasicMaterial, type PointLight } from 'three';
import type { Pos } from '../engine';
import { RUNE_DROP_GLOW, UNIT_HEIGHT } from '../config/art';
import { softSpotTexture } from './Hazards';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

const noRaycast = () => null;
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

/**
 * Endless mode's curse (hud/EndlessCurse.tsx): the mage is wrapped in a pulsing purple aura, the rune-drop purple
 * (RUNE_DROP_GLOW), with a purple pool of light under them and a strong purple light that grows as the curse takes hold.
 * Nothing here catches the mouse.
 */
export function CurseGlow({ pos, room }: { pos: Pos; room: RoomSize }) {
  const [x, y, z] = tileToWorld(pos, room, TILE_TOP);
  const h = UNIT_HEIGHT.mage;
  const aura = useRef<Group>(null);
  const inner = useRef<MeshBasicMaterial>(null);
  const outer = useRef<MeshBasicMaterial>(null);
  const floor = useRef<MeshBasicMaterial>(null);
  const light = useRef<PointLight>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Grows in over ~1.5 s, then keeps pulsing faster and faster.
    const grow = Math.min(1, (t - born.current) / 1.5);
    const pulse = 0.5 + 0.5 * Math.sin(t * (5 + 4 * grow));
    if (aura.current) aura.current.scale.setScalar(0.85 + 0.15 * grow + 0.08 * pulse);
    if (inner.current) inner.current.opacity = (0.35 + 0.25 * pulse) * grow;
    if (outer.current) outer.current.opacity = (0.12 + 0.12 * pulse) * grow;
    if (floor.current) floor.current.opacity = (0.55 + 0.35 * pulse) * grow;
    if (light.current) light.current.intensity = (3 + 3 * pulse) * grow;
  });
  return (
    <group position={[x, y, z]}>
      <group ref={aura} position={[0, h * 0.55, 0]}>
        {/* A tall aura hugging the body, and a wider haze around it. */}
        <mesh scale={[0.38, h * 0.75, 0.38]} raycast={noRaycast} renderOrder={5}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial ref={inner} color={RUNE_DROP_GLOW} opacity={0} {...glow} />
        </mesh>
        <mesh scale={[0.62, h * 1.0, 0.62]} raycast={noRaycast} renderOrder={4}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial ref={outer} color={RUNE_DROP_GLOW} opacity={0} {...glow} />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={noRaycast} renderOrder={3}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial ref={floor} map={softSpotTexture()} color={RUNE_DROP_GLOW} opacity={0} {...glow} />
      </mesh>
      <pointLight ref={light} position={[0, h * 0.9, 0]} color={RUNE_DROP_GLOW} intensity={0} distance={4.5} decay={1.4} />
    </group>
  );
}
