import { useSyncExternalStore } from 'react';

/**
 * Dev mode: the dev toolbar (cheats like Clear room, Next stop), undo/redo with Ctrl+Z / Ctrl+Y, and K to kill the
 * enemy under the pointer.
 *
 * It's switched on and off in the game's Menu (⚙, "Dev mode"), and the choice is saved on the computer. Until
 * someone flips the switch it starts on for `npm run dev` and off in the built game and the .exe (build with
 * `VITE_DEV_TOOLS=1` to start a build with it on).
 */
export const DEV_MODE_DEFAULT: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === '1';

const KEY = 'broken-grimoire/dev-mode/v1';

function load(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? DEV_MODE_DEFAULT : saved === '1';
  } catch {
    return DEV_MODE_DEFAULT;
  }
}

let devMode = load();
const listeners = new Set<() => void>();

/** Dev mode right now (for code outside React components, e.g. inside callbacks). */
export function isDevMode(): boolean {
  return devMode;
}

export function setDevMode(on: boolean): void {
  devMode = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the switch lasts until the game closes.
  }
  listeners.forEach((l) => l());
}

/** Dev mode, re-rendering the component when it's switched. */
export function useDevMode(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => devMode,
  );
}
