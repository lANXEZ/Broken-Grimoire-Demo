import { cardsLabel, comboFromCards, comboKey, takeFromHand, type CardCombo } from './cards';
import { RULES, coordLabel } from './data';
import {
  RuleError,
  damageEnemy,
  damagePillar,
  damagePlayer,
  enemyName,
  immunityReason,
  log,
  pushUnit,
  removeHazardAt,
  unitSize,
  type UnitRef,
} from './core';
import { enemyAt, hazardAt, isHole, isPillar, manhattan, posKey, samePos } from './grid';
import {
  campfireEffect,
  mergeHazard,
  needsAim,
  pageId,
  pushDistance,
  spellArea,
  spellCost,
  spellDamage,
  spellElements,
  spellName,
  GRIMOIRE_PAGES,
  type SpellArea,
} from './spells';
import { playerAction } from './game';
import type { Card, Dir, Enemy, GameState, RuneEffect, Spell } from './types';

/**
 * Casting what's on the crafting table: the cards are read (cards.ts `comboFromCards`), checked, paid for and
 * resolved here. A rune rides on a plain element + shape spell; on a table that makes no spell it fizzles.
 */

export interface CastPlan {
  combo: CardCombo;
  /** Mana the cast needs: the spell's cost (+1 for a rune), or 1 per card when it will fizzle. Never reveals a rune. */
  cost: number;
  /** Beam and Wall need a direction. */
  needsAim: boolean;
}

export function planCast(cards: Card[]): CastPlan {
  const combo = comboFromCards(cards);
  if (combo.kind === 'spell') {
    return { combo, cost: spellCost(combo.spell) + (combo.rune ? RULES.runeCost : 0), needsAim: needsAim(combo.spell) };
  }
  return { combo, cost: cards.length, needsAim: false };
}

/** The hand cards with these ids, or an error. */
function pickCards(state: GameState, cardIds: number[]): Card[] | string {
  const picked = state.cards.hand.filter((c) => cardIds.includes(c.id));
  if (picked.length !== new Set(cardIds).size) return 'Those fragments are not in your hand.';
  return picked;
}

/** Why these cards can't be cast right now (null = they can). */
export function castError(state: GameState, cardIds: number[], dir: Dir | null): string | null {
  if (state.phase !== 'player') return 'It is not your turn.';
  if (state.actionsLeft <= 0) return 'No actions left this turn.';
  const cards = pickCards(state, cardIds);
  if (typeof cards === 'string') return cards;
  const plan = planCast(cards);
  const { combo } = plan;
  if (combo.kind === 'invalid' && !combo.castable) return combo.reason;
  if (state.player.status.stuck > 0) return 'You’re stuck in the quicksand: climb out first.';
  if (state.player.status.stun > 0) return 'You’re stunned and can’t cast this turn.';
  if (combo.kind === 'spell' && combo.spell.kind === 'unstable' && state.player.unstableUsed) return 'Unstable Fire was already used in this room.';
  if (state.player.mana < plan.cost) return `Needs ${plan.cost} mana (you have ${state.player.mana}).`;
  if (plan.needsAim && !dir) return 'Pick a direction.';
  return null;
}

function runeOf(state: GameState, combo: CardCombo): RuneEffect | null {
  return combo.rune ? state.runeMap[combo.rune.rune ?? 0] ?? null : null;
}

/**
 * Options for showing a rune cast in two parts. `ignoreRune`: resolve the cast as if its rune did nothing (the
 * rune card is still spent and its mana paid). The app shows that state first ("the spell itself"), then the
 * real result ("the rune's part"); it's never committed as the game state.
 */
export interface CastOptions {
  ignoreRune?: boolean;
}

/** Cast the cards with these ids (from the hand) in `dir` (Beam and Wall only). Costs 1 action. */
export function playerCast(state: GameState, cardIds: number[], dir: Dir | null, opts: CastOptions = {}): GameState {
  const err = castError(state, cardIds, dir);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const cards = pickCards(s, cardIds) as Card[];
    const plan = planCast(cards);
    const rune = opts.ignoreRune ? null : runeOf(s, plan.combo);
    const cost = rune === 'free' ? 0 : plan.cost;
    const before = s.player.mana;
    s.player.mana -= cost;
    s.cards.discard.push(...takeFromHand(s.cards, cardIds));
    const what = plan.combo.kind === 'spell' ? spellName(plan.combo.spell) : cardsLabel(cards);
    log(s, 'player', `Cast ${what}${plan.combo.rune ? ` with the ${cardsLabel([plan.combo.rune])}` : ''}${dir ? ` ${dir}` : ''} (mana ${before} → ${s.player.mana}).`);

    if (rune === 'free') log(s, 'player', 'The rune drinks no mana…');
    // A real spell (even one a Fizzle rune spoils) goes into the "Hmmm..." note the first time it's cast.
    if (plan.combo.kind === 'spell') {
      const key = comboKey(cards);
      if (!s.combos.includes(key)) s.combos = [...s.combos, key];
    }
    if (plan.combo.kind === 'invalid') {
      log(s, 'player', 'The fragments don’t form a spell: the cast fizzles.');
    } else if (rune === 'fizzle') {
      log(s, 'player', 'The rune sputters out: the spell fizzles.');
    } else {
      resolveSpell(s, plan.combo.spell, dir, rune);
    }
    // The rune's own price is paid even when nothing else happens.
    if (rune === 'free') damagePlayer(s, RULES.runeFreeHpCost, 'The rune’s hunger', 'player');
    if (rune === 'volatile') damagePlayer(s, RULES.runeVolatileSelfDamage, 'The volatile rune', 'player');
  });
}

/** The spell takes effect: damage, statuses, pushes and hazards on its area, then the Grimoire. */
function resolveSpell(s: GameState, spell: Spell, dir: Dir | null, rune: RuneEffect | null): void {
  const area = spellArea(s, spell, dir, rune);
  const passes = rune === 'echo' ? 2 : 1;
  let hits = 0;
  for (let i = 0; i < passes; i++) {
    if (i === 1) log(s, 'player', 'The spell echoes!');
    hits += applyArea(s, spell, area, rune);
    if (s.phase === 'lost' || s.phase === 'won') return;
  }
  if (spell.kind === 'unstable') {
    s.player.unstableUsed = true;
    s.player.status.burn = RULES.unstableBurn;
    log(s, 'player', `YOU catch fire (Burn ${RULES.unstableBurn}).`);
  }
  if (rune === 'siphon' && hits > 0) {
    const before = s.player.hp;
    s.player.hp = Math.min(s.player.maxHp, before + hits * RULES.runeSiphonHeal);
    log(s, 'player', `The rune drinks from the wounded: HP ${before} → ${s.player.hp}.`);
  }
  recordPage(s, spell);
}

/** Write a spell into the grimoire the first time it's cast. */
function recordPage(s: GameState, spell: Spell): void {
  const id = pageId(spell);
  if (s.grimoire.includes(id)) return;
  s.grimoire = [...s.grimoire, id];
  const title = GRIMOIRE_PAGES.find((p) => p.id === id)?.title ?? id;
  log(s, 'system', `A new page is written into the grimoire: ${title} (${s.grimoire.length}/${GRIMOIRE_PAGES.length}).`);
}

/** One pass of the spell over its area. Returns the number of enemies it affected (for Siphon). */
function applyArea(s: GameState, spell: Spell, area: SpellArea, rune: RuneEffect | null): number {
  const dmg = spellDamage(spell, rune);
  const elements = spellElements(spell);
  const hazard = spell.kind === 'merge' ? mergeHazard(spell.elements) : undefined;
  const push = pushDistance(spell);
  const source = spellName(spell);

  // Damaging spells chip the pillars in (or stopping) their area.
  if (dmg > 0) for (const p of area.pillars) damagePillar(s, p, 1, source, 'player');

  // Units hit, farthest from the caster first (so a line of pushed units slides together).
  const origin = s.player.pos;
  const targets = area.tiles
    .map((t) => ({ t, e: enemyAt(s, t.pos) }))
    .filter((x): x is { t: (typeof area.tiles)[number]; e: Enemy } => !!x.e)
    .sort((a, b) => manhattan(b.t.pos, origin) - manhattan(a.t.pos, origin));
  if (targets.length === 0 && !area.self) log(s, 'player', 'The spell hits no one.');

  let hits = 0;
  for (const { t, e } of targets) {
    if (!s.enemies.includes(e)) continue;
    const immune = immunityReason(s, e, { elements, hazard });
    if (immune) {
      log(s, 'player', `${enemyName(e)} is immune (${immune}).`);
      continue;
    }
    hits++;
    if (dmg > 0 && damageEnemy(s, e, dmg, source)) continue;
    if (spell.kind === 'basic') applyElement(s, e.id, spell, t.push, push);
    // Magma lands under it: it catches fire straight away (house rule, Nov 4), as if it had stepped in.
    if (hazard === 'magma') {
      e.status.burn = RULES.burnTicks;
      log(s, 'player', `${enemyName(e)} is caught in the magma and catches fire (Burn ${RULES.burnTicks}).`);
    }
    if (s.phase === 'lost' || s.phase === 'won') return hits;
  }

  // Backfire: the caster is hit too.
  if (area.self) {
    log(s, 'player', 'The spell backfires onto YOU!');
    if (dmg > 0) damagePlayer(s, dmg, source, 'player');
    if (s.phase === 'lost') return hits;
    if (spell.kind === 'basic') applyElement(s, 'player', spell, area.self.push, push);
    if (hazard === 'magma') {
      s.player.status.burn = RULES.burnTicks;
      log(s, 'player', `YOU catch fire in your own magma (Burn ${RULES.burnTicks}).`);
    }
  }

  const tiles = area.tiles.map((t) => t.pos);
  // A campfire in the area: Water and Earth put it out, Fire lights it again.
  const fire = s.room.feature;
  if (fire?.kind === 'campfire' && [...tiles, ...area.pillars].some((p) => samePos(p, fire.pos))) {
    const effect = campfireEffect(spell);
    const lit = s.room.fireLit !== false;
    if (effect === 'douse' && lit) {
      s.room.fireLit = false;
      log(s, 'player', 'The campfire hisses out.');
    } else if (effect === 'light' && !lit) {
      s.room.fireLit = true;
      log(s, 'player', 'The campfire catches and burns again.');
    }
  }
  if (hazard) {
    // A merge leaves its hazard on every open tile of its shape for 3 turns (one hazard per tile).
    const until = s.turn + RULES.hazardTurns - 1;
    for (const p of tiles) {
      if (isPillar(s, p) || isHole(s, p)) continue;
      s.room.hazards = s.room.hazards.filter((h) => !samePos(h.pos, p));
      s.room.hazards.push({ pos: { ...p }, kind: hazard, until });
      const e = enemyAt(s, p);
      if (hazard === 'quicksand' && e && unitSize(e) !== 'float' && e.status.stuck === 0) {
        e.status.stuck = RULES.quicksandEscape;
        log(s, 'player', `${enemyName(e)} is caught in the quicksand.`);
      }
    }
    const names = { fog: 'Fog rolls over', magma: 'Magma pools on', quicksand: 'Quicksand opens under' };
    log(s, 'player', `${names[hazard]} ${tiles.length} tile${tiles.length === 1 ? '' : 's'} until the end of your turn ${until}.`);
  } else if (spell.kind === 'basic') {
    // Wind blows the fog away; Water cools magma back into floor.
    const clears = spell.element === 'wind' ? 'fog' : spell.element === 'water' ? 'magma' : null;
    const cleared = clears ? tiles.filter((p) => hazardAt(s, p)?.kind === clears) : [];
    for (const p of cleared) removeHazardAt(s, p);
    if (cleared.length) {
      log(s, 'player', `${clears === 'fog' ? 'The wind clears the fog' : 'The water cools the magma'} on ${cleared.map(coordLabel).join(', ')}.`);
    }
  }
  return hits;
}

/** A plain spell's element effect on a unit that survived the hit: Burn, Root, Stun or a push. */
function applyElement(s: GameState, ref: UnitRef, spell: Extract<Spell, { kind: 'basic' }>, pushDir: { x: number; y: number } | null, push: number): void {
  const isPlayer = ref === 'player';
  const status = isPlayer ? s.player.status : s.enemies.find((e) => e.id === ref)?.status;
  if (!status) return;
  const name = isPlayer ? 'YOU' : enemyName(s.enemies.find((e) => e.id === ref)!);
  // On your own turn, "your next turn" means the rest of this one and the next.
  const extra = isPlayer ? 1 : 0;
  switch (spell.element) {
    case 'fire':
      status.burn = RULES.burnTicks;
      log(s, 'player', `${name} ${isPlayer ? 'are' : 'is'} burning (${RULES.burnTicks} turns).`);
      break;
    case 'water':
      status.root = Math.max(status.root, RULES.rootTurns + extra);
      log(s, 'player', `${name} ${isPlayer ? 'are' : 'is'} rooted.`);
      break;
    case 'earth': {
      status.stun = Math.max(status.stun, RULES.stunTurns + extra);
      log(s, 'player', `${name} ${isPlayer ? 'are' : 'is'} stunned.`);
      const e = s.enemies.find((x) => x.id === ref);
      if (e?.markedLine) {
        e.markedLine = null;
        e.markedPillar = null;
        log(s, 'player', `${enemyName(e)}'s marked line is cancelled.`);
      }
      break;
    }
    case 'wind':
      if (pushDir) pushUnit(s, ref, pushDir, push, 'player', 'wind');
      break;
  }
}

/**
 * What a cast will look like, for the spell effects (scene/SpellFx.tsx). Pure: call it on the state *before*
 * casting. Unlike the crafting-table preview, this includes the rune's real effect, since the cast reveals it.
 * Returns null if these cards can't be cast right now.
 */
export interface CastFx {
  /** spell: the spell takes effect. fizzle: a rune on a table that makes nothing, or the Fizzle rune. */
  kind: 'spell' | 'fizzle';
  /** The rune card's symbol, if a rune was cast (whatever it does). */
  runeSymbol: number | null;
  spell: Spell | null;
  rune: RuneEffect | null;
  dir: Dir | null;
  origin: { x: number; y: number };
  /** The real area (Widen, Backfire included); null for a fizzle. */
  area: SpellArea | null;
  /** 2 with Echo. */
  passes: number;
  /** Tiles a Wind spell pushes along, how far. */
  push: number;
  /** Enemies standing in the area as it's cast, and whether the spell can touch them. */
  hits: { id: string; pos: { x: number; y: number }; immune: boolean }[];
}

export function castFx(state: GameState, cardIds: number[], dir: Dir | null, opts: CastOptions = {}): CastFx | null {
  if (castError(state, cardIds, dir)) return null;
  const cards = pickCards(state, cardIds) as Card[];
  const { combo } = planCast(cards);
  const rune = opts.ignoreRune ? null : runeOf(state, combo);
  const origin = { ...state.player.pos };
  const runeSymbol = combo.rune ? combo.rune.rune ?? 0 : null;
  if (combo.kind === 'invalid' || rune === 'fizzle') {
    return { kind: 'fizzle', spell: combo.kind === 'spell' ? combo.spell : null, rune, runeSymbol, dir, origin, area: null, passes: 0, push: 0, hits: [] };
  }
  const spell = combo.spell;
  const area = spellArea(state, spell, dir, rune);
  const elements = spellElements(spell);
  const hazard = spell.kind === 'merge' ? mergeHazard(spell.elements) : undefined;
  const hits = area.tiles.flatMap((t) => {
    const e = enemyAt(state, t.pos);
    return e ? [{ id: e.id, pos: { ...e.pos }, immune: !!immunityReason(state, e, { elements, hazard }) }] : [];
  });
  return { kind: 'spell', spell, rune, runeSymbol, dir, origin, area, passes: rune === 'echo' ? 2 : 1, push: pushDistance(spell), hits };
}

/** Every tile key the spell covers (for previews). */
export function areaKeys(area: SpellArea): Set<string> {
  return new Set(area.tiles.map((t) => posKey(t.pos)));
}
