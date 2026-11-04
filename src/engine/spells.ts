import { RULES } from './data';
import { DIR_VECTORS, DIRS4, addPos, inBounds, isPillar, perpendicular, ray, scalePos } from './grid';
import type { Dir, Element, GameState, HazardKind, Pos, RuneEffect, Shape, Spell } from './types';

export const ELEMENT_EFFECT: Record<Element, { status: 'burn' | 'root' | 'stun' | 'push'; text: string }> = {
  fire: { status: 'burn', text: `Burn: 1 dmg at the start of each of its next ${RULES.burnTicks} turns` },
  water: { status: 'root', text: 'Root: can’t move during its next turn' },
  earth: { status: 'stun', text: 'Stun: can’t attack during its next turn; cancels a charged attack' },
  wind: { status: 'push', text: 'Push away from you (2 tiles doubled)' },
};

export const HAZARD_INFO: Record<HazardKind, { name: string; text: string }> = {
  fog: { name: 'Fog', text: 'Blocks sight. Monsters inside wander and don’t attack. Wind clears it.' },
  magma: { name: 'Magma', text: 'Stepping onto it burns. Water turns it back to floor.' },
  quicksand: { name: 'Quicksand', text: `A unit on it is stuck until it spends ${RULES.quicksandEscape} actions to climb out.` },
};

/** Fire + Water = Fog, Fire + Earth = Magma, Earth + Water = Quicksand. */
export function mergeHazard(elements: readonly Element[]): HazardKind {
  const has = (e: Element) => elements.includes(e);
  if (has('fire') && has('water')) return 'fog';
  if (has('fire') && has('earth')) return 'magma';
  return 'quicksand';
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function spellName(spell: Spell): string {
  if (spell.kind === 'unstable') return 'Unstable Fire';
  if (spell.kind === 'merge') return `${HAZARD_INFO[mergeHazard(spell.elements)].name} ${cap(spell.shape)}`;
  const el = spell.elementCount === 2 ? `${cap(spell.element)} ×2` : cap(spell.element);
  const sh = spell.shapeCount === 2 ? `${cap(spell.shape)} ×2` : cap(spell.shape);
  return `${el} + ${sh}`;
}

/** The elements a spell contains (for Page Ward immunity). */
export function spellElements(spell: Spell): Element[] {
  if (spell.kind === 'unstable') return ['fire'];
  if (spell.kind === 'merge') return [...spell.elements];
  return [spell.element];
}

export function spellShape(spell: Spell): Shape | null {
  return spell.kind === 'unstable' ? null : spell.shape;
}

/** Mana a spell costs on its own: fragments used, +1 per doubled part. Merges 3, Unstable Fire 5. */
export function spellCost(spell: Spell): number {
  if (spell.kind === 'unstable') return RULES.unstableCost;
  if (spell.kind === 'merge') return RULES.mergeCost;
  return spell.elementCount + spell.shapeCount + (spell.elementCount === 2 ? 1 : 0) + (spell.shapeCount === 2 ? 1 : 0);
}

/** Damage to each unit hit, with a rune's effect if one rides on the spell. */
export function spellDamage(spell: Spell, rune: RuneEffect | null = null): number {
  let dmg: number;
  if (spell.kind === 'unstable') dmg = RULES.unstableDamage;
  else if (spell.kind === 'merge') dmg = mergeHazard(spell.elements) === 'magma' ? RULES.magmaDamage : 0;
  else dmg = (spell.elementCount === 2 ? RULES.doubledElementDamage : RULES.elementDamage)[spell.element];
  if (rune === 'amplify') dmg += RULES.runeAmplify;
  if (rune === 'volatile') dmg *= 2;
  return dmg;
}

/** Tiles a Wind spell pushes its targets (0 for anything else). */
export function pushDistance(spell: Spell): number {
  if (spell.kind !== 'basic' || spell.element !== 'wind') return 0;
  return spell.elementCount === 2 ? RULES.doubledWindPush : RULES.windPush;
}

/** Beam and Wall are cast in one of the 4 directions; Cross and Unstable Fire are centred on you. */
export function needsAim(spell: Spell): boolean {
  const shape = spellShape(spell);
  return shape === 'beam' || shape === 'wall';
}

/** One tile a spell hits, and the way a Wind spell pushes whatever stands there. */
export interface AreaTile {
  pos: Pos;
  push: Pos | null;
}

export interface SpellArea {
  tiles: AreaTile[];
  /** Pillars inside the area or stopping it (a damaging spell chips each one). */
  pillars: Pos[];
  /** Backfire: the caster's own tile is hit too. */
  self: AreaTile | null;
}

/**
 * The area a spell covers.
 * - Beam: a line in the cast direction. Cross: the 4 lines around you. Pillars stop each line.
 * - Wall: rows across the cast direction, directly in front of you. A pillar shields the tile behind it.
 * - Widen (rune): Beam gets two side lanes, Cross gets the diagonals, Wall gets 1 more tile at each end.
 * - Backfire (rune): your own tile is hit too.
 */
export function spellArea(state: GameState, spell: Spell, dir: Dir | null, rune: RuneEffect | null = null): SpellArea {
  const origin = state.player.pos;
  const widen = rune === 'widen';
  const tiles: AreaTile[] = [];
  const pillars: Pos[] = [];
  const d = dir ? DIR_VECTORS[dir] : null;

  /** Walk a lane of up to `len` tiles from `start` (exclusive) along v; a pillar ends it. */
  const lane = (start: Pos, v: Pos, len: number) => {
    const line = ray(state, start, v, len);
    for (const p of line) tiles.push({ pos: p, push: v });
    if (line.length < len) {
      const next = addPos(line.length ? line[line.length - 1] : start, v);
      if (inBounds(state, next) && isPillar(state, next)) pillars.push(next);
    }
  };

  if (spell.kind === 'unstable') {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const p = { x: origin.x + dx, y: origin.y + dy };
        if (!inBounds(state, p)) continue;
        if (isPillar(state, p)) pillars.push(p);
        else tiles.push({ pos: p, push: null });
      }
  } else if (spell.shape === 'beam') {
    if (d) {
      const len = spellShapeCount(spell) === 2 ? RULES.doubledBeamLength : RULES.beamLength;
      const side = perpendicular(d);
      for (const k of widen ? [0, -1, 1] : [0]) {
        const start = addPos(origin, scalePos(side, k));
        if (k !== 0 && !inBounds(state, start)) continue;
        lane(start, d, len);
      }
    }
  } else if (spell.shape === 'cross') {
    const reach = spellShapeCount(spell) === 2 ? RULES.doubledCrossReach : RULES.crossReach;
    for (const v of DIRS4) lane(origin, v, reach);
    if (widen) {
      // The diagonals: the full ring for a plain Cross, the 5×5 minus its corners for a doubled one.
      for (let dx = -reach; dx <= reach; dx++)
        for (let dy = -reach; dy <= reach; dy++) {
          if (!dx || !dy || (Math.abs(dx) === reach && Math.abs(dy) === reach && reach > 1)) continue;
          const p = { x: origin.x + dx, y: origin.y + dy };
          if (!inBounds(state, p)) continue;
          if (isPillar(state, p)) pillars.push(p);
          else tiles.push({ pos: p, push: { x: Math.sign(dx), y: Math.sign(dy) } });
        }
    }
  } else if (d) {
    // Wall
    const half = (RULES.wallWidth + (widen ? 2 : 0) - 1) / 2;
    const rows = spellShapeCount(spell) === 2 ? 2 : 1;
    const side = perpendicular(d);
    for (let k = -half; k <= half; k++) {
      for (let row = 1; row <= rows; row++) {
        const p = addPos(addPos(origin, scalePos(d, row)), scalePos(side, k));
        if (!inBounds(state, p)) break;
        if (isPillar(state, p)) {
          pillars.push(p);
          break; // the pillar shields the tile behind it
        }
        tiles.push({ pos: p, push: d });
      }
    }
  }

  const self = rune === 'backfire' ? { pos: { ...origin }, push: spell.kind !== 'unstable' && spell.shape !== 'cross' ? d : null } : null;
  return { tiles, pillars, self };
}

function spellShapeCount(spell: Spell): 1 | 2 {
  return spell.kind === 'basic' ? spell.shapeCount : 1;
}

// ---------------------------------------------------------------------------
// The Grimoire
// ---------------------------------------------------------------------------

/**
 * Grimoire page for a spell: "fire-beam" for element + shape (doubling doesn't matter), "magma-wall" for a
 * merge, "unstable" for Unstable Fire.
 */
export function pageId(spell: Spell): string {
  if (spell.kind === 'unstable') return 'unstable';
  if (spell.kind === 'merge') return `${mergeHazard(spell.elements)}-${spell.shape}`;
  return `${spell.element}-${spell.shape}`;
}

/** Every page in the grimoire, in book order: 12 element pages, 9 merge pages, Unstable Fire. */
export const GRIMOIRE_PAGES: { id: string; title: string; group: 'element' | 'merge' | 'unstable' }[] = [
  ...(['fire', 'water', 'earth', 'wind'] as Element[]).flatMap((e) =>
    (['beam', 'cross', 'wall'] as Shape[]).map((s) => ({ id: `${e}-${s}`, title: `${cap(e)} ${cap(s)}`, group: 'element' as const })),
  ),
  ...(['fog', 'magma', 'quicksand'] as HazardKind[]).flatMap((h) =>
    (['beam', 'cross', 'wall'] as Shape[]).map((s) => ({ id: `${h}-${s}`, title: `${HAZARD_INFO[h].name} ${cap(s)}`, group: 'merge' as const })),
  ),
  { id: 'unstable', title: 'Unstable Fire', group: 'unstable' },
];
