import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, type Mesh, type MeshBasicMaterial } from 'three';
import type { Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { BIG_DOOR_SCALE, DOOR_BEAM_HEIGHT } from './Door';

/**
 * PLACEHOLDER: room 0's collapsed corner. The ceiling is open to the night here: a slab of moonlight comes down
 * through the hole onto tiles a3-a4, straight on its left side and slanting out on its right ("|_\" on screen).
 * Dust drifts in it, bits of gravel fall straight down from the hole, and rubble lies on the floor. Walkable.
 */
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

/**
 * The beam, in world units (one tile = 1; the board centred on the origin; y up), as drawn on the room 0 map: the
 * hole (`top`) and the lit floor (`floor`, on the tiles' surface). Both are rectangles over the same z range; the
 * left side (x = -1.5) goes straight down, the right side slants from x -1.2 (the hole is 0.3 wide) to x -0.5. The
 * hole is as high as the top of the big door's light column (about y 2.61).
 */
const MOON_BEAM = {
  top: { x0: -1.5, x1: -1.2, z0: -2, z1: 0, y: TILE_TOP + DOOR_BEAM_HEIGHT * BIG_DOOR_SCALE },
  floor: { x0: -1.5, x1: -0.5, z0: -2, z1: 0 },
};

/** The beam's four sides (no top or bottom), as one open box whose top is narrower than its bottom. */
function beamGeometry(): BufferGeometry {
  const T = MOON_BEAM.top;
  const F = MOON_BEAM.floor;
  const y0 = TILE_TOP;
  // Corners: floor 0-3, top 4-7, going round the same way.
  const v = [
    [F.x0, y0, F.z0], [F.x1, y0, F.z0], [F.x1, y0, F.z1], [F.x0, y0, F.z1],
    [T.x0, T.y, T.z0], [T.x1, T.y, T.z0], [T.x1, T.y, T.z1], [T.x0, T.y, T.z1],
  ];
  const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos: number[] = [];
  for (const [a, b, c, d] of quads) for (const i of [a, b, c, a, c, d]) pos.push(...v[i]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function Moonlight({ tiles, room }: { tiles: Pos[]; room: RoomSize }) {
  const C = PLACEHOLDER_COLORS;
  const beam = useRef<Mesh>(null);
  const dust = useRef<(Mesh | null)[]>([]);
  const gravel = useRef<(Mesh | null)[]>([]);
  const pts = tiles.map((p) => tileToWorld(p, room, TILE_TOP));
  const geo = useMemo(beamGeometry, []);
  useEffect(() => () => geo.dispose(), [geo]);

  const rand = useMemo(() => {
    let s = 11;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }, []);
  const motes = useMemo(() => Array.from({ length: 26 }, () => ({ u: rand(), w: rand(), s: rand(), v: 0.03 + rand() * 0.04, ph: rand() * 6 })), [rand]);
  // Gravel drops from the hole straight down, so it lands under the hole.
  const falls = useMemo(() => Array.from({ length: 7 }, () => ({ u: rand(), w: rand(), t0: rand() * 3, period: 1.6 + rand() * 2.4 })), [rand]);
  const rubble = useMemo(
    () => pts.flatMap((p) => Array.from({ length: 6 }, () => ({ x: p[0] + (rand() - 0.5) * 0.8, z: p[2] + (rand() - 0.5) * 0.8, s: 0.04 + rand() * 0.07, r: rand() * 3 }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placed once per room
    [rand, tiles.length],
  );

  /** A point inside the beam: `s` = 0 on the floor to 1 at the hole; `u`/`w` = 0-1 across it in x / z. */
  const inside = (s: number, u: number, w: number): [number, number, number] => {
    const T = MOON_BEAM.top;
    const F = MOON_BEAM.floor;
    const x0 = F.x0 + (T.x0 - F.x0) * s;
    const x1 = F.x1 + (T.x1 - F.x1) * s;
    return [x0 + (x1 - x0) * u, TILE_TOP + (T.y - TILE_TOP) * s, F.z0 + (F.z1 - F.z0) * w];
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beam.current) (beam.current.material as MeshBasicMaterial).opacity = 0.11 + 0.025 * Math.sin(t * 0.7);
    dust.current.forEach((m, i) => {
      if (!m) return;
      const d = motes[i];
      const s = (d.s + t * d.v) % 1;
      const p = inside(s * 0.9, 0.1 + 0.8 * d.u + 0.04 * Math.sin(t * 0.4 + d.ph), 0.05 + 0.9 * d.w);
      m.position.set(...p);
      (m.material as MeshBasicMaterial).opacity = 0.6 * Math.sin(s * Math.PI);
    });
    gravel.current.forEach((m, i) => {
      if (!m) return;
      const f = falls[i];
      const u = ((t + f.t0) % f.period) / 0.7; // falls for 0.7 s, then waits
      m.visible = u < 1;
      const [x, , z] = inside(1, f.u, 0.1 + 0.8 * f.w);
      m.position.set(x, TILE_TOP + (MOON_BEAM.top.y - TILE_TOP) * (1 - u * u), z);
      m.rotation.set(u * 6, u * 4, 0);
    });
  });

  return (
    <group>
      {/* The slab of moonlight, from the hole down to the floor. */}
      <mesh ref={beam} geometry={geo} raycast={() => null}>
        <meshBasicMaterial color={C.moonlight} side={2} {...glow} opacity={0.11} />
      </mesh>
      {/* Where it lands on the floor. */}
      {pts.map((p, i) => (
        <mesh key={i} position={[p[0], TILE_TOP + 0.012, p[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={C.moonlight} {...glow} opacity={0.2} />
        </mesh>
      ))}
      {/* Pale light on whoever stands in it, from up toward the hole. */}
      <pointLight position={inside(0.55, 0.4, 0.5)} intensity={5} distance={4} decay={1.5} color={C.moonlight} />
      {rubble.map((r, i) => (
        <mesh key={`r${i}`} position={[r.x, TILE_TOP + r.s * 0.4, r.z]} rotation={[r.r, r.r * 2, 0]} castShadow raycast={() => null}>
          <dodecahedronGeometry args={[r.s]} />
          <meshStandardMaterial color={C.rubble} roughness={0.95} />
        </mesh>
      ))}
      {motes.map((_, i) => (
        <mesh key={`d${i}`} ref={(m) => { dust.current[i] = m; }} raycast={() => null}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshBasicMaterial color={C.moonDust} {...glow} />
        </mesh>
      ))}
      {falls.map((_, i) => (
        <mesh key={`g${i}`} ref={(m) => { gravel.current[i] = m; }} raycast={() => null}>
          <boxGeometry args={[0.045, 0.035, 0.04]} />
          <meshStandardMaterial color={C.rubble} />
        </mesh>
      ))}
    </group>
  );
}
