/**
 * Everything the game saves on this computer lives in local storage under this prefix: the run, the Grimoire, the
 * "Hmmm..." note, rune notes, the rune mapping and alphabet, whether the opening cutscene has played, and the dev mode
 * switch.
 */
const PREFIX = 'broken-grimoire/';
/** Kept by a new account: the dev mode switch (so the dev toolbar is still there afterwards). */
const KEEP = ['broken-grimoire/dev-mode/v1'];

/**
 * Dev: start over as a brand-new player on this computer. Wipes every saved thing but the dev mode switch, then
 * reloads: the title screen offers only Start, the opening cutscene plays again, and the computer gets a new rune
 * mapping and alphabet.
 */
export function newAccount(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !KEEP.includes(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage blocked: nothing was saved anyway.
  }
  window.location.reload();
}
