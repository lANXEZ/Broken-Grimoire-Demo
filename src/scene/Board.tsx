import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BOARD_GEOMETRY } from '../config/camera';
import { PLACEHOLDER_COLORS } from '../config/art';
import type { Pos, RoomRuntime } from '../engine';
import { TILE_TOP, tileToWorld } from './iso';

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
 * PLACEHOLDER board: a floating stone slab with a checkerboard of raised tiles, pillars as stone blocks and an
 * exit tile. When the artist's isometric room art arrives (config/art.ts `ROOM_ART`), this is the only scene
 * file that needs to change; tile positions, clicks and highlights stay the same.
 */
export function Board({ room, pointer }: { room: RoomRuntime; pointer: TilePointer }) {
  const G = BOARD_GEOMETRY;
  const tiles = useMemo(() => {
    const out: Pos[] = [];
    for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) out.push({ x, y });
    return out;
  }, [room.width, room.height]);

  const isPillar = (p: Pos) => room.pillars.some((q) => q.x === p.x && q.y === p.y);
  const exit = room.exit;
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

      {/* Floor tiles. */}
      {tiles.map((p) => {
        const isExit = !!exit && exit.pos.x === p.x && exit.pos.y === p.y;
        const color = isExit
          ? exit!.locked
            ? PLACEHOLDER_COLORS.exitLocked
            : PLACEHOLDER_COLORS.exitOpen
          : (p.x + p.y) % 2 === 0
            ? PLACEHOLDER_COLORS.tileA
            : PLACEHOLDER_COLORS.tileB;
        return (
          <mesh key={`${p.x},${p.y}`} position={tileToWorld(p, room, G.tileHeight / 2)} receiveShadow {...tileHandlers(p, pointer)}>
            <boxGeometry args={[tileSize, G.tileHeight, tileSize]} />
            <meshStandardMaterial
              color={color}
              roughness={0.9}
              emissive={isExit && !exit!.locked ? PLACEHOLDER_COLORS.exitOpen : '#000000'}
              emissiveIntensity={isExit && !exit!.locked ? 0.35 : 0}
            />
          </mesh>
        );
      })}

      {/* Pillars. */}
      {room.pillars.map((p) => (
        <group key={`pillar-${p.x},${p.y}`} position={tileToWorld(p, room, TILE_TOP)} {...tileHandlers(p, pointer)}>
          <mesh position={[0, G.pillarHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[G.pillarSize, G.pillarHeight, G.pillarSize]} />
            <meshStandardMaterial color={PLACEHOLDER_COLORS.pillar} roughness={0.85} />
          </mesh>
          <mesh position={[0, G.pillarHeight + 0.05, 0]} castShadow>
            <boxGeometry args={[G.pillarSize + 0.12, 0.1, G.pillarSize + 0.12]} />
            <meshStandardMaterial color={PLACEHOLDER_COLORS.pillarCap} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* A locked exit gets three bars across it. */}
      {exit && exit.locked && !isPillar(exit.pos) && (
        <group position={tileToWorld(exit.pos, room, TILE_TOP)} {...tileHandlers(exit.pos, pointer)}>
          {[-0.28, 0, 0.28].map((dx) => (
            <mesh key={dx} position={[dx, 0.35, 0]} castShadow>
              <boxGeometry args={[0.07, 0.7, 0.07]} />
              <meshStandardMaterial color="#3b2a24" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.68, 0]}>
            <boxGeometry args={[0.72, 0.06, 0.08]} />
            <meshStandardMaterial color="#3b2a24" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}
