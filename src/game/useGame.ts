import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, type GameState } from '../engine';
import { DEV_MODE } from '../config/dev';

/**
 * The current run, saved in local storage after every change (the .exe keeps it in the app's data folder),
 * so closing the game and reopening it continues the run.
 *
 * Undo/redo history is kept only in dev mode.
 */
const SAVE_KEY = 'broken-grimoire/run/v2';
const HISTORY_LIMIT = 200;

interface History {
  past: GameState[];
  present: GameState;
  future: GameState[];
}

function isUsableSave(s: unknown): s is GameState {
  const g = s as GameState | null;
  return !!g && !!g.room && !!g.cards && Array.isArray(g.enemies) && typeof g.phase === 'string';
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as unknown;
      if (isUsableSave(saved)) return saved;
    }
  } catch {
    // Storage blocked or corrupt: start a fresh run.
  }
  return createGame(Date.now());
}

export interface GameApi {
  state: GameState;
  error: string | null;
  /** Apply an engine function (one undo step). Rule errors are reported in `error` instead of thrown. */
  run: (fn: (s: GameState) => GameState) => boolean;
  /** Change the state without an undo step (bookkeeping such as dismissing loot). */
  amend: (fn: (s: GameState) => GameState) => void;
  newRun: () => void;
  clearError: () => void;
  /** Dev mode only (no-ops otherwise). */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useGame(): GameApi {
  // The history lives in a ref so `run` can apply an action and report success synchronously;
  // the counter just tells React to re-render.
  const history = useRef<History | null>(null);
  if (!history.current) history.current = { past: [], present: load(), future: [] };
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((h: History) => {
    history.current = h;
    setVersion((v) => v + 1);
  }, []);

  const present = history.current.present;
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(present));
    } catch {
      // Quota exceeded or storage blocked: the run still works, it just won't survive closing the game.
    }
  }, [present]);

  const run = useCallback(
    (fn: (s: GameState) => GameState) => {
      const h = history.current!;
      try {
        const next = fn(h.present);
        commit({ past: DEV_MODE ? [...h.past, h.present].slice(-HISTORY_LIMIT) : [], present: next, future: [] });
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [commit],
  );

  const amend = useCallback(
    (fn: (s: GameState) => GameState) => {
      const h = history.current!;
      commit({ ...h, present: fn(h.present) });
    },
    [commit],
  );

  const undo = useCallback(() => {
    const h = history.current!;
    if (!DEV_MODE || !h.past.length) return;
    commit({ past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] });
    setError(null);
  }, [commit]);

  const redo = useCallback(() => {
    const h = history.current!;
    if (!DEV_MODE || !h.future.length) return;
    commit({ past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) });
    setError(null);
  }, [commit]);

  const newRun = useCallback(() => {
    const h = history.current!;
    commit({ past: DEV_MODE ? [...h.past, h.present].slice(-HISTORY_LIMIT) : [], present: createGame(Date.now()), future: [] });
    setError(null);
  }, [commit]);

  return {
    state: present,
    error,
    run,
    amend,
    newRun,
    clearError: useCallback(() => setError(null), []),
    undo,
    redo,
    canUndo: DEV_MODE && history.current.past.length > 0,
    canRedo: DEV_MODE && history.current.future.length > 0,
  };
}
