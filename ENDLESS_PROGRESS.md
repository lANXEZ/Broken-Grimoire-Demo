# Endless mode: plan and progress

Working notes for the "Demo's Endless Curse" (branch `endless-mode`, made from `map-choice-fix`). If work stops
part-way, this file says what's done and what's next. Tick boxes as steps land; add a line under **Log** each
session.

## How it plays

1. Killing the Redactor shows **Victory** as now, but its button says **Continue** (with a smaller **New run**).
2. **The curse:** the screen darkens to purple, the mage glows purple, and purple glitchy text types out:
   "There is no more content in this demo. NOW GO SUFFER THE DEMO'S ENDLESS CURSE (PCG applied)."
   A purple flash teleports the mage to endless room 1. Space or a click skips once the text has finished.
3. **Entering endless:** HP restored to full. Deck, Grimoire, notes and rune meanings carry over.
4. **Fight room**, generated from the current hardness. No door, no map. Kill every monster, CLEARED! shows, walk
   around to pick up drops, then the Continue button reads **"Next: Camp"** and fades you to the camp.
5. **Camp:** Rest (heal 70% of missing HP, rounded up) or Tear out 4 pages (pick 4 fragments to remove for good;
   fewer if 4 can't be spared without breaking the grimoire). Then **"Next room"**; hardness +3.
6. **Death:** "The curse claims you. Rooms cleared: N (best: M)", then the usual rune message and room 0.

## Settings (one `ENDLESS` block next to `RULES` in engine/data.ts)

| Setting | Value |
|---|---|
| Costs | Hole 1, Leech 2, Rat 2, Brute 4, Archer 4, Warden 7, Redactor + 3 Wards 20, pillars 0 |
| Hardness | Starts at 12, +3 per room cleared |
| Unlocks | Archers from 12; Warden from 15 (max 1 until 25); Redactor team from 24 (max 1 per room) |
| Room size | 6x6 up to 17, 7x7 up to 26, 8x8 after |
| Holes | ~20% of the budget, at least 1, at most 5 |
| Monster limit | 7 on 6x6, 9 on 7x7, 12 on 8x8 |
| Pillars | 2-4, more in bigger rooms |
| Start safety | No monster within 2 tiles of the mage, no hole next to the mage |

Generator rules: holes first (up to the cap), then weighted-random monsters favouring kinds not yet in the room
(prefer expensive ones near the monster limit), a leftover 1 becomes a hole, so the total always equals the
hardness exactly. Holes never cut off part of the floor (loot must be reachable). Enemies need NOT be reachable on
foot (spells and breaking pillars handle that). Wards are fire, water, earth (the 3 ward drawings). Same seed +
hardness = same room.

## Steps

- [x] 1. Generator: `src/engine/generate.ts` (`generateRoom(seed, hardness)` -> RoomDef), `ENDLESS` settings, tests
- [ ] 2. Engine flow: `endless: { seed, hardness, cleared } | null` on GameState; `enterEndless`; Continue alternates
      fight <-> camp; Redactor kill in endless is a normal kill; endless camp choices (70% rest, tear 4); saving
- [ ] 3. Screens: top bar (Endless · Room N · Hardness H · Seed XXXX), clear panel labels with no door walk, camp
      panel (70% rest + pick-4 picker), death screen with best score (`broken-grimoire/endless-best/v1`)
- [ ] 4. The curse transition: `src/hud/EndlessCurse.tsx`, timings in `config/timing.ts`, Victory -> Continue
- [ ] 5. Dev: Endless button (anywhere), in endless Reroll and Hardness -3/+3; scripted playthrough; docs
      (GAME_RULES.md "Endless mode", README.md tuning + dev buttons)

## Risks to check

- 7x7 rooms: no hand-made room is 7x7; check the camera and walls fit.
- The Redactor in a random room: its fight assumes the boss room's layout.
- Balance: costs are a first guess; all in one settings block.

## Decisions (Nov 9, before the user went to sleep)

- Commit AND push `endless-mode` after each finished step. Never merge into main.
- Curse text: "There is no more content in this demo. NOW GO SUFFER THE DEMO'S ENDLESS CURSE (PCG applied)."
- Camp "Tear out pages": the player picks UP TO 4 (1 to 4), then confirms.
- Don't restore the deleted remote `map-choice-fix`: its commit is inside `endless-mode`.
- Victory shows first (not evil), then Continue starts the curse.
- Entering endless: HP restored to full; everything else carries over.
- Dev: an Endless button; in endless, Reroll and Hardness -3/+3. Show the room's seed and hardness in endless.

## Log

- Nov 9: plan agreed; branch `endless-mode` created from `map-choice-fix` (not yet merged to main).
- Step 1 done: `src/engine/generate.ts` + `ENDLESS` in data.ts + `generate.test.ts` (2,550 rooms checked: exact
  budget, size/limits/unlocks, fair start, floor never cut). Hand-made rooms price at 12 / 19 / 22. A pick is only
  allowed if the rest of the budget still fits the places left, so the budget always lands exactly (up to ~60).
