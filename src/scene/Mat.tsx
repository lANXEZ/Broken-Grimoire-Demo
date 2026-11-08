import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import type { Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/**
 * PLACEHOLDER: room 0's sleeping mat, where the mage wakes up. A rough, worn straw mat two tiles long (woven
 * bands, dark worn patches, frayed ends) with a small old pillow at the head end (`tiles[0]`). It lies flat and
 * doesn't block its tiles. While the mage stands on it, a small prompt floats over the pillow, "Get some rest?":
 * clicking it goes back to the title screen (App.tsx).
 */
const noRaycast = () => null;

/** Mat size in tiles: length along the two tiles, width across. */
const LENGTH = 1.84;
const WIDTH = 0.72;
const HEAD = -0.7;

export function Mat({ tiles, room, prompt, onRest }: { tiles: Pos[]; room: RoomSize; prompt: boolean; onRest: () => void }) {
  const C = PLACEHOLDER_COLORS;
  const head = tileToWorld(tiles[0], room, TILE_TOP);
  const foot = tileToWorld(tiles[tiles.length - 1], room, TILE_TOP);
  const mid: [number, number, number] = [(head[0] + foot[0]) / 2, TILE_TOP, (head[2] + foot[2]) / 2];
  // The mat's length runs along local x, from the head (pillow) to the foot; slightly askew, as if kicked about.
  const turn = Math.atan2(-(foot[2] - head[2]), foot[0] - head[0]) + 0.035;
  // Fixed "random" fringe straws, so the frayed ends look the same every time.
  const straws = useMemo(
    () =>
      [-1, 1].flatMap((end) =>
        Array.from({ length: 12 }, (_, i) => ({
          z: -0.33 + i * 0.06 + Math.sin(i * 12.9 + end) * 0.012,
          x: end * (LENGTH / 2 + 0.01 + Math.abs(Math.sin(i * 7.3 + end * 2)) * 0.035),
          len: 0.05 + Math.abs(Math.sin(i * 3.1 + end)) * 0.05,
          tilt: Math.sin(i * 5.7 + end) * 0.5,
        })),
      ),
    [],
  );
  // drei's <Html> comes up empty if it's created in the scene's very first render (see Lectern.tsx).
  const [htmlReady, setHtmlReady] = useState(false);
  useEffect(() => setHtmlReady(true), []);
  return (
    <group position={mid} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.012, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[LENGTH, 0.022, WIDTH]} />
        <meshStandardMaterial color={C.matStraw} roughness={1} />
      </mesh>
      {/* Woven bands across it. */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={`b${i}`} position={[-0.84 + i * 0.112, 0.0245, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.028, 0.004, WIDTH]} />
          <meshStandardMaterial color={C.matWeave} roughness={1} />
        </mesh>
      ))}
      {/* Worn through in places. */}
      {[
        [0.35, 0.12, 0.26, 0.17, 0.4],
        [-0.15, -0.2, 0.12, 0.09, -0.3],
        [0.72, -0.08, 0.1, 0.12, 0.9],
      ].map(([x, z, w, d, r], i) => (
        <mesh key={`w${i}`} position={[x, 0.025, z]} rotation={[0, r, 0]} raycast={noRaycast}>
          <boxGeometry args={[w, 0.004, d]} />
          <meshStandardMaterial color={C.matWorn} roughness={1} />
        </mesh>
      ))}
      {/* Frayed ends. */}
      {straws.map((s, i) => (
        <mesh key={`s${i}`} position={[s.x, 0.012, s.z]} rotation={[0, Math.PI / 2 + s.tilt, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.012, 0.008, s.len]} />
          <meshStandardMaterial color={C.matStraw} roughness={1} />
        </mesh>
      ))}
      {/* The small old pillow at the head, flattened from use, with a stain. */}
      <group position={[HEAD, 0.06, 0.01]} rotation={[0, 0.1, 0]}>
        <mesh scale={[0.12, 0.05, 0.22]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={C.matPillow} roughness={0.95} />
        </mesh>
        <mesh position={[0.02, 0.03, 0.06]} scale={[0.05, 0.025, 0.07]} raycast={noRaycast}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={C.matStain} roughness={1} />
        </mesh>
      </group>
      {htmlReady && prompt && (
        <Html position={[HEAD, 1.55, 0]} center zIndexRange={[20, 10]}>
          <button className="rest-prompt" onClick={onRest} onPointerDown={(e) => e.stopPropagation()}>
            Get some rest?
            <span>Return to menu</span>
          </button>
        </Html>
      )}
    </group>
  );
}
