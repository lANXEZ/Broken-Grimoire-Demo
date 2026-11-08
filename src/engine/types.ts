/** Board coordinate. x = column (0 = "a"), y = row (0 = row "1", the board's bottom row). */
export interface Pos {
  x: number;
  y: number;
}

export type Element = 'fire' | 'water' | 'earth' | 'wind';
export type Shape = 'beam' | 'cross' | 'wall';
export type Dir = 'up' | 'down' | 'left' | 'right';

export type EnemyKind = 'rat' | 'archer' | 'brute' | 'leech' | 'warden' | 'ward' | 'scrap' | 'redactor';

/** What a rune does. The player never sees these names: runes show only their gibberish symbol. */
export type RuneEffect = 'echo' | 'amplify' | 'widen' | 'siphon' | 'volatile' | 'free' | 'backfire' | 'fizzle';

/** What a fragment card is: an element, a shape or a rune. */
export type FragmentKind = Element | Shape | 'rune';

/** One fragment card. Cards of the same kind play the same; `loot` only changes the art. */
export interface Card {
  id: number;
  kind: FragmentKind;
  /** Runes only: which of the 8 symbols (0–7). What it does comes from `GameState.runeMap`. */
  rune?: number;
  /** The enemy this card dropped from, or absent for the starting deck. */
  loot?: EnemyKind;
}

/** The player's fragment cards. */
export interface CardState {
  /** Draw pile, top card last. */
  deck: Card[];
  hand: Card[];
  discard: Card[];
  /** Cards an Erasure Zone removed from the game. */
  erased: Card[];
  nextId: number;
}

export interface Statuses {
  /** Burn ticks left: 1 damage at the start of each of the unit's next turns. */
  burn: number;
  /** Turns of Root left (the unit can't move). */
  root: number;
  /** Turns of Stun left (the unit can't attack; the mage can't cast). */
  stun: number;
  /** Quicksand: actions the unit still has to spend to escape (0 = free). */
  stuck: number;
}

export type RedactorMode = 'guarded' | 'chaos' | 'spent';

/** How the board treats a unit: floating units ignore holes, pushes and hazards; massive ones can't be pushed. */
export type UnitSize = 'normal' | 'float' | 'massive';

export interface Enemy {
  /** Display id, e.g. "3a" = first Brute deployed in this room. */
  id: string;
  kind: EnemyKind;
  typeNum: number;
  /** Order the unit was deployed in the room. Breaks ties in turn order. */
  deployId: number;
  pos: Pos;
  hp: number;
  maxHp: number;
  status: Statuses;
  /** Page Ward attunement. */
  element?: Element;
  // Warden
  turnCount?: number;
  charge?: boolean;
  markedLine?: Pos[] | null;
  /** The pillar that ends the marked line (it takes 1 damage when the line fires), if any. */
  markedPillar?: Pos | null;
  // Redactor
  marks?: number;
  mode?: RedactorMode;
  /** Page Scrap: the cards it stole and carries. */
  carried?: Card[];
  /** Page Scrap: already brought its stolen fragment to the Redactor (it keeps away from then on). */
  delivered?: boolean;
}

export interface PlayerState {
  pos: Pos;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  status: Statuses;
  unstableUsed: boolean;
}

export interface Pillar {
  pos: Pos;
  hp: number;
}

export type HazardKind = 'fog' | 'magma' | 'quicksand';

/** A merge hazard on one tile. */
export interface Hazard {
  pos: Pos;
  kind: HazardKind;
  /** It vanishes at the end of this player turn. */
  until: number;
}

/** Loot lying on the floor until the mage walks onto it. */
export interface Drop {
  id: number;
  pos: Pos;
  cards: Card[];
  /** true = the cards go back to the hand (a Scrap's stolen cards); false = into the discard pile. */
  toHand: boolean;
  from: EnemyKind;
}

export interface RoomRuntime {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  pillars: Pillar[];
  holes: Pos[];
  /**
   * The door to the next stop (null in the boss room). Locked until the room is cleared: while locked the mage
   * can't step onto it (monsters can). Once open, Continue walks the mage there and on.
   */
  exit: Pos | null;
  /** The door is open from the start (the Cistern): the mage may leave early, losing what the survivors would drop. */
  exitAlwaysOpen: boolean;
  /**
   * The thing a between-rooms room is built around (the event's lectern, the camp's fire), or null. It blocks its
   * tile like a pillar but never breaks; `read` is where the mage stands to use it.
   */
  feature: RoomFeature | null;
  /** Decorations that block their tiles too (the logs around the campfire). */
  seats: Pos[];
  /** A campfire feature: false once a spell has put it out (Water or Earth); a Fire spell lights it again. */
  fireLit?: boolean;
  /** How the seats look (logs by default; room 0 has a rock). */
  seatStyle?: 'log' | 'rock';
  /** Room 0: tiles under the collapsed ceiling, where moonlight, dust and gravel come down (walkable). */
  moonlight?: Pos[];
  /** Room 0: the big dungeon door. */
  bigDoor?: boolean;
  /** Room 0: the sleeping mat's tiles, pillow end first (walkable); standing on it offers a way back to the title. */
  mat?: Pos[];
  hazards: Hazard[];
  drops: Drop[];
}

export interface RoomFeature {
  kind: 'lectern' | 'campfire';
  pos: Pos;
  read: Pos;
}

/**
 * player / enemy: combat turns. cleared: every enemy is dead, walk freely and Continue.
 * event / camp: the Whispering Lectern's room and the camp's room (see `EventState`): the mage walks up to the
 * feature, the player chooses, the mage walks out. won / lost: the run is over.
 */
export type Phase = 'player' | 'enemy' | 'cleared' | 'event' | 'camp' | 'won' | 'lost';

export type LostReason = 'hp' | 'grimoire' | 'hole';

/**
 * The lectern's room and the camp's room, step by step:
 * - approach: the mage is walking up to the lectern / fire (the door is locked);
 * - offer: the choice. Lectern: take a rune fragment, or leave it. Camp: rest, or tear out a page;
 * - blood (lectern only): you took one, and it speaks: give it some blood (another rune, for HP), or walk away;
 * - done: it's over; the door is open and the mage walks out.
 */
export type EventStep = 'approach' | 'offer' | 'blood' | 'done';

export interface EventState {
  step: EventStep;
  /** What the lectern last said in plain words (shown over it); at the camp, what you did. Null otherwise. */
  said: string | null;
}

/** 'dev' = edits made with the dev-mode tools (see devtools.ts). */
export type LogSide = 'player' | 'enemy' | 'system' | 'dev';

export interface LogEntry {
  id: number;
  roomIndex: number;
  turn: number;
  side: LogSide;
  text: string;
}

export interface GameState {
  /** Deck, hand and discard pile. */
  cards: CardState;
  /** Position in the run (`RUN` in data.ts): room, event, room, camp, boss. */
  stage: number;
  roomIndex: number;
  room: RoomRuntime;
  player: PlayerState;
  enemies: Enemy[];
  /** Turn counter within the room. Player turn N is followed by enemy turn N. */
  turn: number;
  phase: Phase;
  actionsLeft: number;
  /** Tiles turned into Erasure Zone by the Redactor's explosions. Cleared when the player's next turn ends. */
  erasureZone: Pos[];
  /** Per-type deploy counters used to label spawned units (e.g. next Page Scrap = "7c"). */
  typeCounters: Record<number, number>;
  nextDeployId: number;
  nextDropId: number;
  /** Seeded RNG state, so undo/redo and the intent preview replay the exact same decisions. */
  rng: number;
  log: LogEntry[];
  nextLogId: number;
  /** Why the game was lost, once phase is 'lost'. */
  lostReason?: LostReason;
  /** What each rune symbol does (index = symbol). Fixed per computer; the app passes it in. */
  runeMap: RuneEffect[];
  /** Rune symbols the mage has been given this run (no repeats). */
  runesFound: number[];
  /** Grimoire pages written so far (see `pageId`). Kept across runs; the app passes it in. */
  grimoire: string[];
  /**
   * The "Hmmm..." note: every exact card combination ever cast successfully (see `comboKey`), runes included.
   * Kept across runs; the app passes it in.
   */
  combos: string[];
  /** The event in progress (phase 'event'), else null. */
  event: EventState | null;
  /** The last two random fragment drops (no card drops three times in a row). */
  lastDrops: FragmentKind[];
}

/**
 * One thing an enemy will do on its turn, shown above its token like Slay the Spire intents.
 * `value` is the damage / amount where that matters.
 */
export type IntentKind =
  | 'move'
  | 'retreat'
  | 'attack'
  | 'shoot'
  | 'drain'
  | 'mark'
  | 'fire'
  | 'watch'
  | 'steal'
  | 'deliver'
  | 'block'
  | 'explode'
  | 'cooldown'
  | 'spawn'
  | 'escape'
  | 'wander'
  | 'wait';

export interface Intent {
  kind: IntentKind;
  value?: number;
  /** Plain-language note for the hover card, e.g. why it waits. */
  note?: string;
}

/** A spell the fragments make. Runes ride on top (see cast.ts). */
export type Spell =
  | { kind: 'basic'; element: Element; elementCount: 1 | 2; shape: Shape; shapeCount: 1 | 2 }
  | { kind: 'merge'; elements: [Element, Element]; shape: Shape }
  | { kind: 'unstable' };
