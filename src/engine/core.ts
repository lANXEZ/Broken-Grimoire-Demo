import { LOOT_FRAGMENT, cardsLabel, fragmentName, grimoireBroken, newLootCard } from './cards';
import { ENEMY_DEFS, coordLabel } from './data';
import { samePos } from './grid';
import type { Enemy, GameState, LogSide, LootNotice } from './types';

type LootNoticeCards = Pick<LootNotice, 'discardCards' | 'handCards'>;

export class RuleError extends Error {}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function log(state: GameState, side: LogSide, text: string): void {
  state.log.push({ id: state.nextLogId++, roomIndex: state.roomIndex, turn: state.turn, side, text });
}

function lose(state: GameState, reason: 'hp' | 'grimoire', text: string): void {
  state.phase = 'lost';
  state.lostReason = reason;
  log(state, 'system', text);
}

/** Lose once the hand, deck and discard can no longer make a spell (kit p.2). */
export function checkGrimoire(state: GameState): void {
  if (state.phase === 'lost' || state.phase === 'won') return;
  if (grimoireBroken(state.cards)) {
    lose(state, 'grimoire', 'Your grimoire is broken: your hand, deck and discard pile no longer hold an element and a shape. Game over.');
  }
}

export function enemyName(e: Enemy): string {
  const def = ENEMY_DEFS[e.kind];
  const element = e.element ? ` (${e.element})` : '';
  return `${def.name}${element} ${e.id}`;
}

export function wardsStanding(state: GameState): boolean {
  return state.enemies.some((e) => e.kind === 'ward');
}

/**
 * Why an attack has no effect on this enemy, or null if it can be hurt. `element` is the spell's element,
 * or null for anything that isn't a spell (an Archer's arrow), which never hurts a Page Ward.
 */
export function immunityReason(state: GameState, e: Enemy, element: string | null): string | null {
  if (e.kind === 'ward' && element !== e.element) return `only ${e.element} spells hurt it`;
  if (e.kind === 'redactor' && wardsStanding(state)) return 'protected while a Page Ward stands';
  return null;
}

export function damagePlayer(state: GameState, amount: number, source: string): void {
  if (amount <= 0) return;
  const before = state.player.hp;
  state.player.hp = Math.max(0, before - amount);
  log(state, 'enemy', `${source} hits YOU for ${amount} (HP ${before} → ${state.player.hp}).`);
  if (state.player.hp <= 0) lose(state, 'hp', 'The wizard has fallen. Game over.');
}

/** Deal damage to an enemy, handling death, drops and room-key effects. Returns true if it died. */
export function damageEnemy(state: GameState, e: Enemy, amount: number, source: string, side: LogSide = 'player'): boolean {
  if (amount <= 0) return false;
  const before = e.hp;
  e.hp = Math.max(0, e.hp - amount);
  log(state, side, `${source} hits ${enemyName(e)} for ${amount} (HP ${before} → ${e.hp}).`);
  if (e.hp <= 0) {
    killEnemy(state, e);
    return true;
  }
  return false;
}

export function killEnemy(state: GameState, e: Enemy): void {
  state.enemies = state.enemies.filter((x) => x.id !== e.id);
  const where = `${enemyName(e)} is defeated at ${coordLabel(e.pos)}`;
  log(state, 'system', `${where}.`);

  const notice = (discard: string[], extras: string[] = [], toHand: string[] = [], cards: Partial<LootNoticeCards> = {}) =>
    state.pendingLoot.push({ enemyId: e.id, enemyKind: e.kind, enemyName: enemyName(e), discard, toHand, extras, ...cards });

  switch (e.kind) {
    case 'rat':
    case 'archer':
    case 'brute':
    case 'leech': {
      const card = ENEMY_DEFS[e.kind].drop!;
      const loot = newLootCard(state.cards, LOOT_FRAGMENT[e.kind]!, e.kind);
      state.cards.discard.push(loot);
      log(state, 'system', `Loot: a ${fragmentName(loot.kind)} fragment goes into your discard pile.`);
      notice([card], [], [], { discardCards: [loot] });
      break;
    }
    case 'warden': {
      state.player.potions += 1;
      log(state, 'system', 'Loot: the Warden drops the Max Potion. You keep it for later.');
      const extras = ['You keep the Max Potion with you, outside the deck. Drinking it costs 1 action and restores full HP.'];
      if (state.room.exit?.locked) {
        state.room.exit.locked = false;
        log(state, 'system', 'The exit is now unlocked.');
        extras.push('The exit is now unlocked.');
      }
      notice([], extras);
      break;
    }
    case 'scrap':
      if (e.carried?.length) {
        const back = e.carried;
        state.cards.hand.push(...back);
        log(state, 'system', `The scrap drops what it stole: ${cardsLabel(back)} ${back.length === 1 ? 'goes' : 'go'} back into your hand.`);
        notice([], [], [`${back.length === 1 ? 'The fragment' : `The ${back.length} fragments`} it stole`], { handCards: back });
      }
      break;
    case 'redactor':
      state.phase = 'won';
      log(state, 'system', 'The Redactor is destroyed. The grimoire is yours. You win the demo!');
      break;
    case 'ward':
      if (!wardsStanding(state)) {
        log(state, 'system', 'All Page Wards have fallen. The Redactor is no longer protected.');
      }
      break;
  }
}

/** The player dismissed the loot popup: clear the queue. */
export function acknowledgeLoot(state: GameState): GameState {
  return { ...state, pendingLoot: [] };
}

/** Burn tick that happens right before a unit takes an action. Returns true if the unit died from it. */
export function burnTickEnemy(state: GameState, e: Enemy): boolean {
  if (e.status.burn <= 0) return false;
  e.status.burn -= 1;
  return damageEnemy(state, e, 1, 'Burn', 'enemy');
}

export function burnTickPlayer(state: GameState): void {
  if (state.player.status.burn <= 0) return;
  state.player.status.burn -= 1;
  const before = state.player.hp;
  state.player.hp = Math.max(0, before - 1);
  log(state, 'player', `Burn hurts YOU for 1 (HP ${before} → ${state.player.hp}).`);
  if (state.player.hp <= 0) lose(state, 'hp', 'The wizard has fallen. Game over.');
}

export function playerOnExit(state: GameState): boolean {
  return !!state.room.exit && samePos(state.room.exit.pos, state.player.pos);
}
