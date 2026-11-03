import { useCallback, useEffect, useMemo, useState } from 'react';
import { planEnemyTurn, type EnemyStep, type GameState } from '../engine';
import { TIMING } from '../config/timing';
import type { GameApi } from './useGame';

export interface EnemyTurnView {
  /** What the board should show: the current enemy step's snapshot, or the real state outside the enemy turn. */
  shown: GameState;
  /** The enemy action being shown, or null. */
  step: EnemyStep | null;
  /** True from the moment the enemy turn starts until it is committed. */
  playing: boolean;
  /** Jump to the end of the enemy turn. */
  skip: () => void;
}

/**
 * Plays the enemy turn out one action at a time. The engine resolves the whole turn up front
 * (`planEnemyTurn`, with a full snapshot after every action); this hook shows the snapshots on a timer and then
 * commits the final state as one step.
 */
export function useEnemyTurn(game: GameApi): EnemyTurnView {
  const { state, run } = game;
  const plan = useMemo(() => (state.phase === 'enemy' ? planEnemyTurn(state) : null), [state]);
  // The index is stored with the plan it belongs to, so a new plan always starts from -1 (the "Enemy turn" pause).
  const [cursor, setCursor] = useState<{ plan: typeof plan; index: number }>({ plan: null, index: -1 });
  const index = cursor.plan === plan ? cursor.index : -1;

  const finish = useCallback(() => {
    if (plan) run(() => plan.final);
  }, [plan, run]);

  useEffect(() => {
    if (!plan) return;
    const next = index + 1;
    const turnLevel = next < plan.steps.length && plan.steps[next].actorId === null;
    const delay = index < 0 ? TIMING.enemyTurnStartDelay : turnLevel ? TIMING.enemyStep / 2 : TIMING.enemyStep;
    const t = window.setTimeout(() => {
      if (next >= plan.steps.length) finish();
      else setCursor({ plan, index: next });
    }, delay);
    return () => window.clearTimeout(t);
  }, [plan, index, finish]);

  const step = plan && index >= 0 ? plan.steps[index] : null;
  return { shown: step ? step.state : state, step, playing: !!plan, skip: finish };
}
