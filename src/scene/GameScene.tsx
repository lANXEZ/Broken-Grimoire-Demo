import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Vector3 } from 'three';
import { ENEMY_DEFS, RULES, exitOpen, stageName, wardsStanding, type GameState, type Intent, type Pos } from '../engine';
import { PLAYER_ART, unitArt } from '../config/art';
import { Board, type TilePointer } from './Board';
import { CameraRig } from './CameraRig';
import { TileOverlay, type BoardOverlays } from './TileOverlay';
import { CameraShake, SpellFxLayer, type FxEvent } from './SpellFx';
import { Unit, type Flight, type UnitView } from './Unit';
import { SceneLights } from './Lighting';
import { Drops, Hazards } from './Hazards';
import { BIG_DOOR_SCALE, DOOR_TOP } from './Door';
import { Moonlight } from './Moonlight';
import { Mat } from './Mat';
import { Lectern } from './Lectern';
import { Campfire } from './Campfire';
import { TILE_TOP, tileToWorld } from './iso';

interface Props {
  /** The state to draw (during the enemy turn, the snapshot of the step being shown). */
  state: GameState;
  intents: Record<string, Intent[]>;
  overlays: BoardOverlays;
  /** Spell effects playing right now (scene/SpellFx.tsx). */
  fx: FxEvent[];
  /** A rune's part of a cast is showing: HP changes appear as purple numbers. */
  runeTint: boolean;
  /** What the wizard is thinking, shown in a thought cloud over their head (or null). */
  playerThought?: string | null;
  /** What the wizard says out loud, in a speech bubble (or null). */
  playerSpeech?: string | null;
  /** How dark the room is: 0 = normal, 1 = pitch dark (scene/Lighting.tsx). */
  dark?: number;
  /** The pillars' torches are burning. */
  torchesLit?: boolean;
  /** The monsters can't be seen yet (a dark room before the dungeon lights it). */
  enemiesHidden?: boolean;
  /** The opening cutscene: the wizard is off stage (still in the next room). */
  wizardHidden?: boolean;
  /** The opening cutscene: the wizard falls or is thrown onto their tile. */
  wizardFlight?: Flight | null;
  /** The opening cutscene: units are just pictures (no HP plates, hover cards or intents). */
  bare?: boolean;
  /** Room 0: the wizard is on the mat and can go back to the title ("Get some rest?"). */
  restPrompt?: boolean;
  onRest?: () => void;
  hover: Pos | null;
  pointer: TilePointer;
  onRightClick: () => void;
}

function unitViews(state: GameState, intents: Record<string, Intent[]>): UnitView[] {
  const p = state.player;
  const views: UnitView[] = [
    {
      key: 'player',
      isPlayer: true,
      name: 'The Wizard',
      tag: '',
      pos: p.pos,
      hp: p.hp,
      maxHp: p.maxHp,
      status: p.status,
      art: PLAYER_ART,
      mana: p.mana,
      maxMana: p.maxMana,
      behavior: 'You. Move, craft spells from your fragments, meditate for mana, reroll your hand. 3 actions per turn.',
    },
  ];
  const guarded = wardsStanding(state);
  for (const e of state.enemies) {
    const def = ENEMY_DEFS[e.kind];
    const sameKind = state.enemies.filter((x) => x.kind === e.kind).length;
    views.push({
      // Room index in the key: a "1a" in the next room is a different unit and must not glide over.
      key: `${state.roomIndex}-${e.id}`,
      isPlayer: false,
      kind: e.kind,
      element: e.element,
      name: e.element ? `${def.name} (${e.element})` : def.name,
      tag: sameKind > 1 ? e.id.replace(/^\d+/, '') : '',
      pos: e.pos,
      hp: e.hp,
      maxHp: e.maxHp,
      status: e.status,
      art: unitArt(e.kind, e.element),
      intents: intents[e.id],
      behavior: def.behavior,
      marks: e.kind === 'redactor' ? e.marks ?? 0 : undefined,
      maxMarks: e.kind === 'redactor' ? RULES.redactorMaxMarks : undefined,
      mode: e.mode,
      guarded: e.kind === 'redactor' && guarded,
      charge: e.kind === 'warden' ? !!e.charge : undefined,
      carried: e.kind === 'scrap' ? e.carried?.length ?? 0 : undefined,
    });
  }
  return views;
}

/** The 3D board: camera, lights, tiles, highlights and units. The HUD is drawn on top of it in HTML. */
export function GameScene({
  state,
  intents,
  overlays,
  fx,
  runeTint,
  playerThought = null,
  playerSpeech = null,
  dark = 0,
  torchesLit = true,
  enemiesHidden = false,
  wizardHidden = false,
  wizardFlight = null,
  bare = false,
  restPrompt = false,
  onRest = () => {},
  hover,
  pointer,
  onRightClick,
}: Props) {
  const room = state.room;
  const units = useMemo(() => unitViews(state, intents), [state, intents]);
  // For the obstacle fade (scene/Obstacle.tsx): where every unit stands, and whether the mouse is on the board.
  const unitFeet = useMemo(() => units.map((u) => new Vector3(...tileToWorld(u.pos, room, TILE_TOP))), [units, room]);
  const pointerOnBoard = useRef(false);
  const showIntents = state.phase === 'player' && !enemiesHidden;
  // (After CLEARED! there are no enemies left, so no intents either.)

  return (
    <div
      className="scene"
      onPointerEnter={() => (pointerOnBoard.current = true)}
      onPointerLeave={() => (pointerOnBoard.current = false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick();
      }}
    >
      <Canvas orthographic shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ zoom: 60, position: [-20, 20, 20], near: 0.1, far: 200 }}>
        <CameraRig room={room} extraPoints={room.exit ? [tileToWorld(room.exit, room, room.bigDoor ? DOOR_TOP * BIG_DOOR_SCALE : DOOR_TOP)] : []} />
        <CameraShake />
        <SceneLights dark={dark} />
        <Board room={room} exitOpen={exitOpen(state)} exitLabel={stageName(state.stage + 1)} pointer={pointer} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} torchesLit={torchesLit} doorSign={!bare} />
        <Hazards hazards={room.hazards} room={room} />
        {room.moonlight && room.moonlight.length > 0 && <Moonlight tiles={room.moonlight} room={room} />}
        {room.mat && room.mat.length > 0 && <Mat tiles={room.mat} room={room} prompt={restPrompt} onRest={onRest} />}
        {room.feature?.kind === 'lectern' && (
          <Lectern
            pos={room.feature.pos}
            room={room}
            step={state.event?.step ?? null}
            said={state.event?.said ?? null}
            pointer={pointer}
            unitFeet={unitFeet}
            pointerOnBoard={pointerOnBoard}
          />
        )}
        {room.feature?.kind === 'campfire' && (
          <Campfire
            pos={room.feature.pos}
            seats={room.seats ?? []}
            seatStyle={room.seatStyle}
            room={room}
            lit={state.event?.step !== 'done'}
            out={room.fireLit === false}
            pointer={pointer}
            unitFeet={unitFeet}
            pointerOnBoard={pointerOnBoard}
          />
        )}
        <TileOverlay room={room} overlays={overlays} />
        <Drops drops={room.drops} room={room} />
        <Suspense fallback={null}>
          {units.map((u) => (
            <Unit
              key={u.key}
              unit={u}
              room={room}
              pointer={pointer}
              hovered={!!hover && hover.x === u.pos.x && hover.y === u.pos.y}
              showIntents={showIntents}
              runeTint={runeTint}
              thought={u.isPlayer ? playerThought : null}
              speech={u.isPlayer ? playerSpeech : null}
              hidden={u.isPlayer ? wizardHidden : enemiesHidden}
              bare={bare}
              flight={u.isPlayer ? wizardFlight : null}
            />
          ))}
        </Suspense>
        <SpellFxLayer events={fx} room={room} />
      </Canvas>
    </div>
  );
}
