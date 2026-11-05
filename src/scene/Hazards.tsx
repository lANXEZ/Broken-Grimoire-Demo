import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Drop, Hazard } from '../engine';
import { FRAGMENT_COLOR, HAZARD_COLOR } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/**
 * PLACEHOLDER merge hazards and floor drops. None of these catch the mouse: clicks go to the tile underneath.
 * - Magma: a glowing orange pool. Quicksand: a sandy, slowly swirling puddle. Fog: a low translucent cloud.
 * - Drops: a small gem bobbing over the tile, in the colour of the card it holds (purple-grey for a rune).
 */
const noRaycast = () => null;

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
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.y = TILE_TOP + 0.35 + 0.08 * Math.sin(clock.elapsedTime * 2.5 + drop.id);
    g.current.rotation.y = clock.elapsedTime * 1.2;
  });
  const [x, , z] = tileToWorld(drop.pos, room);
  const color = FRAGMENT_COLOR[drop.cards[0]?.kind ?? 'rune'];
  return (
    <group ref={g} position={[x, TILE_TOP + 0.35, z]}>
      <mesh castShadow raycast={noRaycast}>
        <octahedronGeometry args={[0.15]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
      </mesh>
      {drop.cards.length > 1 && (
        <mesh position={[0.16, -0.06, 0]} raycast={noRaycast}>
          <octahedronGeometry args={[0.08]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
        </mesh>
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
