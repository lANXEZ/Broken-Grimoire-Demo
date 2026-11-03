import { coordLabel } from './data';
import { RuleError, cloneState, enemyName, killEnemy, log } from './core';
import { spawnEnemy } from './game';
import { isPillar, isOccupied } from './grid';
import type { Element, Enemy, EnemyKind, GameState, PlayerState, Pos } from './types';

/**
 * Dev-mode tools (cheats for testing): edit units, kill or place enemies. The game itself never calls these;
 * the dev toolbar does (only in `npm run dev` builds), and so do the tests. Every edit is logged.
 */
export function devEdit(state: GameState, note: string, edit: (s: GameState) => void): GameState {
  const s = cloneState(state);
  edit(s);
  log(s, 'dev', `Dev: ${note}`);
  if (s.player.hp <= 0 && s.phase !== 'lost') {
    s.phase = 'lost';
    s.lostReason = 'hp';
    log(s, 'system', 'The wizard has fallen. Game over.');
  }
  return s;
}

function findEnemy(s: GameState, id: string): Enemy {
  const e = s.enemies.find((x) => x.id === id);
  if (!e) throw new RuleError(`No unit ${id} on the board.`);
  return e;
}

export function devPatchEnemy(state: GameState, id: string, patch: Partial<Enemy>, note: string): GameState {
  return devEdit(state, note, (s) => {
    const e = findEnemy(s, id);
    Object.assign(e, structuredClone(patch));
    if (e.hp <= 0) killEnemy(s, e);
  });
}

export function devPatchPlayer(state: GameState, patch: Partial<PlayerState>, note: string): GameState {
  return devEdit(state, note, (s) => Object.assign(s.player, structuredClone(patch)));
}

export function canPlaceAt(state: GameState, pos: Pos): boolean {
  return !isPillar(state, pos) && !isOccupied(state, pos);
}

export function devMoveEnemy(state: GameState, id: string, to: Pos): GameState {
  if (!canPlaceAt(state, to)) throw new RuleError('That tile is taken.');
  const e = findEnemy(state, id);
  return devEdit(state, `moved ${enemyName(e)} ${coordLabel(e.pos)} → ${coordLabel(to)}`, (s) => {
    findEnemy(s, id).pos = { ...to };
  });
}

export function devMovePlayer(state: GameState, to: Pos): GameState {
  if (!canPlaceAt(state, to)) throw new RuleError('That tile is taken.');
  return devEdit(state, `moved YOU ${coordLabel(state.player.pos)} → ${coordLabel(to)}`, (s) => {
    s.player.pos = { ...to };
  });
}

export function devRemoveEnemy(state: GameState, id: string, asKill: boolean): GameState {
  const e = findEnemy(state, id);
  return devEdit(state, `${asKill ? 'killed' : 'removed'} ${enemyName(e)}`, (s) => {
    const target = findEnemy(s, id);
    if (asKill) killEnemy(s, target);
    else s.enemies = s.enemies.filter((x) => x.id !== id);
  });
}

export function devAddEnemy(state: GameState, kind: EnemyKind, pos: Pos, element?: Element): GameState {
  if (!canPlaceAt(state, pos)) throw new RuleError('That tile is taken.');
  let label = '';
  const s = devEdit(state, '', (draft) => {
    label = enemyName(spawnEnemy(draft, kind, pos, element));
  });
  s.log[s.log.length - 1].text = `Dev: placed ${label} on ${coordLabel(pos)}`;
  return s;
}
