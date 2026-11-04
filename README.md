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
- **The run:** title screen → room 0 (wake up, try spells freely) → Cistern → Whispering Lectern (event) →
  Scriptorium → Camp → the Redactor. The branching map screen
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
Four things are kept per computer and survive a new run: what each rune symbol does (shuffled once, on first launch,
so the player's notes keep working), the player's own rune notes, the Grimoire's pages, and the "Hmmm..." note's
card combinations.

## Controls

| Action | How |
|---|---|
| Start | Title screen: **Start** (or **Continue** / **New game** when a run is saved) |
| Room 0 | Click any tile to walk there, click the big door to start the run. Spells are free to try: mana and actions never run out, Reroll works, and Water or Earth puts the campfire out (Fire lights it again) |
| Move | Click a highlighted tile next to the wizard |
| Craft a spell | Drag fragments from your hand onto the crafting table: they stay wherever you drop them (clicking a card drops it at a random spot). Drag a table card to move it |
| Take a card back | Drag it off the table, or click it. Esc clears the whole table |
| Cast | Cross-shaped spells and Unstable Fire: press **Cast** when it lights up. Beam- and Wall-shaped spells (merges included): no button needed. While one is castable, point at the board to aim (the aimed direction glows brightest) and left-click to fire (clicking a tile then casts instead of moving) |
| Reroll | Press **Reroll**, click the cards to swap, then **Confirm** |
| Meditate / End turn | Buttons on the HUD |
| Climb out of quicksand | While you're stuck, a big **Climb out** button takes the crafting table's place (1 action per click, 2 in all) |
| Pick up a drop | Walk onto it. What you got is shown, then it flies into your discard pile (a Page Scrap's stolen cards go back to your hand) |
| Leave the Cistern early | Its door is open the whole time: step onto it and confirm **Leave now** (enemies still alive keep their drops). Click your own tile to be asked again |
| The Whispering Lectern and the Camp | Each is its own little room: the wizard walks up to the lectern / campfire by themselves, you choose in the panel at the bottom, then they walk out. You can't walk around in them yourself |
| After CLEARED! | The door opens. Click any tile to walk there and pick up drops, then **Continue** (or click the door): the wizard walks to the door and on to the next stop |
| Grimoire | The book button in the top bar |
| "Hmmm..." (spell note, left side) | Every card combination you've cast. Top: what your hand can make now. Hover a line to see its cards rise in your hand; click it to put them on the crafting table. Cards on the table filter the note |
| Deck | The **Deck** button in the top bar, or D: every card you own |
| Note what a rune does | Click the pencil in the thought bubble over any rune card (hand, crafting table or Deck view). Enter saves, Esc cancels |
| Peek behind a pillar | Move the mouse near it: obstacles fade near the mouse (and whenever a unit is behind them) |
| Skip the enemy turn animation, or a rune cast's two-part animation | Space (a click also skips a rune cast) |
| Combat log | L, or the Log button |
| Menu | Esc |
| Dev mode on / off | Menu (Esc or ⚙) → Settings → **Dev mode** switch. Saved on the computer |
| Dev mode only | Ctrl+Z / Ctrl+Y undo and redo, K kills the enemy under the pointer, plus the DEV toolbar (Clear room, Next room, …, and **Forget everything**: wipes the Grimoire and the "Hmmm..." note, on the computer too; click twice to confirm. Rune notes stay) |

## Where to change things

| To change… | Edit |
|---|---|
| Where a HUD piece sits on screen | `src/config/layout.ts`. Every placement is tagged `[UI-PLACEMENT]` in the code, so search for that tag |
| Camera angle, tilt, board size on screen | `src/config/camera.ts` (`elevationDeg` must match the artist's isometric angle, see the note there) |
| How obstacles fade (unit behind them, mouse nearby) | `OBSTACLE_FADE` in `src/config/camera.ts`. New obstacle types go inside `<Obstacle>` (`src/scene/Obstacle.tsx`) to get the same behaviour |
| Art (cards, units, room art) | `src/config/art.ts`. All placeholders are listed there. The title screen's photo is "Full moon behind tree silhouettes" by Aron Visuals (Unsplash, free under the Unsplash License), in `public/art/title/` |
| Room 0's layout and the wizard's waking thought | `PROLOGUE_ROOM` in `src/engine/data.ts` |
| Animation speeds | `src/config/timing.ts` |
| Spell effects (timing, size, colours, camera shake on/off) | `src/config/fx.ts`; the effects themselves are in `src/scene/SpellFx.tsx` |
| Balance numbers, enemies, rooms, the run order | `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`, `RUN`) |
| Rune symbols and their made-up names | `src/engine/runes.ts` |
| The "Hmmm..." note | Logic in `src/game/notes.ts`, panel in `src/hud/HmmmNote.tsx`, position `LAYOUT.hmmm`. The thought-cloud look (and the rune bubbles) is `src/hud/Thought.tsx` plus the "wizard's thoughts" styles in `hud.css` |
| Card art for kinds without art yet (Wind, Wall, runes) | Wind and Wall are drawn in the kit's card layout in `src/hud/KitCard.tsx` (text, pictures, colours); runes are plain cards in `FragmentCard` (`src/hud/Hand.tsx`). To use real art instead, add the kind to `CARD_IMAGE` in `src/config/art.ts` |
| Dev mode on or off | In the game: the **Dev mode** switch in the Menu. Its starting value before anyone flips it (on for `npm run dev`, off in builds) is in `src/config/dev.ts` |

## Project layout

```
src/engine/   Rules engine. No UI. Tests next to it (testkit.ts builds custom boards for them).
              game.ts turns and the run · cast.ts casting · spells.ts areas · enemies.ts monster AI
              core.ts damage, pushes, drops · cards.ts deck and drop rolls · runes.ts · grid.ts pathing
src/game/     Glue between engine and UI: saves and undo (useGame), enemy turn playback, crafting table (casting.ts),
              the "Hmmm..." note (notes.ts), rune notes (runeNotes.ts)
src/scene/    3D board: camera rig, placeholder board, hazards and drops, tile highlights, spell effects (SpellFx),
              unit standees with HP plates and intents
src/hud/      Slay the Spire–style HUD: hand, crafting table, controls, top bar, "Hmmm..." note, thought bubbles,
              dialogs (CLEARED!, event, camp, Grimoire, Deck), styles (hud.css)
src/config/   Layout, camera, art, timing, spell effects, dev mode: the knobs
electron/     Desktop wrapper for the .exe
public/art/   PLACEHOLDER art cut from the paper print-and-cut kit
```
