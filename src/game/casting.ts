import {
  RULES,
  castError,
  mergeHazard,
  planCast,
  pushDistance,
  spellArea,
  spellDamage,
  spellName,
  type Card,
  type Dir,
  type GameState,
  type Pos,
  type Spell,
} from '../engine';
import { ELEMENT_COLOR, HAZARD_COLOR } from '../config/art';

/**
 * The crafting table: the player drags fragment cards from the hand onto one big table. Any number of cards can
 * sit there; a spell uses 2–3 of them (a rune takes one of the 3).
 * This file is pure logic (no React): what the cards on the table make, whether it can be cast, and which tiles
 * it would hit. The HUD (hud/CraftingTable.tsx) and the board highlights read the result.
 */

/**
 * A card lying on the crafting table, wherever the player dropped it. `x`/`y` are the card centre as fractions
 * (0–1) of the table's card area, so the layout survives window resizes; `tilt` is a small rotation in degrees
 * so the cards look tossed down rather than snapped into a grid.
 */
export interface TablePlacement {
  id: number;
  x: number;
  y: number;
  tilt: number;
}

/** Cards on the crafting table. Array order is stacking order: the last one lies on top. */
export type Table = TablePlacement[];

/** Put a card on the table at (x, y), or move it there if it's already on it. It ends up on top of the pile. */
export function placeOnTable(table: Table, card: TablePlacement): Table {
  return [...table.filter((p) => p.id !== card.id), card];
}

export function removeFromTable(table: Table, id: number): Table {
  return table.filter((p) => p.id !== id);
}

export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

export interface CastPreview {
  /** empty: nothing on the table · incomplete: 1 card · invalid: not castable · blocked: castable but not now · ready */
  status: 'empty' | 'incomplete' | 'invalid' | 'blocked' | 'ready';
  /** One line for the strip along the top of the crafting table. */
  message: string;
  /** Spell name when the cards make one (even if blocked). */
  title?: string;
  /** The cards that get cast. */
  cardIds: number[];
  cost?: number;
  /** Colour of the spell's highlight (element or hazard colour). */
  color?: string;
  /** Beam and Wall are cast by clicking a direction on the board (no Cast click needed). */
  needsAim: boolean;
  /** Tiles the spell will hit (undirected spells), shown on the board while it's valid. */
  tiles: Pos[];
  /** Beam and Wall: the tiles in each direction, shown faintly until the player aims. */
  aimTiles?: Record<Dir, Pos[]>;
  /** A rune is on the table. Its effect is never previewed: areas and numbers are the plain spell's. */
  rune: boolean;
}

/** The cards currently on the table, bottom of the pile first. */
export function tableCards(hand: Card[], table: Table): Card[] {
  return table.map((p) => hand.find((c) => c.id === p.id)).filter((c): c is Card => !!c);
}

/** Drop table entries whose card has left the hand (cast, stolen, erased...). Returns `table` itself if nothing changed. */
export function cleanTable(hand: Card[], table: Table): Table {
  const next = table.filter((p) => hand.some((c) => c.id === p.id));
  return next.length === table.length ? table : next;
}

function actionBlock(state: GameState): string | null {
  if (state.phase !== 'player') return 'Wait for your turn.';
  if (state.actionsLeft <= 0) return 'No actions left this turn.';
  return null;
}

/** The colour a spell is previewed in. */
export function spellColor(spell: Spell): string {
  if (spell.kind === 'unstable') return ELEMENT_COLOR.fire;
  if (spell.kind === 'merge') return HAZARD_COLOR[mergeHazard(spell.elements)];
  return ELEMENT_COLOR[spell.element];
}

/** "2 dmg · Root", "push 1", "2 dmg · leaves Magma for 3 turns". */
function effectText(spell: Spell): string {
  const dmg = spellDamage(spell);
  if (spell.kind === 'unstable') return `${dmg} dmg to all 8 tiles around you · you gain Burn ${RULES.unstableBurn} · once per room`;
  if (spell.kind === 'merge') {
    const hazard = mergeHazard(spell.elements);
    return `${dmg ? `${dmg} dmg · ` : ''}leaves ${hazard[0].toUpperCase()}${hazard.slice(1)} for ${RULES.hazardTurns} turns`;
  }
  const word = { fire: 'Burn', water: 'Root', earth: 'Stun' } as const;
  if (spell.element === 'wind') return `push ${pushDistance(spell)}`;
  return `${dmg} dmg · ${word[spell.element]}`;
}

export function previewCast(state: GameState, cards: Card[]): CastPreview {
  const cardIds = cards.map((c) => c.id);
  const base = { needsAim: false, tiles: [] as Pos[], cardIds, rune: cards.some((c) => c.kind === 'rune') };
  if (cards.length === 0) {
    return { ...base, status: 'empty', message: 'Drag fragments here: one element + one shape (either can be doubled), or two elements + a shape' };
  }
  const plan = planCast(cards);
  const { combo } = plan;

  if (combo.kind === 'invalid') {
    if (!combo.castable) return { ...base, status: cards.length === 1 ? 'incomplete' : 'invalid', message: combo.reason };
    // A rune keeps CAST lit even when the fragments make nothing, so the button never gives the rune away.
    const blocked = actionBlock(state) ?? castError(state, cardIds, null);
    const title = 'An unknown working';
    const message = `${combo.reason} The rune hums anyway…`;
    return { ...base, title, cost: plan.cost, status: blocked ? 'blocked' : 'ready', message: blocked ?? message };
  }

  const spell = combo.spell;
  const title = spellName(spell);
  const needsAim = plan.needsAim;
  const aimTiles = needsAim ? (Object.fromEntries(DIRS.map((d) => [d, spellArea(state, spell, d).tiles.map((t) => t.pos)])) as Record<Dir, Pos[]>) : undefined;
  const tiles = needsAim ? [] : spellArea(state, spell, null).tiles.map((t) => t.pos);
  // castError wants a direction for Beam and Wall; any direction works for checking cards and mana.
  const blocked = actionBlock(state) ?? castError(state, cardIds, needsAim ? 'up' : null);
  const common = { ...base, title, cost: plan.cost, color: spellColor(spell), needsAim, tiles, aimTiles };
  if (blocked) return { ...common, status: 'blocked', message: blocked };
  const rune = combo.rune ? ' · + a rune' : '';
  return { ...common, status: 'ready', message: `${effectText(spell)}${rune}${needsAim ? ' · click a direction on the board to cast' : ''}` };
}

/**
 * Aiming: which direction the pointer is in, seen from the player. Ties on a diagonal keep `fallback`
 * so the preview doesn't flicker when the pointer crosses a diagonal.
 */
export function aimDirection(from: Pos, to: Pos | null, fallback: Dir | null): Dir | null {
  if (!to) return fallback;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? 'up' : 'down';
  return fallback;
}
