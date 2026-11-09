import { cardsLabel, drawFragments, freshShuffle, grimoireBroken, newCardState, ownedCards, refillHand, takeFromHand, type DrawResult } from './cards';
import { CAMP_ROOM, ENDLESS, ENEMY_DEFS, LECTERN_ROOM, PROLOGUE_ROOM, ROOMS, RULES, RUN, coordLabel, parseCoord, type RoomDef } from './data';
import { generateRoom } from './generate';
import {
  RuleError,
  checkCleared,
  enemyName,
  checkGrimoire,
  cloneState,
  damagePlayer,
  enterTile,
  log,
  newRuneCard,
  noStatus,
  removeHazardAt,
} from './core';
import { random } from './rng';
import { randomRuneMap, runeName } from './runes';
import { DIR_VECTORS, addPos, exitOpen, hazardAt, isLockedExit, isWalkable, manhattan, samePos, walkPath } from './grid';
import type { Dir, Element, Enemy, EnemyKind, GameState, Pos, RuneEffect } from './types';

export interface NewGameOptions {
  /** The per-computer rune mapping (symbol → effect). A random one from the seed if absent. */
  runeMap?: RuneEffect[];
  /** Grimoire pages written in earlier runs. */
  grimoire?: string[];
  /** Card combinations already in the "Hmmm..." note (kept across runs). */
  combos?: string[];
  /** Start in room 0 (the prologue) instead of straight in the Cistern. The app always does; tests mostly don't. */
  prologue?: boolean;
}

export function createGame(seed: number = Date.now(), opts: NewGameOptions = {}): GameState {
  const state: GameState = {
    cards: newCardState(),
    stage: 0,
    roomIndex: 0,
    room: { id: '', name: '', blurb: '', width: 0, height: 0, pillars: [], holes: [], exit: null, exitAlwaysOpen: false, feature: null, seats: [], hazards: [], drops: [] },
    player: {
      pos: { x: 0, y: 0 },
      hp: RULES.playerMaxHp,
      maxHp: RULES.playerMaxHp,
      mana: RULES.roomStartMana,
      maxMana: RULES.playerMaxMana,
      status: noStatus(),
      unstableUsed: false,
    },
    enemies: [],
    turn: 1,
    phase: 'player',
    actionsLeft: RULES.actionsPerTurn,
    erasureZone: [],
    typeCounters: {},
    nextDeployId: 1,
    nextDropId: 1,
    rng: seed | 0,
    log: [],
    nextLogId: 1,
    runeMap: [],
    runesFound: [],
    grimoire: [...(opts.grimoire ?? [])],
    combos: [...(opts.combos ?? [])],
    event: null,
    lastDrops: [],
  };
  state.runeMap = opts.runeMap ? [...opts.runeMap] : randomRuneMap(() => random(state));
  log(state, 'system', `New run: your deck holds ${state.cards.deck.length} fragments.`);
  if (opts.prologue) loadPrologue(state);
  else loadRoom(state, 0);
  return state;
}

/** "You draw Fire and Beam." plus a note when the discard pile was reshuffled into the deck. */
export function logDraw(state: GameState, result: DrawResult, lead: string): void {
  if (result.reshuffled) log(state, 'system', 'Your deck ran out: the discard pile is shuffled into a new deck.');
  log(state, 'player', result.drawn.length ? `${lead} ${cardsLabel(result.drawn)}.` : `${lead} nothing: no cards left to draw.`);
}

/** Set up a combat room in place. HP carries over; mana resets; hand, deck and discard are shuffled together. */
export function loadRoom(state: GameState, index: number): void {
  const def = ROOMS[index];
  const stage = RUN.findIndex((st) => st.kind === 'room' && st.room === index);
  if (stage >= 0) state.stage = stage;
  state.roomIndex = index;
  setUpRoom(state, def);
  log(state, 'system', `Room ${index + 1}: ${def.name}. Mana resets to ${RULES.roomStartMana}.`);
  log(state, 'player', 'Your turn 1.');
  logDraw(state, freshShuffle(state), 'Hand, deck and discard pile are shuffled together. You draw');
}

/** Build a combat room from its definition (hand-made or generated) and deploy its enemies. */
function setUpRoom(state: GameState, def: RoomDef): void {
  state.room = {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    width: def.width,
    height: def.height,
    pillars: def.pillars.map((c) => ({ pos: parseCoord(c), hp: RULES.pillarHp })),
    holes: def.holes.map(parseCoord),
    exit: def.exit ? parseCoord(def.exit) : null,
    exitAlwaysOpen: !!def.exitAlwaysOpen,
    feature: null,
    seats: [],
    hazards: [],
    drops: [],
  };
  state.event = null;
  state.enemies = [];
  state.typeCounters = {};
  state.nextDeployId = 1;
  state.player.pos = parseCoord(def.start);
  state.player.mana = RULES.roomStartMana;
  state.player.status = noStatus();
  state.player.unstableUsed = false;
  state.turn = 1;
  state.phase = 'player';
  state.actionsLeft = RULES.actionsPerTurn;
  state.erasureZone = [];
  for (const spawn of def.enemies) spawnEnemy(state, spawn.kind, parseCoord(spawn.at), spawn.element);
}

// ---------------------------------------------------------------------------
// Endless mode: after the Redactor, generated rooms (engine/generate.ts), each a fight then a camp
// ---------------------------------------------------------------------------

/** Each endless room's seed, from the run's endless seed and how many rooms are behind. */
export function endlessRoomSeed(seed: number, cleared: number): number {
  return (seed ^ Math.imul(cleared + 1, 0x9e3779b1)) >>> 0;
}

/** A seed as shown on screen: 8 hex digits. */
export function seedLabel(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Endless rooms get room numbers after the hand-made ones (fight, then camp), so each has its own log. */
const endlessRoomIndex = (cleared: number, camp: boolean) => ROOMS.length + cleared * 2 + (camp ? 1 : 0);

/** Generate and set up the current endless fight room. */
function loadEndlessRoom(s: GameState): void {
  const e = s.endless!;
  const def = generateRoom(e.roomSeed, e.hardness, e.cleared + 1);
  s.roomIndex = endlessRoomIndex(e.cleared, false);
  setUpRoom(s, def);
  log(s, 'system', `${def.name}: hardness ${e.hardness}, seed ${seedLabel(e.roomSeed)}. Mana resets to ${RULES.roomStartMana}.`);
  log(s, 'player', 'Your turn 1.');
  logDraw(s, freshShuffle(s), 'Hand, deck and discard pile are shuffled together. You draw');
}

/**
 * The curse: start endless mode (after beating the Redactor; the dev toolbar can start it anywhere). HP is restored
 * to full; the deck, the Grimoire and everything else carry over.
 */
export function enterEndless(state: GameState): GameState {
  const s = cloneState(state);
  const seed = Math.floor(random(s) * 2 ** 32) >>> 0;
  s.endless = { seed, roomSeed: endlessRoomSeed(seed, 0), hardness: ENDLESS.startHardness, cleared: 0 };
  s.stage = RUN.length - 1;
  s.lostReason = undefined;
  s.player.hp = s.player.maxHp;
  log(s, 'system', 'The curse takes hold. Endless mode: kill every monster to go on. HP restored to full.');
  loadEndlessRoom(s);
  return s;
}

/** Endless mode's Continue: a cleared fight goes to the camp; the camp goes to the next, harder fight. */
function continueEndless(state: GameState): GameState {
  const e = state.endless!;
  if (state.phase === 'cleared') {
    const s = cloneState(state);
    log(s, 'player', `You leave ${s.room.name}.`);
    const left = s.room.drops.flatMap((d) => d.cards);
    if (left.length) log(s, 'system', `Left behind: ${cardsLabel(left)}.`);
    loadFeatureRoom(s, CAMP_ROOM, 'campfire', 'camp');
    s.roomIndex = endlessRoomIndex(e.cleared, true);
    return s;
  }
  if (state.phase === 'camp') {
    if (!state.event || state.event.step === 'approach') throw new RuleError('Walk up to the fire first.');
    const s = cloneState(state);
    log(s, 'player', 'You leave the camp.');
    const cleared = e.cleared + 1;
    s.endless = { ...e, cleared, hardness: e.hardness + ENDLESS.hardnessStep, roomSeed: endlessRoomSeed(e.seed, cleared) };
    loadEndlessRoom(s);
    return s;
  }
  throw new RuleError('Kill every monster first.');
}

/** Dev: a new endless room at the hardness plus `delta`, with a new seed if `reroll`. */
export function devEndlessRoom(s: GameState, delta: number, reroll: boolean): void {
  if (!s.endless) throw new RuleError('Not in endless mode.');
  s.endless = {
    ...s.endless,
    hardness: Math.max(1, s.endless.hardness + delta),
    roomSeed: reroll ? Math.floor(random(s) * 2 ** 32) >>> 0 : s.endless.roomSeed,
  };
  loadEndlessRoom(s);
}

export function spawnEnemy(state: GameState, kind: EnemyKind, pos: Pos, element?: Element): Enemy {
  const def = ENEMY_DEFS[kind];
  const n = state.typeCounters[def.typeNum] ?? 0;
  state.typeCounters[def.typeNum] = n + 1;
  const enemy: Enemy = {
    id: `${def.typeNum}${String.fromCharCode(97 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ''}`,
    kind,
    typeNum: def.typeNum,
    deployId: state.nextDeployId++,
    pos: { ...pos },
    hp: def.hp,
    maxHp: def.hp,
    status: noStatus(),
  };
  if (element) enemy.element = element;
  if (kind === 'warden') {
    enemy.turnCount = 0;
    enemy.charge = false;
    enemy.markedLine = null;
    enemy.markedPillar = null;
  }
  if (kind === 'redactor') {
    enemy.marks = 0;
    enemy.mode = 'guarded';
  }
  if (kind === 'scrap') enemy.carried = [];
  state.enemies.push(enemy);
  return enemy;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function assertPlayerAction(state: GameState): void {
  if (state.phase !== 'player') throw new RuleError('It is not your turn.');
  if (state.actionsLeft <= 0) throw new RuleError('No actions left this turn.');
}

/** Shared wrapper: the action resolves and uses 1 action; the turn ends when all 3 are spent. */
export function playerAction(state: GameState, body: (s: GameState) => void): GameState {
  assertPlayerAction(state);
  const s = cloneState(state);
  body(s);
  checkCleared(s);
  if (s.phase !== 'player') return s;
  // Room 0: actions and mana never run out, Unstable Fire comes back, and the hand refills after every action.
  if (isPrologue(s)) {
    s.actionsLeft = RULES.actionsPerTurn;
    s.player.mana = s.player.maxMana;
    s.player.unstableUsed = false;
    refillHand(s);
    return s;
  }
  s.actionsLeft -= 1;
  if (s.actionsLeft <= 0) endTurnInPlace(s);
  return s;
}

/** Where a move in this direction would land, or why it can't be made. */
export function moveError(state: GameState, dir: Dir): string | null {
  if (state.player.status.stuck > 0) return 'You’re stuck in the quicksand: climb out first.';
  if (state.player.status.root > 0) return 'You’re rooted and can’t move this turn.';
  const to = addPos(state.player.pos, DIR_VECTORS[dir]);
  if (isLockedExit(state, to)) return 'The door is locked until every enemy is down.';
  if (!isWalkable(state, to)) return 'That tile is blocked.';
  return null;
}

export function moveTarget(state: GameState, dir: Dir): Pos | null {
  return moveError(state, dir) ? null : addPos(state.player.pos, DIR_VECTORS[dir]);
}

export function playerMove(state: GameState, dir: Dir): GameState {
  assertPlayerAction(state);
  const err = moveError(state, dir);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const from = s.player.pos;
    s.player.pos = addPos(from, DIR_VECTORS[dir]);
    log(s, 'player', `Move ${coordLabel(from)} → ${coordLabel(s.player.pos)}.`);
    enterTile(s, 'player', 'player');
  });
}

/** Quicksand: spend 1 action climbing out (2 in all; progress carries over between turns). */
export function playerEscape(state: GameState): GameState {
  assertPlayerAction(state);
  if (state.player.status.stuck <= 0) throw new RuleError('You’re not stuck.');
  return playerAction(state, (s) => {
    s.player.status.stuck -= 1;
    if (s.player.status.stuck > 0) {
      log(s, 'player', `You struggle in the quicksand (${s.player.status.stuck} more action${s.player.status.stuck === 1 ? '' : 's'} to climb out).`);
    } else {
      removeHazardAt(s, s.player.pos);
      log(s, 'player', 'You climb out of the quicksand. The puddle is gone.');
    }
  });
}

export function playerMeditate(state: GameState): GameState {
  return playerAction(state, (s) => {
    const before = s.player.mana;
    s.player.mana = Math.min(s.player.maxMana, before + RULES.meditateMana);
    log(s, 'player', `Meditate: mana ${before} → ${s.player.mana}.`);
  });
}

export function rerollError(state: GameState, cardIds: number[] = []): string | null {
  if (cardIds.length === 0) return 'Pick the cards in your hand you want to swap.';
  if (!cardIds.every((id) => state.cards.hand.some((c) => c.id === id))) return 'Those fragments are not in your hand.';
  return null;
}

/** Reroll: discard the chosen cards from your hand, then draw that many non-rune fragments (runes drawn don't count). */
export function playerReroll(state: GameState, cardIds: number[] = []): GameState {
  assertPlayerAction(state);
  const err = rerollError(state, cardIds);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const swapped = takeFromHand(s.cards, cardIds);
    s.cards.discard.push(...swapped);
    log(s, 'player', `Reroll: discard ${cardsLabel(swapped)}.`);
    logDraw(s, drawFragments(s, swapped.length), 'You draw');
  });
}

export function endPlayerTurn(state: GameState): GameState {
  if (state.phase !== 'player') throw new RuleError('It is not your turn.');
  const s = cloneState(state);
  endTurnInPlace(s);
  return s;
}

function endTurnInPlace(s: GameState): void {
  if (s.actionsLeft > 0) log(s, 'player', `End turn (${s.actionsLeft} action${s.actionsLeft === 1 ? '' : 's'} unused).`);
  if (s.erasureZone.length > 0) {
    if (s.erasureZone.some((p) => samePos(p, s.player.pos))) eraseFragment(s);
    s.erasureZone = [];
    log(s, 'system', 'The Erasure Zone fades.');
    if (s.phase === 'lost') return;
  }
  // Hazards last until the end of the player turn written on them.
  const expired = s.room.hazards.filter((h) => h.until <= s.turn);
  for (const h of expired) removeHazardAt(s, h.pos);
  if (expired.length) log(s, 'system', `${expired.length} hazard tile${expired.length === 1 ? '' : 's'} fade${expired.length === 1 ? 's' : ''} away.`);
  const st = s.player.status;
  st.root = Math.max(0, st.root - 1);
  st.stun = Math.max(0, st.stun - 1);
  s.phase = 'enemy';
  log(s, 'enemy', `Enemy turn ${s.turn}.`);
}

/** Reads the phase afresh (TypeScript would otherwise keep a narrowed value across calls that change it). */
const lost = (s: GameState) => s.phase === 'lost';

/** After the enemy turn: the player's next turn starts. Burn ticks first, then the hand refills. */
export function startPlayerTurn(s: GameState): void {
  s.turn += 1;
  s.phase = 'player';
  s.actionsLeft = RULES.actionsPerTurn;
  if (s.player.status.burn > 0) {
    s.player.status.burn -= 1;
    damagePlayer(s, 1, 'Burn', 'player');
    if (lost(s)) return;
  }
  logDraw(s, refillHand(s), `Your turn ${s.turn}: you draw`);
}

/** The Erasure Zone takes a random hand card out of the game (the top of the deck if the hand is empty). */
function eraseFragment(s: GameState): void {
  const cards = s.cards;
  const fromHand = cards.hand.length > 0;
  const card = fromHand ? cards.hand.splice(Math.floor(random(s) * cards.hand.length), 1)[0] : cards.deck.pop();
  if (!card) {
    log(s, 'system', 'YOU ended your turn inside the Erasure Zone, but there was no fragment left to erase.');
    return;
  }
  cards.erased.push(card);
  log(s, 'system', `YOU ended your turn inside the Erasure Zone: your ${cardsLabel([card])} fragment is erased from ${fromHand ? 'your hand' : 'the top of your deck'} for good.`);
  checkGrimoire(s);
}

// ---------------------------------------------------------------------------
// After a room is cleared: free walking, then on through the run
// ---------------------------------------------------------------------------

/** The tiles the mage would walk through to reach `to` after the room is cleared (null if unreachable). */
/** Room 0, the prologue (before the run's first stop). */
export const isPrologue = (state: GameState) => state.room.id === PROLOGUE_ROOM.id;

/** After CLEARED!, in the lectern's and the camp's rooms (where the app does the walking), and in room 0. */
const walksFreely = (state: GameState) =>
  state.phase === 'cleared' || state.phase === 'event' || state.phase === 'camp' || (state.phase === 'player' && isPrologue(state));

export function freeWalkPath(state: GameState, to: Pos): Pos[] | null {
  if (!walksFreely(state)) return null;
  return walkPath(state, state.player.pos, to);
}

/**
 * One free step (no action, no turn) to an adjacent tile, picking up anything lying there. Works after CLEARED!
 * and in the lectern's and camp's rooms, where reaching the lectern / fire starts the choice (and opens the door).
 */
export function freeStep(state: GameState, to: Pos): GameState {
  if (!walksFreely(state)) throw new RuleError('You can only walk freely once the room is cleared.');
  if (manhattan(state.player.pos, to) !== 1 || !isWalkable(state, to)) throw new RuleError('That tile is blocked.');
  const s = cloneState(state);
  s.player.pos = { ...to };
  enterTile(s, 'player', 'player');
  const feature = s.room.feature;
  if (s.event?.step === 'approach' && feature && manhattan(s.player.pos, feature.pos) === 1) {
    s.event = { step: 'offer', said: null };
    log(s, 'system', feature.kind === 'lectern' ? 'The lectern whispers to you in a familiar voice, in a language you don’t understand.' : 'You sit down by the fire.');
  }
  return s;
}

/**
 * Continue: leave the room through its door (anything still on the floor is left behind) for the next stop on the
 * run. The mage must be standing on the door (the app walks them there first). Normally the room must be cleared;
 * through a door that's always open (the Cistern) you may also leave mid-fight, on your turn, and every enemy still
 * alive keeps what it would have dropped.
 */
export function continueRun(state: GameState): GameState {
  if (state.endless) return continueEndless(state);
  const early = state.phase === 'player' && state.room.exitAlwaysOpen;
  const between = (state.phase === 'event' || state.phase === 'camp') && exitOpen(state);
  if (state.phase !== 'cleared' && !early && !between) throw new RuleError('The room isn’t cleared yet.');
  if (state.room.exit && !samePos(state.player.pos, state.room.exit)) throw new RuleError('Walk to the door first.');
  const s = cloneState(state);
  log(s, 'player', `You leave ${s.room.name} through the door.`);
  const skipped = s.enemies.filter((e) => ENEMY_DEFS[e.kind].drop);
  if (early && skipped.length) log(s, 'system', `Left behind alive: ${skipped.map(enemyName).join(', ')}. Their drops are lost.`);
  const left = s.room.drops.flatMap((d) => d.cards);
  if (left.length) log(s, 'system', `Left behind: ${cardsLabel(left)}.`);
  const carried = s.enemies.flatMap((e) => e.carried ?? []);
  if (carried.length) log(s, 'system', `${cardsLabel(carried)} stay${carried.length === 1 ? 's' : ''} behind with the Page Scraps.`);
  enterStage(s, s.stage + 1);
  return s;
}

/**
 * Dev ("Next stop"): go on to the next stop on the run as if through the door, one stop at a time (so the run map
 * steps one layer too), without clearing the room or walking to the door. Past the last stop the run is won.
 */
export function enterNextStop(s: GameState): void {
  enterStage(s, s.stage + 1);
}

function enterStage(s: GameState, stage: number): void {
  const next = RUN[stage];
  if (!next) {
    s.phase = 'won';
    log(s, 'system', 'You reached the end of the run!');
    return;
  }
  s.stage = stage;
  if (next.kind === 'room') {
    loadRoom(s, next.room);
  } else if (next.kind === 'event') {
    loadFeatureRoom(s, LECTERN_ROOM, 'lectern', 'event');
  } else {
    loadFeatureRoom(s, CAMP_ROOM, 'campfire', 'camp');
  }
}

/** Room 0: where a new run wakes up (see PROLOGUE_ROOM). Before the first stop, so `stage` is -1. */
function loadPrologue(s: GameState): void {
  const R = PROLOGUE_ROOM;
  s.stage = -1;
  s.roomIndex = -1;
  s.room = {
    id: R.id,
    name: R.name,
    blurb: R.blurb,
    width: R.width,
    height: R.height,
    pillars: [],
    holes: [],
    exit: parseCoord(R.exit),
    exitAlwaysOpen: true,
    feature: { kind: 'campfire', pos: parseCoord(R.feature), read: parseCoord(R.read) },
    seats: R.seats.map(parseCoord),
    seatStyle: 'rock',
    sealedDoor: parseCoord(R.sealedDoor),
    spellTrail: R.spellTrail.map(parseCoord),
    mat: R.mat.map(parseCoord),
    bigDoor: true,
    hazards: [],
    drops: [],
  };
  s.event = null;
  s.enemies = [];
  s.erasureZone = [];
  s.player.pos = parseCoord(R.start);
  s.player.mana = s.player.maxMana;
  s.player.status = noStatus();
  s.player.unstableUsed = false;
  s.turn = 1;
  s.phase = 'player';
  s.actionsLeft = RULES.actionsPerTurn;
  log(s, 'system', `${R.name}: ${R.blurb}`);
  logDraw(s, freshShuffle(s), 'You draw');
}

/** Restart the stop the run is at (for saves made before a stop's rules changed). */
export function restartStage(state: GameState): GameState {
  const s = cloneState(state);
  if (s.endless) {
    loadEndlessRoom(s);
    return s;
  }
  if (s.stage < 0) {
    loadPrologue(s);
    return s;
  }
  enterStage(s, s.stage);
  return s;
}

/** A between-rooms room (the lectern's, the camp's): no enemies, a feature in the middle, the door locked until you reach it. */
function loadFeatureRoom(s: GameState, R: typeof LECTERN_ROOM | typeof CAMP_ROOM, kind: 'lectern' | 'campfire', phase: 'event' | 'camp'): void {
  s.room = {
    id: R.id,
    name: R.name,
    blurb: R.blurb,
    width: R.width,
    height: R.height,
    pillars: [],
    holes: [],
    exit: parseCoord(R.exit),
    exitAlwaysOpen: false,
    feature: { kind, pos: parseCoord(R.feature), read: parseCoord(R.read) },
    seats: R.seats.map(parseCoord),
    hazards: [],
    drops: [],
  };
  s.enemies = [];
  s.erasureZone = [];
  s.player.pos = parseCoord(R.start);
  s.player.status = noStatus();
  s.phase = phase;
  s.event = { step: 'approach', said: null };
  log(s, 'system', `${R.name}: ${R.blurb}`);
}

/**
 * The lectern's choices. offer: 'take' (a rune) or 'leave'. blood: 'blood' (another rune for HP, which can kill)
 * or 'walk' (away). Every path ends at 'done', with the door open.
 */
export type EventChoice = 'take' | 'leave' | 'blood' | 'walk';

/** Give the mage `n` runes (into the deck). */
function grantRunes(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    const card = newRuneCard(s);
    if (!card) break;
    s.cards.deck.push(card);
    log(s, 'system', `You take a rune: ${runeName(card.rune!)}.`);
  }
}

/** Why this choice can't be made now (null = it can). */
export function eventError(state: GameState, choice: EventChoice): string | null {
  if (state.phase !== 'event' || !state.event) return 'There is no event here.';
  const step = state.event.step;
  if (step === 'approach') return 'Walk up to the lectern first.';
  if ((choice === 'take' || choice === 'leave') && step !== 'offer') return 'That choice has passed.';
  if ((choice === 'blood' || choice === 'walk') && step !== 'blood') return 'That choice has passed.';
  return null;
}

/** The Whispering Lectern. The mage stays in the room afterwards; Continue (the door) moves on. */
export function eventChoice(state: GameState, choice: EventChoice): GameState {
  const err = eventError(state, choice);
  if (err) throw new RuleError(err);
  const s = cloneState(state);
  if (choice === 'take') {
    log(s, 'system', 'You take a rune fragment from the lectern.');
    grantRunes(s, 1);
    s.event = { step: 'blood', said: LECTERN_ROOM.lines.blood };
    log(s, 'system', `The lectern speaks: “${LECTERN_ROOM.lines.blood}”`);
  } else if (choice === 'blood') {
    log(s, 'system', 'You give the lectern some blood.');
    damagePlayer(s, RULES.eventBloodCost, 'The lectern', 'system');
    if (s.phase === 'lost') return s;
    grantRunes(s, 1);
    s.event = { step: 'done', said: LECTERN_ROOM.lines.fed };
    log(s, 'system', `The lectern: “${LECTERN_ROOM.lines.fed}”`);
  } else {
    log(s, 'system', choice === 'leave' ? 'You leave the lectern alone.' : 'You walk away from the lectern.');
    s.event = { step: 'done', said: null };
  }
  return s;
}

/** Rest, or tear out pages: one at a normal camp, up to ENDLESS.tearCount at an endless one. */
export type CampChoice = { kind: 'rest' } | { kind: 'tear'; cardIds: number[] };

/** How many pages a camp lets you tear out. */
export function campTearMax(state: GameState): number {
  return state.endless ? ENDLESS.tearCount : 1;
}

/** HP that resting gives back: all of it at a normal camp, ENDLESS.restShare of the missing HP (rounded up) in endless. */
export function campRestHeal(state: GameState): number {
  const missing = state.player.maxHp - state.player.hp;
  return state.endless ? Math.ceil(missing * ENDLESS.restShare) : missing;
}

export function campError(state: GameState, choice: CampChoice): string | null {
  if (state.phase !== 'camp' || !state.event) return 'There is no camp here.';
  if (state.event.step === 'approach') return 'Walk up to the fire first.';
  if (state.event.step !== 'offer') return 'You’ve already made your choice.';
  if (choice.kind === 'rest') return null;
  const ids = choice.cardIds;
  if (!ids.length) return 'Pick a page to tear out.';
  const max = campTearMax(state);
  if (ids.length > max) return max === 1 ? 'You can only tear out one page.' : `You can tear out at most ${max} pages.`;
  if (new Set(ids).size !== ids.length) return 'That page is already picked.';
  const all = ownedCards(state.cards);
  if (!ids.every((id) => all.some((c) => c.id === id))) return 'That fragment isn’t in your deck.';
  const keep = (c: { id: number }) => !ids.includes(c.id);
  const without = {
    ...state.cards,
    hand: state.cards.hand.filter(keep),
    deck: state.cards.deck.filter(keep),
    discard: state.cards.discard.filter(keep),
  };
  if (grimoireBroken(without)) return ids.length === 1 ? 'Tearing that page out would break your grimoire.' : 'Tearing those pages out would break your grimoire.';
  return null;
}

/**
 * The camp: rest (heal to full) or tear a page out (remove one fragment from your deck for good). The mage stays
 * in the room afterwards; the app walks them out through the door (Continue).
 */
export function campChoice(state: GameState, choice: CampChoice): GameState {
  const err = campError(state, choice);
  if (err) throw new RuleError(err);
  const s = cloneState(state);
  if (choice.kind === 'rest') {
    const before = s.player.hp;
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + campRestHeal(s));
    log(s, 'system', `You rest by the fire: HP ${before} → ${s.player.hp}.`);
    s.event = { step: 'done', said: before < s.player.hp ? `You rest by the fire: HP ${before} → ${s.player.hp}.` : 'You rest by the fire.' };
  } else {
    const cards = ownedCards(s.cards).filter((c) => choice.cardIds.includes(c.id));
    const keep = (c: { id: number }) => !choice.cardIds.includes(c.id);
    s.cards.hand = s.cards.hand.filter(keep);
    s.cards.deck = s.cards.deck.filter(keep);
    s.cards.discard = s.cards.discard.filter(keep);
    const what = cards.length === 1 ? 'a page' : `${cards.length} pages`;
    log(s, 'system', `You tear out ${what}: ${cardsLabel(cards)} ${cards.length === 1 ? 'leaves' : 'leave'} your deck for good.`);
    s.event = { step: 'done', said: `You tear out ${what}: ${cardsLabel(cards)} ${cards.length === 1 ? 'is' : 'are'} gone for good.` };
  }
  return s;
}

/** True if the mage stands on a tile with this hazard. */
export function playerInHazard(state: GameState): string | null {
  return hazardAt(state, state.player.pos)?.kind ?? null;
}
