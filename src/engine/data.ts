import type { Element, EnemyKind, FragmentKind, Pos, UnitSize } from './types';

/**
 * Tunable numbers. Playtest balance changes should only need edits here. The rules they implement are in
 * GAME_RULES.md.
 */
export const RULES = {
  playerMaxHp: 20,
  playerMaxMana: 6,
  roomStartMana: 3,
  actionsPerTurn: 3,
  meditateMana: 3,
  handSize: 5,

  burnTicks: 3,
  rootTurns: 1,
  stunTurns: 1,
  /** Quicksand: actions it takes to climb out. Progress carries over between turns. */
  quicksandEscape: 2,

  elementDamage: { fire: 1, water: 2, earth: 2, wind: 0 } as Record<Element, number>,
  doubledElementDamage: { fire: 3, water: 4, earth: 4, wind: 0 } as Record<Element, number>,
  /** Wind pushes 2 tiles; doubled Wind pushes until the target hits something (team decision, Nov 4). */
  windPush: 2,
  doubledWindPush: Infinity,
  beamLength: 2,
  doubledBeamLength: 4,
  crossReach: 1,
  doubledCrossReach: 2,
  wallWidth: 3,

  /** Merges: two different elements + one shape. */
  mergeCost: 3,
  magmaDamage: 2,
  /** Hazards last this many player turns, the casting turn included. */
  hazardTurns: 3,

  unstableCost: 5,
  unstableBurn: 3,
  unstableDamage: 7,

  pillarHp: 2,
  collisionDamage: 1,

  runeCost: 1,
  runeAmplify: 2,
  runeVolatileSelfDamage: 2,
  runeFreeHpCost: 2,
  runeSiphonHeal: 1,

  archerBackoffSteps: 2,
  archerPush: 1,

  wardenShotDamage: 5,
  /** Warden gains a charge on its turns 2, 4, 6, ... */
  wardenChargeEvery: 2,
  /** Page Wards summon a Page Scrap on enemy turns 2, 4, 6, ... */
  wardSpawnEvery: 2,

  redactorExplodeDamage: 3,
  redactorActions: { guarded: 2, chaos: 4, spent: 3 },
  /** Explosions per turn, in every mode. */
  redactorMaxExplosions: 2,
  /** Marks the Redactor can hold. Page Scraps stop stealing once it's full. */
  redactorMaxMarks: 5,

  /** Random drops: weight = target share ÷ current share, clamped; ×theme bonus for the monster's theme card. */
  dropWeightMin: 0.5,
  dropWeightMax: 3,
  dropThemeBonus: 2,

  /** The Whispering Lectern: the HP its second rune costs (it can kill). */
  eventBloodCost: 2,
} as const;

/**
 * The Whispering Lectern's room (team decision, Nov 4): 5x5 and empty but for the lectern in the middle. The mage
 * comes in at `start`, walks up to `read` (in front of the lectern), and leaves by `exit`, which stays locked until
 * the mage has reached the lectern. `lines` is what it says in plain words.
 */
export const LECTERN_ROOM = {
  id: 'lectern',
  name: 'The Whispering Lectern',
  blurb: 'A lectern whispers in a familiar voice, in a language you don’t understand.',
  width: 5,
  height: 5,
  start: 'a1',
  feature: 'c3',
  read: 'c2',
  exit: 'e5',
  seats: [] as string[],
  lines: {
    blood: '…Still lost, would you? Though I am so thirsty… let me taste your blood.',
    fed: 'Hmm… my favorite.',
  },
} as const;

/**
 * Room 0, the prologue (team decision, Nov 5): where a new run wakes up. 3x4, a campfire with a rock to sit on, a
 * corner where the ceiling has collapsed (moonlight, dust and gravel come down: walkable), and the big dungeon door.
 * No enemies; actions and mana never run out and the hand refills after every cast, so it's the place to try spells.
 * Going through the door starts the run (the Cistern). It isn't one of the run's numbered stops.
 */
export const PROLOGUE_ROOM = {
  id: 'prologue',
  name: 'The Waking Room',
  blurb: 'Where you wake, again. A dying fire, a rock to sit on, and the moon through a hole in the ceiling.',
  width: 3,
  height: 4,
  start: 'a1',
  feature: 'b2',
  read: 'b1',
  seats: ['a2'],
  moonlight: ['a3', 'a4'],
  /**
   * The sleeping mat the mage wakes up on: two tiles, pillow end first (walkable). Standing on it offers
   * "Get some rest?" (back to the title).
   */
  mat: ['a1', 'b1'],
  exit: 'c4',
  /** What the mage thinks on waking (shown in a thought cloud). */
  wakeThought: 'Dream of outside again… How long have I been stuck here…',
} as const;

/**
 * The camp's room (team decision, Nov 4): like the lectern's, but built around a campfire with logs to sit on (the
 * logs block their tiles). The mage walks up to the fire, rests or tears out a page, and walks out.
 */
export const CAMP_ROOM = {
  id: 'camp',
  name: 'Camp',
  blurb: 'A campfire crackles between a few logs. Somewhere safe, for a moment.',
  width: 5,
  height: 5,
  start: 'a1',
  feature: 'c3',
  read: 'c2',
  exit: 'e5',
  seats: ['b3', 'd3', 'c4'],
} as const;

export type AttackKind = 'melee' | 'ranged' | 'drain' | 'telegraph' | 'none' | 'steal' | 'explode';

export interface EnemyDef {
  kind: EnemyKind;
  typeNum: number;
  name: string;
  hp: number;
  actions: number;
  attack: AttackKind;
  damage: number;
  size: UnitSize;
  /** The fragment it's twice as likely to drop (random drops only). */
  theme: FragmentKind | null;
  attackText: string;
  notes: string;
  /** What the enemy AI actually does on its turn, in plain words. */
  behavior: string;
  /** Short name shown on the board token. */
  shortName: string;
  /** What it leaves on the floor when it dies, in words. */
  drop: string | null;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  rat: {
    kind: 'rat',
    shortName: 'Rat',
    typeNum: 1,
    name: 'Rat',
    hp: 2,
    actions: 3,
    attack: 'melee',
    damage: 1,
    size: 'normal',
    theme: 'fire',
    attackText: '1 dmg to one adjacent tile.',
    notes: 'Moves in packs. Punishes single-target spells.',
    behavior: 'Takes the shortest path to you, then bites once when next to you. Stops for the turn after biting.',
    drop: 'A random fragment (Fire more likely)',
  },
  archer: {
    kind: 'archer',
    shortName: 'Archer',
    typeNum: 2,
    name: 'Archer',
    hp: 3,
    actions: 2,
    attack: 'ranged',
    damage: 2,
    size: 'normal',
    theme: 'beam',
    attackText: '2 dmg + push 1, any of the 8 directions, no range limit. Pillars and fog block it; the first unit in the way takes the arrow.',
    notes: 'If you are adjacent when its turn starts, it spends both actions backing off. Friendly fire: monsters in the line of fire take the arrow.',
    behavior:
      'Walks until it has a straight or diagonal line to you with no pillar or fog in between, then shoots once: 2 dmg and a push of 1 tile along the shot. A monster between it and you takes the arrow instead. If you start its turn next to it, it spends both actions backing away instead.',
    drop: 'A random fragment (Beam more likely)',
  },
  brute: {
    kind: 'brute',
    shortName: 'Brute',
    typeNum: 3,
    name: 'Brute',
    hp: 6,
    actions: 2,
    attack: 'melee',
    damage: 3,
    size: 'normal',
    theme: 'wall',
    attackText: '3 dmg to one adjacent tile.',
    notes: 'Slow but tough. A tempo check, not a puzzle.',
    behavior: 'Takes the shortest path to you, then hits once when next to you. Stops for the turn after hitting.',
    drop: 'A random fragment (Wall more likely)',
  },
  leech: {
    kind: 'leech',
    shortName: 'Leech',
    typeNum: 4,
    name: 'Leech',
    hp: 4,
    actions: 2,
    attack: 'drain',
    damage: 1,
    size: 'normal',
    theme: 'water',
    attackText: 'Drains 1 mana (not HP) from one adjacent tile.',
    notes: 'Pressures your meditation, not your HP.',
    behavior: 'Takes the shortest path to you, then drains 1 mana once when next to you. Never touches your HP.',
    drop: 'A random fragment (Water more likely)',
  },
  warden: {
    kind: 'warden',
    shortName: 'Warden',
    typeNum: 5,
    name: 'Warden',
    hp: 8,
    actions: 2,
    attack: 'telegraph',
    damage: RULES.wardenShotDamage,
    size: 'massive',
    theme: null,
    attackText: 'No normal attack. A marked 5 dmg line on charged turns that hits every unit on it.',
    notes: 'Massive: can’t be pushed. Hunts for a clear line to you.',
    behavior:
      'Walks the shortest path to a tile where it can see you (straight or diagonal; pillars and fog block), then holds still. On its 2nd, 4th, 6th… turn, once it sees you it marks a line through you to the wall or the first pillar, and its turn ends. The first action of its next turn fires 5 dmg at every unit on that line. Stun cancels the line. An unused charge is lost.',
    drop: '1 rune',
  },
  ward: {
    kind: 'ward',
    shortName: 'Ward',
    typeNum: 6,
    name: 'Page Ward',
    hp: 4,
    /** On summon turns only (2, 4, 6…); it rests with no action in between. */
    actions: 1,
    attack: 'none',
    damage: 0,
    size: 'float',
    theme: null,
    attackText: 'None. Does not attack.',
    notes: 'Floats: ignores holes, pushes and hazards. Only spells containing its element hurt it (never Magma).',
    behavior:
      'Never moves or attacks. On every other enemy turn (2nd, 4th, 6th…) it summons a Page Scrap on a free tile next to it. While any Ward stands, the Redactor is immune.',
    drop: null,
  },
  scrap: {
    kind: 'scrap',
    shortName: 'Scrap',
    typeNum: 7,
    name: 'Page Scrap',
    hp: 1,
    actions: 4,
    attack: 'steal',
    damage: 0,
    size: 'normal',
    theme: null,
    attackText: 'Touch (1 action): steals a fragment from your hand.',
    notes: 'Feeds the Redactor marks while the Wards stand. Blocks you once they fall.',
    behavior:
      'While Wards stand: runs to you and steals a fragment, carries it to the Redactor (any of the 8 tiles around it) to give it 1 mark, then keeps away from you for good. It stops stealing once the Redactor has 5 marks. After all Wards fall, every Scrap runs at you to block your path, without stealing.',
    drop: 'The fragments it stole (back to your hand)',
  },
  redactor: {
    kind: 'redactor',
    shortName: 'Redactor',
    typeNum: 8,
    name: 'The Redactor',
    hp: 18,
    actions: RULES.redactorActions.guarded,
    attack: 'explode',
    damage: RULES.redactorExplodeDamage,
    size: 'massive',
    theme: null,
    attackText: 'Explodes for 3 dmg on all 8 tiles around it (at most 2 explosions a turn).',
    notes:
      'Massive and tall: can’t be pushed, and its head stays above the fog. Immune while any Page Ward stands (2 actions). Gains marks (max 5) from Page Scraps that bring it a stolen fragment. After all Wards fall: spends 1 mark per turn for Chaos mode (4 actions, each explosion followed by a cooldown); when out of marks, 3 actions.',
    behavior:
      'Walks toward you and explodes whenever you are in the 8 tiles around it, at most twice a turn. In Chaos mode the action after an explosion is a cooldown, and each explosion leaves an Erasure Zone on the 9 tiles around it (its own tile included): end your next turn there and you lose a fragment for good.',
    drop: null,
  },
};

export interface RoomDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  pillars: string[];
  holes: string[];
  /** The door out (none in the boss room: killing the Redactor ends the demo). */
  exit: string | null;
  /** The door is open from the start (you may leave early) instead of locked until the room is cleared. */
  exitAlwaysOpen?: boolean;
  start: string;
  enemies: { kind: EnemyKind; at: string; element?: Element }[];
}

/** Room layouts (GAME_RULES.md, Rooms). Enemies are listed in deploy order. Hole positions are proposed. */
export const ROOMS: RoomDef[] = [
  {
    id: 'cistern',
    name: 'The Cistern',
    blurb: 'Teaching room. The door is open the whole time, but every enemy you skip is a fragment you don’t get.',
    width: 6,
    height: 6,
    pillars: ['d4', 'c3'],
    holes: ['b4', 'e5'],
    exit: 'f6',
    exitAlwaysOpen: true,
    start: 'a1',
    enemies: [
      { kind: 'rat', at: 'f4' },
      { kind: 'brute', at: 'c5' },
      { kind: 'brute', at: 'e2' },
    ],
  },
  {
    id: 'scriptorium',
    name: 'The Scriptorium',
    blurb: 'The Warden watches every line. Break its sight with pillars or fog.',
    width: 6,
    height: 6,
    pillars: ['b5', 'e5', 'b2', 'e2'],
    holes: ['c2', 'd5'],
    exit: 'f6',
    start: 'a1',
    enemies: [
      { kind: 'archer', at: 'a6' },
      { kind: 'archer', at: 'e6' },
      { kind: 'leech', at: 'd2' },
      { kind: 'warden', at: 'c4' },
    ],
  },
  {
    id: 'redactor',
    name: 'The Redactor',
    blurb: 'Defeat the boss to finish the demo. While any Page Ward stands the boss takes no damage, and each Ward only takes damage from spells containing its element.',
    width: 8,
    height: 8,
    pillars: ['b6', 'g6', 'b3', 'g3'],
    holes: ['a5', 'h4'],
    exit: null,
    start: 'd1',
    enemies: [
      { kind: 'ward', at: 'c7', element: 'fire' },
      { kind: 'ward', at: 'f7', element: 'water' },
      { kind: 'ward', at: 'd4', element: 'earth' },
      { kind: 'redactor', at: 'e5' },
    ],
  },
];

/** One stop on the run. The map screen (a teammate's work) will draw these as a branching graph. */
export type Stage = { kind: 'room'; room: number } | { kind: 'event' } | { kind: 'camp' };

/** The fixed run: Cistern → Whispering Lectern → Scriptorium → Camp → the Redactor. */
export const RUN: Stage[] = [
  { kind: 'room', room: 0 },
  { kind: 'event' },
  { kind: 'room', room: 1 },
  { kind: 'camp' },
  { kind: 'room', room: 2 },
];

/** What a stop on the run is called ("The Scriptorium", "The Whispering Lectern", "Camp"); "the end" past the last. */
export function stageName(stage: number): string {
  const st = RUN[stage];
  if (!st) return 'the end';
  if (st.kind === 'room') return ROOMS[st.room].name;
  return st.kind === 'event' ? 'The Whispering Lectern' : 'Camp';
}

/** "c5" -> {x: 2, y: 4} */
export function parseCoord(coord: string): Pos {
  const x = coord.charCodeAt(0) - 'a'.charCodeAt(0);
  const y = parseInt(coord.slice(1), 10) - 1;
  return { x, y };
}

/** {x: 2, y: 4} -> "c5" */
export function coordLabel(p: Pos): string {
  return `${String.fromCharCode('a'.charCodeAt(0) + p.x)}${p.y + 1}`;
}
