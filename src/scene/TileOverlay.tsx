import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import type { Pos } from '../engine';
import { TIMING } from '../config/timing';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';

/** Everything the board can highlight. Built in App.tsx from the game state and what the player is doing. */
export interface BoardOverlays {
  /** Tiles the player can step onto. */
  move: Pos[];
  /** The spell's hit area (valid spell on the crafting table, or the beam direction being aimed). */
  spell: Pos[];
  /** Beam directions not chosen yet, shown faintly. */
  spellFaint: Pos[];
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

export interface CastFlash {
  id: number;
  tiles: Pos[];
  color: string;
}

const SIZE = 0.92;

/** A flat coloured square lying on a tile. `layer` lifts it a hair so stacked highlights don't flicker. */
function TileQuad({ p, room, color, opacity, layer = 0, pulse = false }: { p: Pos; room: RoomSize; color: string; opacity: number; layer?: number; pulse?: boolean }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (pulse && mat.current) mat.current.opacity = opacity * (0.75 + 0.25 * Math.sin(clock.elapsedTime * 5));
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

/** A spell's area flashing once after the cast, then fading out. */
function Flash({ flash, room }: { flash: CastFlash; room: RoomSize }) {
  const refs = useRef<(Mesh | null)[]>([]);
  const start = useRef<number | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    start.current = null;
    setDone(false);
  }, [flash.id]);
  useFrame(({ clock }) => {
    if (done) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / (TIMING.castFlash / 1000);
    if (t >= 1) {
      setDone(true);
      return;
    }
    for (const m of refs.current) {
      if (!m) continue;
      (m.material as MeshBasicMaterial).opacity = 0.95 * (1 - t);
      m.position.y = TILE_TOP + 0.02 + t * 0.25;
    }
  });
  if (done) return null;
  return (
    <>
      {flash.tiles.map((p, i) => {
        const [x, , z] = tileToWorld(p, room);
        return (
          <mesh key={`${flash.id}-${i}`} ref={(m) => { refs.current[i] = m; }} position={[x, TILE_TOP + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[SIZE, SIZE]} />
            <meshBasicMaterial color={flash.color} transparent opacity={0.95} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

const k = (p: Pos) => `${p.x},${p.y}`;

export function TileOverlay({ room, overlays, flash }: { room: RoomSize; overlays: BoardOverlays; flash: CastFlash | null }) {
  const o = overlays;
  return (
    <group>
      {o.erasure.map((p) => <TileQuad key={`er-${k(p)}`} p={p} room={room} color="#050304" opacity={0.72} layer={0} />)}
      {o.marked.map((p) => <TileQuad key={`mk-${k(p)}`} p={p} room={room} color="#ff2a1f" opacity={0.75} layer={1} pulse />)}
      {o.move.map((p) => <TileQuad key={`mv-${k(p)}`} p={p} room={room} color="#8fd4ff" opacity={0.42} layer={2} />)}
      {o.spellFaint.map((p) => <TileQuad key={`sf-${k(p)}`} p={p} room={room} color={o.spellColor} opacity={0.38} layer={3} />)}
      {o.spell.map((p) => <TileQuad key={`sp-${k(p)}`} p={p} room={room} color={o.spellColor} opacity={0.78} layer={4} pulse />)}
      {o.focus.map((p) => <TileFrame key={`fc-${k(p)}`} p={p} room={room} color="#ffd36b" width={0.07} layer={6} />)}
      {o.hover && <TileFrame p={o.hover} room={room} color={o.hoverColor} />}
      {flash && <Flash key={flash.id} flash={flash} room={room} />}
    </group>
  );
}
