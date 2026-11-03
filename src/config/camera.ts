/**
 * [CAMERA] The Into the Breach–style view of the board.
 *
 * The board is a real 3D slab seen through an orthographic camera (no perspective, so parallel lines stay
 * parallel like in hand-drawn isometric art). Two angles decide the look:
 *
 * - `azimuthDeg` turns the board. ±45° makes it a diamond. At -45° the camera looks from the a1 corner, so the
 *   start tile (a1) is the bottom corner of the diamond and the exit (f6) is the top corner.
 * - `elevationDeg` tilts the camera down. 30° makes a square tile exactly twice as wide as it is tall on screen
 *   (the classic 2:1 pixel-art isometric, as in Into the Breach). 35.26° is "true" isometric.
 *
 * IMPORTANT for the commissioned art: the artist is drawing at an isometric angle, so `elevationDeg` must match
 * the ratio of their tiles. Measure one drawn tile: elevation = asin(tileHeight / tileWidth).
 *   2:1 tiles → 30°   ·   1.73:1 → 35.26°   ·   1.5:1 → 41.8°
 */
export const CAMERA = {
  azimuthDeg: -45,
  elevationDeg: 30,
  /** Extra room around the board when it is fitted into the free screen area (1 = touching the edges). */
  fitPadding: 1.0,
} as const;

/** [CAMERA] Placeholder board geometry, in tile units (1 = one tile). */
export const BOARD_GEOMETRY = {
  /** Gap between neighbouring floor tiles. */
  tileGap: 0.05,
  /** Height of one floor tile block. */
  tileHeight: 0.14,
  /** Thickness of the slab under the tiles (the "floating chunk of land" look). */
  slabDepth: 0.5,
  /** How far the slab sticks out past the outer tiles. */
  slabMargin: 0.18,
  /** Pillar footprint and height. */
  pillarSize: 0.72,
  pillarHeight: 1.35,
  /** Height of a unit standee (its picture is this tall). */
  unitHeight: 1.05,
} as const;

/**
 * [CAMERA] Obstacles (pillars and any future wall/statue/crate, see scene/Obstacle.tsx) fade out when a unit
 * stands behind them or the mouse is near them, so nothing important hides behind scenery.
 */
export const OBSTACLE_FADE = {
  /** Opacity when faded (0 = invisible, 1 = solid). */
  opacity: 0.25,
  /** How fast it fades in and out (higher = snappier). */
  speed: 12,
  /** The mouse fades an obstacle when it's within this many screen pixels of it. */
  mouseRadiusPx: 40,
  /** A unit counts as "behind" once at least this much of its picture (0–1) is covered by the obstacle. */
  minCoveredFraction: 0.12,
} as const;
