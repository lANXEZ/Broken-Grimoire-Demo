import type { Card, Element, EnemyKind, FragmentKind } from '../engine';

/**
 * [ART] Every picture the game uses, in one place, so the commissioned art can be swapped in one line at a time.
 *
 * Files live in public/art/ and are served next to the page. The current pictures are PLACEHOLDERS cut from the
 * paper print-and-cut kit (cards, unit tokens, status icons). The board itself has no pictures yet: it is plain
 * 3D blocks coloured with `PLACEHOLDER_COLORS` below.
 */
export const artUrl = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

// ---------------------------------------------------------------- units

/**
 * Unit pictures, drawn standing on their tile and always facing the camera (scene/Unit.tsx).
 * PLACEHOLDER: round paper tokens. When the artist's isometric unit drawings arrive, point these at the new files
 * and set `UNIT_SPRITE` to match how the drawings are framed.
 */
export const PLAYER_ART = artUrl('tokens/you.png');

export function unitArt(kind: EnemyKind, element?: Element): string {
  return artUrl(`tokens/${kind === 'ward' ? `ward-${element ?? 'fire'}` : kind}.png`);
}

/** How a unit picture sits on its tile: `width`/`height` in tiles, `footY` = how far its bottom edge sits above the tile. */
export const UNIT_SPRITE = { width: 0.86, height: 0.86, footY: 0.12 } as const;

// ---------------------------------------------------------------- board

/**
 * Room art from the artist, once it exists. The artist draws at an isometric angle, and the delivery format
 * isn't decided yet:
 * - one painting per room: show it behind the board as a flat picture lined up with the grid, and hide the
 *   placeholder tiles (pillars must still come as separate cut-outs so units can stand behind them);
 * - separate pieces (floor tiles, pillars, exit): one picture per piece, placed on each tile.
 * Either way the grid, clicks and highlights stay as they are; only scene/Board.tsx changes.
 */
export const ROOM_ART: Record<string, { painting?: string } | undefined> = {
  cistern: undefined,
  scriptorium: undefined,
  redactor: undefined,
};

/** PLACEHOLDER board colours, used until the room art arrives. */
export const PLACEHOLDER_COLORS = {
  background: '#17120f',
  tileA: '#8a7a63',
  tileB: '#7d6d57',
  tileSide: '#4f4336',
  slabTop: '#3d3229',
  slabSide: '#2a221c',
  pillar: '#9b9184',
  pillarCap: '#b5ab9d',
  exitOpen: '#d8b55a',
  exitLocked: '#7a2f2a',
  unitBase: { player: '#d8b55a', enemy: '#8b2e2a' },
} as const;

// ---------------------------------------------------------------- cards & icons

/** Fragment card faces. Loot cards (with the wax seal) have their own art. */
export function cardArt(card: Pick<Card, 'kind' | 'loot'>): string {
  return artUrl(`cards/${card.kind}${card.loot ? '-loot' : ''}.jpg`);
}

export const CARD_BACK_ART = artUrl('cards/back.jpg');

/** Fragment pictures without the card frame (used on piles and small badges). */
export const iconArt = (kind: FragmentKind | 'potion') => artUrl(`icons/${kind}.png`);

export const STATUS_ART = {
  burn: artUrl('status/burn.png'),
  root: artUrl('status/root.png'),
  stun: artUrl('status/stun.png'),
} as const;

/** Colour of each element, used for spell previews, the crafting table glow and ward bases. */
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#e0623a',
  water: '#3f9fd8',
  rock: '#b08a4e',
};
