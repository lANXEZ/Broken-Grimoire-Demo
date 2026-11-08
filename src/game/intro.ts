import { cloneState, createGame, parseCoord, type Card, type FragmentKind, type GameState } from '../engine';
import { INTRO_PLACES } from '../config/introScript';

/**
 * The opening cutscene's scenes and the tutorial's set-up, as plain game states (pure functions, so they can be
 * tested). game/useIntro.ts plays them.
 */

/** Saved once the cutscene has played (or been skipped) on this computer, so it only plays the first time. */
const SEEN_KEY = 'broken-grimoire/intro/v1';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'seen');
  } catch {
    // Storage blocked: it plays again next time.
  }
}

/** The two fragments the tutorial teaches with. */
export const TUTORIAL_KINDS: FragmentKind[] = ['fire', 'beam'];

/** The fragment lying in room 0, picked up during the cutscene. */
const itemCard = (): Card => ({ id: -1, kind: 'fire' });

/**
 * Room 0 in the cutscene, built from a fresh room 0 (`base`). `camp: false` is the room as the mage falls into
 * it: empty, no campfire, rock or mat. `camp: true` is after the blackout: the campfire (not lit), the rock and the
 * mat are there. Both have the grimoire fragment lying on the floor unless `itemTaken`.
 */
export function introRoom0(base: GameState, { camp, itemTaken = false }: { camp: boolean; itemTaken?: boolean }): GameState {
  const s = cloneState(base);
  if (!camp) {
    s.room.feature = null;
    s.room.seats = [];
    s.room.mat = [];
  } else {
    s.room.fireLit = false;
  }
  s.room.drops = itemTaken ? [] : [{ id: -1, pos: parseCoord(INTRO_PLACES.item), cards: [itemCard()], toHand: false, from: 'rat' }];
  s.player.pos = parseCoord(INTRO_PLACES.fall);
  return s;
}

/** The Cistern in the cutscene: its layout, with just the one brute that comes for the mage. */
export function introCistern(base: GameState): GameState {
  const s = createGame(base.rng, { runeMap: base.runeMap });
  const from = parseCoord(INTRO_PLACES.bruteFrom);
  s.enemies = s.enemies.filter((e) => e.kind === 'brute' && e.pos.x === from.x && e.pos.y === from.y);
  return s;
}

/**
 * Make sure the hand holds one of each of `kinds`, taking them from the deck (or the discard pile) and putting the
 * hand cards they replace back into the deck. The rest of the hand stays as it was.
 */
export function withInHand(state: GameState, kinds: FragmentKind[]): GameState {
  const s = cloneState(state);
  const c = s.cards;
  for (const kind of kinds) {
    if (c.hand.some((x) => x.kind === kind)) continue;
    const pile = c.deck.some((x) => x.kind === kind) ? c.deck : c.discard;
    const i = pile.findIndex((x) => x.kind === kind);
    if (i < 0) continue;
    const [card] = pile.splice(i, 1);
    // Make room by sending back a card the tutorial doesn't use.
    const spare = c.hand.findIndex((x) => !kinds.includes(x.kind));
    if (spare >= 0) c.deck.push(...c.hand.splice(spare, 1));
    c.hand.push(card);
  }
  return s;
}

/** The tutorial, in the real room 0: the fire is out, the mage stands in front of it, and Fire and Beam are in hand. */
export function tutorialState(state: GameState): GameState {
  const s = withInHand(state, TUTORIAL_KINDS);
  s.room.fireLit = false;
  s.player.pos = parseCoord(INTRO_PLACES.atFire);
  return s;
}

/** The hand cards the tutorial glows: the first Fire and the first Beam. */
export function tutorialCardIds(state: GameState): number[] {
  return TUTORIAL_KINDS.flatMap((k) => state.cards.hand.filter((c) => c.kind === k).slice(0, 1).map((c) => c.id));
}
