# Broken Grimoire: how everything works

The complete rulebook for the demo. It follows the team's packaged-demo design ([DESIGN.md](DESIGN.md), Nov 3, 2026),
which replaced the paper-kit rules. If this file and the PDF disagree, this file is the current rule.

> **Status (Nov 4, 2026):** the rules below were updated to the new design. **The game code still runs the previous
> rules** (`src/engine/`): the new parts (Wind, Wall, merges, runes, holes, pushes, the run map, floor drops…) still
> have to be built. [Changes from the previous rules](#changes-from-the-previous-rules) lists every difference, so it
> doubles as the to-do list for the engine.

- Items marked **(proposed)** still need a team decision. Rules marked *(default)* were judgement calls made while
  building the app; they're easy to change.
- Numbers live in `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`), so balance changes are data edits.

**Contents:** [The run](#the-run) · [Turns](#turns) · [Intents](#intents-what-enemies-will-do) ·
[The wizard](#the-wizard-player) · [Spells](#spells) · [Merges](#element-merges) · [Statuses](#statuses) ·
[Runes](#runes) · [The board](#the-board) · [Monsters](#monsters) · [Boss room](#boss-room) · [Rooms](#rooms) ·
[Cards and drops](#cards-and-drops) · [Event and camp](#event-and-camp) ·
[Changes](#changes-from-the-previous-rules)

---

## The run

The map is drawn like Slay the Spire's branching graph (6 layers deep, start included), but every path leads to the
same fixed sequence:

1. **Start**
2. **Room 1 · The Cistern** (6×6, teaching room)
3. **Event · The Whispering Lectern** (fixed, never random)
4. **Room 2 · The Scriptorium** (6×6, the Warden)
5. **Camp**
6. **Boss · The Redactor** (8×8)

- **Finishing a combat room:** kill every enemy. There is **no exit tile and no early exit**. When the last enemy
  dies a big **CLEARED!** appears, turns stop counting, and you walk freely to pick up any drops on the floor.
  **Continue** takes you to the map; if items are still on the floor it asks once: "You left 2 items behind. Leave
  anyway?"
- **Between rooms:** HP carries over. Mana resets to 3. Hand, deck and discard pile are shuffled together into one
  deck and you draw 5. Erased cards stay erased.

## Turns

- There are **no rounds**. Turns alternate: your turn, then the enemy turn. Player turn *N* is followed by enemy turn
  *N*. The turn counter restarts at 1 in each room.
- **Your turn:** 3 actions, in any order. It ends when all 3 are spent, or earlier if you end it. At the start of your
  turn you draw back up to 5 cards.
- **Enemy turn:** each enemy takes its own turn, one after another, in order of **type number** (Rat 1 → Redactor 8),
  then **deploy order** within a type. The Redactor always goes last. Each enemy spends its actions one at a time,
  and **attacks resolve immediately**.
- **One attack per monster per turn:** a normal monster ends its turn after attacking. The Redactor is the only
  exception (up to 2 explosions).
- **Labels:** units of the same type are lettered in deploy order (Brute `3a`, Brute `3b`). The hover card shows the
  name ("Brute", with a small "a"/"b" when the room has more than one). The combat log keeps the number (`3a`).
- **Blocking:** units never share a tile. No unit moves through or onto another unit, a pillar or a hole. An enemy
  that acts earlier claims a tile first, and later enemies path around it.
- **Ties:** when several paths are equally good, one is picked at random. The random seed is saved with the run, so
  the intent preview stays exact and bugs can be replayed.
- **"Adjacent"** means the 4 orthogonal tiles (up, down, left, right). Only three things use all 8 surrounding tiles,
  diagonals included: the Redactor's explosion, Scrap delivery, and Unstable Fire.

## Intents (what enemies will do)

Like *Slay the Spire*, every monster shows small chips above its head with **how it will spend its next turn**:
moves, attacks and their damage (for example `» ×2` then `⚔ 3`). They **never show which tile it will attack or
which path it will take**.

- The preview assumes you end your turn right now, updates after every action you take, and is exact: the monsters
  do what was shown unless your later actions change the situation. Hover a unit for the same plan in words.
- **Charging monsters** (the Warden) are the only ones whose attack is marked on the floor: the full line is drawn
  when it charges, and it fires at the start of its next turn.
- Repeated actions are merged into one chip, and damage values are written on the chip (`3×2` = two hits of 3).

| Chip | Meaning |
|---|---|
| Blue double arrow » | Moves (`×3` = three steps) |
| Grey-blue reverse arrow « | Backs away from you |
| Red sword | Melee attack, with damage |
| Red arrow | Archer shot at you, with damage |
| Amber arrow | Archer shot that a monster in the way will take instead (friendly fire) |
| Blue drop | Drains mana |
| Orange crosshair | Warden marks a line |
| Orange bolt | Warden fires the marked line, with damage |
| Gold eye | Warden holds still with a clear line to you |
| Purple card | Page Scrap steals a fragment |
| Purple `+1` | Page Scrap gives the Redactor a mark |
| Tan shield | Page Scrap blocks your path |
| Orange burst | Redactor explodes, with damage |
| Grey hourglass | Redactor cooldown |
| Purple ⊕ | Page Ward summons a Page Scrap |
| Grey pause ‖ | Does nothing (rooted, stuck, cornered or blocked) |

## The wizard (player)

| Stat | Value |
|---|---|
| HP | 20 (max 20). Carries over between rooms. |
| Mana | Starts at 3 in each room, max 6. |
| Hand | 5 cards |
| Actions | 3 per turn |

**Actions** (each costs 1 action):

| Action | Effect |
|---|---|
| Move | 1 tile up, down, left or right. Never into a hole, a unit or a pillar. |
| Cast | Fire what's on the crafting table (see [Spells](#spells)). |
| Meditate | +3 mana (max 6). Doesn't end your turn. |
| Reroll | Choose any of the cards in your hand (at least one), discard them, and draw that many from the deck. |

- **There is no potion.** Healing happens only at the [camp](#event-and-camp).
- **End of your turn:** if you're standing in an [Erasure Zone](#erasure-zone), a random fragment from your hand is
  erased for good. Then the zones fade.

**You lose if:**

- your HP reaches 0;
- you fall into a hole (only an Archer shot can push you);
- your hand, deck and discard pile together no longer hold at least one element and one shape (or three Fire
  cards). Cards carried by Page Scraps and erased cards don't count.

## Spells

Drag fragments from your hand onto the **crafting table** (no slots; order doesn't matter), aim if the shape needs a
direction, and cast. Used fragments go to the discard pile.

- **Valid spell:** one element + one shape, either of which may be doubled (two copies of the same card). Fire ×3
  alone is [Unstable Fire](#unstable-fire). Two different elements + one shape is a [merge](#element-merges).
- **Cost** = fragments used, +1 for each doubled part. So 2 fragments cost 2 mana, and 3 fragments with one part
  doubled cost 4.
- **Runes:** at most one per cast. A rune costs 1 mana like any fragment and modifies a valid spell; it's never cast
  alone. CAST is greyed out for an invalid table unless a rune is on it. See [Runes](#runes).
- **Directions:** Beam and Wall are cast in one of the 4 directions; Cross is centred on you.
- Pillars stop a Beam and each arm of a Cross. Spells never hurt the caster, except runes and Unstable Fire's Burn.
- A status is applied only if the target survives the hit.
- **Immunities:** a Page Ward is only affected by spells **containing** its element (merges included). The Redactor
  ignores all spells while any Page Ward stands. An immune target takes no damage, no status and no push.

| Element | Damage | Doubled | Effect on hit |
|---|---|---|---|
| Fire | **1** | 3 | Burn |
| Water | 2 | 4 | Root |
| Earth | 2 | 4 | Stun; also cancels a charged attack |
| Wind | 0 | 0 | Push 1 tile away from you (Beam and Wall: along the cast direction; Cross: outward) |
| Wind ×2 | 0 | — | Push 2 tiles |

| Shape | Area | Doubled |
|---|---|---|
| Beam | 2-tile line in one of the 4 directions | 4-tile line |
| Cross | The 4 tiles around you (not your own) | 2 tiles out each way (8 tiles) |
| Wall | A row of 3 tiles directly in front of you, across the cast direction | Adds a second row behind it (3×2) |

Wall is an attack shape, not a barrier.

### Unstable Fire

| | |
|---|---|
| Fragments | Fire ×3, no shape |
| Cost | 5 mana; usable once per room |
| Area | The 3×3 block around you (8 tiles) |
| Damage | **7** |
| Cost to you | You gain Burn 3 |
| Notes | Enemies hit are *not* burned. Immunities still apply (a Fire Ward is hurt; the others aren't). |

### The Grimoire

The first time you cast a new element + shape combo, it's written into the reconstructed grimoire. Fragments are
drawn as torn pages of a chant: element words highlighted in the element's colour, shape words in light purple. A
completed grimoire becomes a readable book. Runes are never recorded.

## Element merges

A merge is **two different elements + one shape**: 3 fragments, 3 mana, no doubling inside a merge. **Wind can't be
merged.** A merge leaves a **hazard** on every tile of its shape for 3 turns: it's gone at the end of your 3rd turn.
One hazard per tile; a new one replaces the old.

| Merge | Hazard | Effect |
|---|---|---|
| Fire + Water | **Fog** | 0 damage. Blocks line of sight (Archers and the Warden can't shoot or see through it). A monster inside spends all its actions moving randomly and doesn't attack. A Wind spell clears the fog tiles it hits. Doesn't affect you. |
| Fire + Earth | **Magma** | Units hit by the cast take 2 damage. A unit that steps onto magma later gains Burn. Monsters avoid it when pathing. Water on a magma tile turns it back to floor. |
| Earth + Water | **Quicksand** | 0 damage. A unit on it can't move, attack or cast until it spends 2 actions to escape; escaping removes the puddle. Monsters avoid stepping in (cast it on them or push them in). If nobody escapes, it vanishes after the 3 turns. |

## Statuses

| Status | Source | Effect |
|---|---|---|
| **Burn** | Fire spell, magma, or Unstable Fire on yourself | 1 damage at the **start of each of the unit's next 3 turns**, whether or not it acts. Fire on a burning unit resets it to 3; it doesn't stack. |
| **Root** | Water spell | The unit can't move during its next turn. It can still attack if already in range. |
| **Stun** | Earth spell | The unit can't attack during its next turn. It can still move. Also cancels a charged attack. |

**Root and Stun** wear off at the end of the affected unit's next turn.

## Runes

Runes are fragments written in the dungeon's native gibberish. You learn what one does only by casting it, and you
keep your own notes; the game never records them.

- **Fixed but random:** on first launch the game randomly assigns the 8 meanings to the 8 symbols and saves that
  mapping. It then stays the same for every run on that computer, so notes keep working.
- **Sources:** up to 2 from the event and 1 from the Warden, so at most 3 per run. **Never a random drop.**

| Effect (proposed) | Type |
|---|---|
| Echo: the spell casts twice | Good |
| Amplify: +2 damage | Good |
| Widen: the shape grows 1 tile on each side | Good |
| Siphon: heal 1 HP per enemy hit | Good |
| Volatile: double damage, but you take 2 damage | Risky |
| Free: costs 0 mana, but you lose 2 HP | Risky |
| Backfire: the spell centres on you instead | Bad |
| Fizzle: nothing happens; mana and cards are spent | Bad |

## The board

| Element | Meaning |
|---|---|
| **Pillar** | **2 HP.** Any hit or collision removes 1; a destroyed pillar becomes open floor. Blocks movement, line of sight, Archer shots, the Warden's line and spells. |
| **Hole** | No unit walks into one. A unit **pushed** into a hole dies instantly (you included: game over), and its loot is lost. |
| **Drops** | Every monster that dies, whoever killed it, leaves a small bobbing item icon on its tile. Walk onto it to pick it up: a fragment goes to your discard pile; a Scrap's carried cards go back to your hand. |
| **Marked line** | The Warden's line, which fires 5 dmg at the start of its next turn. |
| <a id="erasure-zone"></a>**Erasure Zone** | Left by the Redactor's Chaos-mode explosions: the 3×3 block around it, its own tile included. Several zones add up. If you end your turn inside one, a random fragment from your hand is erased: gone for good, not discarded (the top card of your deck if your hand is empty). Then the zones fade. |
| **Hazards** | Fog, Magma and Quicksand from [merges](#element-merges). There are no separate traps in the demo. |

- **Pushes** come from Wind spells and Archer shots. A pushed unit slides the full distance unless something stops it.
- **Collisions:** a push stopped by a unit or a pillar: the pushed unit and what it hit each take 1 damage, and the
  pushed unit stays put. Stopped by the room's wall: only the pushed unit takes 1.

**Unit types:**

| Unit | Type | Holes and push | Magma | Quicksand | Fog |
|---|---|---|---|---|---|
| Normal monsters (and you) | — | Affected | Affected | Affected | Affected (you: no) |
| Page Wards | Float | Immune | Immune | Immune | Immune |
| Warden | Massive | Immune | Affected | Affected | Affected |
| The Redactor | Massive, tall | Immune | Affected | Affected | Immune (its head stays above the fog) |

### On screen

- **Obstacles turn see-through.** Pillars (and any other obstacle that stands up off the floor) fade out whenever a
  unit stands behind them or the mouse is near them, so nothing hides behind the scenery. While faded, the mouse
  passes through them to the tiles and units behind, so the player can peek behind a pillar and spot anything placed
  there.
- **Marked line:** pulsing red tiles. **Erasure Zone:** dark tiles.
- **Badges** beside the HP bar under each unit: the Burn icon with the turns left, the Root icon, the Stun icon;
  **⚡** = the Warden holds a charge; **🂠***n* = fragments a Scrap is carrying; purple **⛨** = the Redactor is
  protected by its Wards; orange **✸** = the Redactor is in Chaos mode. The Redactor's marks are **5 dots** under its
  HP bar.

## Monsters

| # | Monster | HP | Actions | Attack | Theme card |
|---|---|---|---|---|---|
| 1 | Rat | 2 | 3 | 1 damage, adjacent | Fire |
| 2 | Archer | 3 | 2 | Shot: 2 damage + push 1 (see below) | Beam |
| 3 | Brute | 6 | 2 | 3 damage, adjacent | Wall |
| 4 | Leech | 4 | 2 | Drains 1 mana, adjacent | Water |
| 5 | Warden | 8 | 2 | Halberd wave, 5 damage (see below) | Drops 1 rune |

The theme card makes that fragment twice as likely when the monster drops loot (see
[Cards and drops](#cards-and-drops)).

### Rat, Brute, Leech

Take the shortest path toward a tile next to you, then attack once. The Leech drains 1 mana instead of dealing damage.

### Archer

- **If you're adjacent when its turn starts:** it spends both actions backing off. Each step goes directly away from
  you; if that tile is blocked, it takes whichever open step ends farthest from you.
- **Otherwise:** it walks to a tile with a shot, then shoots once. A shot goes in **any of the 8 directions with no
  range limit** and hits **only the first unit or pillar** in the line: 2 damage and a **push of 1 tile** along the
  shot (collisions apply). A pillar takes 1 damage.
- **Friendly fire:** it shoots whenever it has a line to you, even if a monster is in the way; that monster takes the
  hit instead (and the push). A Page Ward (or the Redactor while Wards stand) stops the arrow but takes nothing.

### Warden (massive)

It has no normal attack. Each action, it checks these in order:

1. **Marked line from last turn:** it fires down the line for 5 damage to **every unit on the line, monsters
   included**, until the line reaches a pillar (1 damage to it) or the wall.
2. **Charged and can see you:** it **marks** a line from itself through you to the wall or the first pillar.
   **Marking ends its turn.**
3. **Can see you, no charge:** it holds still and watches.
4. **Can't see you:** it walks the shortest path to a tile that can see you.

- **Seeing you** means you're on one of its 8 lines (straight or diagonal) with no pillar **or fog** in between, at
  any distance.
- **Charges** come on its own turns 2, 4, 6…. A charge it doesn't use that turn is lost.
- **The shot** always comes at the start of its next turn, so you get exactly one turn to step off the red line.
- **Stun** cancels a marked line. **Root** stops it walking, but it can still mark and fire.
- **Death:** it drops **1 rune**.

## Boss room

The Redactor can't be hurt while its three Page Wards stand, and every stolen fragment its Page Scraps deliver fuels
its Chaos mode.

### Page Ward (×3, HP 4, float)

- **Never moves or attacks.** Only spells containing its element (Fire, Water or Earth) hurt it.
- **Summoning:** on enemy turns 2, 4, 6… each standing Ward summons one Page Scrap on a random free tile next to it.
  If there's no free tile, it does nothing that turn. Stun doesn't stop a summon.
- **New Scraps** start acting on the next enemy turn.
- **While any Ward stands,** the Redactor is immune.

### Page Scrap (HP 1, 4 actions)

| Situation | Behaviour |
|---|---|
| Wards stand, empty-handed, Redactor below 5 marks | Runs to you. When next to you, **steals** a random fragment from your hand (1 action) and carries it. Empty hand: nothing to steal. |
| Wards stand, carrying a card it hasn't delivered | Runs to the Redactor. Reaching any of the 8 tiles around it gives the Redactor **1 mark** for free (no action). It keeps the card. |
| Wards stand, already delivered | Keeps away from you for good; doesn't steal again. |
| Wards stand, Redactor at 5/5 marks | Won't steal, and keeps away from you. |
| **All Wards down** | Runs at you and stops on a tile next to you (**outside Erasure Zones first**) to **block your path**. No stealing and no deliveries, however many marks the Redactor has. |

When a Scrap dies, the cards it carries **drop on its tile**; picking them up puts them back in your hand.

### The Redactor (HP 18, massive, tall, always last)

Its mode is set at the start of each of its turns:

| Mode | When | Actions | Explosions | Notes |
|---|---|---|---|---|
| **Guarded** | Any Page Ward stands | 2 | Up to 2 | Immune to every spell. |
| **Chaos** | All Wards down and it has a mark | **4** | Up to 2 | Spends 1 mark at the start of the turn. The action after an explosion is a cooldown. Each explosion leaves an Erasure Zone. |
| **Spent** | All Wards down, no marks | 3 | Up to 2 | For the rest of the fight. |

- **Marks** only come from Page Scraps delivering stolen fragments, up to a **maximum of 5**.
- **Each action:** if you're on any of the 8 tiles around it, it **explodes** for 3 damage (only you take damage),
  at most **2 explosions per turn in every mode**. Otherwise it steps toward you.
- **Chaos cooldown:** the cooldown resets each turn, so a turn can start with an explosion even if the last one ended
  with one.
- **Stun:** it can't explode; if you're next to it, it ends its turn on the spot. **Root:** it can't walk, but still
  explodes if you're next to it.
- **Erasure Zone:** see [The board](#erasure-zone).
- **Killing it wins the demo.** In the full game, every erased fragment comes back when you defeat the boss.

## Rooms

| Room | Grid | You start | Pillars (2 HP) | Holes (proposed) | Enemies (deploy order) |
|---|---|---|---|---|---|
| 1 · The Cistern | 6×6 | a1 | d4, c3 | b4, e5 | Rat f4, Brute c5, Brute e2 |
| 2 · The Scriptorium | 6×6 | a1 | b5, e5, b2, e2 | c2, d5 | Archer a6, Archer e6, Leech d2, Warden c4 |
| 3 · The Redactor | 8×8 | d1 | b6, g6, b3, g3 | a5, h4 | Fire Ward c7, Water Ward f7, Earth Ward d4, Redactor e5 |

No room has an exit tile: a combat room ends when every enemy is dead (see [The run](#the-run)).

## Cards and drops

| | |
|---|---|
| Starting deck (14) | Fire ×3, Water ×2, Earth ×2, Wind ×2, Beam ×2, Cross ×2, Wall ×1. |
| Hand | 5 cards. At the start of each of your turns, draw back up to 5. |
| Deck runs out | The discard pile is shuffled into a new deck. |
| Reroll | Pick the hand cards to swap: they go to the discard pile first, then you draw that many (reshuffling the discard pile in if the deck runs out). |
| New room | Hand, deck and discard pile are shuffled together into one deck, then you draw 5. Erased cards stay erased. |
| Page Scrap steal | Takes a **random** card from your hand. With an empty hand there's nothing to steal, and it waits. |
| Erasure Zone | Ending your turn inside one erases a **random** hand card for good (the top card of the deck if your hand is empty). |

**Random drops:** every normal monster drops one fragment, rolled with weights that steer the deck toward a healthy
mix:

1. Target mix: half elements (spread evenly over Fire, Water, Earth, Wind) and half shapes (Beam, Cross, Wall).
2. Count the deck (hand + deck + discard; not erased cards or cards held by Scraps). Each card's weight = target
   share ÷ current share, clamped to 0.5–3.
3. ×2 for the killer's theme card (see [Monsters](#monsters)).
4. Never the same card three times in a row.
5. Runes are never random drops. Rolls use the run's saved seed.

The Warden drops 1 rune; a Page Scrap drops the cards it carried; Page Wards and the Redactor drop nothing. The full
roll is written out in [DESIGN.md](DESIGN.md#cards-and-drops).

## Event and camp

**Event · The Whispering Lectern** (fixed). A lectern of torn pages in the dungeon's gibberish: "These pages are
written in the dungeon's own tongue. You'll have to work out what they mean yourself… better keep notes." Choose one
(proposed):

1. **Read the pages aloud:** take 2 runes, lose 3 HP.
2. **Copy one page carefully:** take 1 rune.
3. **Leave it.**

**Camp.** Choose one: **Rest** (heal to full, 20 HP) or **Tear out a page** (remove one fragment from your deck).

---

## Changes from the previous rules

What the Nov 3 design changed compared with the rules the game code currently runs. Each row is engine work still to
do.

| Area | Before | Now |
|---|---|---|
| Run structure | 3 rooms in a row, each left through an exit tile | Map → Cistern → Event → Scriptorium → Camp → Boss |
| Ending a room | Step onto the exit (Room 2's unlocks when the Warden dies); skipped enemies forfeit loot | Kill every enemy → CLEARED! → walk to pick up drops → Continue. No exit tiles |
| Elements | Fire, Water, Rock | Fire, Water, **Earth** (renamed Rock), **Wind** (new: 0 damage, push 1 / push 2 doubled) |
| Shapes | Beam, Cross | Beam, Cross, **Wall** (new: 3-wide row, 3×2 doubled) |
| Earth/Rock effect | Stun | Stun, and also cancels a charged attack |
| Merges | Not allowed (one element only) | Two different elements + one shape: Fog, Magma or Quicksand hazards for 3 turns |
| Runes | None | 8 secret rune effects, mapping saved per computer; up to 3 per run |
| Unstable Fire damage | 6 or 7 (spin wheel) | **7** |
| Burn | 1 damage before each action; wears off after a turn without acting | 1 damage at the start of each of the unit's next 3 turns, whether or not it acts |
| Potion | Max Potion from the Warden, restores full HP | **No potion.** Healing only at the camp |
| Warden drop | Max Potion + unlocks the exit | 1 rune |
| Loot | Goes straight into your discard pile on a kill | Drops on the floor; walk onto it to pick it up |
| Which fragment drops | Fixed per monster (Rat Fire, Archer Beam, Brute Rock, Leech Water) | Weighted random roll toward a balanced deck; theme card ×2 (Brute's theme is now Wall) |
| Starting deck | 11 cards | 14 cards (adds Wind ×2, Wall ×1) |
| Holes | None | Holes in every room (proposed positions); pushed in = dies, you included |
| Pushes and collisions | None | Wind and Archer shots push; collisions deal 1 damage |
| Pillars | Indestructible | 2 HP; destroyed pillars become floor |
| Unit types | — | Float (Wards) and Massive (Warden, Redactor) are immune to holes and pushes |
| Archer shot | Range 4; pillars block it | 8 directions, no range limit, hits the first unit or pillar; +push 1; a pillar takes 1 damage |
| Warden wave | Hits only you | Hits every unit on the line, monsters included; 1 damage to the pillar that stops it |
| Warden sight | Blocked by pillars | Blocked by pillars and fog |
| Page Ward immunity | Only spells *of* its element | Spells *containing* its element (merges count) |
| Page Scrap death | Stolen cards go straight back to your hand | Cards drop on its tile; pick them up to get them back |
| Scrap blocking | Stops next to you | Stops next to you, preferring tiles outside Erasure Zones |
| Redactor explosions | Guarded and Spent: every action while you're next to it (no cap) | At most 2 per turn in every mode |
| Losing | HP 0, or broken grimoire | Also: being pushed into a hole |
| Grimoire | — | New combos are recorded in a reconstructed grimoire book |
| Room 3 Wards | Fire, Water, Rock | Fire, Water, Earth |

Kept from our build and unchanged by the design: the crafting table, beams aimed on the board, and **obstacles that
turn see-through** when a unit is behind them or the mouse is near (see [On screen](#on-screen)).
