import { BOARD_GEOMETRY } from '../config/camera';
import type { Pos } from '../engine';

/**
 * Board coordinates → 3D world coordinates.
 *
 * One tile = one world unit. The board is centred on the origin, lying on the XZ plane with Y up.
 * Board x (columns a, b, c...) runs along +X; board y (rows 1, 2, 3...) runs along -Z, so row 1 is nearest the
 * camera's side of the board (see config/camera.ts for how the camera looks at it).
 */
export interface RoomSize {
  width: number;
  height: number;
}

/** Height of the top surface of the floor tiles: units stand and highlights lie here. */
export const TILE_TOP = BOARD_GEOMETRY.tileHeight;

export function tileToWorld(p: Pos, room: RoomSize, y = 0): [number, number, number] {
  return [p.x - (room.width - 1) / 2, y, -(p.y - (room.height - 1) / 2)];
}

export const posKey = (p: Pos) => `${p.x},${p.y}`;
