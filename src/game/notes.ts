import {
  RULES,
  comboFromCards,
  comboTokens,
  mergeHazard,
  pushDistance,
  pushLabel,
  spellCost,
  spellDamage,
  spellName,
  type Card,
  type FragmentKind,
  type Spell,
} from '../engine';

/**
 * The "Hmmm..." note (hud/HmmmNote.tsx): the mage's memory of every card combination cast so far. Pure logic:
 * which lines to show for the cards on the crafting table, which ones the hand can make, and which hand cards a
 * line would add to the table.
 */

export interface NoteToken {
  kind: FragmentKind;
  /** Rune symbol, for rune cards. */
  rune?: number;
}

export interface NoteLine {
  key: string;
  tokens: NoteToken[];
  /** "Fire + Beam", "Magma Wall". A rune doesn't change the name. */
  name: string;
  /** Mana cost and a short effect, or null on a line with a rune (its numbers stay a mystery: "?"). */
  cost: number | null;
  effect: string | null;
  /** The hand (crafting table included) holds every card of this line. */
  available: boolean;
  /** Its cost is more than the mage's mana right now (known costs only). */
  tooExpensive: boolean;
  /** Per token: is it one of the cards already on the crafting table? */
  onTable: boolean[];
  /** Hand cards (not on the table) that complete it, in token order. Empty when it isn't available. */
  addIds: number[];
}

export interface NoteView {
  available: NoteLine[];
  missing: NoteLine[];
  /** Lines hidden because they don't use the cards on the table. */
  hidden: number;
}

const matches = (card: Card, t: NoteToken) => card.kind === t.kind && (t.kind !== 'rune' || (card.rune ?? 0) === t.rune);

/** A short effect for a note line: "1 dmg · Burn", "push 2", "2 dmg · Burn · Magma". */
export function shortEffect(spell: Spell): string {
  const dmg = spellDamage(spell);
  if (spell.kind === 'unstable') return `${dmg} dmg all around · you Burn`;
  if (spell.kind === 'merge') {
    const hazard = mergeHazard(spell.elements);
    if (hazard === 'magma') return `${dmg} dmg · Burn · Magma`;
    return hazard === 'fog' ? 'Fog: blocks sight' : 'Quicksand: traps';
  }
  if (spell.element === 'wind') return pushLabel(pushDistance(spell)).replace('it hits something', 'it hits');
  const word = { fire: 'Burn', water: 'Root', earth: 'Stun' } as const;
  return `${dmg} dmg · ${word[spell.element]}`;
}

/** Give each card in `cards` a different token it matches; returns the token indexes taken, or null if one can't. */
function assign(cards: Card[], tokens: NoteToken[]): Set<number> | null {
  const taken = new Set<number>();
  for (const c of cards) {
    const i = tokens.findIndex((t, j) => !taken.has(j) && matches(c, t));
    if (i < 0) return null;
    taken.add(i);
  }
  return taken;
}

/**
 * The note for this hand and crafting table. With cards on the table, only lines that contain all of them are
 * shown. A line is available if the hand (table included) has all its cards.
 */
export function noteView(combos: string[], hand: Card[], table: Card[], mana: number): NoteView {
  const view: NoteView = { available: [], missing: [], hidden: 0 };
  const lines: (NoteLine & { order: number })[] = [];
  for (const key of combos) {
    const tokens = comboTokens(key);
    const fake = tokens.map((t, i) => ({ id: -1 - i, kind: t.kind, rune: t.rune }) as Card);
    const combo = comboFromCards(fake);
    if (combo.kind !== 'spell') continue;
    const onTableIdx = assign(table, tokens);
    if (!onTableIdx) {
      view.hidden++;
      continue;
    }
    // The rest of the line from the hand cards not already on the table.
    const free = hand.filter((c) => !table.some((t) => t.id === c.id));
    const addIds: number[] = [];
    let available = true;
    tokens.forEach((t, i) => {
      if (onTableIdx.has(i)) return;
      const card = free.find((c) => matches(c, t) && !addIds.includes(c.id));
      if (card) addIds.push(card.id);
      else available = false;
    });
    const hasRune = !!combo.rune;
    const cost = hasRune ? null : spellCost(combo.spell);
    lines.push({
      key,
      tokens,
      name: spellName(combo.spell),
      cost,
      effect: hasRune ? null : shortEffect(combo.spell),
      available,
      tooExpensive: cost !== null && cost > mana,
      onTable: tokens.map((_, i) => onTableIdx.has(i)),
      addIds: available ? addIds : [],
      order: spellCost(combo.spell) + (hasRune ? RULES.runeCost : 0),
    });
  }
  lines.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  for (const { order: _order, ...line } of lines) (line.available ? view.available : view.missing).push(line);
  return view;
}
