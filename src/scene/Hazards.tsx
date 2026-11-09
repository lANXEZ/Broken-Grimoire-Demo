import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type PointLight } from 'three';
import type { Drop, Hazard } from '../engine';
import { FRAGMENT_COLOR, HAZARD_COLOR, RUNE_DROP_GLOW } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/**
 * PLACEHOLDER merge hazards and floor drops. None of these catch the mouse: clicks go to the tile underneath.
 * - Magma: a glowing orange pool. Quicksand: a sandy, slowly swirling puddle. Fog: a low translucent cloud.
 *   Hovering a hazard's tile shows what it does and when it fades, top right (hud/BoardInfo.tsx).
 * - Drops: a small gem bobbing over the tile, in the colour of the card it holds. A drop holding a rune glows bright
 *   purple (RUNE_DROP_GLOW): a glowing gem in a pulsing halo, a purple pool of light on the floor and a purple light.
 */
const noRaycast = () => null;
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

/** A white spot fading out to its edge: the rune drop's pool of light on the floor (tinted by the material). */
let softSpot: CanvasTexture | null = null;
export function softSpotTexture(): CanvasTexture {
  if (softSpot) return softSpot;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  softSpot = new CanvasTexture(c);
  return softSpot;
}

function Magma({ hazard, room }: { hazard: Hazard; room: RoomSize }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.emissiveIntensity = 0.9 + 0.35 * Math.sin(clock.elapsedTime * 3 + hazard.pos.x);
  });
  return (
    <mesh position={tileToWorld(hazard.pos, room, TILE_TOP + 0.012)} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <planeGeometry args={[0.86, 0.86]} />
      <meshStandardMaterial ref={mat} color={HAZARD_COLOR.magma} emissive={HAZARD_COLOR.magma} emissiveIntensity={1} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function Quicksand({ hazard, room }: { hazard: Hazard; room: RoomSize }) {
  const swirl = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (swirl.current) swirl.current.rotation.z += dt * 0.6;
  });
  const pos = tileToWorld(hazard.pos, room, TILE_TOP + 0.012);
  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh raycast={noRaycast}>
        <circleGeometry args={[0.43, 32]} />
        <meshStandardMaterial color={HAZARD_COLOR.quicksand} roughness={1} transparent opacity={0.92} depthWrite={false} />
      </mesh>
      <mesh ref={swirl} position={[0, 0, 0.002]} raycast={noRaycast}>
        <ringGeometry args={[0.12, 0.2, 24, 1, 0, Math.PI * 1.4]} />
        <meshBasicMaterial color="#7a5a2c" transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Fog({ hazard, room }: { hazard: Hazard; room: RoomSize }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.32 + 0.06 * Math.sin(clock.elapsedTime * 1.4 + hazard.pos.y * 1.7);
  });
  return (
    <mesh position={tileToWorld(hazard.pos, room, TILE_TOP + 0.3)} raycast={noRaycast}>
      <boxGeometry args={[0.98, 0.6, 0.98]} />
      <meshBasicMaterial ref={mat} color={HAZARD_COLOR.fog} transparent opacity={0.32} depthWrite={false} />
    </mesh>
  );
}

export function Hazards({ hazards, room }: { hazards: Hazard[]; room: RoomSize }) {
  return (
    <group>
      {hazards.map((h, i) => {
        // The index keeps keys unique even if a tile were ever listed twice (a repeated key leaves a mesh behind).
        const key = `${h.kind}-${h.pos.x},${h.pos.y}-${i}`;
        if (h.kind === 'magma') return <Magma key={key} hazard={h} room={room} />;
        if (h.kind === 'quicksand') return <Quicksand key={key} hazard={h} room={room} />;
        return <Fog key={key} hazard={h} room={room} />;
      })}
    </group>
  );
}

function DropGem({ drop, room }: { drop: Drop; room: RoomSize }) {
  const g = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const pool = useRef<MeshBasicMaterial>(null);
  const light = useRef<PointLight>(null);
  const rune = drop.cards.some((c) => c.kind === 'rune');
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      g.current.position.y = TILE_TOP + 0.35 + 0.08 * Math.sin(t * 2.5 + drop.id);
      g.current.rotation.y = t * 1.2;
    }
    if (!rune) return;
    // The rune's glow breathes: halo, floor pool and light swell together.
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + drop.id);
    if (halo.current) {
      halo.current.scale.setScalar(1 + 0.18 * pulse);
      (halo.current.material as MeshBasicMaterial).opacity = 0.35 + 0.25 * pulse;
    }
    if (pool.current) pool.current.opacity = 0.45 + 0.3 * pulse;
    if (light.current) light.current.intensity = 2.2 + 1.4 * pulse;
  });
  const [x, , z] = tileToWorld(drop.pos, room);
  const color = rune ? RUNE_DROP_GLOW : FRAGMENT_COLOR[drop.cards[0]?.kind ?? 'rune'];
  const shine = rune ? 2.2 : 0.55;
  return (
    <group>
      <group ref={g} position={[x, TILE_TOP + 0.35, z]}>
        <mesh castShadow raycast={noRaycast}>
          <octahedronGeometry args={[0.15]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={shine} roughness={0.35} metalness={0.2} toneMapped={!rune} />
        </mesh>
        {drop.cards.length > 1 && (
          <mesh position={[0.16, -0.06, 0]} raycast={noRaycast}>
            <octahedronGeometry args={[0.08]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={shine} toneMapped={!rune} />
          </mesh>
        )}
        {rune && (
          <>
            <mesh ref={halo} raycast={noRaycast}>
              <sphereGeometry args={[0.3, 16, 12]} />
              <meshBasicMaterial color={RUNE_DROP_GLOW} {...glow} opacity={0.45} />
            </mesh>
            <mesh raycast={noRaycast}>
              <sphereGeometry args={[0.19, 16, 12]} />
              <meshBasicMaterial color={RUNE_DROP_GLOW} {...glow} opacity={0.5} />
            </mesh>
          </>
        )}
      </group>
      {rune && (
        <>
          <mesh position={[x, TILE_TOP + 0.014, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[1.1, 1.1]} />
            <meshBasicMaterial ref={pool} color={RUNE_DROP_GLOW} map={softSpotTexture()} {...glow} opacity={0.55} />
          </mesh>
          <pointLight ref={light} position={[x, TILE_TOP + 0.5, z]} color={RUNE_DROP_GLOW} intensity={2.8} distance={2.6} decay={1.6} />
        </>
      )}
    </group>
  );
}

export function Drops({ drops, room }: { drops: Drop[]; room: RoomSize }) {
  return (
    <group>
      {drops.map((d) => (
        <DropGem key={d.id} drop={d} room={room} />
      ))}
    </group>
  );
}
