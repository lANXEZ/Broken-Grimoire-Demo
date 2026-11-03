import {
  ELEMENT_EFFECT,
  RULES,
  castError,
  comboFromCards,
  isElementKind,
  spellCost,
  spellDamage,
  spellName,
  spellTiles,
  unstableError,
  unstableTiles,
  type Card,
  type Dir,
  type Element,
  type GameState,
  type Pos,
  type SpellSpec,
} from '../engine';

/**
 * The crafting table: the player drags fragment cards from the hand onto one big table. Any number of cards can
 * sit there; a spell uses 2–3 of them (one element + one shape, either doubled).
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

export type CastPlan =
  | { kind: 'spell'; spec: SpellSpec; cardIds: number[] }
  | { kind: 'unstable'; cardIds: number[] };

export interface CastPreview {
  /** empty: nothing on the table · incomplete: 1 card · invalid: not a spell · blocked: a spell you can't afford now · ready */
  status: 'empty' | 'incomplete' | 'invalid' | 'blocked' | 'ready';
  /** One line for the strip along the top of the crafting table. */
  message: string;
  /** Spell name when the cards make one (even if blocked). */
  title?: string;
  /** What gets cast when the Cast button is pressed (only when status is 'ready'). */
  plan?: CastPlan;
  cost?: number;
  element?: Element;
  /** Beam spells are cast by clicking a direction on the board (no Cast click needed). */
  needsAim: boolean;
  /** Tiles the spell will hit (undirected spells), shown on the board while it's valid. */
  tiles: Pos[];
  /** Beam: the tiles in each direction, shown faintly until the player aims. */
  beamTiles?: Record<Dir, Pos[]>;
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

const STATUS_WORD = { burn: 'Burn', root: 'Root', stun: 'Stun' } as const;

function actionBlock(state: GameState): string | null {
  if (state.phase !== 'player') return 'Wait for your turn.';
  if (state.actionsLeft <= 0) return 'No actions left this turn.';
  return null;
}

export function previewCast(state: GameState, cards: Card[]): CastPreview {
  const base = { needsAim: false, tiles: [] as Pos[] };
  if (cards.length === 0) return { ...base, status: 'empty', message: 'Drag fragments here: one element + one shape (either can be doubled)' };
  if (cards.length > 3) {
    return { ...base, status: 'invalid', message: `Too many fragments (${cards.length}): a spell uses 2 or 3. Drag the extras back to your hand.` };
  }
  if (cards.length === 1) {
    const hasElement = isElementKind(cards[0].kind);
    return { ...base, status: 'incomplete', message: hasElement ? 'Add a shape: Beam or Cross' : 'Add an element: Fire, Water or Rock' };
  }
  const combo = comboFromCards(cards);
  const cardIds = cards.map((c) => c.id);

  if (combo.kind === 'invalid') return { ...base, status: 'invalid', message: combo.reason };

  if (combo.kind === 'unstable') {
    const title = 'Unstable Fire';
    const blocked = actionBlock(state) ?? unstableError(state);
    const tiles = unstableTiles(state);
    const [lo, hi] = [Math.min(...RULES.unstableDamageOptions), Math.max(...RULES.unstableDamageOptions)];
    if (blocked) return { ...base, status: 'blocked', title, message: blocked, cost: RULES.unstableCost, element: 'fire', tiles };
    return {
      ...base,
      status: 'ready',
      title,
      message: `${lo}–${hi} dmg to all 8 tiles around you · you gain Burn ${RULES.unstableBurn} · once per room`,
      plan: { kind: 'unstable', cardIds },
      cost: RULES.unstableCost,
      element: 'fire',
      tiles,
    };
  }

  const spec = combo.spec;
  const title = spellName(spec);
  const cost = spellCost(spec);
  const needsAim = spec.shape === 'beam';
  const effect = STATUS_WORD[ELEMENT_EFFECT[spec.element].status];
  const beamTiles = needsAim
    ? (Object.fromEntries(DIRS.map((d) => [d, spellTiles(state, spec, d)])) as Record<Dir, Pos[]>)
    : undefined;
  const tiles = needsAim ? [] : spellTiles(state, spec, null);
  // castError wants a direction for beams; any direction works for checking cards and mana.
  const blocked = actionBlock(state) ?? castError(state, spec, needsAim ? 'up' : null, cardIds);
  const common = { title, cost, element: spec.element, needsAim, tiles, beamTiles };
  if (blocked) return { ...common, status: 'blocked', message: blocked };
  return {
    ...common,
    status: 'ready',
    message: `${spellDamage(spec)} dmg · ${effect}${needsAim ? ' · click a direction on the board to cast' : ''}`,
    plan: { kind: 'spell', spec, cardIds },
  };
}

/**
 * Beam aiming: which direction the pointer is in, seen from the player. Ties on a diagonal keep `fallback`
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
