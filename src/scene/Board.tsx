import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Vector3 } from 'three';
import { BOARD_GEOMETRY } from '../config/camera';
import { PLACEHOLDER_COLORS } from '../config/art';
import { RULES, type Pos, type RoomRuntime } from '../engine';
import { TILE_TOP, tileToWorld } from './iso';
import { Obstacle } from './Obstacle';
import { Door } from './Door';
import { Torch } from './Torch';

export interface TilePointer {
  onHover: (p: Pos | null, from?: Pos) => void;
  onClick: (p: Pos) => void;
}

/** Pointer handlers for anything that stands on a tile (floor, pillar, unit): they all act as that tile. */
export function tileHandlers(p: Pos, pointer: TilePointer) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointer.onHover(p);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointer.onHover(null, p);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.nativeEvent.button === 0) pointer.onClick(p);
    },
  };
}

/**
 * PLACEHOLDER board: a floating stone slab with a checkerboard of raised tiles, holes as dark pits, pillars as
 * stone blocks and the door (barred red while locked, glowing gold once the room is cleared). When the artist's isometric room art arrives (config/art.ts `ROOM_ART`), this is the only scene
 * file that needs to change; tile positions, clicks and highlights stay the same.
 *
 * Everything that stands up off the floor (pillars, and any future obstacle) is wrapped in <Obstacle>, which
 * fades it out when a unit is behind it or the mouse is near it. A pillar down to its last HP looks cracked.
 * Every pillar carries a torch (scene/Torch.tsx) on whichever of its two visible faces looks into the room.
 */
export function Board({ room, exitOpen, exitLabel, pointer, unitFeet, pointerOnBoard, torchesLit = true, doorSign = true }: {
  room: RoomRuntime;
  /** The pillars' torches are burning (they're out when the mage first walks into a dark room). */
  torchesLit?: boolean;
  /** The open door's EXIT sign shows (not in the opening cutscene). */
  doorSign?: boolean;
  /** Where the door leads, for its EXIT sign. */
  exitLabel: string;
  /** The door is open (gold): the room is cleared, or its door is always open. Otherwise it's locked (barred). */
  exitOpen: boolean;
  pointer: TilePointer;
  /** World positions of every unit's feet, for the obstacle fade. */
  unitFeet: Vector3[];
  /** Whether the mouse is over the board (not the HUD), for the obstacle fade. */
  pointerOnBoard: { current: boolean };
}) {
  const G = BOARD_GEOMETRY;
  const tiles = useMemo(() => {
    const out: Pos[] = [];
    for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) out.push({ x, y });
    return out;
  }, [room.width, room.height]);

  const isHole = (p: Pos) => room.holes.some((q) => q.x === p.x && q.y === p.y);
  const exit = room.exit;
  const isExit = (p: Pos) => !!exit && exit.x === p.x && exit.y === p.y;
  const tileSize = 1 - G.tileGap;

  return (
    <group>
      {/* The slab under the tiles. */}
      <mesh position={[0, -G.slabDepth / 2, 0]} receiveShadow>
        <boxGeometry args={[room.width + 2 * G.slabMargin, G.slabDepth, room.height + 2 * G.slabMargin]} />
        <meshStandardMaterial color={PLACEHOLDER_COLORS.slabSide} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width + 2 * G.slabMargin, room.height + 2 * G.slabMargin]} />
        <meshStandardMaterial color={PLACEHOLDER_COLORS.slabTop} roughness={0.95} />
      </mesh>

      {/* Floor tiles; a hole is a dark pit sunk into the slab. */}
      {tiles.map((p) =>
        isHole(p) ? (
          <group key={`${p.x},${p.y}`}>
            <mesh position={tileToWorld(p, room, 0.004)} rotation={[-Math.PI / 2, 0, 0]} {...tileHandlers(p, pointer)}>
              <planeGeometry args={[tileSize, tileSize]} />
              <meshBasicMaterial color={PLACEHOLDER_COLORS.hole} />
            </mesh>
            <mesh position={tileToWorld(p, room, 0.003)} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[tileSize + 0.08, tileSize + 0.08]} />
              <meshStandardMaterial color={PLACEHOLDER_COLORS.holeRim} roughness={1} />
            </mesh>
          </group>
        ) : (
          <mesh key={`${p.x},${p.y}`} position={tileToWorld(p, room, G.tileHeight / 2)} receiveShadow {...tileHandlers(p, pointer)}>
            <boxGeometry args={[tileSize, G.tileHeight, tileSize]} />
            <meshStandardMaterial
              color={isExit(p) ? (exitOpen ? PLACEHOLDER_COLORS.exitOpen : PLACEHOLDER_COLORS.exitLocked) : (p.x + p.y) % 2 === 0 ? PLACEHOLDER_COLORS.tileA : PLACEHOLDER_COLORS.tileB}
              emissive={isExit(p) && exitOpen ? PLACEHOLDER_COLORS.exitOpen : '#000000'}
              emissiveIntensity={isExit(p) && exitOpen ? 0.45 : 0}
              roughness={0.9}
            />
          </mesh>
        ),
      )}

      {/* The door: an archway, barred shut while locked, open with a portal, beam and EXIT sign once unlocked. */}
      {exit && <Door pos={exit} room={room} open={exitOpen} label={exitLabel} big={!!room.bigDoor} sign={doorSign} pointer={pointer} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} />}

      {/* Pillars (2 HP; obstacles: they fade when they hide a unit or the mouse is near). */}
      {room.pillars.map(({ pos: p, hp }, i) => {
        const cracked = hp < RULES.pillarHp;
        const height = cracked ? G.pillarHeight * 0.82 : G.pillarHeight;
        const at = tileToWorld(p, room, TILE_TOP);
        // The torch goes on the visible face (-x "left" or +z "front") that points more toward the middle.
        const side = at[0] > -at[2] ? 'left' : 'front';
        return (
          <Obstacle
            key={`pillar-${p.x},${p.y}`}
            position={at}
            size={{ width: G.pillarSize + 0.12, depth: G.pillarSize + 0.12, height: height + 0.1 }}
            unitFeet={unitFeet}
            pointerOnBoard={pointerOnBoard}
            handlers={tileHandlers(p, pointer)}
          >
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[G.pillarSize, height, G.pillarSize]} />
              <meshStandardMaterial color={cracked ? PLACEHOLDER_COLORS.pillarCracked : PLACEHOLDER_COLORS.pillar} roughness={0.85} />
            </mesh>
            {cracked ? (
              // A broken top and a dark crack down the front faces.
              <>
                <mesh position={[0.12, height + 0.04, -0.1]} rotation={[0.3, 0.4, 0.2]} castShadow>
                  <boxGeometry args={[0.34, 0.12, 0.3]} />
                  <meshStandardMaterial color={PLACEHOLDER_COLORS.pillarCap} roughness={0.8} />
                </mesh>
                {[-1, 1].map((side) => (
                  <mesh key={side} position={side < 0 ? [-G.pillarSize / 2 - 0.002, height * 0.55, 0.05] : [0.05, height * 0.55, G.pillarSize / 2 + 0.002]} rotation={[0, side < 0 ? -Math.PI / 2 : 0, 0.35]}>
                    <planeGeometry args={[0.05, height * 0.7]} />
                    <meshBasicMaterial color="#1c1612" />
                  </mesh>
                ))}
              </>
            ) : (
              <mesh position={[0, height + 0.05, 0]} castShadow>
                <boxGeometry args={[G.pillarSize + 0.12, 0.1, G.pillarSize + 0.12]} />
                <meshStandardMaterial color={PLACEHOLDER_COLORS.pillarCap} roughness={0.8} />
              </mesh>
            )}
            {/* Lit one after another when the dungeon lights the room. */}
            <Torch side={side} half={G.pillarSize / 2} y={G.pillarHeight * 0.5} lit={torchesLit} delay={0.12 + i * 0.22} seed={i * 1.7} />
          </Obstacle>
        );
      })}
    </group>
  );
}
