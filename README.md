# Broken Grimoire Demo

A project for the CSS481 game development course: a tactical spellcaster where you craft spells from fragment
cards on a small grid of rooms. Rules: [GAME_RULES.md](GAME_RULES.md).

The low-fidelity prototype lives at <https://github.com/lANXEZ/CSS481_GameDev_ProjectLowFiDemo>. This repo started
from its rules engine, which now runs the team's packaged-demo design ([DESIGN.md](DESIGN.md), with the details
settled in GAME_RULES.md's *Build decisions*), and gives it a real game presentation:

- **Board:** a 3D isometric board seen from an Into the Breach–style camera, with holes, breakable pillars, merge
  hazards (Fog, Magma, Quicksand) and loot lying on the floor.
- **HUD:** Slay the Spire–style hand, piles, mana orb, End Turn, intents and HP plates.
- **Casting:** drag fragments onto the crafting table. Cast lights up only for a castable spell (2–3 cards, enough
  mana), or whenever a rune is on the table. Beams and Walls are aimed straight on the board: click a direction to
  fire. Every cast plays an effect over exactly the tiles it hit.
- **The run:** Cistern → Whispering Lectern (event) → Scriptorium → Camp → the Redactor. The branching map screen
  is still to come (a teammate is building it).

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
Two things are kept per computer and survive a new run: what each rune symbol does (shuffled once, on first launch,
so the player's notes keep working) and the Grimoire's pages.

## Controls

| Action | How |
|---|---|
| Move | Click a highlighted tile next to the wizard |
| Craft a spell | Drag fragments from your hand onto the crafting table: they stay wherever you drop them (clicking a card drops it at a random spot). Drag a table card to move it |
| Take a card back | Drag it off the table, or click it. Esc clears the whole table |
| Cast | Cross-shaped spells and Unstable Fire: press **Cast** when it lights up. Beam- and Wall-shaped spells (merges included): no button needed. While one is castable, point at the board to aim (the aimed direction glows brightest) and left-click to fire (clicking a tile then casts instead of moving) |
| Reroll | Press **Reroll**, click the cards to swap, then **Confirm** |
| Meditate / End turn | Buttons on the HUD |
| Climb out of quicksand | While you're stuck, a big **Climb out** button takes the crafting table's place (1 action per click, 2 in all) |
| Pick up a drop | Walk onto it. What you got is shown, then it flies into your discard pile (a Page Scrap's stolen cards go back to your hand) |
| Leave the Cistern early | Its door is open the whole time: step onto it and confirm **Leave now** (enemies still alive keep their drops). Click your own tile to be asked again |
| After CLEARED! | The door opens. Click any tile to walk there and pick up drops, then **Continue** (or click the door): the wizard walks to the door and on to the next stop |
| Grimoire | The book button in the top bar |
| Peek behind a pillar | Move the mouse near it: obstacles fade near the mouse (and whenever a unit is behind them) |
| Skip the enemy turn animation | Space |
| Combat log | L, or the Log button |
| Menu | Esc |
| Dev mode only | Ctrl+Z / Ctrl+Y undo and redo, K kills the enemy under the pointer, plus the DEV toolbar (Clear room, Next room, …) |

## Where to change things

| To change… | Edit |
|---|---|
| Where a HUD piece sits on screen | `src/config/layout.ts`. Every placement is tagged `[UI-PLACEMENT]` in the code, so search for that tag |
| Camera angle, tilt, board size on screen | `src/config/camera.ts` (`elevationDeg` must match the artist's isometric angle, see the note there) |
| How obstacles fade (unit behind them, mouse nearby) | `OBSTACLE_FADE` in `src/config/camera.ts`. New obstacle types go inside `<Obstacle>` (`src/scene/Obstacle.tsx`) to get the same behaviour |
| Art (cards, units, room art) | `src/config/art.ts`. All placeholders are listed there |
| Animation speeds | `src/config/timing.ts` |
| Spell effects (timing, size, colours, camera shake on/off) | `src/config/fx.ts`; the effects themselves are in `src/scene/SpellFx.tsx` |
| Balance numbers, enemies, rooms, the run order | `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`, `RUN`) |
| Rune symbols and their made-up names | `src/engine/runes.ts` |
| Card art for kinds without art yet (Wind, Wall, runes) | They're drawn in CSS: `FragmentCard` in `src/hud/Hand.tsx`, colours in `src/config/art.ts` |
| Dev mode on or off | `src/config/dev.ts` (on for `npm run dev`, off in builds) |

## Project layout

```
src/engine/   Rules engine. No UI. Tests next to it (testkit.ts builds custom boards for them).
              game.ts turns and the run · cast.ts casting · spells.ts areas · enemies.ts monster AI
              core.ts damage, pushes, drops · cards.ts deck and drop rolls · runes.ts · grid.ts pathing
src/game/     Glue between engine and UI: saves and undo (useGame), enemy turn playback, crafting table (casting.ts)
src/scene/    3D board: camera rig, placeholder board, hazards and drops, tile highlights, spell effects (SpellFx),
              unit standees with HP plates and intents
src/hud/      Slay the Spire–style HUD: hand, crafting table, controls, top bar, dialogs (CLEARED!, event, camp,
              Grimoire), styles (hud.css)
src/config/   Layout, camera, art, timing, spell effects, dev mode: the knobs
electron/     Desktop wrapper for the .exe
public/art/   PLACEHOLDER art cut from the paper print-and-cut kit
```
