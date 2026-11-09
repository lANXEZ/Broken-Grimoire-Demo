import { cardsLabel, grimoireBroken, newCard, rollDrop } from './cards';
import { ENEMY_DEFS, PROLOGUE_ROOM, RULES, coordLabel } from './data';
import { addPos, enemyAt, hazardAt, inBounds, isHole, isLockedExit, pillarAt, samePos } from './grid';
import { pick } from './rng';
import { RUNE_SYMBOLS, runeName } from './runes';
import { HAZARD_INFO } from './spells';
import type { Card, Element, Enemy, GameState, HazardKind, LogSide, LostReason, Pos, Statuses, UnitSize } from './types';

export class RuleError extends Error {}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function log(state: GameState, side: LogSide, text: string): void {
  state.log.push({ id: state.nextLogId++, roomIndex: state.roomIndex, turn: state.turn, side, text });
}

export const noStatus = (): Statuses => ({ burn: 0, root: 0, stun: 0, stuck: 0 });

export function lose(state: GameState, reason: LostReason, text: string): void {
  if (state.phase === 'lost' || state.phase === 'won') return;
  state.phase = 'lost';
  state.lostReason = reason;
  log(state, 'system', text);
}

/** Lose once the hand, deck and discard can no longer make a spell. */
export function checkGrimoire(state: GameState): void {
  if (grimoireBroken(state.cards)) {
    lose(state, 'grimoire', 'Your grimoire is broken: your hand, deck and discard pile no longer hold an element and a shape. Game over.');
  }
}

/**
 * Every enemy is dead: CLEARED! Turns stop counting, statuses, hazards and Erasure Zones fade, and the mage
 * walks freely to pick up drops before pressing Continue.
 */
export function checkCleared(state: GameState): void {
  if ((state.phase !== 'player' && state.phase !== 'enemy') || state.enemies.length > 0) return;
  // Room 0 has no enemies to clear: it's left by its door.
  if (state.room.id === PROLOGUE_ROOM.id) return;
  state.phase = 'cleared';
  state.player.status = noStatus();
  state.room.hazards = [];
  state.erasureZone = [];
  const items = state.room.drops.length;
  log(state, 'system', `CLEARED! Every enemy is down.${items ? ` ${items} item${items === 1 ? '' : 's'} on the floor.` : ''}`);
}

export function enemyName(e: Enemy): string {
  const def = ENEMY_DEFS[e.kind];
  const element = e.element ? ` (${e.element})` : '';
  return `${def.name}${element} ${e.id}`;
}

export function unitSize(e: Enemy): UnitSize {
  return ENEMY_DEFS[e.kind].size;
}

export function wardsStanding(state: GameState): boolean {
  return state.enemies.some((e) => e.kind === 'ward');
}

/**
 * Why a hit has no effect on this enemy, or null if it can be hurt.
 * `spell` lists the elements of the spell (and its hazard, for merges); null = not a spell (arrows, the
 * Warden's line, collisions), which never hurts a Page Ward.
 */
export function immunityReason(state: GameState, e: Enemy, spell: { elements: Element[]; hazard?: HazardKind } | null): string | null {
  if (e.kind === 'ward') {
    if (!spell) return 'only spells hurt it';
    if (spell.hazard === 'magma') return 'it floats above the magma';
    if (!e.element || !spell.elements.includes(e.element)) return `only spells containing ${e.element} hurt it`;
  }
  if (e.kind === 'redactor' && wardsStanding(state)) return 'protected while a Page Ward stands';
  return null;
}

// ---------------------------------------------------------------------------
// Damage, death and drops
// ---------------------------------------------------------------------------

export function damagePlayer(state: GameState, amount: number, source: string, side: LogSide = 'enemy'): void {
  if (amount <= 0 || state.phase === 'lost' || state.phase === 'won') return;
  const before = state.player.hp;
  state.player.hp = Math.max(0, before - amount);
  log(state, side, `${source} hits YOU for ${amount} (HP ${before} → ${state.player.hp}).`);
  if (state.player.hp <= 0) lose(state, 'hp', 'The mage has fallen. Game over.');
}

/** Deal damage to an enemy, handling death and drops. Returns true if it died. */
export function damageEnemy(state: GameState, e: Enemy, amount: number, source: string, side: LogSide = 'player'): boolean {
  if (amount <= 0 || !state.enemies.includes(e)) return false;
  const before = e.hp;
  e.hp = Math.max(0, e.hp - amount);
  log(state, side, `${source} hits ${enemyName(e)} for ${amount} (HP ${before} → ${e.hp}).`);
  if (e.hp <= 0) {
    killEnemy(state, e);
    return true;
  }
  return false;
}

function addDrop(state: GameState, e: Enemy, cards: Card[], toHand: boolean): void {
  state.room.drops.push({ id: state.nextDropId++, pos: { ...e.pos }, cards, toHand, from: e.kind });
}

/** Give the mage a rune symbol they don't hold yet this run (null if they have them all). */
export function newRuneCard(state: GameState): Card | null {
  const free = RUNE_SYMBOLS.map((_, n) => n).filter((n) => !state.runesFound.includes(n));
  if (free.length === 0) return null;
  const symbol = pick(state, free);
  state.runesFound.push(symbol);
  return newCard(state.cards, 'rune', { rune: symbol });
}

/**
 * Remove a dead enemy. Normal monsters drop a random fragment, the Warden a rune, a Page Scrap the cards it
 * carried; it all lies on the floor until the mage walks over it. `inHole` = it fell in: its loot is lost.
 */
export function killEnemy(state: GameState, e: Enemy, inHole = false): void {
  state.enemies = state.enemies.filter((x) => x.id !== e.id);
  if (inHole) {
    log(state, 'system', `${enemyName(e)} falls into the hole at ${coordLabel(e.pos)}${ENEMY_DEFS[e.kind].drop ? '. Its loot is lost.' : '.'}`);
  } else {
    log(state, 'system', `${enemyName(e)} is defeated at ${coordLabel(e.pos)}.`);
    switch (e.kind) {
      case 'rat':
      case 'archer':
      case 'brute':
      case 'leech': {
        const kind = rollDrop(state, e.kind);
        state.lastDrops = [...state.lastDrops, kind].slice(-2);
        addDrop(state, e, [newCard(state.cards, kind, { loot: e.kind })], false);
        log(state, 'system', `It drops a fragment on ${coordLabel(e.pos)}.`);
        break;
      }
      case 'warden': {
        const rune = newRuneCard(state);
        if (rune) {
          addDrop(state, e, [{ ...rune, loot: 'warden' }], false);
          log(state, 'system', `It drops a rune (${runeName(rune.rune!)}) on ${coordLabel(e.pos)}.`);
        }
        break;
      }
      case 'scrap':
        if (e.carried?.length) {
          addDrop(state, e, e.carried, true);
          log(state, 'system', `It drops what it stole (${cardsLabel(e.carried)}) on ${coordLabel(e.pos)}.`);
        }
        break;
      case 'redactor':
        // In endless mode it's just another monster: the curse holds.
        if (state.endless) {
          log(state, 'system', 'The Redactor falls again. The curse holds.');
          break;
        }
        state.phase = 'won';
        log(state, 'system', 'The Redactor is destroyed. The grimoire is yours. You win the demo!');
        break;
      case 'ward':
        if (!wardsStanding(state)) log(state, 'system', 'All Page Wards have fallen. The Redactor is no longer protected.');
        break;
    }
  }
}

/** The mage picks up everything lying on their tile. */
export function pickUpDrops(state: GameState): void {
  const here = state.room.drops.filter((d) => samePos(d.pos, state.player.pos));
  if (here.length === 0) return;
  state.room.drops = state.room.drops.filter((d) => !here.includes(d));
  for (const d of here) {
    if (d.toHand) state.cards.hand.push(...d.cards);
    else state.cards.discard.push(...d.cards);
    log(state, 'player', `Pick up ${cardsLabel(d.cards)}: ${d.toHand ? 'back into your hand' : 'into your discard pile'}.`);
  }
}

/** A pillar takes damage; at 0 HP it crumbles into open floor. */
export function damagePillar(state: GameState, pos: Pos, amount: number, source: string, side: LogSide): void {
  const pillar = pillarAt(state, pos);
  if (!pillar || amount <= 0) return;
  pillar.hp = Math.max(0, pillar.hp - amount);
  if (pillar.hp === 0) {
    state.room.pillars = state.room.pillars.filter((p) => p !== pillar);
    log(state, side, `${source} breaks the pillar at ${coordLabel(pos)}: it crumbles into open floor.`);
  } else {
    log(state, side, `${source} cracks the pillar at ${coordLabel(pos)} (${pillar.hp}/${RULES.pillarHp}).`);
  }
}

// ---------------------------------------------------------------------------
// Units on the board: the mage and the enemies, for pushes and hazards
// ---------------------------------------------------------------------------

/** The mage ('player') or an enemy (by id). */
export type UnitRef = 'player' | string;

export function unitAlive(state: GameState, ref: UnitRef): boolean {
  if (ref === 'player') return state.phase !== 'lost';
  return state.enemies.some((e) => e.id === ref);
}

function unitInfo(state: GameState, ref: UnitRef): { pos: Pos; status: Statuses; size: UnitSize; name: string; enemy?: Enemy } {
  if (ref === 'player') return { pos: state.player.pos, status: state.player.status, size: 'normal', name: 'YOU' };
  const e = state.enemies.find((x) => x.id === ref)!;
  return { pos: e.pos, status: e.status, size: unitSize(e), name: enemyName(e), enemy: e };
}

function hurtUnit(state: GameState, ref: UnitRef, amount: number, source: string, side: LogSide): void {
  if (ref === 'player') damagePlayer(state, amount, source, side);
  else {
    const e = state.enemies.find((x) => x.id === ref);
    if (e && !immunityReason(state, e, null)) damageEnemy(state, e, amount, source, side);
  }
}

/**
 * A unit arrives on a tile (a step or a push). Magma burns it; Quicksand catches it; the mage picks up drops.
 * Floating units ignore hazards. Returns true if Quicksand caught it.
 */
export function enterTile(state: GameState, ref: UnitRef, side: LogSide): boolean {
  const u = unitInfo(state, ref);
  if (ref === 'player') pickUpDrops(state);
  if (u.size === 'float') return false;
  const h = hazardAt(state, u.pos);
  // An immune unit (the Redactor while a Ward stands) takes no status from the floor either.
  const enemy = ref === 'player' ? null : state.enemies.find((x) => x.id === ref);
  const immune = enemy && (h?.kind === 'magma' || h?.kind === 'quicksand') ? immunityReason(state, enemy, null) : null;
  if (immune) {
    log(state, side, `${u.name} steps onto the ${h!.kind} unharmed (${immune}).`);
    return false;
  }
  if (h?.kind === 'magma') {
    u.status.burn = RULES.burnTicks;
    log(state, side, `${u.name} step${ref === 'player' ? '' : 's'} onto the magma and catch${ref === 'player' ? '' : 'es'} fire (Burn ${RULES.burnTicks}).`);
  }
  if (h?.kind === 'quicksand' && u.status.stuck === 0) {
    u.status.stuck = RULES.quicksandEscape;
    log(state, side, `${u.name} ${ref === 'player' ? 'sink' : 'sinks'} into the quicksand: ${RULES.quicksandEscape} actions to climb out.`);
    return true;
  }
  return false;
}

/**
 * Push a unit `dist` tiles along `dir`. It slides until something stops it:
 * - the room's wall: it takes 1;
 * - a pillar or a unit: it and what it hit each take 1 (immunities apply), and it stays put;
 * - a hole: it falls in and dies (the mage too: game over). A massive unit is too big to fall in: the hole stops
 *   it at its edge like the wall (it takes 1);
 * - Quicksand: it's caught there. Magma burns it on the way.
 * Floating units can't be pushed. Massive units (the Warden, the Redactor) only by Wind (`by`), not by arrows.
 */
export function pushUnit(state: GameState, ref: UnitRef, dir: Pos, dist: number, side: LogSide, by: 'wind' | 'arrow'): void {
  const u = unitInfo(state, ref);
  if (u.size === 'float' || (u.size === 'massive' && by !== 'wind') || dist <= 0) return;
  const dmg = RULES.collisionDamage;
  for (let i = 0; i < dist; i++) {
    if (!unitAlive(state, ref)) return;
    const from = unitInfo(state, ref).pos;
    const to = addPos(from, dir);
    if (!inBounds(state, to)) {
      log(state, side, `${u.name} ${ref === 'player' ? 'are' : 'is'} pushed into the wall.`);
      hurtUnit(state, ref, dmg, 'The collision', side);
      return;
    }
    if (ref === 'player' && isLockedExit(state, to)) {
      // The locked door stops the mage like the room's wall.
      log(state, side, 'YOU are pushed into the locked door.');
      hurtUnit(state, ref, dmg, 'The collision', side);
      return;
    }
    if (pillarAt(state, to)) {
      log(state, side, `${u.name} ${ref === 'player' ? 'are' : 'is'} pushed into the pillar at ${coordLabel(to)}.`);
      hurtUnit(state, ref, dmg, 'The collision', side);
      damagePillar(state, to, dmg, 'The collision', side);
      return;
    }
    if (u.size === 'massive' && isHole(state, to)) {
      log(state, side, `${u.name} is pushed to the edge of the hole at ${coordLabel(to)}, too big to fall in.`);
      hurtUnit(state, ref, dmg, 'The collision', side);
      return;
    }
    const other: UnitRef | null = samePos(state.player.pos, to) ? 'player' : enemyAt(state, to)?.id ?? null;
    if (other) {
      log(state, side, `${u.name} ${ref === 'player' ? 'are' : 'is'} pushed into ${unitInfo(state, other).name}.`);
      hurtUnit(state, ref, dmg, 'The collision', side);
      hurtUnit(state, other, dmg, 'The collision', side);
      return;
    }
    if (ref === 'player') state.player.pos = to;
    else u.enemy!.pos = to;
    log(state, side, `${u.name} ${ref === 'player' ? 'are' : 'is'} pushed ${coordLabel(from)} → ${coordLabel(to)}.`);
    if (u.enemy?.markedLine) {
      // The Warden's line starts where it stood: pushed off that tile, it loses the line (like a Stun).
      u.enemy.markedLine = null;
      u.enemy.markedPillar = null;
      log(state, side, `${u.name} is knocked off its spot: its marked line is cancelled.`);
    }
    if (isHole(state, to)) {
      if (ref === 'player') lose(state, 'hole', 'YOU fall into the hole. Game over.');
      else killEnemy(state, u.enemy!, true);
      return;
    }
    if (enterTile(state, ref, side)) return;
  }
}

/** A Quicksand puddle is gone (escaped or expired): free anyone stuck on it. */
export function removeHazardAt(state: GameState, pos: Pos): void {
  const h = hazardAt(state, pos);
  if (!h) return;
  state.room.hazards = state.room.hazards.filter((x) => x !== h);
  if (h.kind === 'quicksand') {
    if (samePos(state.player.pos, pos)) state.player.status.stuck = 0;
    const e = enemyAt(state, pos);
    if (e) e.status.stuck = 0;
  }
}

export function hazardName(kind: HazardKind): string {
  return HAZARD_INFO[kind].name;
}
