import type { Card, Element, EnemyKind, FragmentKind, HazardKind } from '../engine';

/**
 * [ART] Every picture the game uses, in one place, so the commissioned art can be swapped in one line at a time.
 *
 * Files live in public/art/ and are served next to the page. From the art team: the fragments in hand, the info
 * cards, the mage and the monsters. Still PLACEHOLDERS from the paper print-and-cut kit: the piles' card backs, the
 * small fragment icons and the status icons. The board itself has no pictures yet: it is plain 3D blocks coloured
 * with `PLACEHOLDER_COLORS` below.
 */
export const artUrl = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

/** The title screen's background: a pixel-art night forest under the moon. */
export const TITLE_ART = artUrl('title/moon-forest.png');

// ---------------------------------------------------------------- units

/**
 * Unit pictures: the art team's full-body drawings, standing on their tile and always facing the camera
 * (scene/Unit.tsx). Each drawing sits on a big transparent square; the game trims it to the figure when it loads, so
 * only `UNIT_HEIGHT` decides how big a unit looks.
 */
export type MagePose = 'idle' | 'running' | 'casting' | 'meditating';

/**
 * The mage's poses (public/art/mc/): idle; running while walking a tile; casting while their spell plays out;
 * meditating for a moment after Meditate and while on the sleeping mat. The drawings face right; the picture flips
 * to face the way the mage walks or casts.
 */
export const MAGE_ART: Record<MagePose, string> = {
  idle: artUrl('mc/idle.png'),
  running: artUrl('mc/running.png'),
  casting: artUrl('mc/casting.png'),
  meditating: artUrl('mc/meditating.png'),
};
export const MAGE_POSES = Object.keys(MAGE_ART) as MagePose[];

const SPRITE_FILE: Record<Exclude<EnemyKind, 'ward'>, string> = {
  rat: 'Rat',
  archer: 'archer',
  brute: 'Brute',
  leech: 'Leech',
  warden: 'Warden',
  scrap: 'Scrap',
  redactor: 'Redactor',
};
const WARD_FILE: Record<Element, string> = { fire: 'Fward', water: 'Wward', earth: 'Eward', wind: 'Fward' };

/** A monster's drawing (public/art/sprites/). Page Wards have one per element (no Wind Ward exists). */
export function unitArt(kind: EnemyKind, element?: Element): string {
  return artUrl(`sprites/${kind === 'ward' ? WARD_FILE[element ?? 'fire'] : SPRITE_FILE[kind]}.png`);
}

/**
 * How tall each unit stands, in tiles (its trimmed figure; the width follows the drawing). The mage's other poses keep
 * the idle pose's scale, so crouching to meditate makes them shorter, not bigger.
 */
export const UNIT_HEIGHT: Record<EnemyKind | 'mage', number> = {
  mage: 1.0,
  rat: 0.48,
  archer: 1.02,
  brute: 1.25,
  leech: 0.62,
  warden: 1.42,
  ward: 1.12,
  scrap: 0.6,
  redactor: 1.5,
};

/** A typical unit's box (for spell effects aimed at a unit's middle and for fading obstacles in front of units). */
export const UNIT_SPRITE = { width: 0.8, height: 1.05, footY: 0.03 } as const;

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
  rubble: '#7a7067',
  /**
   * Room 0's sealed door (scene/SealedDoor.tsx): charred wood and its cracks, the gravel heap, and the marks the spells
   * left on it: scorch and embers (Fire), frost (Water), rock spikes (Earth), and the faint motes off the spikes.
   */
  sealedWood: '#4a3220',
  sealedCrack: '#120a06',
  rubbleLight: '#968a7c',
  scorch: '#0d0806',
  scorchedStone: '#3b3029',
  ember: '#ff7a2a',
  frost: '#9fd8ff',
  frostedStone: '#c9d8e2',
  earthSpike: '#6b5a48',
  earthSpark: '#d9b27a',
  hole: '#060405',
  holeRim: '#241b16',
  unitBase: { player: '#d8b55a', enemy: '#8b2e2a' },
} as const;

// ---------------------------------------------------------------- cards & icons

/**
 * The fragments in hand (and on the crafting table, the piles' pop-ups and so on): torn grimoire pages from the art
 * team, public/art/spell_fragments/. Each rune card has its own page, rune1-rune6 (rune card `symbol` + 1). The art
 * team's rune symbols aren't the rune alphabet the hidden messages use (engine/cipher.ts); for the demo a rune card
 * simply shows its page, and the alphabet stays as it is for the messages.
 */
export function fragmentArt(card: Pick<Card, 'kind' | 'rune'>): string {
  return artUrl(`spell_fragments/${card.kind === 'rune' ? `rune${(card.rune ?? 0) + 1}` : card.kind}.png`);
}

/**
 * The full card for a fragment kind, shown big beside the board while a fragment is hovered (hud/CardPreview.tsx):
 * public/art/info_cards/. Runes have no info card (null).
 */
export function infoCardArt(kind: FragmentKind): string | null {
  return kind === 'rune' ? null : artUrl(`info_cards/${kind}.png`);
}

/** The paper kit's fragment pictures without the card frame, still used on the piles and small badges. */
const CARD_IMAGE: Partial<Record<FragmentKind, string>> = { fire: 'fire', water: 'water', earth: 'rock', beam: 'beam', cross: 'cross' };

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

/** A rune fragment lying on the floor: its gem, halo, floor glow and light are this bright purple. */
export const RUNE_DROP_GLOW = '#b866ff';
