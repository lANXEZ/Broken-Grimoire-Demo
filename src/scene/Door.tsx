import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Vector3 } from 'three';
import type { Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { Obstacle } from './Obstacle';
import { tileHandlers, type TilePointer } from './Board';

/**
 * PLACEHOLDER door on the room's exit tile: a stone archway.
 * - Locked: a closed wooden door with iron bars, on a dark red tile.
 * - Open: the door stands swung aside, a gold portal shimmers in the arch, a light beam rises from the tile, and a
 *   gold arrow bobs above it under an EXIT sign naming where it leads. Hard to miss on purpose.
 * The archway is an <Obstacle> (it fades like a pillar); the portal, beam, arrow and sign never hide anything.
 */
const ARCH = { width: 0.86, height: 1.05, post: 0.13, opening: 0.6 } as const;
/** Heights above the tile: the bobbing arrow, the EXIT sign's centre, and the sign's top edge (roughly). */
const ARROW_Y = 1.38;
const SIGN_Y = 1.66;
/**
 * How high the door's decorations reach, in world units above the floor. The camera (scene/CameraRig.tsx) keeps
 * this point inside the board area, so the EXIT sign never slides under the top bar.
 */
export const DOOR_TOP = TILE_TOP + SIGN_Y + 0.38;
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;
const noRaycast = () => null;

/** The big dungeon door (room 0) is this much bigger than a normal one. */
export const BIG_DOOR_SCALE = 1.45;
/** Height of the open door's light column (scaled with the big door: about 2.47, reaching world y ≈ 2.61). */
export const DOOR_BEAM_HEIGHT = 1.7;

export function Door({ pos, room, open, label, big = false, sign = true, pointer, unitFeet, pointerOnBoard }: {
  pos: Pos;
  room: RoomSize;
  open: boolean;
  /** Room 0's big dungeon door. */
  big?: boolean;
  /** Where the door leads ("The Whispering Lectern"), shown on the EXIT sign while it's open. */
  label: string;
  /** Show the EXIT sign (not in the opening cutscene). */
  sign?: boolean;
  pointer: TilePointer;
  unitFeet: Vector3[];
  pointerOnBoard: { current: boolean };
}) {
  const portal = useRef<Mesh>(null);
  // drei's <Html> comes up empty if it's created in the scene's very first render (a door that's open from the
  // start, like room 0's or the Cistern's), so the EXIT sign is added one render later.
  const [signReady, setSignReady] = useState(false);
  useEffect(() => setSignReady(true), []);
  const beam = useRef<Mesh>(null);
  const arrow = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!open) return;
    const t = clock.elapsedTime;
    if (portal.current) (portal.current.material as MeshBasicMaterial).opacity = 0.55 + 0.2 * Math.sin(t * 3);
    if (beam.current) (beam.current.material as MeshBasicMaterial).opacity = 0.14 + 0.06 * Math.sin(t * 2 + 1);
    if (arrow.current) {
      arrow.current.position.y = TILE_TOP + ARROW_Y + 0.07 * Math.sin(t * 3);
      arrow.current.rotation.y = t * 1.5;
    }
  });

  const at = tileToWorld(pos, room, TILE_TOP);
  const C = PLACEHOLDER_COLORS;
  const half = ARCH.width / 2 - ARCH.post / 2;

  const k = big ? BIG_DOOR_SCALE : 1;
  const beamH = DOOR_BEAM_HEIGHT;
  return (
    <group position={[at[0] * (1 - k), at[1] * (1 - k), at[2] * (1 - k)]} scale={k}>
      <Obstacle
        position={at}
        size={{ width: ARCH.width, depth: 0.2, height: ARCH.height + 0.12 }}
        unitFeet={unitFeet}
        pointerOnBoard={pointerOnBoard}
        handlers={tileHandlers(pos, pointer)}
      >
        {/* Stone archway: two posts and a lintel. */}
        {[-half, half].map((x) => (
          <mesh key={x} position={[x, ARCH.height / 2, 0]} castShadow>
            <boxGeometry args={[ARCH.post, ARCH.height, 0.2]} />
            <meshStandardMaterial color={C.doorFrame} roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, ARCH.height + 0.06, 0]} castShadow>
          <boxGeometry args={[ARCH.width + 0.08, 0.13, 0.24]} />
          <meshStandardMaterial color={C.doorFrame} roughness={0.85} />
        </mesh>

        {/* The door leaf, hinged on the left post: shut and barred while locked, swung wide open once unlocked. */}
        <group position={[-ARCH.opening / 2, 0, 0]} rotation={[0, open ? -1.95 : 0, 0]}>
          <mesh position={[ARCH.opening / 2, (ARCH.height - 0.05) / 2, 0]} castShadow>
            <boxGeometry args={[ARCH.opening, ARCH.height - 0.05, 0.05]} />
            <meshStandardMaterial color={C.doorWood} roughness={0.8} />
          </mesh>
          {!open &&
            [0.12, 0.3, 0.48].map((x) => (
              <mesh key={x} position={[x, (ARCH.height - 0.05) / 2, 0.035]}>
                <boxGeometry args={[0.05, ARCH.height - 0.12, 0.03]} />
                <meshStandardMaterial color={C.exitBars} metalness={0.5} roughness={0.45} />
              </mesh>
            ))}
          {!open && (
            <mesh position={[ARCH.opening / 2, ARCH.height * 0.55, 0.035]}>
              <boxGeometry args={[ARCH.opening - 0.06, 0.06, 0.03]} />
              <meshStandardMaterial color={C.exitBars} metalness={0.5} roughness={0.45} />
            </mesh>
          )}
        </group>
      </Obstacle>

      {/* An invisible click area over the doorway: clicking the door always means the door, even while the arch
          has faded to let you see past it (a faded obstacle lets clicks through). */}
      <mesh position={[at[0], at[1] + ARCH.height / 2, at[2]]} {...tileHandlers(pos, pointer)}>
        <boxGeometry args={[ARCH.width, ARCH.height, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {open && (
        <group position={at}>
          {/* The portal shimmering in the arch. */}
          <mesh ref={portal} position={[0, (ARCH.height - 0.05) / 2, 0]} raycast={noRaycast}>
            <planeGeometry args={[ARCH.opening, ARCH.height - 0.05]} />
            <meshBasicMaterial color={C.portal} side={2} {...glow} opacity={0.6} />
          </mesh>
          {/* A beam of light rising from the tile. */}
          <mesh ref={beam} position={[0, beamH / 2, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.38, 0.42, beamH, 24, 1, true]} />
            <meshBasicMaterial color={C.portal} side={2} {...glow} opacity={0.16} />
          </mesh>
          {/* A gold arrow bobbing above the door, pointing down at it. */}
          <group ref={arrow} position={[0, TILE_TOP + ARROW_Y, 0]}>
            <mesh rotation={[Math.PI, 0, 0]} raycast={noRaycast}>
              <coneGeometry args={[0.13, 0.24, 4]} />
              <meshStandardMaterial color={C.exitOpen} emissive={C.exitOpen} emissiveIntensity={0.9} />
            </mesh>
          </group>
          {signReady && sign && <Html position={[0, TILE_TOP + SIGN_Y, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
            <div className="door-sign">
              <span className="door-sign-title">Exit</span>
              <span className="door-sign-to">{label}</span>
            </div>
          </Html>}
        </group>
      )}
    </group>
  );
}
