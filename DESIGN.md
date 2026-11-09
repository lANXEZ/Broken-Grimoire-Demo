# Broken Grimoire — Packaged Demo Design

Current design for the packaged (Windows) demo, as of Nov 3, 2026. It replaces the Sept 26 design draft and the
paper-kit rules. The web demo's `GAME_RULES.md` still describes the older rules that the web build implements; where
the two disagree, this file wins for the packaged demo.

- **Build:** Python + pygame, packaged as a Windows `.exe` with PyInstaller (build it on Windows).
- **Due:** Nov 9, 2026 (`GroupName_GA2.zip`: project files, `.exe`, slides). Presentation Nov 10 / 13.
- Items marked **(proposed)** still need a team decision.

**Contents:** [The run](#the-run) · [Turns](#turns) · [The mage](#the-mage) · [Spells](#spells) ·
[Merges](#element-merges) · [Statuses](#statuses) · [Runes](#runes) · [The board](#the-board) ·
[Monsters](#monsters) · [Boss room](#boss-room) · [Rooms](#rooms) · [Cards and drops](#cards-and-drops) ·
[Event and camp](#event-and-camp) · [Art and UI](#art-and-ui) · [Open items](#open-items) · [Plan](#plan-to-nov-9)

---

## The run

The map is drawn like Slay the Spire's branching graph (6 layers deep, start included), but every path leads to the
same fixed sequence:

1. **Start**
2. **Room 1 — The Cistern** (6×6, teaching room)
3. **Event — The Whispering Lectern** (fixed, never random)
4. **Room 2 — The Scriptorium** (6×6, the Warden)
5. **Camp**
6. **Boss — The Redactor** (8×8)

**Finishing a combat room:** kill every enemy. There's no early exit and no exit tile. When the last enemy dies a big
**CLEARED!** appears, turns stop counting, and you walk freely to pick up any drops on the floor. A **Continue**
button takes you to the map; if items are still on the floor it asks once: "You left 2 items behind. Leave anyway?"

**Between rooms:** HP carries over. Mana resets to 3. Hand, deck and discard pile are shuffled together into one deck
and you draw 5. Erased cards stay erased.

## Turns

- Turns alternate: your turn, then the enemy turn. The turn counter restarts at 1 in each room.
- **Your turn:** 3 actions, any order. Start of your turn: draw back up to 5 (runes don't count; GAME_RULES.md, Cards and drops).
- **Enemy turn:** each enemy takes its own turn in order of type number (Rat 1 → Redactor 8), then deploy order. The
  Redactor always goes last. Each enemy spends its actions one at a time, and **attacks resolve immediately**.
- **One attack per monster per turn**, and a normal monster ends its turn after attacking. The Redactor is the only
  exception (up to 2 explosions).
- **Blocking:** units never share a tile. No unit moves through or onto another unit or a pillar. An enemy that acts
  earlier claims a tile first; later enemies path around it.
- **Ties** between equally good paths are broken at random with a seed saved in the run, so the intent preview stays
  exact and bugs can be replayed.
- **"Adjacent"** means the 4 orthogonal tiles (up, down, left, right). Only three things use all 8 surrounding tiles,
  diagonals included: the Redactor's explosion, Scrap delivery, and Unstable Fire.

### Intents

- Every monster shows small icon chips over its head with **how it will spend its next turn**: moves, attacks and
  their damage (for example `» ×2` then `⚔ 3`). They never show which tile it will attack or which path it will take.
- The preview assumes you end your turn now, updates after every action you take, and is exact: the monsters do
  what was shown unless your later actions change the situation.
- **Charging monsters** (the Warden) are the only ones whose attack is marked on the floor: the full line is drawn
  when it charges, and it fires at the start of its next turn.

| Chip | Meaning |
|---|---|
| » | Moves (`×3` = three steps) |
| « | Backs away from you |
| Red sword | Melee attack, with damage |
| Red arrow / amber arrow | Archer shot at you / at a monster in the way |
| Blue drop | Drains mana |
| Orange crosshair / bolt | Warden marks a line / fires it |
| Gold eye | Warden holds still with a clear line to you |
| Purple card / `+1` | Scrap steals / delivers a mark to the Redactor |
| Tan shield | Scrap blocks your path |
| Orange burst / hourglass | Redactor explodes / cools down |
| Purple ⊕ | Page Ward summons a Scrap |
| ‖ | Does nothing (rooted, stuck, cornered or blocked) |

## The mage

| Stat | Value |
|---|---|
| HP | 20 (max 20), carries over between rooms |
| Mana | Starts at 3 in each room, max 6 |
| Hand | 5 |
| Actions | 3 per turn |

| Action (1 action each) | Effect |
|---|---|
| Move | 1 tile orthogonally; never into a hole, unit or pillar |
| Cast | Fire what's on the crafting board (see [Spells](#spells)) |
| Meditate | +3 mana (max 6); doesn't end your turn |
| Reroll | Pick any cards in your hand (at least one), discard them, draw that many (runes drawn don't count) |

There is no potion. Healing happens only at the camp.

**You lose if:**

- your HP reaches 0;
- you fall into a hole (only an Archer shot can push you);
- your hand, deck and discard pile together no longer hold at least one element and one shape (or three Fire cards).
  Cards carried by Page Scraps and erased cards don't count.

## Spells

Drag fragments from your hand onto the crafting board (no slots, order doesn't matter), pick a direction, press
**CAST**. Used fragments go to the discard pile.

- **Valid spell:** one element + one shape; either may be doubled (two copies of the same card). Fire ×3 alone is
  Unstable Fire. Two different elements + one shape is a [merge](#element-merges).
- **Cost** = fragments used, +1 for each doubled part.
- **Runes:** at most one per cast. A rune costs 1 mana like any fragment and modifies a valid spell; it's never cast
  alone. CAST is greyed out for an invalid board unless a rune is on it.
- Pillars stop a Beam and each arm of a Cross. Spells never hurt the caster (except runes and Unstable Fire's Burn).
- A status is applied only if the target survives the hit.
- **Immunities:** a Page Ward is only affected by spells containing its element. The Redactor ignores all spells while
  any Page Ward stands. An immune target takes no damage, no status and no push.

| Element | Damage | Doubled | Effect on hit |
|---|---|---|---|
| Fire | 1 | 3 | Burn |
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

**Unstable Fire** (Fire ×3, no shape): 3×3 block around you, 7 damage, costs 5 mana, once per room. You gain Burn 3;
enemies hit are not burned. Immunities still apply.

**The Grimoire:** the first time you cast a new element + shape combo, it's written into the reconstructed grimoire.
Fragments are torn pages of that grimoire (Art and UI). A completed grimoire becomes a readable book. Runes are never
recorded.

## Element merges

A merge is **two different elements + one shape**: 3 fragments, 3 mana, no doubling inside a merge. Wind can't be
merged. A merge leaves a **hazard** on every tile of its shape for 3 turns: it's gone at the end of your 3rd turn.
One hazard per tile; a new one replaces the old.

| Merge | Hazard | Effect |
|---|---|---|
| Fire + Water | **Fog** | 0 damage. Blocks line of sight (Archers and the Warden can't shoot or see through it). A monster inside spends all its actions moving randomly and doesn't attack. A Wind spell clears the fog tiles it hits. Doesn't affect you. |
| Fire + Earth | **Magma** | Units hit by the cast take 2 damage. A unit that steps onto magma later gains Burn. Monsters avoid it when pathing. Water on a magma tile turns it back to floor. |
| Earth + Water | **Quicksand** | 0 damage. A unit on it can't move, attack or cast until it spends 2 actions to escape; escaping removes the puddle. Monsters avoid stepping in (cast it on them or push them in). If nobody escapes, it vanishes after the 3 turns. |

## Statuses

| Status | Effect |
|---|---|
| Burn | 1 damage at the start of each of the unit's next 3 turns, whether or not it acts. Fire on a burning unit resets it to 3; it doesn't stack. |
| Root | The unit can't move during its next turn (it can still attack if in range). |
| Stun | The unit can't attack during its next turn (it can still move). Also cancels a charged attack. |

Root and Stun wear off at the end of the unit's next turn.

## Runes

Runes are fragments written in the dungeon's native gibberish. You learn what one does only by casting it, and you
keep your own notes; the game never records them.

- **Fixed but random:** on first launch the game randomly assigns the 8 meanings to the 8 symbols and saves that
  mapping in the save file. It then stays the same for every run on that computer, so notes keep working.
- **Sources:** up to 2 from the event and 1 from the Warden, so at most 3 per run. Never a random drop.

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

- **Holes:** no unit walks into one. A unit pushed into a hole dies instantly (you included: game over). Its loot is
  lost.
- **Pushes** come from Wind spells and Archer shots. A pushed unit slides the full distance unless something stops it.
- **Collisions:** a push stopped by a unit or pillar: the pushed unit and what it hit each take 1 damage, and the
  pushed unit stays put. Stopped by the room's wall: only the pushed unit takes 1.
- **Pillars** have **2 HP**. Any hit or collision removes 1; a destroyed pillar becomes open floor. Pillars block
  movement, line of sight, Archer shots, the Warden's line and spells.
- **Drops:** every monster that dies, whoever killed it, leaves a small bobbing item icon on its tile. Walk onto it
  to pick it up: a fragment goes to your discard pile; a Scrap's carried cards go back to your hand.
- **No separate traps** in the demo: merge hazards fill that role.

**Unit types:**

| Unit | Type | Holes and push | Magma | Quicksand | Fog |
|---|---|---|---|---|---|
| Normal monsters | — | Affected | Affected | Affected | Affected |
| Page Wards | Float | Immune | Immune | Immune | Immune |
| Warden | Massive | Immune | Affected | Affected | Affected |
| The Redactor | Massive, tall | Immune | Affected | Affected | Immune (its head stays above the fog) |

## Monsters

| # | Monster | HP | Actions | Attack | Theme card |
|---|---|---|---|---|---|
| 1 | Rat | 2 | 3 | 1 damage, adjacent | Fire |
| 2 | Archer | 3 | 2 | Shot, 2 damage + push 1 (see below) | Beam |
| 3 | Brute | 6 | 2 | 3 damage, adjacent | Wall |
| 4 | Leech | 4 | 2 | Drains 1 mana, adjacent | Water |
| 5 | Warden | 8 | 2 | Halberd wave, 5 damage (see below) | Drops 1 rune |

**Rat, Brute, Leech:** take the shortest path to a tile next to you, then attack once.

**Archer:**

- If you're adjacent when its turn starts, it spends both actions backing off (each step directly away from you; if
  blocked, the open step that ends farthest from you).
- Otherwise it walks to a tile with a shot, then shoots once. A shot goes in any of 8 directions with no range limit
  and hits **only the first unit or pillar** in the line: 2 damage and a push of 1 tile along the shot (collisions
  apply). A pillar takes 1 damage.
- **Friendly fire:** it shoots whenever it has a line to you, even if a monster is in the way; that monster takes the
  hit instead. A Page Ward (or the Redactor while Wards stand) stops the arrow but takes nothing.

**Warden** (massive). It has no normal attack. Each action, in order:

1. **Marked line from last turn:** fires down it for 5 damage to every unit on the line, monsters included, until
   the line reaches a pillar (1 damage to it) or the wall.
2. **Charged and can see you:** marks a line from itself through you to the wall or first pillar. Marking ends its
   turn.
3. **Can see you, no charge:** holds still and watches.
4. **Can't see you:** walks the shortest path to a tile that can.

- Seeing you = you're on one of its 8 lines with no pillar or fog in between, at any distance.
- Charges come on its own turns 2, 4, 6… An unused charge is lost.
- Stun cancels a marked line. Root stops it walking, but it can still mark and fire.

## Boss room

The Redactor can't be hurt while its three Page Wards stand, and every stolen fragment its Page Scraps deliver fuels
its chaos mode.

**Page Ward** (×3, HP 4, float): never moves or attacks; only spells containing its element hurt it. On enemy turns
2, 4, 6… each standing Ward summons one Page Scrap on a random free tile next to it (nothing if there's no room).
Stun doesn't stop a summon. New Scraps start acting on the next enemy turn.

**Page Scrap** (HP 1, 4 actions):

| Situation | Behaviour |
|---|---|
| Wards stand, empty-handed, Redactor below 5 marks | Runs to you; when next to you, **steals** a random fragment (1 action). The card goes under its token. Empty hand: nothing to steal. |
| Wards stand, carrying a card it hasn't delivered | Runs to the Redactor. Reaching any of the 8 tiles around it gives the Redactor **1 mark** for free (no action). It keeps the card. |
| Wards stand, already delivered | Keeps away from you; doesn't steal again. |
| Wards stand, Redactor at 5/5 marks | Won't steal; keeps away from you. |
| All Wards down | Runs at you and stops on a tile next to you (outside Erasure Zones first) to block your path. No stealing, no deliveries. |

When a Scrap dies, the cards it carries drop on its tile; picking them up puts them back in your hand.

**The Redactor** (HP 18, massive, tall, always last). Its mode is set at the start of each of its turns:

| Mode | When | Actions | Explosions | Notes |
|---|---|---|---|---|
| Guarded | Any Ward stands | 2 | Up to 2 | Immune to every spell |
| Chaos | All Wards down and it has a mark | 4 | Up to 2 | Spends 1 mark at the start of the turn. The action after an explosion is a cooldown. Each explosion leaves an Erasure Zone |
| Spent | All Wards down, no marks | 3 | Up to 2 | For the rest of the fight |

- **Each action:** if you're on any of the 8 tiles around it, it **explodes** for 3 damage (only you take damage).
  Otherwise it steps toward you.
- **Stun:** it can't explode; if you're next to it, it ends its turn on the spot. **Root:** it can't walk.
- **Erasure Zone:** the 3×3 block around it, its own tile included. Several zones add up. If you end your turn
  inside one, a random fragment from your hand is erased: gone for good, not discarded (top card of your deck if your
  hand is empty). Then the zones fade.
- Killing it wins the demo. In the full game, every erased fragment comes back when you defeat the boss.

## Rooms

| Room | Grid | Start | Pillars (2 HP) | Holes (proposed) | Enemies (deploy order) |
|---|---|---|---|---|---|
| 1 · The Cistern | 6×6 | a1 | d4, c3 | b4, e5 | Rat f4, Brute c5, Brute e2 |
| 2 · The Scriptorium | 6×6 | a1 | b5, e5, b2, e2 | c2, d5 | Archer a6, Archer e6, Leech d2, Warden c4 |
| 3 · The Redactor | 8×8 | d1 | b6, g6, b3, g3 | a5, h4 | Fire Ward c7, Water Ward f7, Earth Ward d4, Redactor e5 |

## Cards and drops

- **Starting deck (14):** Fire ×3, Water ×2, Earth ×2, Wind ×2, Beam ×2, Cross ×2, Wall ×1.
- **Deck runs out:** the discard pile is shuffled into a new deck.
- **Random drops:** every normal monster drops one fragment, rolled with weights that steer the deck toward a healthy
  mix:
  1. Target mix: half elements (spread evenly over Fire, Water, Earth, Wind) and half shapes (Beam, Cross, Wall).
  2. Count the deck (hand + deck + discard; not erased cards or cards held by Scraps). Each card's weight = target
     share ÷ current share, clamped to 0.5–3.
  3. ×2 for the killer's theme card (table in [Monsters](#monsters)).
  4. Never the same card three times in a row.
  5. Runes are never random drops. Uses the run's saved seed.

```python
import random

ELEMENTS = ["fire", "water", "earth", "wind"]
SHAPES = ["beam", "cross", "wall"]
TARGET = {**{e: 0.5 / len(ELEMENTS) for e in ELEMENTS},
          **{s: 0.5 / len(SHAPES) for s in SHAPES}}
THEME = {"rat": "fire", "archer": "beam", "brute": "wall", "leech": "water"}

def roll_drop(rng: random.Random, owned: dict, monster: str, last_two: list) -> str:
    total = max(1, sum(owned.get(c, 0) for c in TARGET))
    weights = {}
    for card, target in TARGET.items():
        share = owned.get(card, 0) / total
        w = min(max(target / max(share, 0.01), 0.5), 3.0)   # short of it -> more likely
        if THEME.get(monster) == card:
            w *= 2.0                                          # monster flavour
        if last_two == [card, card]:
            w = 0.0                                           # no 3 in a row
        weights[card] = w
    cards, ws = zip(*weights.items())
    return rng.choices(cards, weights=ws, k=1)[0]
```

## Event and camp

**Event — The Whispering Lectern** (fixed). A lectern of torn pages in the dungeon's gibberish: "These pages are
written in the dungeon's own tongue. You'll have to work out what they mean yourself… better keep notes." Choose one
(proposed):

1. **Read the pages aloud:** take 2 runes, lose 3 HP.
2. **Copy one page carefully:** take 1 rune.
3. **Leave it.**

**Camp.** Choose one: **Rest** (heal to full, 20 HP) or **Tear out a page** (remove one fragment from your deck).

## Art and UI

- **Style:** AI-generated pixel art for everything, characters included (regenerate the painted paper-kit portraits as
  pixel sprites so the game has one style).
- **Animation (proposed):** static sprites moved by code (idle bob, lunge on attack, red flash and shake on hit, slide
  on push, fade on death) instead of sprite sheets.
- **Screens:** title, map, combat, event, camp, win, lose.
- **Combat HUD:** intent chips over each monster; the Warden's marked line on the floor; HP and mana; hand, crafting
  board and CAST; bobbing drops; holes, pillar HP and hazards (Fog, Magma, Quicksand); the Redactor's 5 mark dots;
  Erasure Zones; CLEARED! and Continue.
- **Fragment cards:** each card is a torn page of your grimoire covered in unreadable gibberish. The only readable part
  is the card's own word, highlighted inside the gibberish. Each element word is written in its element's colour and a
  font themed on that element.

  | Card | Highlight | Font (proposed) |
  | --- | --- | --- |
  | Fire | Red | Fiery: flame-licked letters |
  | Water | Blue (proposed) | Flowing: rounded, dripping letters |
  | Earth | Brown (proposed) | Stony: heavy, cracked, chiselled letters |
  | Wind | Mint green | Airy: thin, slanted letters with trailing wisps |
  | Beam, Cross, Wall | Purple | The grimoire's normal script |
  | Runes | Burgundy | The rune's own symbol; stays unreadable |

- **Card detail panel:** hovering a torn-page fragment in your hand shows that card's existing card asset (the card art
  the team already has) in a panel on the right side of the screen. The torn pages are new art; the card assets are
  reused as-is for the panel. A rune shows only its symbol there. Hovering the board shows what's under the pointer
  in the same spot (team decision, Nov 9): the unit standing there (name, HP, statuses, what it does, its next turn)
  and the hazard on the tile, so no card covers the board.

## Open items

| Topic | Proposal |
|---|---|
| Hole positions | Room 1: b4, e5 · Room 2: c2, d5 · Boss: a5, h4 |
| Rune effects | The 8 effects in [Runes](#runes) |
| Event options | The three choices in [Event and camp](#event-and-camp) |
| Animation | Static pixel sprites moved by code |

## Plan to Nov 9

1. **Nov 3:** lock the open items; create the pygame project and repo; split the work.
2. **Nov 4:** grid, holes, pillars, movement, turn loop, intents, pushes and collisions.
3. **Nov 5:** hand, deck, crafting board and CAST; elements, shapes, statuses, merges; the Grimoire.
4. **Nov 6:** Rooms 1–2 and their monsters, random drops, CLEARED! and Continue, map, event, camp, runes.
5. **Nov 7:** boss room (Wards, Scraps, Redactor, Erasure); title, win and lose screens; first Windows `.exe`.
6. **Nov 8:** playtest, balance, bugs, presentation slides.
7. **Nov 9:** submit `GroupName_GA2.zip` on Google Classroom, with names and IDs on everything.

**Suggested split:** A: grid, turns, movement, pushes, collisions, hazards. B: crafting board, spells, merges,
runes, Grimoire, UI. C: monster AI and intents, rooms, map, event, camp, boss.

**Presentation (15 min max):** rules and mechanics, narrative, a live demo, and optionally the algorithms: monster
pathfinding, the intent preview, the drop-balancing weights, the saved-seed randomness and the illusion-of-choice map.
