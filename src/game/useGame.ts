import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, isRuneMap, randomRuneMap, type GameState, type RuneEffect } from '../engine';
import { DEV_MODE } from '../config/dev';

/**
 * The current run, saved in local storage after every change (the .exe keeps it in the app's data folder),
 * so closing the game and reopening it continues the run.
 *
 * Two things outlive a run and are saved on their own:
 * - the rune mapping (which symbol does what): made once, on first launch, and the same for every run on this
 *   computer so the player's notes keep working;
 * - the Grimoire's pages: every spell ever cast on this computer.
 *
 * Undo/redo history is kept only in dev mode.
 */
const SAVE_KEY = 'broken-grimoire/run/v3';
const RUNES_KEY = 'broken-grimoire/runes/v1';
const GRIMOIRE_KEY = 'broken-grimoire/grimoire/v1';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the game still works, it just won't remember this.
  }
}

/** This computer's rune mapping, made (and saved) on first launch. */
function runeMap(): RuneEffect[] {
  const saved = readJson(RUNES_KEY);
  if (isRuneMap(saved)) return saved;
  const map = randomRuneMap(Math.random);
  writeJson(RUNES_KEY, map);
  return map;
}

/** Grimoire pages written on this computer, in any run. */
function savedPages(): string[] {
  const saved = readJson(GRIMOIRE_KEY);
  return Array.isArray(saved) ? saved.filter((p): p is string => typeof p === 'string') : [];
}

function newGame(): GameState {
  return createGame(Date.now(), { runeMap: runeMap(), grimoire: savedPages() });
}
const HISTORY_LIMIT = 200;

interface History {
  past: GameState[];
  present: GameState;
  future: GameState[];
}

function isUsableSave(s: unknown): s is GameState {
  const g = s as GameState | null;
  return !!g && !!g.room && !!g.cards && Array.isArray(g.enemies) && typeof g.phase === 'string' && Array.isArray(g.grimoire);
}

function load(): GameState {
  const saved = readJson(SAVE_KEY);
  // A run always uses this computer's rune mapping, even one saved before the mapping existed.
  if (isUsableSave(saved)) return { ...saved, runeMap: runeMap() };
  return newGame();
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
  useEffect(() => writeJson(SAVE_KEY, present), [present]);
  // New Grimoire pages are kept for good (undoing a cast in dev mode doesn't unwrite them).
  useEffect(() => {
    const known = savedPages();
    if (present.grimoire.some((p) => !known.includes(p))) writeJson(GRIMOIRE_KEY, [...new Set([...known, ...present.grimoire])]);
  }, [present.grimoire]);

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
    commit({ past: DEV_MODE ? [...h.past, h.present].slice(-HISTORY_LIMIT) : [], present: newGame(), future: [] });
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
