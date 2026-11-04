import { cardsLabel, drawCards, freshShuffle, grimoireBroken, newCardState, ownedCards, refillHand, takeFromHand, type DrawResult } from './cards';
import { ENEMY_DEFS, ROOMS, RULES, RUN, coordLabel, parseCoord } from './data';
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
import { DIR_VECTORS, addPos, hazardAt, isLockedExit, isWalkable, manhattan, samePos, walkPath } from './grid';
import type { Dir, Element, Enemy, EnemyKind, GameState, Pos, RuneEffect } from './types';

export interface NewGameOptions {
  /** The per-computer rune mapping (symbol → effect). A random one from the seed if absent. */
  runeMap?: RuneEffect[];
  /** Grimoire pages written in earlier runs. */
  grimoire?: string[];
}

export function createGame(seed: number = Date.now(), opts: NewGameOptions = {}): GameState {
  const state: GameState = {
    cards: newCardState(),
    stage: 0,
    roomIndex: 0,
    room: { id: '', name: '', blurb: '', width: 0, height: 0, pillars: [], holes: [], exit: null, exitAlwaysOpen: false, hazards: [], drops: [] },
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
    lastDrops: [],
  };
  state.runeMap = opts.runeMap ? [...opts.runeMap] : randomRuneMap(() => random(state));
  log(state, 'system', `New run: your deck holds ${state.cards.deck.length} fragments.`);
  loadRoom(state, 0);
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
    hazards: [],
    drops: [],
  };
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

  log(state, 'system', `Room ${index + 1}: ${def.name}. Mana resets to ${RULES.roomStartMana}.`);
  log(state, 'player', 'Your turn 1.');
  logDraw(state, freshShuffle(state), 'Hand, deck and discard pile are shuffled together. You draw');
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

/** Reroll: discard the chosen cards from your hand, then draw that many from the deck. */
export function playerReroll(state: GameState, cardIds: number[] = []): GameState {
  assertPlayerAction(state);
  const err = rerollError(state, cardIds);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const swapped = takeFromHand(s.cards, cardIds);
    s.cards.discard.push(...swapped);
    log(s, 'player', `Reroll: discard ${cardsLabel(swapped)}.`);
    logDraw(s, drawCards(s, swapped.length), 'You draw');
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

/** The tiles the wizard would walk through to reach `to` after the room is cleared (null if unreachable). */
export function freeWalkPath(state: GameState, to: Pos): Pos[] | null {
  if (state.phase !== 'cleared') return null;
  return walkPath(state, state.player.pos, to);
}

/** One free step (no action, no turn) to an adjacent tile, picking up anything lying there. */
export function freeStep(state: GameState, to: Pos): GameState {
  if (state.phase !== 'cleared') throw new RuleError('You can only walk freely once the room is cleared.');
  if (manhattan(state.player.pos, to) !== 1 || !isWalkable(state, to)) throw new RuleError('That tile is blocked.');
  const s = cloneState(state);
  s.player.pos = { ...to };
  enterTile(s, 'player', 'player');
  return s;
}

/**
 * Continue: leave the room through its door (anything still on the floor is left behind) for the next stop on the
 * run. The wizard must be standing on the door (the app walks them there first). Normally the room must be cleared;
 * through a door that's always open (the Cistern) you may also leave mid-fight, on your turn, and every enemy still
 * alive keeps what it would have dropped.
 */
export function continueRun(state: GameState): GameState {
  const early = state.phase === 'player' && state.room.exitAlwaysOpen;
  if (state.phase !== 'cleared' && !early) throw new RuleError('The room isn’t cleared yet.');
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
    s.phase = 'event';
    log(s, 'system', 'Event: The Whispering Lectern.');
  } else {
    s.phase = 'camp';
    log(s, 'system', 'You reach a camp.');
  }
}

export type EventChoice = 'read' | 'copy' | 'leave';

/** Give the wizard `n` runes (into the deck). */
function grantRunes(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    const card = newRuneCard(s);
    if (!card) break;
    s.cards.deck.push(card);
    log(s, 'system', `You take a rune: ${runeName(card.rune!)}.`);
  }
}

/** The Whispering Lectern: read aloud (2 runes, −3 HP, never below 1), copy one page (1 rune), or leave. */
export function eventChoice(state: GameState, choice: EventChoice): GameState {
  if (state.phase !== 'event') throw new RuleError('There is no event here.');
  const s = cloneState(state);
  if (choice === 'read') {
    const before = s.player.hp;
    s.player.hp = Math.max(1, before - RULES.eventReadHpCost);
    log(s, 'system', `You read the pages aloud. The words burn your throat: HP ${before} → ${s.player.hp}.`);
    grantRunes(s, RULES.eventReadRunes);
  } else if (choice === 'copy') {
    log(s, 'system', 'You copy one page carefully.');
    grantRunes(s, RULES.eventCopyRunes);
  } else {
    log(s, 'system', 'You leave the lectern alone.');
  }
  enterStage(s, s.stage + 1);
  return s;
}

export type CampChoice = { kind: 'rest' } | { kind: 'tear'; cardId: number };

export function campError(state: GameState, choice: CampChoice): string | null {
  if (state.phase !== 'camp') return 'There is no camp here.';
  if (choice.kind === 'rest') return null;
  const all = ownedCards(state.cards);
  if (!all.some((c) => c.id === choice.cardId)) return 'That fragment isn’t in your deck.';
  const without = {
    ...state.cards,
    hand: state.cards.hand.filter((c) => c.id !== choice.cardId),
    deck: state.cards.deck.filter((c) => c.id !== choice.cardId),
    discard: state.cards.discard.filter((c) => c.id !== choice.cardId),
  };
  if (grimoireBroken(without)) return 'Tearing that page out would break your grimoire.';
  return null;
}

/** The camp: rest (heal to full) or tear a page out (remove one fragment from your deck for good). */
export function campChoice(state: GameState, choice: CampChoice): GameState {
  const err = campError(state, choice);
  if (err) throw new RuleError(err);
  const s = cloneState(state);
  if (choice.kind === 'rest') {
    const before = s.player.hp;
    s.player.hp = s.player.maxHp;
    log(s, 'system', `You rest by the fire: HP ${before} → ${s.player.hp}.`);
  } else {
    const card = ownedCards(s.cards).find((c) => c.id === choice.cardId)!;
    s.cards.hand = s.cards.hand.filter((c) => c.id !== card.id);
    s.cards.deck = s.cards.deck.filter((c) => c.id !== card.id);
    s.cards.discard = s.cards.discard.filter((c) => c.id !== card.id);
    log(s, 'system', `You tear out a page: ${cardsLabel([card])} leaves your deck for good.`);
  }
  enterStage(s, s.stage + 1);
  return s;
}

/** True if the wizard stands on a tile with this hazard. */
export function playerInHazard(state: GameState): string | null {
  return hazardAt(state, state.player.pos)?.kind ?? null;
}
