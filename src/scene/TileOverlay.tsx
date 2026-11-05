import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshBasicMaterial } from 'three';
import type { Pos } from '../engine';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/** Everything the board can highlight. Built in App.tsx from the game state and what the player is doing. */
export interface BoardOverlays {
  /** Tiles the player can step onto. */
  move: Pos[];
  /** The spell's hit area (valid spell on the crafting table, or the beam direction being aimed). */
  spell: Pos[];
  /** Beam/Wall directions not chosen yet (or a spell you can't afford yet), shown faintly. */
  spellFaint: Pos[];
  /** Beam/Wall: the direction the mouse is aiming at right now. Glows brightest, with an outline on each tile. */
  aim: Pos[];
  spellColor: string;
  /** Tiles involved in the enemy action being shown. */
  focus: Pos[];
  /** Warden's marked line (fires next enemy turn). */
  marked: Pos[];
  /** Redactor's Erasure zone. */
  erasure: Pos[];
  hover: Pos | null;
  /** Hover frame colour: e.g. gold when the click would do something. */
  hoverColor: string;
}

const SIZE = 0.92;
/** Outline drawn around each tile of the direction being aimed. */
const AIM_FRAME = '#fff4d6';

/** A flat coloured square lying on a tile. `layer` lifts it a hair so stacked highlights don't flicker. */
function TileQuad({ p, room, color, opacity, layer = 0, pulse = false, pulseDepth = 0.25 }: {
  p: Pos;
  room: RoomSize;
  color: string;
  opacity: number;
  layer?: number;
  pulse?: boolean;
  /** How far the pulse dips (0 = steady, 0.25 = between 50% and 100% of `opacity`). */
  pulseDepth?: number;
}) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (pulse && mat.current) mat.current.opacity = opacity * (1 - pulseDepth + pulseDepth * Math.sin(clock.elapsedTime * 5));
  });
  return (
    <mesh position={tileToWorld(p, room, TILE_TOP + 0.004 + layer * 0.002)} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** A square outline on a tile (hover cursor, enemy focus). */
function TileFrame({ p, room, color, width = 0.06, layer = 5 }: { p: Pos; room: RoomSize; color: string; width?: number; layer?: number }) {
  const h = SIZE / 2 - width / 2;
  const strips: [number, number, number, number][] = [
    [0, h, SIZE, width],
    [0, -h, SIZE, width],
    [h, 0, width, SIZE],
    [-h, 0, width, SIZE],
  ];
  return (
    <group position={tileToWorld(p, room, TILE_TOP + 0.004 + layer * 0.002)} rotation={[-Math.PI / 2, 0, 0]}>
      {strips.map(([x, y, w, hh], i) => (
        <mesh key={i} position={[x, y, 0]} raycast={() => null}>
          <planeGeometry args={[w, hh]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const k = (p: Pos) => `${p.x},${p.y}`;

/**
 * Each tile once. The lists can repeat a tile (Wall's four aim directions overlap at the corners), and two meshes
 * with the same React key break the scene: one of them never gets removed and stays on the floor for good, even
 * after the room changes.
 */
function once(ps: Pos[]): Pos[] {
  const seen = new Set<string>();
  return ps.filter((p) => !seen.has(k(p)) && !!seen.add(k(p)));
}

export function TileOverlay({ room, overlays }: { room: RoomSize; overlays: BoardOverlays }) {
  const o: BoardOverlays = {
    ...overlays,
    move: once(overlays.move),
    spell: once(overlays.spell),
    spellFaint: once(overlays.spellFaint),
    aim: once(overlays.aim),
    focus: once(overlays.focus),
    marked: once(overlays.marked),
    erasure: once(overlays.erasure),
  };
  return (
    <group>
      {o.erasure.map((p) => <TileQuad key={`er-${k(p)}`} p={p} room={room} color="#050304" opacity={0.72} layer={0} />)}
      {o.marked.map((p) => <TileQuad key={`mk-${k(p)}`} p={p} room={room} color="#ff2a1f" opacity={0.75} layer={1} pulse />)}
      {o.move.map((p) => <TileQuad key={`mv-${k(p)}`} p={p} room={room} color="#8fd4ff" opacity={0.42} layer={2} />)}
      {/* While aiming, the other directions dim right down so the aimed one stands out. */}
      {o.spellFaint.map((p) => <TileQuad key={`sf-${k(p)}`} p={p} room={room} color={o.spellColor} opacity={o.aim.length ? 0.2 : 0.38} layer={3} />)}
      {o.spell.map((p) => <TileQuad key={`sp-${k(p)}`} p={p} room={room} color={o.spellColor} opacity={0.78} layer={4} pulse />)}
      {o.aim.map((p) => <TileQuad key={`am-${k(p)}`} p={p} room={room} color={o.spellColor} opacity={1} layer={4} pulse pulseDepth={0.1} />)}
      {o.aim.map((p) => <TileFrame key={`af-${k(p)}`} p={p} room={room} color={AIM_FRAME} width={0.05} layer={5} />)}
      {o.focus.map((p) => <TileFrame key={`fc-${k(p)}`} p={p} room={room} color="#ffd36b" width={0.07} layer={6} />)}
      {o.hover && <TileFrame p={o.hover} room={room} color={o.hoverColor} />}
    </group>
  );
}
