/**
 * Helpers for the engine tests (not used by the game). Builds custom boards and casts by card kind.
 */
import { castError, playerCast } from './cast';
import { coordLabel, parseCoord } from './data';
import { createGame, endPlayerTurn, spawnEnemy } from './game';
import { planEnemyTurn } from './enemies';
import { RULES } from './data';
import type { Card, Dir, Element, EnemyKind, FragmentKind, GameState, HazardKind, RuneEffect } from './types';

export interface Setup {
  size?: number;
  pillars?: string[];
  holes?: string[];
  /** The room's door (none by default). */
  exit?: string;
  /** The door is open from the start, like the Cistern's. */
  exitAlwaysOpen?: boolean;
  player: string;
  enemies?: { kind: EnemyKind; at: string; element?: Element }[];
  /** Cards in hand, in order (taken from the starting deck when possible). Default: the whole starting deck. */
  hand?: FragmentKind[];
  mana?: number;
  seed?: number;
}

/** A game on a custom board. Mana defaults to 6 so any spell can be paid for. */
export function board(setup: Setup): GameState {
  const s = createGame(setup.seed ?? 42);
  const size = setup.size ?? 6;
  s.room = {
    id: 'test',
    name: 'Test',
    blurb: '',
    width: size,
    height: size,
    pillars: (setup.pillars ?? []).map((c) => ({ pos: parseCoord(c), hp: RULES.pillarHp })),
    holes: (setup.holes ?? []).map(parseCoord),
    exit: setup.exit ? parseCoord(setup.exit) : null,
    exitAlwaysOpen: !!setup.exitAlwaysOpen,
    hazards: [],
    drops: [],
  };
  s.enemies = [];
  s.typeCounters = {};
  s.nextDeployId = 1;
  s.player.pos = parseCoord(setup.player);
  s.player.mana = setup.mana ?? 6;
  for (const e of setup.enemies ?? []) spawnEnemy(s, e.kind, parseCoord(e.at), e.element);
  const cards = s.cards;
  const all = [...cards.hand, ...cards.deck];
  if (setup.hand) {
    cards.hand = [];
    for (const kind of setup.hand) {
      const i = all.findIndex((c) => c.kind === kind);
      cards.hand.push(i >= 0 ? all.splice(i, 1)[0] : { id: cards.nextId++, kind });
    }
    cards.deck = all;
  } else {
    cards.hand = all;
    cards.deck = [];
  }
  return s;
}

/** Add cards of these kinds to the hand. */
export function give(s: GameState, ...kinds: FragmentKind[]): void {
  for (const kind of kinds) s.cards.hand.push({ id: s.cards.nextId++, kind });
}

/** Add the rune that has this effect (on this game's mapping) to the hand. */
export function giveRune(s: GameState, effect: RuneEffect): Card {
  const card: Card = { id: s.cards.nextId++, kind: 'rune', rune: s.runeMap.indexOf(effect) };
  s.cards.hand.push(card);
  return card;
}

/** Hand card ids for these kinds (each card used once). */
export function idsFor(s: GameState, kinds: FragmentKind[]): number[] {
  const ids: number[] = [];
  for (const k of kinds) {
    const c = s.cards.hand.find((x) => x.kind === k && !ids.includes(x.id));
    if (!c) throw new Error(`No ${k} card in hand`);
    ids.push(c.id);
  }
  return ids;
}

export function cast(s: GameState, kinds: FragmentKind[], dir: Dir | null = null): GameState {
  return playerCast(s, idsFor(s, kinds), dir);
}

export function castErr(s: GameState, kinds: FragmentKind[], dir: Dir | null = null): string | null {
  return castError(s, idsFor(s, kinds), dir);
}

export function hazard(s: GameState, at: string, kind: HazardKind, until = 99): void {
  s.room.hazards.push({ pos: parseCoord(at), kind, until });
}

export const at = (s: GameState, id: string) => coordLabel(s.enemies.find((e) => e.id === id)!.pos);
export const hp = (s: GameState, id: string) => s.enemies.find((e) => e.id === id)?.hp;
export const enemy = (s: GameState, id: string) => s.enemies.find((e) => e.id === id)!;
export const toEnemyTurn = (s: GameState) => endPlayerTurn(s);
export const runEnemyTurn = (s: GameState) => planEnemyTurn(toEnemyTurn(s)).final;
export const kinds = (cards: Card[]) => cards.map((c) => c.kind).sort();
export const labels = (ps: { x: number; y: number }[]) => ps.map(coordLabel).sort();
/** A harmless enemy that keeps the room from counting as cleared (Page Wards rest on odd enemy turns). */
export const dummy = (where = 'f6') => ({ kind: 'ward' as const, at: where, element: 'water' as const });
