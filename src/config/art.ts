import type { Card, Element, EnemyKind, FragmentKind, HazardKind } from '../engine';

/**
 * [ART] Every picture the game uses, in one place, so the commissioned art can be swapped in one line at a time.
 *
 * Files live in public/art/ and are served next to the page. The current pictures are PLACEHOLDERS cut from the
 * paper print-and-cut kit (cards, unit tokens, status icons). The board itself has no pictures yet: it is plain
 * 3D blocks coloured with `PLACEHOLDER_COLORS` below.
 */
export const artUrl = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

/**
 * The title screen's background. PLACEHOLDER photo: "Full moon behind tree silhouettes" by Aron Visuals, from
 * Unsplash (https://unsplash.com/photos/4zxSWESyZio), free to use under the Unsplash License.
 */
export const TITLE_ART = artUrl('title/moon-forest.jpg');

// ---------------------------------------------------------------- units

/**
 * Unit pictures, drawn standing on their tile and always facing the camera (scene/Unit.tsx).
 * PLACEHOLDER: round paper tokens. When the artist's isometric unit drawings arrive, point these at the new files
 * and set `UNIT_SPRITE` to match how the drawings are framed.
 */
export const PLAYER_ART = artUrl('tokens/you.png');

export function unitArt(kind: EnemyKind, element?: Element): string {
  // The kit's Earth ward token is still called "rock" (Earth was Rock in the paper kit).
  const ward = element === 'earth' ? 'rock' : element ?? 'fire';
  return artUrl(`tokens/${kind === 'ward' ? `ward-${ward}` : kind}.png`);
}

/** How a unit picture sits on its tile: `width`/`height` in tiles, `footY` = how far its bottom edge sits above the tile. */
export const UNIT_SPRITE = { width: 0.86, height: 0.86, footY: 0.12 } as const;

// ---------------------------------------------------------------- board

/**
 * Room art from the artist, once it exists. The artist draws at an isometric angle, and the delivery format
 * isn't decided yet:
 * - one painting per room: show it behind the board as a flat picture lined up with the grid, and hide the
 *   placeholder tiles (pillars must still come as separate cut-outs so units can stand behind them);
 * - separate pieces (floor tiles, pillars, holes): one picture per piece, placed on each tile.
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
  /** A pillar down to its last HP. */
  pillarCracked: '#6f665b',
  /** The door tile: dark red with bars while locked, glowing gold once the room is cleared. */
  exitLocked: '#7a2f2a',
  exitOpen: '#d8b55a',
  exitBars: '#3b2a24',
  doorFrame: '#7d7064',
  doorWood: '#5a3b24',
  /** The open door's portal, light beam and arrow. */
  portal: '#ffe2a0',
  /** The Whispering Lectern (scene/Lectern.tsx). */
  lecternStone: '#8d8379',
  lecternWood: '#4a2f1d',
  lecternPage: '#efe4cc',
  lecternGlow: '#b05cff',
  /** The camp's fire and logs (scene/Campfire.tsx). */
  campStone: '#6f665d',
  campLog: '#6b4a2e',
  campLogDark: '#2e1d12',
  campLogEnd: '#c9a57a',
  campFlameOuter: '#ff5a1f',
  campFlame: '#ff9a3c',
  campFlameCore: '#ffe08a',
  campLight: '#ffb066',
  campSmoke: '#8a8580',
  campSteam: '#e8ecf0',
  /** Room 0's collapsed corner (scene/Moonlight.tsx). */
  moonlight: '#b9cdff',
  // Room 0's sleeping mat: old straw, darker woven bands and worn patches, a dirty off-white pillow.
  matStraw: '#8f7a52',
  matWeave: '#6f5d3c',
  matWorn: '#5a4a31',
  matPillow: '#b9ad90',
  matStain: '#9a8a66',
  /** The torch on every pillar (scene/Torch.tsx): iron bracket, wooden handle, oily rag, flame and its light. */
  torchIron: '#2b2622',
  torchWood: '#5a3d24',
  torchRag: '#3a2a1c',
  torchFlame: '#ff8a2a',
  torchFlameCore: '#ffe08a',
  torchLight: '#ffa04d',
  moonDust: '#e6eeff',
  rubble: '#7a7067',
  hole: '#060405',
  holeRim: '#241b16',
  unitBase: { player: '#d8b55a', enemy: '#8b2e2a' },
} as const;

// ---------------------------------------------------------------- cards & icons

/**
 * Kit card art that exists for each fragment kind. Kinds missing here are drawn in code until the artist delivers
 * them: Wind and Wall in the kit's card layout (hud/KitCard.tsx), runes as plain cards (hud/Hand.tsx).
 */
const CARD_IMAGE: Partial<Record<FragmentKind, string>> = { fire: 'fire', water: 'water', earth: 'rock', beam: 'beam', cross: 'cross' };
/** Kinds whose loot version (with the wax seal printed on) exists in public/art/cards/. The kit has no Cross loot card. */
const LOOT_IMAGE: ReadonlySet<FragmentKind> = new Set<FragmentKind>(['fire', 'water', 'earth', 'beam']);

/**
 * Fragment card face (null = no art yet). Loot cards use their own art (`-loot`, with the wax seal printed on);
 * where that doesn't exist, the normal art is used and `seal` asks for a drawn wax seal on top.
 */
export function cardArt(card: Pick<Card, 'kind' | 'loot'>): { src: string; seal: boolean } | null {
  const name = CARD_IMAGE[card.kind];
  if (!name) return null;
  const lootArt = !!card.loot && LOOT_IMAGE.has(card.kind);
  return { src: artUrl(`cards/${name}${lootArt ? '-loot' : ''}.jpg`), seal: !!card.loot && !lootArt };
}

export const CARD_BACK_ART = artUrl('cards/back.jpg');

/** Fragment pictures without the card frame (used on piles and small badges); null = no art yet. */
export const iconArt = (kind: FragmentKind): string | null => {
  const name = CARD_IMAGE[kind];
  return name ? artUrl(`icons/${name}.png`) : null;
};

export const STATUS_ART = {
  burn: artUrl('status/burn.png'),
  root: artUrl('status/root.png'),
  stun: artUrl('status/stun.png'),
} as const;

/** Colour of each element, used for spell previews, the crafting table glow and ward bases. */
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#e0623a',
  water: '#3f9fd8',
  earth: '#b08a4e',
  wind: '#9fd8c4',
};

/** Colour of each merge hazard, on the board and in spell previews. */
export const HAZARD_COLOR: Record<HazardKind, string> = {
  fog: '#d9dde6',
  magma: '#ff5a1f',
  quicksand: '#c9a25a',
};

/** Placeholder card colours for fragment kinds without art. Shapes are light purple (the chant's shape words). */
export const FRAGMENT_COLOR: Record<FragmentKind, string> = {
  ...ELEMENT_COLOR,
  beam: '#c9b3f0',
  cross: '#c9b3f0',
  wall: '#c9b3f0',
  rune: '#8f86a8',
};
