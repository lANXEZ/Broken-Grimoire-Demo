import { ENEMY_DEFS, RULES } from './data';
import { random } from './rng';
import { runeName } from './runes';
import type { Card, CardState, Element, EnemyKind, FragmentKind, GameState, Shape, Spell } from './types';

/**
 * Fragment cards: the deck, the hand and the discard pile.
 * Pure helpers (no logging); the rules modules decide what to say about each move.
 */

/** The 14-card starting deck: Fire ×3, Water ×2, Earth ×2, Wind ×2, Beam ×2, Cross ×2, Wall ×1. */
export const STARTING_DECK: FragmentKind[] = [
  'fire', 'fire', 'fire', 'water', 'water', 'earth', 'earth', 'wind', 'wind', 'beam', 'beam', 'cross', 'cross', 'wall',
];

export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'wind'];
export const SHAPES: Shape[] = ['beam', 'cross', 'wall'];

export function isElementKind(kind: FragmentKind): kind is Element {
  return (ELEMENTS as string[]).includes(kind);
}

export function isShapeKind(kind: FragmentKind): kind is Shape {
  return (SHAPES as string[]).includes(kind);
}

export function fragmentName(kind: FragmentKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** "Fire", or a rune's gibberish name ("Kesh rune"). */
export function cardName(card: Card): string {
  return card.kind === 'rune' ? `${runeName(card.rune ?? 0)} rune` : fragmentName(card.kind);
}

/** "Fire", "Fire and Beam", "Fire, Fire and Beam". */
export function cardsLabel(cards: Card[]): string {
  const names = cards.map(cardName);
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function newCardState(): CardState {
  return {
    deck: STARTING_DECK.map((kind, i) => ({ id: i + 1, kind })),
    hand: [],
    discard: [],
    erased: [],
    nextId: STARTING_DECK.length + 1,
  };
}

export function newCard(cards: CardState, kind: FragmentKind, extra: Partial<Card> = {}): Card {
  return { id: cards.nextId++, kind, ...extra };
}

/** Seeded Fisher–Yates, so undo/redo and the intent preview see the same order. */
export function shuffleInPlace(state: GameState, items: Card[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export interface DrawResult {
  drawn: Card[];
  /** The discard pile was shuffled into a new deck along the way. */
  reshuffled: boolean;
}

/** Draw up to `n` cards. When the deck runs out, the discard pile is shuffled into a new deck. */
export function drawCards(state: GameState, n: number): DrawResult {
  const cards = state.cards;
  const drawn: Card[] = [];
  let reshuffled = false;
  for (let i = 0; i < n; i++) {
    if (cards.deck.length === 0) {
      if (cards.discard.length === 0) break;
      cards.deck = cards.discard;
      cards.discard = [];
      shuffleInPlace(state, cards.deck);
      reshuffled = true;
    }
    const card = cards.deck.pop()!;
    cards.hand.push(card);
    drawn.push(card);
  }
  return { drawn, reshuffled };
}

/** Start of the player's turn: draw back up to the hand size. */
export function refillHand(state: GameState): DrawResult {
  return drawCards(state, Math.max(0, RULES.handSize - state.cards.hand.length));
}

/** New room: hand, deck and discard all go back into one shuffled deck, then draw a fresh hand. */
export function freshShuffle(state: GameState): DrawResult {
  const cards = state.cards;
  cards.deck = [...cards.deck, ...cards.hand, ...cards.discard];
  cards.hand = [];
  cards.discard = [];
  shuffleInPlace(state, cards.deck);
  return drawCards(state, RULES.handSize);
}

/**
 * What a set of cards on the crafting table makes.
 * - spell: a castable spell, with the rune riding on it (if any).
 * - invalid: no spell. `castable` is still true when a rune is on the table (with at least one other card), so
 *   the CAST button never gives away whether the rune would work; casting it fizzles.
 */
export type CardCombo =
  | { kind: 'spell'; spell: Spell; rune: Card | null }
  | { kind: 'invalid'; reason: string; rune: Card | null; castable: boolean };

const SHAPE_LIST = 'Beam, Cross or Wall';
const ELEMENT_LIST = 'Fire, Water, Earth or Wind';

/** Read the fragments without any rune. */
function readFragments(cards: Card[]): { spell: Spell } | { reason: string } {
  const elements = cards.filter((c) => isElementKind(c.kind)).map((c) => c.kind as Element);
  const shapes = cards.filter((c) => isShapeKind(c.kind)).map((c) => c.kind as Shape);
  const kinds = new Set(elements);
  if (shapes.length === 0) {
    if (elements.length === 3 && elements.every((k) => k === 'fire')) return { spell: { kind: 'unstable' } };
    return { reason: `Add a shape (${SHAPE_LIST}).` };
  }
  if (elements.length === 0) return { reason: `Add an element (${ELEMENT_LIST}).` };
  if (new Set(shapes).size > 1) return { reason: 'Only one kind of shape per spell (it may be doubled).' };
  if (kinds.size === 1) {
    return {
      spell: { kind: 'basic', element: elements[0], elementCount: elements.length as 1 | 2, shape: shapes[0], shapeCount: shapes.length as 1 | 2 },
    };
  }
  if (kinds.size === 2 && elements.length === 2 && shapes.length === 1) {
    if (kinds.has('wind')) return { reason: 'Wind can’t be merged with another element.' };
    return { spell: { kind: 'merge', elements: [elements[0], elements[1]], shape: shapes[0] } };
  }
  return { reason: 'A merge is two different elements and one shape.' };
}

export function comboFromCards(cards: Card[]): CardCombo {
  const runes = cards.filter((c) => c.kind === 'rune');
  const rune = runes[0] ?? null;
  if (cards.length === 0) return { kind: 'invalid', reason: 'Drag fragments here.', rune, castable: false };
  if (runes.length > 1) return { kind: 'invalid', reason: 'Only one rune per cast.', rune, castable: false };
  if (cards.length > 3) {
    return { kind: 'invalid', reason: `Too many fragments (${cards.length}): a spell uses 2 or 3, a rune included.`, rune, castable: false };
  }
  const rest = cards.filter((c) => c.kind !== 'rune');
  if (rune && rest.length === 0) return { kind: 'invalid', reason: 'A rune is never cast alone. Add fragments.', rune, castable: false };
  const read = readFragments(rest);
  if ('spell' in read) {
    // A rune takes one of the 3 slots, so it only rides on a plain element + shape.
    if (rune && read.spell.kind !== 'basic') return { kind: 'invalid', reason: 'The rune leaves no room for this spell.', rune, castable: true };
    return { kind: 'spell', spell: read.spell, rune };
  }
  if (cards.length === 1) return { kind: 'invalid', reason: read.reason, rune, castable: false };
  return { kind: 'invalid', reason: read.reason, rune, castable: !!rune };
}

/** Take these cards out of the hand (in hand order). */
export function takeFromHand(cards: CardState, ids: number[]): Card[] {
  const taken = cards.hand.filter((c) => ids.includes(c.id));
  cards.hand = cards.hand.filter((c) => !ids.includes(c.id));
  return taken;
}

/** Every card the wizard still owns: hand, deck and discard (not erased cards or cards held by Scraps). */
export function ownedCards(cards: CardState): Card[] {
  return [...cards.hand, ...cards.deck, ...cards.discard];
}

/**
 * Losing condition: the hand, deck and discard pile together no longer hold an element and a shape
 * (or three Fire cards for Unstable Fire). Cards under Page Scraps, erased cards and runes don't count.
 */
export function grimoireBroken(cards: CardState): boolean {
  const all = ownedCards(cards);
  const hasElement = all.some((c) => isElementKind(c.kind));
  const hasShape = all.some((c) => isShapeKind(c.kind));
  const fires = all.filter((c) => c.kind === 'fire').length;
  return !(hasElement && hasShape) && fires < 3;
}

/** Target deck mix for random drops: half elements (spread evenly), half shapes. */
export const DROP_TARGET: Record<Element | Shape, number> = {
  ...(Object.fromEntries(ELEMENTS.map((e) => [e, 0.5 / ELEMENTS.length])) as Record<Element, number>),
  ...(Object.fromEntries(SHAPES.map((s) => [s, 0.5 / SHAPES.length])) as Record<Shape, number>),
};

/** The weights a monster's drop is rolled with (GAME_RULES.md, Cards and drops). */
export function dropWeights(state: GameState, monster: EnemyKind): Record<Element | Shape, number> {
  const owned = ownedCards(state.cards).filter((c) => c.kind !== 'rune');
  const total = Math.max(1, owned.length);
  const theme = ENEMY_DEFS[monster].theme;
  const [a, b] = state.lastDrops.slice(-2);
  const weights = {} as Record<Element | Shape, number>;
  for (const [card, target] of Object.entries(DROP_TARGET) as [Element | Shape, number][]) {
    const share = owned.filter((c) => c.kind === card).length / total;
    let w = Math.min(Math.max(target / Math.max(share, 0.01), RULES.dropWeightMin), RULES.dropWeightMax);
    if (theme === card) w *= RULES.dropThemeBonus;
    if (a === card && b === card) w = 0;
    weights[card] = w;
  }
  return weights;
}

/** Roll a monster's random fragment drop with the run's seed. */
export function rollDrop(state: GameState, monster: EnemyKind): Element | Shape {
  const weights = dropWeights(state, monster);
  const entries = Object.entries(weights) as [Element | Shape, number][];
  const sum = entries.reduce((n, [, w]) => n + w, 0);
  let r = random(state) * sum;
  for (const [card, w] of entries) {
    if ((r -= w) < 0) return card;
  }
  return entries[entries.length - 1][0];
}
