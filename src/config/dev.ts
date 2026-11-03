/**
 * Dev mode: on for `npm run dev`, off in the built game and the .exe.
 * To try a built game with the dev tools, build with `VITE_DEV_TOOLS=1`.
 *
 * Dev mode adds the dev toolbar (undo/redo, cheats) and the Ctrl+Z / Ctrl+Y shortcuts.
 */
export const DEV_MODE: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === '1';
