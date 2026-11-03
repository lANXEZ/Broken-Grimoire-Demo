import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ENEMY_DEFS, RULES, wardsStanding, type GameState, type Intent, type Pos } from '../engine';
import { PLAYER_ART, unitArt } from '../config/art';
import { Board, type TilePointer } from './Board';
import { CameraRig } from './CameraRig';
import { TileOverlay, type BoardOverlays, type CastFlash } from './TileOverlay';
import { Unit, type UnitView } from './Unit';

interface Props {
  /** The state to draw (during the enemy turn, the snapshot of the step being shown). */
  state: GameState;
  intents: Record<string, Intent[]>;
  overlays: BoardOverlays;
  flash: CastFlash | null;
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
      behavior: 'You. Move, craft spells from your fragments, meditate for mana. 3 actions per turn.',
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
      carried: e.kind === 'scrap' ? e.carried?.length ?? e.stolen ?? 0 : undefined,
    });
  }
  return views;
}

/** The 3D board: camera, lights, tiles, highlights and units. The HUD is drawn on top of it in HTML. */
export function GameScene({ state, intents, overlays, flash, hover, pointer, onRightClick }: Props) {
  const room = state.room;
  const units = useMemo(() => unitViews(state, intents), [state, intents]);
  const showIntents = state.phase === 'player';

  return (
    <div
      className="scene"
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick();
      }}
    >
      <Canvas orthographic shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ zoom: 60, position: [-20, 20, 20], near: 0.1, far: 200 }}>
        <CameraRig room={room} />
        <hemisphereLight args={['#fff1d6', '#2a1f18', 0.9]} />
        <directionalLight
          position={[-6, 12, 4]}
          intensity={1.6}
          color="#ffe6c4"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        <Board room={room} pointer={pointer} />
        <TileOverlay room={room} overlays={overlays} flash={flash} />
        <Suspense fallback={null}>
          {units.map((u) => (
            <Unit
              key={u.key}
              unit={u}
              room={room}
              pointer={pointer}
              hovered={!!hover && hover.x === u.pos.x && hover.y === u.pos.y}
              showIntents={showIntents}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
