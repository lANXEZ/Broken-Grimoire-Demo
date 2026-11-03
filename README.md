# Broken Grimoire Demo

A project for the CSS481 game development course: a tactical spellcaster where you craft spells from fragment
cards on a small grid of rooms. Rules: [GAME_RULES.md](GAME_RULES.md).

The low-fidelity prototype lives at <https://github.com/lANXEZ/CSS481_GameDev_ProjectLowFiDemo>. This repo keeps its
tested rules engine and replaces its interface with a real game presentation:

- **Board:** a 3D isometric board seen from an Into the Breach–style camera.
- **HUD:** Slay the Spire–style hand, piles, mana orb, End Turn, intents and HP plates.
- **Casting:** drag fragments onto the crafting table. Cast lights up only for a castable spell (2–3 fragments,
  enough mana). A castable Beam is aimed straight on the board: click a direction to fire it.

## Tech

| Part | Tool |
|---|---|
| Language | TypeScript |
| Rules | `src/engine/`: pure TypeScript, no UI, unit-tested (vitest) |
| 3D board | Three.js via React Three Fiber + drei, orthographic camera |
| HUD | React + CSS, drawn over the 3D canvas |
| Desktop .exe | Electron, packaged by electron-builder as a portable Windows .exe |

## Running it

```bash
npm install
npm run dev        # play in the browser at http://127.0.0.1:5173 (dev mode: undo + cheats)
npm test           # rules engine tests
npm run electron   # build and open the desktop window
npm run dist       # build the portable Windows .exe into release/BrokenGrimoire-<version>.exe
```

The .exe needs no installer and no internet. The run is saved automatically and continues when the game reopens.

## Controls

| Action | How |
|---|---|
| Move | Click a highlighted tile next to the wizard |
| Craft a spell | Drag fragments from your hand onto the crafting table (or click a card to put it there) |
| Take a card back | Drag it off the table, or click it. Esc clears the whole table |
| Cast | Cross and Unstable Fire: press **Cast** when it lights up. Beam: no button needed. While a castable Beam is on the table, point at the board to aim and left-click to fire (clicking a tile then casts instead of moving) |
| Reroll | Press **Reroll**, click the cards to swap, then **Confirm** |
| Meditate / End turn / Potion | Buttons on the HUD (potion is in the top bar) |
| Skip the enemy turn animation | Space |
| Combat log | L, or the Log button |
| Menu | Esc |
| Dev mode only | Ctrl+Z / Ctrl+Y undo and redo, K kills the enemy under the pointer, plus the DEV toolbar |

## Where to change things

| To change… | Edit |
|---|---|
| Where a HUD piece sits on screen | `src/config/layout.ts`. Every placement is tagged `[UI-PLACEMENT]` in the code, so search for that tag |
| Camera angle, tilt, board size on screen | `src/config/camera.ts` (`elevationDeg` must match the artist's isometric angle, see the note there) |
| Art (cards, units, room art) | `src/config/art.ts`. All placeholders are listed there |
| Animation speeds | `src/config/timing.ts` |
| Balance numbers, enemies, rooms | `src/engine/data.ts` |
| Dev mode on or off | `src/config/dev.ts` (on for `npm run dev`, off in builds) |

## Project layout

```
src/engine/   Rules engine (from the low-fi demo, Board tracker mode removed). No UI. Tests next to it.
src/game/     Glue between engine and UI: save/undo (useGame), enemy turn playback, spell-slot logic (casting.ts)
src/scene/    3D board: camera rig, placeholder board, tile highlights, unit standees with HP plates and intents
src/hud/      Slay the Spire–style HUD: hand, spell slots, controls, top bar, dialogs, styles (hud.css)
src/config/   Layout, camera, art, timing, dev mode: the knobs
electron/     Desktop wrapper for the .exe
public/art/   PLACEHOLDER art cut from the paper print-and-cut kit
```
