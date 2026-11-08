import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Mesh, type MeshBasicMaterial, type PointLight } from 'three';
import type { Vector3 } from 'three';
import type { Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { Obstacle } from './Obstacle';
import { ARCH, BIG_DOOR_SCALE } from './Door';
import { tileHandlers, type TilePointer } from './Board';

/**
 * PLACEHOLDER: room 0's sealed door (on `pos`, in the back corner). The mage blasted it shut with a string of spells,
 * and the last one went off in their face (the opening cutscene starts as they come to). A big stone archway like the
 * dungeon door, its door charred and cracked, buried to half its height under a heap of gravel that blocks the tile.
 * The gravel spills onto the `trail` tiles in front (walkable), and the spells left their marks along it, from the
 * floor up to the door: scorch and embers (Fire), frost shards (Water), rock spikes jutting out of the heap (Earth).
 * The embers and the frost glow faintly: the only light in the room while the campfire is out.
 */
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;
const noRaycast = () => null;

/** How far back on its tile the door stands (the heap fills the front of the tile). */
const DOOR_BACK = 0.3;
/** The gravel heap: half as wide as it is (rx), how far it reaches out from the door (rz), and its height (h). */
const HEAP = { rx: 0.55, rz: 0.7, h: 0.6 };

type Mark = 'fire' | 'frost' | 'earth';

export function SealedDoor({ pos, trail, room, pointer, unitFeet, pointerOnBoard }: {
  pos: Pos;
  /** The tiles in front of it with gravel spilled on them, and the spells' trail. */
  trail: Pos[];
  room: RoomSize;
  pointer: TilePointer;
  unitFeet: Vector3[];
  pointerOnBoard: { current: boolean };
}) {
  const C = PLACEHOLDER_COLORS;
  const at = tileToWorld(pos, room, TILE_TOP);
  const k = BIG_DOOR_SCALE;
  const half = ARCH.width / 2 - ARCH.post / 2;
  const doorZ = at[2] - DOOR_BACK;

  const embers = useRef<(Mesh | null)[]>([]);
  const motes = useRef<(Mesh | null)[]>([]);
  const fireLight = useRef<PointLight>(null);
  const frostLight = useRef<PointLight>(null);

  const scene = useMemo(() => {
    let seed = 23;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spill = trail.map((p) => tileToWorld(p, room, TILE_TOP));
    // The trail runs from the front of the spill up the heap to the foot of the door. 0 = front, 1 = the door.
    const front = spill.length ? spill[spill.length - 1] : at;
    const along = (t: number, side = 0): [number, number] => [
      front[0] + (at[0] - front[0]) * t + side,
      front[2] + 0.3 + (doorZ + 0.15 - (front[2] + 0.3)) * t,
    ];
    // The heap: a half mound against the door, highest there and sloping down toward the room.
    const heapH = (x: number, z: number) => {
      const dx = (x - at[0]) / HEAP.rx;
      const dz = Math.max(0, z - doorZ) / HEAP.rz;
      return Math.max(0, HEAP.h * Math.sqrt(Math.max(0, 1 - dx * dx - dz * dz)));
    };
    // The marks along the trail, in the order they were cast.
    const marks: { kind: Mark; x: number; z: number; y: number }[] = (
      [
        ['fire', 0.12, 0.08],
        ['frost', 0.4, -0.16],
        ['earth', 0.62, 0.12],
        ['fire', 0.82, -0.08],
        ['frost', 0.93, 0.2],
      ] as [Mark, number, number][]
    ).map(([kind, t, side]) => {
      const [x, z] = along(t, side);
      return { kind, x, z, y: TILE_TOP + heapH(x, z) };
    });
    const nearest = (x: number, z: number) => {
      let best: { kind: Mark; d: number } | null = null;
      for (const m of marks) {
        const d = Math.hypot(m.x - x, m.z - z);
        if (!best || d < best.d) best = { kind: m.kind, d };
      }
      return best;
    };
    const stoneColor = (x: number, z: number) => {
      const n = nearest(x, z);
      if (n && n.d < 0.2 && n.kind === 'fire') return C.scorchedStone;
      if (n && n.d < 0.2 && n.kind === 'frost') return C.frostedStone;
      return rand() < 0.5 ? C.rubble : C.rubbleLight;
    };

    const stones: { x: number; y: number; z: number; s: number; r: number; color: string }[] = [];
    // Chunks of stone all over the heap, bigger toward its foot, and a few tumbled off around it.
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI;
      const d = Math.sqrt(rand()) * 1.02;
      const x = at[0] + Math.cos(a) * d * HEAP.rx;
      const z = doorZ + Math.sin(a) * d * HEAP.rz;
      const h = heapH(x, z);
      const s = 0.04 + rand() * 0.06 + (1 - h / HEAP.h) * 0.05;
      stones.push({ x, y: TILE_TOP + Math.max(s * 0.4, h - s * 0.35), z, s, r: rand() * 3, color: stoneColor(x, z) });
    }
    // Gravel spilled onto the tiles in front, thicker near the heap.
    for (const p of spill) {
      for (let i = 0; i < 16; i++) {
        const u = rand();
        const x = p[0] + (rand() - 0.5) * 0.85;
        const z = p[2] - 0.45 + u * u * 0.9;
        const s = 0.025 + rand() * 0.05;
        stones.push({ x, y: TILE_TOP + s * 0.4, z, s, r: rand() * 3, color: stoneColor(x, z) });
      }
    }
    const ember = marks.filter((m) => m.kind === 'fire').flatMap((m) =>
      Array.from({ length: 6 }, () => ({ x: m.x + (rand() - 0.5) * 0.3, z: m.z + (rand() - 0.5) * 0.24, y: m.y + 0.02, ph: rand() * 6, sp: 2 + rand() * 4 })),
    );
    const shards = marks.filter((m) => m.kind === 'frost').flatMap((m) =>
      Array.from({ length: 4 }, () => ({ x: m.x + (rand() - 0.5) * 0.22, z: m.z + (rand() - 0.5) * 0.2, y: m.y, h: 0.12 + rand() * 0.16, tx: (rand() - 0.5) * 0.9, tz: (rand() - 0.5) * 0.9 })),
    );
    const spikes = marks.filter((m) => m.kind === 'earth').flatMap((m) =>
      Array.from({ length: 3 }, (_, i) => ({ x: m.x + (i - 1) * 0.13, z: m.z + (rand() - 0.5) * 0.12, y: m.y - 0.04, h: 0.24 + rand() * 0.2, tx: (rand() - 0.5) * 0.6, tz: 0.25 + rand() * 0.3 })),
    );
    const wisps = marks.flatMap((m) => Array.from({ length: 3 }, () => ({ kind: m.kind, x: m.x, z: m.z, y: m.y, ph: rand(), v: 0.18 + rand() * 0.12, dx: (rand() - 0.5) * 0.2 })));
    return { marks, stones, ember, shards, spikes, wisps };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placed once per room
  }, [pos.x, pos.y, trail.length, room.width, room.height]);

  const fireAt = scene.marks.find((m) => m.kind === 'fire')!;
  const frostAt = scene.marks.find((m) => m.kind === 'frost')!;
  const wispColor = (k: Mark) => (k === 'fire' ? C.ember : k === 'frost' ? C.frost : C.earthSpark);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    embers.current.forEach((m, i) => {
      if (!m) return;
      const e = scene.ember[i];
      (m.material as MeshBasicMaterial).opacity = 0.45 + 0.45 * Math.max(0, Math.sin(t * e.sp + e.ph));
    });
    motes.current.forEach((m, i) => {
      if (!m) return;
      const w = scene.wisps[i];
      const u = (w.ph + t * w.v) % 1;
      m.position.set(w.x + w.dx * u, w.y + 0.05 + u * 0.7, w.z);
      (m.material as MeshBasicMaterial).opacity = 0.7 * Math.sin(u * Math.PI);
    });
    if (fireLight.current) fireLight.current.intensity = 2.2 + 0.5 * Math.sin(t * 7) + 0.3 * Math.sin(t * 13.3);
    if (frostLight.current) frostLight.current.intensity = 1.3 + 0.2 * Math.sin(t * 1.3);
  });

  return (
    <group>
      {/* The archway and its door, scaled up like the dungeon door; it fades like a pillar. */}
      <Obstacle
        position={[at[0], TILE_TOP, doorZ]}
        size={{ width: ARCH.width * k, depth: 0.2 * k, height: (ARCH.height + 0.12) * k }}
        unitFeet={unitFeet}
        pointerOnBoard={pointerOnBoard}
        handlers={tileHandlers(pos, pointer)}
      >
        <group scale={k}>
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
          {/* The door, shut for good: charred wood, split by cracks. */}
          <mesh position={[0, (ARCH.height - 0.05) / 2, 0]} castShadow>
            <boxGeometry args={[ARCH.opening, ARCH.height - 0.05, 0.05]} />
            <meshStandardMaterial color={C.sealedWood} roughness={0.95} />
          </mesh>
          {[
            [0.08, 0.72, 0.5, 0.42],
            [-0.12, 0.5, 0.42, -0.62],
            [0.1, 0.3, 0.3, 0.2],
          ].map(([x, y, len, rot], i) => (
            <mesh key={i} position={[x, y, 0.03]} rotation={[0, 0, rot]} raycast={noRaycast}>
              <boxGeometry args={[0.025, len, 0.01]} />
              <meshBasicMaterial color={C.sealedCrack} />
            </mesh>
          ))}
          {/* Soot blown up the door from the blast. */}
          <mesh position={[0, 0.42, 0.031]} raycast={noRaycast}>
            <planeGeometry args={[ARCH.width, 0.75]} />
            <meshBasicMaterial color={C.scorch} transparent opacity={0.45} depthWrite={false} />
          </mesh>
        </group>
      </Obstacle>

      {/* The gravel heap: a half mound against the door, with chunks of stone on it and spilled in front. */}
      <mesh position={[at[0], TILE_TOP, doorZ]} scale={[HEAP.rx, HEAP.h, HEAP.rz]} castShadow receiveShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 14, 7, 0, Math.PI, 0, Math.PI / 2]} />
        <meshStandardMaterial color={C.rubble} roughness={1} flatShading />
      </mesh>
      {scene.stones.map((s, i) => (
        <mesh key={`s${i}`} position={[s.x, s.y, s.z]} rotation={[s.r, s.r * 2, 0]} castShadow raycast={noRaycast}>
          <dodecahedronGeometry args={[s.s]} />
          <meshStandardMaterial color={s.color} roughness={0.95} flatShading />
        </mesh>
      ))}

      {/* Fire: scorch marks with embers still glowing in them. */}
      {scene.marks
        .filter((m) => m.kind === 'fire')
        .map((m, i) => (
          <group key={`f${i}`} position={[m.x, m.y + 0.014, m.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
              <circleGeometry args={[0.26, 20]} />
              <meshBasicMaterial color={C.scorch} transparent opacity={0.3} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} raycast={noRaycast}>
              <circleGeometry args={[0.15, 16]} />
              <meshBasicMaterial color={C.scorch} transparent opacity={0.5} depthWrite={false} />
            </mesh>
          </group>
        ))}
      {scene.ember.map((e, i) => (
        <mesh key={`e${i}`} ref={(m) => { embers.current[i] = m; }} position={[e.x, e.y, e.z]} raycast={noRaycast}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshBasicMaterial color={C.ember} {...glow} opacity={0.8} />
        </mesh>
      ))}

      {/* Water: frost on the ground and ice shards growing out of it. */}
      {scene.marks
        .filter((m) => m.kind === 'frost')
        .map((m, i) => (
          <mesh key={`r${i}`} position={[m.x, m.y + 0.016, m.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <circleGeometry args={[0.2, 18]} />
            <meshBasicMaterial color={C.frost} {...glow} opacity={0.22} />
          </mesh>
        ))}
      {scene.shards.map((s, i) => (
        <mesh key={`i${i}`} position={[s.x, s.y + s.h / 2 - 0.02, s.z]} rotation={[s.tx, 0, s.tz]} castShadow raycast={noRaycast}>
          <coneGeometry args={[0.035, s.h, 5]} />
          <meshStandardMaterial color={C.frost} emissive={C.frost} emissiveIntensity={0.35} transparent opacity={0.8} roughness={0.15} />
        </mesh>
      ))}

      {/* Earth: rock spikes jutting out of the heap, toward the room. */}
      {scene.spikes.map((s, i) => (
        <mesh key={`p${i}`} position={[s.x, s.y + s.h / 2, s.z]} rotation={[s.tz, 0, s.tx]} castShadow raycast={noRaycast}>
          <coneGeometry args={[0.07, s.h, 5]} />
          <meshStandardMaterial color={C.earthSpike} roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* What's left of the magic drifts up off the marks. */}
      {scene.wisps.map((w, i) => (
        <mesh key={`w${i}`} ref={(m) => { motes.current[i] = m; }} raycast={noRaycast}>
          <sphereGeometry args={[0.016, 6, 6]} />
          <meshBasicMaterial color={wispColor(w.kind)} {...glow} />
        </mesh>
      ))}

      <pointLight ref={fireLight} position={[fireAt.x, fireAt.y + 0.3, fireAt.z]} intensity={2.2} distance={2.6} decay={1.6} color={C.ember} />
      <pointLight ref={frostLight} position={[frostAt.x, frostAt.y + 0.4, frostAt.z]} intensity={1.3} distance={2.4} decay={1.6} color={C.frost} />
    </group>
  );
}
