import { useSyncExternalStore } from 'react';

/**
 * The player's own notes on runes ("Hmm, what is it?" → "+2 dmg?"), one per rune symbol. A rune's meaning is fixed
 * per computer (engine/runes.ts), so its note is too: every card with that symbol shares it, in every run. Saved in
 * local storage (the .exe keeps it in the app's data folder). The game itself never reads these.
 */
const KEY = 'broken-grimoire/rune-notes/v1';
export const RUNE_NOTE_MAX = 80;

type Notes = Record<number, string>;

function read(): Notes {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Notes = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' && v.trim()) out[Number(k)] = v;
    return out;
  } catch {
    return {};
  }
}

let notes: Notes = read();
const listeners = new Set<() => void>();

export function setRuneNote(symbol: number, text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, RUNE_NOTE_MAX);
  const next = { ...notes };
  if (clean) next[symbol] = clean;
  else delete next[symbol];
  notes = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked or full: the note lasts until the game closes.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The player's note on this rune symbol ('' = none yet). Re-renders when any note changes. */
export function useRuneNote(symbol: number): string {
  return useSyncExternalStore(subscribe, () => notes[symbol] ?? '');
}
