import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, restartStage, type GameState } from '../engine';
import { runeMap } from './runeMap';
import { isDevMode, useDevMode } from '../config/dev';

/**
 * The current run, saved in local storage after every change (the .exe keeps it in the app's data folder),
 * so closing the game and reopening it continues the run.
 *
 * Three things outlive a run and are saved on their own:
 * - the rune mapping (which rune card does what) and the rune alphabet (the symbol for each letter): made once, on
 *   first launch, and the same for every run on this computer so the player's notes keep working (game/runeMap.ts);
 * - the Grimoire's pages: every spell ever cast on this computer;
 * - the "Hmmm..." note: every exact card combination ever cast on this computer.
 * (The player's own rune notes are saved separately, in game/runeNotes.ts.)
 *
 * Undo/redo history is kept only while dev mode is on (switched in the Menu); turning it off drops the history.
 */
const SAVE_KEY = 'broken-grimoire/run/v3';
const GRIMOIRE_KEY = 'broken-grimoire/grimoire/v1';
const COMBOS_KEY = 'broken-grimoire/combos/v1';

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

/** Grimoire pages written on this computer, in any run. */
function savedPages(): string[] {
  const saved = readJson(GRIMOIRE_KEY);
  return Array.isArray(saved) ? saved.filter((p): p is string => typeof p === 'string') : [];
}

/** Card combinations in the "Hmmm..." note, from any run on this computer. */
function savedCombos(): string[] {
  const saved = readJson(COMBOS_KEY);
  return Array.isArray(saved) ? saved.filter((p): p is string => typeof p === 'string') : [];
}

function newGame(): GameState {
  return createGame(Date.now(), { runeMap: runeMap(), grimoire: savedPages(), combos: savedCombos(), prologue: true });
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
  // Saves from before the "Hmmm..." note existed get this computer's note.
  if (isUsableSave(saved)) {
    const s: GameState = { ...saved, runeMap: runeMap(), combos: Array.isArray(saved.combos) ? saved.combos : savedCombos(), event: saved.event ?? null };
    // Saved at the lectern or the camp before they had rooms of their own: start that stop again.
    return (s.phase === 'event' || s.phase === 'camp') && (!s.event || !s.room.feature) ? restartStage(s) : s;
  }
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
  /** The game opened on a saved run that can be continued. */
  resumable: boolean;
  /**
   * Dev: forget every Grimoire page and every "Hmmm..." line, in this run and on the computer. Rune meanings and
   * the player's rune notes are kept. Clears the undo history (old states would bring the pages back).
   */
  forgetKnowledge: () => void;
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
  // Whether the game opened on a run saved last time that can still be played (the title screen offers Continue).
  const resumable = useRef<boolean | null>(null);
  if (!history.current) {
    const present = load();
    history.current = { past: [], present, future: [] };
    resumable.current = readJson(SAVE_KEY) !== null && present.phase !== 'won' && present.phase !== 'lost';
  }
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dev = useDevMode();

  const commit = useCallback((h: History) => {
    history.current = h;
    setVersion((v) => v + 1);
  }, []);

  // Dev mode switched off: forget the undo history.
  useEffect(() => {
    const h = history.current!;
    if (!dev && (h.past.length || h.future.length)) commit({ past: [], present: h.present, future: [] });
  }, [dev, commit]);

  const present = history.current.present;
  useEffect(() => writeJson(SAVE_KEY, present), [present]);
  // New Grimoire pages are kept for good (undoing a cast in dev mode doesn't unwrite them).
  useEffect(() => {
    const known = savedPages();
    if (present.grimoire.some((p) => !known.includes(p))) writeJson(GRIMOIRE_KEY, [...new Set([...known, ...present.grimoire])]);
  }, [present.grimoire]);
  // Same for the "Hmmm..." note.
  useEffect(() => {
    const known = savedCombos();
    if (present.combos.some((c) => !known.includes(c))) writeJson(COMBOS_KEY, [...new Set([...known, ...present.combos])]);
  }, [present.combos]);

  const run = useCallback(
    (fn: (s: GameState) => GameState) => {
      const h = history.current!;
      try {
        const next = fn(h.present);
        commit({ past: isDevMode() ? [...h.past, h.present].slice(-HISTORY_LIMIT) : [], present: next, future: [] });
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
    if (!isDevMode() || !h.past.length) return;
    commit({ past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] });
    setError(null);
  }, [commit]);

  const redo = useCallback(() => {
    const h = history.current!;
    if (!isDevMode() || !h.future.length) return;
    commit({ past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) });
    setError(null);
  }, [commit]);

  const newRun = useCallback(() => {
    const h = history.current!;
    commit({ past: isDevMode() ? [...h.past, h.present].slice(-HISTORY_LIMIT) : [], present: newGame(), future: [] });
    setError(null);
  }, [commit]);

  const forgetKnowledge = useCallback(() => {
    writeJson(GRIMOIRE_KEY, []);
    writeJson(COMBOS_KEY, []);
    commit({ past: [], present: { ...history.current!.present, grimoire: [], combos: [] }, future: [] });
  }, [commit]);

  return {
    state: present,
    forgetKnowledge,
    error,
    run,
    amend,
    newRun,
    clearError: useCallback(() => setError(null), []),
    undo,
    redo,
    canUndo: dev && history.current.past.length > 0,
    canRedo: dev && history.current.future.length > 0,
    resumable: !!resumable.current,
  };
}
