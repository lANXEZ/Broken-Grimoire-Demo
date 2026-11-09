import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Vector3 } from 'three';
import { DIR_VECTORS, ENEMY_DEFS, RULES, exitOpen, samePos, stageName, wardsStanding, type GameState, type Intent, type Pos } from '../engine';
import { MAGE_ART, UNIT_HEIGHT, unitArt } from '../config/art';
import { Board, type TilePointer } from './Board';
import { CameraRig } from './CameraRig';
import { TileOverlay, type BoardOverlays } from './TileOverlay';
import { CameraShake, SpellFxLayer, type FxEvent } from './SpellFx';
import { Unit, type Flight, type UnitView } from './Unit';
import { SceneLights } from './Lighting';
import { Drops, Hazards } from './Hazards';
import { ARCH, BIG_DOOR_SCALE, DOOR_TOP } from './Door';
import { SealedDoor } from './SealedDoor';
import { Mat } from './Mat';
import { Lectern } from './Lectern';
import { Campfire } from './Campfire';
import { TILE_TOP, tileToWorld } from './iso';
import { CurseGlow } from './CurseGlow';

interface Props {
  /** The state to draw (during the enemy turn, the snapshot of the step being shown). */
  state: GameState;
  intents: Record<string, Intent[]>;
  overlays: BoardOverlays;
  /** Spell effects playing right now (scene/SpellFx.tsx). */
  fx: FxEvent[];
  /** A rune's part of a cast is showing: HP changes appear as purple numbers. */
  runeTint: boolean;
  /** What the mage is thinking, shown in a thought cloud over their head (or null). */
  playerThought?: string | null;
  /** What the mage says out loud, in a speech bubble (or null). */
  playerSpeech?: string | null;
  /** How dark the room is: 0 = normal, 1 = pitch dark (scene/Lighting.tsx). */
  dark?: number;
  /** The pillars' torches are burning. */
  torchesLit?: boolean;
  /** The monsters can't be seen yet (a dark room before the dungeon lights it). */
  enemiesHidden?: boolean;
  /** The opening cutscene: the mage is off stage (still in the next room). */
  mageHidden?: boolean;
  /** The opening cutscene: the mage falls or is thrown onto their tile. */
  mageFlight?: Flight | null;
  /** The opening cutscene: units are just pictures (no HP plates, hover cards or intents). */
  bare?: boolean;
  /** Room 0: the mage is on the mat and can go back to the title ("Get some rest?"). */
  restPrompt?: boolean;
  /** The mage just meditated: they show their meditating pose for a moment. */
  meditating?: boolean;
  /** Endless mode's curse is taking hold: the mage glows purple, arms raised (scene/CurseGlow.tsx). */
  cursed?: boolean;
  onRest?: () => void;
  hover: Pos | null;
  pointer: TilePointer;
  onRightClick: () => void;
}

/** Every unit on the board as drawn (and as its card describes it, hud/BoardInfo.tsx). */
export function unitViews(state: GameState, intents: Record<string, Intent[]>): UnitView[] {
  const p = state.player;
  const views: UnitView[] = [
    {
      key: 'player',
      isPlayer: true,
      name: 'The Mage',
      tag: '',
      pos: p.pos,
      hp: p.hp,
      maxHp: p.maxHp,
      status: p.status,
      art: MAGE_ART.idle,
      poses: MAGE_ART,
      height: UNIT_HEIGHT.mage,
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
      height: UNIT_HEIGHT[e.kind],
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
  mageHidden = false,
  mageFlight = null,
  bare = false,
  restPrompt = false,
  meditating = false,
  cursed = false,
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
  // The mage's pose: casting while one of their spells plays (facing its direction), meditating after Meditate or
  // while on the sleeping mat.
  const casting = fx.length > 0;
  const castDir = [...fx].reverse().flatMap((e) => ('fx' in e && e.fx.dir ? [e.fx.dir] : []))[0] ?? null;
  const castFace = castDir ? (DIR_VECTORS[castDir].x - DIR_VECTORS[castDir].y >= 0 ? 1 : -1) : null;
  const onMat = (room.mat ?? []).some((p) => samePos(p, state.player.pos));
  const magePose = casting || cursed ? 'casting' : meditating || onMat ? 'meditating' : null;
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
        <CameraRig
          room={room}
          extraPoints={[
            ...(room.exit ? [tileToWorld(room.exit, room, room.bigDoor ? DOOR_TOP * BIG_DOOR_SCALE : DOOR_TOP)] : []),
            ...(room.sealedDoor ? [tileToWorld(room.sealedDoor, room, TILE_TOP + (ARCH.height + 0.2) * BIG_DOOR_SCALE)] : []),
          ]}
        />
        <CameraShake />
        <SceneLights dark={dark} />
        <Board room={room} exitOpen={exitOpen(state)} exitLabel={stageName(state.stage + 1)} pointer={pointer} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} torchesLit={torchesLit} doorSign={!bare} />
        <Hazards hazards={room.hazards} room={room} />
        {room.sealedDoor && (
          <SealedDoor pos={room.sealedDoor} trail={room.spellTrail ?? []} room={room} pointer={pointer} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} />
        )}
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
              hovered={!!hover && hover.x === u.pos.x && hover.y === u.pos.y}
              showIntents={showIntents}
              runeTint={runeTint}
              thought={u.isPlayer ? playerThought : null}
              speech={u.isPlayer ? playerSpeech : null}
              hidden={u.isPlayer ? mageHidden : enemiesHidden}
              bare={bare}
              flight={u.isPlayer ? mageFlight : null}
              pose={u.isPlayer ? magePose : null}
              face={u.isPlayer && casting ? castFace : null}
            />
          ))}
        </Suspense>
        {cursed && <CurseGlow pos={state.player.pos} room={room} />}
        <SpellFxLayer events={fx} room={room} />
      </Canvas>
    </div>
  );
}
