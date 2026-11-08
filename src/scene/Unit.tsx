import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, useTexture } from '@react-three/drei';
import { Color, DoubleSide, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial, type Texture } from 'three';
import type { Element, EnemyKind, Intent, Pos, RedactorMode, Statuses } from '../engine';
import { ELEMENT_COLOR, MAGE_POSES, PLACEHOLDER_COLORS, STATUS_ART, UNIT_SPRITE, type MagePose } from '../config/art';
import { BOARD_GEOMETRY } from '../config/camera';
import { TIMING } from '../config/timing';
import { IntentChips, describeIntents } from '../hud/intents';
import { ThoughtCloud } from '../hud/Thought';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { tileHandlers, type TilePointer } from './Board';
import { sceneLight } from './Lighting';

/** Everything the board needs to draw one unit (the player or an enemy). Built in GameScene.tsx. */
export interface UnitView {
  /** React key: stable for the unit's whole life in a room, so it glides between tiles instead of jumping. */
  key: string;
  isPlayer: boolean;
  kind?: EnemyKind;
  element?: Element;
  name: string;
  /** Short id for telling two of the same enemy apart ("a", "b"), or empty. */
  tag: string;
  pos: Pos;
  hp: number;
  maxHp: number;
  status: Statuses;
  /** The drawing (the mage: their idle pose). */
  art: string;
  /** The mage: a drawing per pose (config/art.ts MAGE_ART). */
  poses?: Record<MagePose, string>;
  /** How tall the figure stands, in tiles (config/art.ts UNIT_HEIGHT). */
  height: number;
  intents?: Intent[];
  /** Plain-language behaviour for the hover card. */
  behavior?: string;
  // Special badges
  marks?: number;
  maxMarks?: number;
  mode?: RedactorMode;
  guarded?: boolean;
  charge?: boolean;
  carried?: number;
  mana?: number;
  maxMana?: number;
}

/**
 * A unit flying onto its tile instead of walking (the opening cutscene): dropping in from `height` tiles above it
 * (`from` null), or thrown from the `from` tile along an arc `height`
 * tiles high. Plays once per `id`, over `ms`.
 */
export interface Flight {
  id: number;
  from: Pos | null;
  height: number;
  ms: number;
}

/** How dim a unit's picture gets in a pitch-dark room (1 = not at all). */
const DARK_SHADE = 0.42;

/** The part of a drawing the figure fills (texture coordinates, 0-1; v up), and the drawing's width / height. */
interface Trim {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  aspect: number;
}
const TRIMS = new Map<string, Trim>();

/**
 * Crop a unit drawing to its figure: the art comes on big transparent squares. Measured once per picture (on a small
 * copy), then the texture shows just that part.
 */
function trimTexture(t: Texture): Trim {
  const img = t.image as HTMLImageElement;
  const key = img.src ?? t.uuid;
  let trim = TRIMS.get(key);
  if (!trim) {
    const W = 256;
    const H = Math.max(1, Math.round((W * img.height) / img.width));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let [x0, y0, x1, y1] = [0, 0, W - 1, H - 1];
    if (ctx) {
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      [x0, y0, x1, y1] = [W, H, -1, -1];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (data[(y * W + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 < 0) [x0, y0, x1, y1] = [0, 0, W - 1, H - 1];
    }
    trim = { u0: x0 / W, u1: (x1 + 1) / W, v0: 1 - (y1 + 1) / H, v1: 1 - y0 / H, aspect: img.width / img.height };
    TRIMS.set(key, trim);
  }
  t.repeat.set(trim.u1 - trim.u0, trim.v1 - trim.v0);
  t.offset.set(trim.u0, trim.v0);
  return trim;
}

const FLOAT_ID = { n: 0 };
interface FloatNum {
  id: number;
  text: string;
  /** dmg/heal: HP changes. burn-tick: damage from Burn (shown with the Burn icon). ignite: the unit caught fire. */
  kind: 'dmg' | 'heal' | 'burn-tick' | 'ignite';
  /** Caused by a rune (purple). */
  rune?: boolean;
}

/**
 * One unit: a coloured base disc and a standee picture that always faces the camera, like the sprites in
 * Into the Breach. HTML plates float with it: HP and statuses under its feet, intents above its head.
 * The mage switches poses (config/art.ts MAGE_ART): running while moving, casting or meditating when the scene says
 * so, idle otherwise; and turns to face the way they walk or cast.
 */
export function Unit({ unit, room, pointer, hovered, showIntents, runeTint = false, thought = null, speech = null, hidden = false, bare = false, flight = null, pose = null, face = null }: {
  unit: UnitView;
  room: RoomSize;
  pointer: TilePointer;
  hovered: boolean;
  showIntents: boolean;
  /** HP changes now come from a rune: show them in purple. */
  runeTint?: boolean;
  /** The mage's thought, in a thought cloud over their head. */
  thought?: string | null;
  /** What the mage says out loud, in a speech bubble over their head. */
  speech?: string | null;
  /** Not seen: hiding in a dark room (fades back in when it turns false), or off stage in a cutscene. */
  hidden?: boolean;
  /** Cutscene: just the picture (no HP plate, hover card or intents). */
  bare?: boolean;
  flight?: Flight | null;
  /** The mage: a pose the scene asks for (casting, meditating); running and idle come from moving or not. */
  pose?: 'casting' | 'meditating' | null;
  /** The mage: face right (1) or left (-1) on screen, e.g. toward the spell being cast; null = the way they last walked. */
  face?: 1 | -1 | null;
}) {
  const group = useRef<Group>(null);
  const sprite = useRef<MeshBasicMaterial>(null);
  const picture = useRef<Mesh>(null);
  const urls = unit.poses ? MAGE_POSES.map((p) => unit.poses![p]) : [unit.art];
  const textures = useTexture(urls) as Texture[];
  const trims = useMemo(
    () =>
      textures.map((t) => {
        t.colorSpace = SRGBColorSpace;
        return trimTexture(t);
      }),
    [textures],
  );
  // Tiles per unit of texture height: the first picture (idle) is `unit.height` tall; the other poses keep its scale.
  const scale = unit.height / (trims[0].v1 - trims[0].v0);
  const shownPose = useRef(0);
  const facing = useRef<1 | -1>(1);

  const target = useMemo(() => new Vector3(...tileToWorld(unit.pos, room)), [unit.pos, room]);
  const firstFrame = useRef(true);
  const hitAt = useRef(-1);
  const [floats, setFloats] = useState<FloatNum[]>([]);

  // Floating numbers and a red flash when HP changes; a flame burst and "Burn 3" when the unit catches fire.
  const prevHp = useRef(unit.hp);
  const prevBurn = useRef(unit.status.burn);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const diff = unit.hp - prevHp.current;
    const burnDiff = unit.status.burn - prevBurn.current;
    prevHp.current = unit.hp;
    prevBurn.current = unit.status.burn;
    const add = (text: string, kind: FloatNum['kind'], ms: number) => {
      const f: FloatNum = { id: ++FLOAT_ID.n, text, kind, rune: runeTint };
      setFloats((fs) => [...fs, f]);
      timers.current.push(window.setTimeout(() => setFloats((fs) => fs.filter((x) => x.id !== f.id)), ms));
    };
    if (diff !== 0) {
      if (diff < 0) hitAt.current = performance.now();
      // A Burn tick: lost HP while the Burn counter went down by one.
      const tick = diff < 0 && burnDiff === -1;
      add(diff < 0 ? `${diff}` : `+${diff}`, tick ? 'burn-tick' : diff < 0 ? 'dmg' : 'heal', TIMING.damageNumber);
    }
    // Caught fire (or a burning unit's Burn was reset to full).
    if (burnDiff > 0) add(`Burn ${unit.status.burn}`, 'ignite', TIMING.burnPopup);
  }, [unit.hp, unit.status.burn]);
  const igniting = floats.some((f) => f.kind === 'ignite');

  const white = useMemo(() => new Color('#ffffff'), []);
  const red = useMemo(() => new Color('#ff5a4a'), []);
  const base = useRef<Group>(null);
  // How visible the unit is (eases to 0 while hidden), and the flight being played.
  const shown = useRef(hidden ? 0 : 1);
  const flying = useRef<{ id: number; start: number } | null>(null);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (firstFrame.current) {
      g.position.copy(target);
      firstFrame.current = false;
    }
    if (flight && flying.current?.id !== flight.id) flying.current = { id: flight.id, start: performance.now() };
    const u = flight && flying.current ? Math.min(1, (performance.now() - flying.current.start) / flight.ms) : 1;
    // Fades in when it comes out of the dark; a flying unit is just there.
    shown.current = flight && u < 1 ? 1 : shown.current + ((hidden ? 0 : 1) - shown.current) * Math.min(1, dt * (hidden ? 30 : 3));
    const vis = shown.current;
    g.visible = vis > 0.01;
    if (flight && u < 1) placePicture();
    if (base.current) base.current.visible = vis > 0.6;
    if (sprite.current) {
      sprite.current.opacity = vis;
      sprite.current.alphaTest = 0.4 * vis;
    }
    // Shade: units dim with the room's light (their pictures don't take light themselves).
    const shade = DARK_SHADE + (1 - DARK_SHADE) * sceneLight.level;
    if (flight && u < 1) {
      const from = flight.from ? tileToWorld(flight.from, room) : [target.x, 0, target.z];
      g.position.x = from[0] + (target.x - from[0]) * u;
      g.position.z = from[2] + (target.z - from[2]) * u;
      // Thrown: an arc. Dropped: falling faster and faster.
      g.position.y = flight.from ? 4 * flight.height * u * (1 - u) : flight.height * (1 - u * u);
      if (sprite.current) sprite.current.color.copy(white).multiplyScalar(shade);
      return;
    }
    // Glide toward the tile with a little hop in the middle of the move.
    const flat = new Vector3(g.position.x, 0, g.position.z);
    const dist = flat.distanceTo(new Vector3(target.x, 0, target.z));
    // The mage's pose and which way they face (screen right is world +x +z).
    const moving = dist > 0.04;
    if (moving) {
      const sx = target.x - g.position.x + (target.z - g.position.z);
      if (Math.abs(sx) > 0.02) facing.current = sx > 0 ? 1 : -1;
    }
    if (face) facing.current = face;
    if (unit.poses) {
      const want: MagePose = pose === 'casting' ? 'casting' : moving ? 'running' : pose === 'meditating' ? 'meditating' : 'idle';
      shownPose.current = MAGE_POSES.indexOf(want);
    }
    placePicture();
    const a = 1 - Math.exp(-dt * TIMING.unitMoveRate);
    g.position.x += (target.x - g.position.x) * a;
    g.position.z += (target.z - g.position.z) * a;
    g.position.y = dist > 0.01 ? 0.22 * Math.sin(Math.PI * Math.min(1, dist)) : 0;

    // Hit flash: tint the picture red for a moment.
    if (sprite.current) {
      const since = (performance.now() - hitAt.current) / 280;
      sprite.current.color.copy(white).lerp(red, since >= 0 && since < 1 ? 1 - since : 0).multiplyScalar(shade);
    }
  });

  /** Show the current pose's picture, sized from its trim, feet on the tile, facing the current way. */
  function placePicture() {
    const m = picture.current;
    if (!m) return;
    const i = shownPose.current;
    const t = trims[i];
    const h = (t.v1 - t.v0) * scale;
    const w = (t.u1 - t.u0) * t.aspect * scale;
    // Facing left mirrors the picture (the material is double-sided, so the mirrored plane still shows).
    m.scale.set(w * facing.current, h, 1);
    m.position.y = h / 2;
    if (sprite.current && sprite.current.map !== textures[i]) sprite.current.map = textures[i];
  }

  const baseColor = unit.isPlayer
    ? PLACEHOLDER_COLORS.unitBase.player
    : unit.element
      ? ELEMENT_COLOR[unit.element]
      : PLACEHOLDER_COLORS.unitBase.enemy;
  const S = UNIT_SPRITE;
  const headY = TILE_TOP + S.footY + unit.height + 0.1;
  const handlers = tileHandlers(unit.pos, pointer);

  return (
    <group ref={group}>
      {/* Base disc */}
      <group ref={base}>
        <mesh position={[0, TILE_TOP + 0.02, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.38, 0.4, 0.04, 32]} />
          <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={hovered ? 0.6 : 0.15} roughness={0.6} />
        </mesh>
      </group>

      {/* Standee picture: its feet on the tile (sized and posed in placePicture). */}
      <Billboard position={[0, TILE_TOP + S.footY, 0]}>
        <mesh ref={picture} position={[0, unit.height / 2, 0]} scale={[unit.height, unit.height, 1]} {...(bare || hidden ? {} : handlers)}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial ref={sprite} map={textures[0]} side={DoubleSide} transparent alphaTest={0.4} toneMapped={false} />
        </mesh>
      </Billboard>

      {/* A thought over the head (the mage waking in room 0). */}
      {thought && (
        <Html position={[0, headY + 0.15, 0]} center zIndexRange={[45, 35]} style={{ pointerEvents: 'none' }}>
          <div className="unit-thought">
            <ThoughtCloud tail>{thought}</ThoughtCloud>
          </div>
        </Html>
      )}

      {/* Something said out loud (the mage in the opening cutscene, or reacting to the lectern). */}
      {speech && !hidden && (
        <Html key={speech} position={[0, headY + 0.1, 0]} center zIndexRange={[46, 36]} style={{ pointerEvents: 'none' }}>
          <div className={`unit-speech ${/!!|[A-Z]{4,}/.test(speech) ? 'is-shout' : ''}`}>
            <div className="speech-body">{speech}</div>
          </div>
        </Html>
      )}

      {/* Intents above the head */}
      {showIntents && !unit.isPlayer && !bare && !hidden && (
        <Html position={[0, headY, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <IntentChips intents={unit.intents} />
        </Html>
      )}

      {/* HP plate under the feet */}
      {!bare && !hidden && (
        <Html position={[0, TILE_TOP, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <UnitPlate unit={unit} />
        </Html>
      )}

      {/* Damage numbers */}
      {floats.length > 0 && (
        <Html position={[0, TILE_TOP + S.footY + unit.height * 0.6, 0]} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
          <div className="float-stack">
            {igniting && <div className="ignite-burst" />}
            {floats.map((f) => (
              <span key={f.id} className={`float-num float-${f.kind} ${f.rune ? 'is-rune' : ''}`}>
                {(f.kind === 'burn-tick' || f.kind === 'ignite') && <img src={STATUS_ART.burn} alt="" />}
                {f.text}
              </span>
            ))}
          </div>
        </Html>
      )}

      {/* Hover card */}
      {hovered && !bare && !hidden && (
        <Html position={[0.5, TILE_TOP + BOARD_GEOMETRY.unitHeight * 0.7, 0]} zIndexRange={[60, 50]} style={{ pointerEvents: 'none' }}>
          <UnitCard unit={unit} />
        </Html>
      )}
    </group>
  );
}

function hpClass(hp: number, max: number) {
  const f = max > 0 ? hp / max : 0;
  return f > 0.6 ? 'hp-high' : f > 0.3 ? 'hp-mid' : 'hp-low';
}

function StatusBadges({ status }: { status: Statuses }) {
  return (
    <>
      {status.burn > 0 && (
        <span className="status-badge" title="Burn">
          <img src={STATUS_ART.burn} alt="Burn" />
          {status.burn}
        </span>
      )}
      {status.root > 0 && (
        <span className="status-badge" title="Root">
          <img src={STATUS_ART.root} alt="Root" />
        </span>
      )}
      {status.stun > 0 && (
        <span className="status-badge" title="Stun">
          <img src={STATUS_ART.stun} alt="Stun" />
        </span>
      )}
      {status.stuck > 0 && (
        <span className="status-badge stuck" title={`Stuck in quicksand: ${status.stuck} action${status.stuck === 1 ? '' : 's'} to climb out`}>
          ⏚{status.stuck}
        </span>
      )}
    </>
  );
}

/** HP bar + status badges + special badges, Slay the Spire style. */
function UnitPlate({ unit }: { unit: UnitView }) {
  const pct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
  return (
    <div className={`unit-plate ${unit.isPlayer ? 'is-player' : ''}`}>
      <div className="plate-row">
        {unit.guarded && <span className="special-badge guarded" title="Immune while a Page Ward stands">⛨</span>}
        {unit.mode === 'chaos' && <span className="special-badge chaos" title="Chaos mode">✸</span>}
        {unit.charge && <span className="special-badge charge" title="Holds a charge: can mark a line">⚡</span>}
        {!!unit.carried && <span className="special-badge carried" title="Fragments it stole">🂠{unit.carried}</span>}
        <div className={`hp-bar ${hpClass(unit.hp, unit.maxHp)}`}>
          <div className="hp-fill" style={{ width: `${pct}%` }} />
          <span className="hp-text">
            {unit.hp}/{unit.maxHp}
          </span>
        </div>
        <StatusBadges status={unit.status} />
      </div>
      {unit.maxMarks !== undefined && (
        <div className="mark-dots" title={`Marks: ${unit.marks ?? 0}/${unit.maxMarks}`}>
          {Array.from({ length: unit.maxMarks }, (_, i) => (
            <span key={i} className={i < (unit.marks ?? 0) ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Hover card: name, HP, what it does, and its plan for next turn in words. */
function UnitCard({ unit }: { unit: UnitView }) {
  const s = unit.status;
  const statuses = [s.burn > 0 && `Burn ${s.burn}`, s.root > 0 && 'Rooted', s.stun > 0 && 'Stunned', s.stuck > 0 && `Stuck (${s.stuck})`].filter(Boolean).join(' · ');
  return (
    <div className="unit-card">
      <div className="unit-card-title">
        {unit.name}
        {unit.tag && <span className="unit-tag">{unit.tag}</span>}
      </div>
      <div className="unit-card-stats">
        HP {unit.hp}/{unit.maxHp}
        {unit.isPlayer && unit.mana !== undefined && ` · Mana ${unit.mana}/${unit.maxMana}`}
        {statuses && ` · ${statuses}`}
      </div>
      {unit.behavior && <p className="unit-card-text">{unit.behavior}</p>}
      {!unit.isPlayer && (
        <p className="unit-card-plan">
          <b>Next turn:</b> {describeIntents(unit.intents)}
        </p>
      )}
    </div>
  );
}
