# Broken Grimoire: how everything works

The complete rulebook for the demo. It follows the team's packaged-demo design ([DESIGN.md](DESIGN.md), Nov 3, 2026),
which replaced the paper-kit rules. If this file and the PDF disagree, this file is the current rule.

> **Status (Nov 4, 2026):** the game code (`src/engine/`) now runs these rules, with every detail the design left
> open settled in [Build decisions](#build-decisions-nov-4). Still missing: the branching **map screen** (a
> teammate is building it); until then the run goes straight from stop to stop.

- Items marked **(proposed)** still need a team decision. Rules marked *(default)* were judgement calls made while
  building the app; they're easy to change.
- Numbers live in `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`), so balance changes are data edits.

**Contents:** [The run](#the-run) · [Turns](#turns) · [Intents](#intents-what-enemies-will-do) ·
[The mage](#the-mage-player) · [Spells](#spells) · [Merges](#element-merges) · [Statuses](#statuses) ·
[Runes](#runes) · [The board](#the-board) · [Monsters](#monsters) · [Boss room](#boss-room) · [Rooms](#rooms) ·
[Cards and drops](#cards-and-drops) · [Event and camp](#event-and-camp) ·
[Endless mode](#endless-mode-the-demos-endless-curse) · [Build decisions](#build-decisions-nov-4) · [Changes](#changes-from-the-previous-rules)

---

## The run

The map is drawn like Slay the Spire's branching graph (6 layers deep, start included), but every path leads to the
same fixed sequence:

The map shows each time you go through a door. You stand on the node you picked last time (nothing lit ahead
yet), and the nodes on the next layer joined to it glow. Pick one: the step to it lights up and you go on. Whichever
you pick, it's the next stop below. Your picks are kept for the whole run, so the lit road is the one you chose.

1. **Start** — in the build: the title screen, then **room 0** (see below)
2. **Room 1 · The Cistern** (6×6, teaching room)
3. **Event · The Whispering Lectern** (fixed, never random)
4. **Room 2 · The Scriptorium** (6×6, the Warden)
5. **Camp**
6. **Boss · The Redactor** (8×8)
7. **Then: endless mode** — beating the Redactor shows Victory, then the curse sends you into generated rooms until
   you fall (see [Endless mode](#endless-mode-the-demos-endless-curse))

- **Title screen and room 0 (team decision, Nov 5):** the game opens on a title screen (a night forest under the
  moon, the game's name, Start on the right; with a saved run, Continue or New game; and Quit under them, which
  closes the game; in a browser, which usually won't let a page close its tab, it shows a goodbye screen instead,
  with a button back to the title). A new run opens its eyes (a
  first-person blink) in **room 0, The Waking Room**: 3×4, a campfire (b2) with a rock to sit on (a2), a big
  dungeon door (c4), and in the back corner **a door the mage sealed with a string of spells** (a4, team decision,
  Nov 8): buried under a heap of gravel that blocks the tile, with the spells' marks trailing across the gravel
  spilled in front (a3, walkable): scorch and embers (Fire), frost shards (Water) and rock spikes (Earth). The mage thinks: *"Dream of outside again… How long have I been stuck here…"* There are no enemies;
  actions and mana never run out and the hand refills after every cast, so it's the place to try spells (casts there
  count for the Grimoire and the "Hmmm..." note; Reroll works too). **The campfire reacts to spells** that reach its
  tile: Water, Earth, Fog and Quicksand put it out; Fire, Unstable Fire and Magma light it again; Wind does nothing.
  Click a tile to walk there; walking through the door
  starts the run in the Cistern. Room 0 isn't one of the numbered stops. **The campfire is the room's light:** while
  it's out, room 0 is dark but for the faint glow of the spell marks (team decision, Nov 6).
- **The opening cutscene and tutorial (team decision, Nov 6):** the first time **Start** is pressed on a computer
  (saved per computer; a **Skip** button jumps straight to the game, and quitting midway plays it again next time).
  The words are in `src/config/introScript.ts`, the order in `src/game/useIntro.ts`. The mage speaks in speech
  bubbles; each line stays until the player presses **Space** (Enter or a click work too):
  1. The eyes open on room 0, dark and empty (no fire, rock or mat). The mage comes to on the spell trail (a3),
     knocked out by the last spell that sealed the door, with a few grimoire fragments on them (not noticed yet):
     *"Ahh… What happened?"*,
     *"Where is this? Why is it so dark?"*,
     *"Maybe that door leads somewhere."*, and walks through the door.
  2. The Cistern, dark; a second later its torches catch and show **one brute** (e2; the room's rat and other brute
     aren't in the cutscene): *"!!!"*, *"A monster??"* It walks up to the mage step by step:
     *"That's not good."*, *"Don't come any closer!!"*, then long spells from memory that only puff out without the
     grimoire: *"SUPREME CRIMSON INFERNO DRAGON-SPIRAL NOVA!!!"* (puff), *"Huh??"*, *"Wait, where the hell is my
     grimoire?"*, *"Hell nah."*, *"GRAND TERRA COLOSSUS EARTHSHATTER FIST!!"*, *"ETERNAL ABYSSAL TIDE-SERPENT
     MAELSTROM!!!"* (puffs), and it stops in front of the mage: *"Naw man."*
  3. Back in room 0: a second later the screen's edge flashes red (hurt, off screen), and the mage is thrown back
     out through the door (lands on b3): *"Guess I have to make a plan first."*
  4. Black for a second, then room 0 with the campfire (not lit), the rock and the mat: *"Now, the first problem:
     how do I light this up?"*, *"…"*. The mage calms down and checks what they have on them: *"Calm down.
     Think."*, *"What do I have on me?"*, *"These… are pages of my grimoire!!!"*, *"Why is it torn up like
     this?"*, *"Hmm, spells are usually just words put together anyway."*, then walks to the fire (b1): *"Will
     this work?"*
  5. **Tutorial** (the real game, HUD back on screen, nothing else to do): the hand holds **Fire** and **Beam** (the
     other three are random and can't be picked up). Both glow, with a tip over the next one: *"Drag the fragment and
     place it on the crafting table"*. With both on the table the Cast button glows: *"Select a direction"*. A cast
     that reaches the fire lights it; any other is a miss: *"Ah, missed!"*, *"One more time!"*, and the hand gets
     Fire and Beam back.
  6. The room fills with the fire's light: *"YESSS!! It works!!!"*, *"I can gather more fragments to fight those
     monsters and find a way out."* The mage counts their fragments: *"Let's check first: how many fragments have I
     got?"*, *"Three Fire, two Water, two Earth and two Wind…"*, *"Two Beams, two Crosses and one Wall."*,
     *"Fourteen fragments. Not much of a grimoire, but it's a start."*, *"That should be enough to fight my way out of
     here."* (the numbers are the starting deck; a test keeps them in step). One step toward the door (c1): *"When did a campfire's warmth become this
     comfortable?"*, *"Let's rest a little before I try again, then."* Onto the mat: *"Ah, I can't wait to get out of
     here."* The eyes close, and the game starts as usual (waking on the mat).
- **Torches and dark rooms (team decision, Nov 6):** every pillar carries a torch. Each time a run walks into a fight
  room, the room starts **dark** (torches out, monsters hidden, nothing can be done); a second later the dungeon
  notices the mage and lights the torches one after another, and the room and its monsters show as usual.
- **Hurt (team decision, Nov 6):** whenever the mage loses HP, the edge of the screen flashes red for half a second.
- **The sleeping mat and the title (team decision, Nov 5):** the mage wakes up on a rough old sleeping mat in room 0
  (two tiles, a1–b1, a small old pillow at a1; walkable). Standing on it, once the waking thought has gone, a small
  prompt floats over the pillow: *"Get some rest? (Return to menu)"*. Clicking it closes the eyes and goes back to
  the title screen. A run still in room 0 doesn't count as saved, so the title then shows **Start** (and
  **Quit**); Start wakes the mage in room 0 again.
- **Defeat (team decision, Nov 5):** the defeat panel's button says **Continue** (victory keeps New run). Everything
  fades to black, and a line written in the rune alphabet appears in the middle of the screen, letter by letter from
  left to right as if someone were saying it to the mage, with a pause after "Wake up,": *"Wake up, you can't
  escape your fate."* (players only read it once they've worked out enough runes; punctuation isn't encrypted). It
  stays a few seconds (Space, Enter or a click moves on once it's fully shown), fades, and the mage wakes up in
  room 0 as at the start of a new run.
- **Finishing a combat room:** kill every enemy. The room's **door** (as in the low-fi demo) stays locked until the
  room is cleared, except in the Cistern, whose door is open the whole time (see [Rooms](#rooms)). When the last enemy dies a big **CLEARED!** appears, turns stop
  counting, the door opens, and you walk freely to pick up any drops on the floor. **Continue** (or clicking the
  open door) walks you to the door and through it, to the map; if items would be left on the floor it asks once
  first: "You left 2 items behind. Leave anyway?"
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
  do what was shown unless your later actions change the situation. Hover a unit's tile for the same plan in words.
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

## The mage (player)

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
| Wind | 0 | 0 | Push **2 tiles** away from you (Beam and Wall: along the cast direction; Cross: outward) |
| Wind ×2 | 0 | — | Push **until it hits something** (a unit, a pillar, the room's wall or the locked door): the usual collision, 1 damage. A hole on the way still swallows it; Quicksand still catches it |

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

### "Hmmm..." (the spell note)

A quality-of-life note on the left of the screen, drawn as one of the mage's foggy thoughts (team decision, Nov 4;
not in the design). Unlike the Grimoire it records **exact card combinations**, with what they cost and do:

- **Recording:** the first time a combination is cast successfully, it's added. Fire + Beam and Fire ×2 + Beam are
  separate lines. Combinations with a rune are recorded too (rune and all), even when the rune turns out to be
  Fizzle. A table that makes no spell (a rune "unknown working") is never recorded. The note is **kept across runs**
  on the computer, like the Grimoire.
- **Two sections:** *I could make…* = lines whose cards are all in your hand (crafting table included), shown
  normally; *If only I had…* = the rest, ghosted. Cheapest first. A line you can make but can't pay for shows its cost
  in red.
- **Filtering:** with cards on the crafting table, only lines that contain all of them are shown, and those cards
  light up in each line.
- **Hover / click** (your turn only): hovering a line you can make pulls its cards up out of the hand; clicking it
  puts the missing cards on the crafting table, ready to cast.
- **Each line shows** its cards, mana cost and effect (e.g. *2 · 1 dmg · Burn*). A line with a rune shows **"?"** for
  both cost and effect, so nothing gives the rune away; the player's own note on that rune is shown above it.

## Element merges

A merge is **two different elements + one shape**: 3 fragments, 3 mana, no doubling inside a merge. **Wind can't be
merged.** A merge leaves a **hazard** on every tile of its shape for 3 turns: it's gone at the end of your 3rd turn.
One hazard per tile; a new one replaces the old.

| Merge | Hazard | Effect |
|---|---|---|
| Fire + Water | **Fog** | 0 damage. Blocks line of sight (Archers and the Warden can't shoot or see through it). A monster inside spends all its actions moving randomly and doesn't attack. A Wind spell clears the fog tiles it hits. Doesn't affect you. |
| Fire + Earth | **Magma** | Units hit by the cast take 2 damage **and gain Burn** (house rule, see [Build decisions](#build-decisions-nov-4)). A unit that steps onto magma later gains Burn too. Monsters avoid it when pathing. Water on a magma tile turns it back to floor. |
| Earth + Water | **Quicksand** | 0 damage. A unit on it can't move, attack or cast until it spends 2 actions to escape; escaping removes the puddle. Monsters avoid stepping in (cast it on them or push them in). If nobody escapes, it vanishes after the 3 turns. |

**Hover a hazard's tile** to see a card saying what it does and the end of which of your turns it fades. The card
sits left of the tile, so it doesn't cover the card of a unit standing in it.

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

**How a rune cast looks (team decision, Nov 4):** it plays in two parts so the player can see what the rune
did. First the spell itself, exactly as if the rune weren't there. Then the rune's symbol glows purple on the 3×3
floor around the mage, and the rune's own part plays in purple, with its damage and healing in purple numbers
(Echo replays the spell, Amplify strikes each target, Siphon draws wisps back to you, Volatile blasts the targets
again and lashes back, Free returns the mana and takes the HP, Fizzle: no spell part, just the glow and purple
smoke). A rune on a table that makes no spell only puffs grey
smoke: no glow, since the cards failed, not the rune. The result is the same as before; only the showing changed.
Space or a click skips to the end.

**Rune notes (team decision, Nov 4):** the player's own notes live in the game. Every rune card wears a foggy thought
bubble, *"Hmm, what is it?"*, with a pencil: click it to write what you think the rune does (Enter saves, Esc
cancels). A note belongs to the rune's **symbol**, so every card with that symbol shares it, in every run on that
computer (the meanings are fixed per computer too). Notes can be edited on any rune card in the hand, on the crafting
table, or in the **Deck** view (top bar, or D), which lists every card you own. The game never fills a note in
itself, and never says whether a note is right. While a rune card in the hand is popped up under the mouse, its note
bubble counts as part of the card: the mouse can move up onto the note without the card dropping back, and pressing
the note (anywhere but the pencil) picks the card up like pressing the card.

- **Six runes (team decision, Nov 9):** the art team drew 6 rune fragments, so the game has 6 runes: Widen and
  Backfire were cut. Each rune card is drawn as its own fragment (`rune1`–`rune6` in `public/art/spell_fragments/`).
  The art team's symbols aren't the rune alphabet below; for the demo a rune card simply shows its fragment, and the
  alphabet is only used for the hidden messages. Saves from before keep working: an old 8-rune mapping is replaced
  by a new 6-rune one, and rune cards 7 and 8 in a saved run become runes still in the game.
- **Fixed but random:** on first launch the game randomly assigns the 6 meanings to the 6 rune cards and saves that
  mapping. It then stays the same for every run on that computer, so notes keep working.
- **The rune alphabet (team decision, Nov 5):** a secret cipher. On first launch every computer also gets its own
  random alphabet: each English letter A–Z gets a different rune symbol (drawn from 33: the 24 Elder Futhark runes
  and 9 Anglo-Saxon ones). The developer's hidden messages are English text written in these symbols (always a
  letter's first symbol). Each rune effect also has a symbol (the first letter of what it does; Free and Fizzle get
  different ones), which the drawn stand-in rune card shows if its fragment picture fails to load. Since Nov 9 the
  rune cards show the art team's fragments instead, so they no longer teach the alphabet. The made-up name (Vreth, Ulmo, …) stays with the shuffled card and tells you nothing.
  Saved like the mapping; a rune added in a later version just gets a symbol added to the saved alphabet.
- **Sources:** up to 2 from the event and 1 from the Warden, so at most 3 per run. **Never a random drop.**

| Effect | Type |
|---|---|
| Echo: the spell casts twice | Good |
| Amplify: +2 damage | Good |
| Siphon: heal 1 HP per enemy hit | Good |
| Volatile: double damage, but you take 2 damage | Risky |
| Free: costs 0 mana, but you lose 2 HP | Risky |
| Fizzle: nothing happens; mana and cards are spent | Bad |

Cut on Nov 9 (no fragment art): Widen (the shape grows 1 tile on each side) and Backfire (the spell hits you too).

## The board

| Element | Meaning |
|---|---|
| **Pillar** | **2 HP.** Any hit or collision removes 1; a destroyed pillar becomes open floor. Blocks movement, line of sight, Archer shots, the Warden's line and spells. |
| **Hole** | No unit walks into one. A unit **pushed** into a hole dies instantly (you included: game over), and its loot is lost. The Warden and the Redactor are too big to fall in: the hole stops them at its edge like the wall (1 damage). |
| **Drops** | Every monster that dies, whoever killed it, leaves a small bobbing item icon on its tile. One holding a rune glows bright purple, with a pulsing halo and a pool of purple light on the floor. Walk onto it to pick it up: a fragment goes to your discard pile; a Scrap's carried cards go back to your hand. |
| **Marked line** | The Warden's line, which fires 5 dmg at the start of its next turn. |
| <a id="erasure-zone"></a>**Erasure Zone** | Left by the Redactor's Chaos-mode explosions: the 3×3 block around it, its own tile included. Several zones add up. If you end your turn inside one, a random fragment from your hand is erased: gone for good, not discarded (the top card of your deck if your hand is empty). Then the zones fade. |
| **Hazards** | Fog, Magma and Quicksand from [merges](#element-merges). There are no separate traps in the demo. |

- **Pushes** come from Wind spells and Archer shots. A pushed unit slides the full distance unless something stops it.
  Massive units (the Warden, the Redactor) are pushed by Wind only, never by an arrow.
- **Collisions:** a push stopped by a unit or a pillar: the pushed unit and what it hit each take 1 damage, and the
  pushed unit stays put. Stopped by the room's wall: only the pushed unit takes 1.

**Unit types:**

| Unit | Type | Holes and push | Magma | Quicksand | Fog |
|---|---|---|---|---|---|
| Normal monsters (and you) | — | Affected | Affected | Affected | Affected (you: no) |
| Page Wards | Float | Immune | Immune | Immune | Immune |
| Warden | Massive | Wind pushes it (arrows don't); a hole stops it like the wall | Affected | Affected | Affected |
| The Redactor | Massive, tall | Wind pushes it (arrows don't); a hole stops it like the wall | Affected | Affected | Immune (its head stays above the fog) |

### On screen

- **Obstacles turn see-through.** Pillars (and any other obstacle that stands up off the floor) fade out whenever a
  unit stands behind them or the mouse is near them, so nothing hides behind the scenery. While faded, the mouse
  passes through them to the tiles and units behind, so the player can peek behind a pillar and spot anything placed
  there.
- **Units don't catch the mouse.** A unit's picture stands tall and covers the tiles behind it, so pointing, aiming
  and clicking always go to the floor tile under the mouse. To point at a unit (its card, or K in dev mode), point at
  the tile it stands on.
- **Marked line:** pulsing red tiles. **Erasure Zone:** dark violet tiles with a throbbing purple edge, drawn over
  the move highlights (Nov 6: it used to be near-black under them and was easy to miss).
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
- **Stun** cancels a marked line, and so does a **Wind push** that moves it off its tile. **Root** stops it walking,
  but it can still mark and fire.
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

| Room | Grid | You start | Door | Pillars (2 HP) | Holes (proposed) | Enemies (deploy order) |
|---|---|---|---|---|---|---|
| 1 · The Cistern | 6×6 | a1 | f6, always open | d4, c3 | b4, e5 | Rat f4, Brute c5, Brute e2 |
| 2 · The Scriptorium | 6×6 | a1 | f6 | b5, e5, b2, e2 | c2, d5 | Archer a6, Archer e6, Leech d2, Warden c4 |
| 3 · The Redactor | 8×8 | d1 | none | b6, g6, b3, g3 | a5, h4 | Fire Ward c7, Water Ward f7, Earth Ward d4, Redactor e5 |

**The door** is locked until every enemy in the room is dead (see [The run](#the-run)). While locked, the mage
can't step onto it, but monsters can walk over it; spells and shots pass over it like floor.

**The Cistern's door is always open** (the teaching room, as in the low-fi demo): step onto it on your turn and the
game asks whether to leave now. Leaving early is allowed, but every enemy still alive keeps what it would have
dropped, and anything on the floor stays there. A push that would
carry the mage onto the locked door stops there like the room's wall (1 damage). The boss room has no door:
killing the Redactor ends the demo.

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

**Event · The Whispering Lectern** (team decision, Nov 4; replaces the design's read / copy / leave). A small room
of its own: **5×5**, empty but for a **lectern** in the middle (c3), which blocks its tile. The mage comes in at
a1 and walks up to it by themselves (to c2); the **door (e5) stays locked until the mage reaches the lectern**. It
whispers in a familiar voice, in a language you don't understand: its line rises off its open book again and
again, *"Hail the rune lord"* written in the rune alphabet (also shown in its choice panel), readable only once
you've worked out enough runes.

1. **Take a rune fragment** or **Leave it.** Leaving ends the event.
2. If you took one, the lectern speaks plain words: *"…Still lost, would you? Though I am so thirsty… let me
   taste your blood."* The choices are plain on purpose (team decision, Nov 6: nothing says what they cost or give):
   **Sate the lectern's desire.** loses **2 HP** (this **can kill**) and gives a second rune: the mage is hurt and
   cries *"Ah! How???"*, then the rune is shown and the lectern answers *"Hmm… my favorite."* Or **Leave** with the
   one rune.

Runes taken are shown, then go into your deck (2 at most, each a symbol you don't have yet). When the event ends, the
mage walks out through the door by themselves. The player never moves the mage in this room (clicks on the board
do nothing), and combat controls are hidden.

**Camp** (team decision, Nov 4: a room like the lectern's). 5×5, with a **campfire** in the middle (c3) and **logs to
sit on** around it (b3, d3, c4); the fire and the logs block their tiles. The mage comes in at a1 and walks up to the
fire by themselves (to c2); the **door (e5) stays locked until the mage reaches the fire**. Choose one: **Rest**
(heal to full, 20 HP) or **Tear out a page** (remove one fragment from your deck for good; never one that would break
your grimoire). Then the mage walks out through the door by themselves. As in the lectern's room, the player never
moves the mage here and combat controls are hidden.

---

## Endless mode (the Demo's Endless Curse)

**Team decision (Nov 9):** the demo's content ends at the Redactor. Beating it shows **Victory** as before, but its
button is now **Continue** (with **New run** beside it). Continue breaks the fourth wall: the screen darkens to
purple, the mage glows purple with arms raised, and the curse types itself out in glitchy purple: *"There is no more
content in this demo. NOW GO SUFFER THE DEMO'S ENDLESS CURSE (PCG applied)."* A purple flash teleports the mage into
endless mode. It's the demo's proof of procedural content generation (PCG): every endless room is generated.

- **Carried over:** everything (deck, Grimoire, "Hmmm...", rune notes and meanings) except HP, which is restored to
  full as the curse takes hold.
- **No map, no doors.** A room is won by killing **every** monster. After CLEARED! you can walk around to pick up
  drops, then **Next: Camp** (the button that walks you to the door in a normal room) takes you to the camp.
- **The camp, between every two fights:** **Rest** heals 70% of your missing HP (rounded up), or **Tear out pages**
  removes 1 to 4 fragments of your choice for good (never so many that the grimoire can't make a spell). Then the mage
  walks out to the next room, which is **3 hardness harder**.
- **Death ends it:** *"The curse claims you"*, the rooms you cleared and your best on this computer, then the usual
  rune message and a new run in room 0.
- **On screen:** the top bar shows *Endless · Room N*, the room, and its **hardness and seed** (8 hex digits). The
  same seed and hardness always give the same room.
- **The Redactor in endless** is just another monster: killing it doesn't win (its Wards and Scraps work as in the
  boss room).

### How a room is generated (`src/engine/generate.ts`)

Each room has a **hardness**: a budget. Holes and monsters cost points, and the generator adds them until they add
up to the hardness **exactly**. Pillars are free cover. The first endless room is hardness **12**; each room cleared
adds **3** (12, 15, 18, 21…).

| Piece | Cost | Why |
|---|---|---|
| Hole | 1 | Blocks walking, and an Archer can push you in. It helps you too: push a monster in and it dies |
| Pillar | 0 | Helps you: blocks Archer and Warden lines, and breaks after 2 hits |
| Leech | 2 | 4 HP, but only drains mana |
| Rat | 2 | 2 HP, 1 dmg, fast; cheap so it can come in packs |
| Brute | 4 | 6 HP, 3 dmg |
| Archer | 4 | 3 HP, but 2 dmg at any range and a push |
| Warden | 7 | 8 HP, a 5 dmg line that hits every unit on it |
| The Redactor and its 3 Page Wards | 20 | The Act 1 boss fight on its own (Scraps are summoned, so free) |

Priced the same way, the hand-made rooms come to: the Cistern **12**, the Scriptorium **19**, the Redactor **22**.

| Rule | Value |
|---|---|
| Unlocks | Rats, Leeches, Brutes always; Archers from 12; the Warden from 15 (at most 1 below 25, 2 from 25, 3 from 40); the Redactor's team from 24 (at most once a room) |
| Room size | 6×6 up to 17, 7×7 up to 26, 8×8 after |
| Monster limit | 7 on 6×6, 9 on 7×7, 12 on 8×8 (the Redactor's team counts as 4) |
| Holes | About a fifth of the budget: at least 1, at most 5 (a leftover point or two can add one or two) |
| Pillars | 2–3 on 6×6, 2–4 on 7×7, 3–4 on 8×8 |
| Fair start | The mage starts in a corner; no monster within 2 tiles (diagonals count as 1), no hole or pillar right next to the mage |
| Floor | Holes never cut the floor in two, so loot can always be picked up. Monsters don't have to be reachable on foot: spells reach over holes, and pillars break |

**The order:** holes first, then monsters picked at random (weighted, with a bonus for kinds not in the room yet so
rooms vary), then any leftover point becomes a hole. A monster is only picked if the rest of the budget still fits
the places left, and as the room fills up the dearer monsters are favoured, so the budget always lands exactly.
Every number above is in `ENDLESS` in `src/engine/data.ts`; `src/engine/generate.test.ts` checks every rule over
2,550 generated rooms.

---

## Build decisions (Nov 4)

Details the design didn't settle, decided while building the engine. Where a rule above says otherwise, this
section wins.

**Spells and the board**

| Topic | Decision |
|---|---|
| Spells vs pillars | Only **damaging** spells chip a pillar (the pillar that stops a Beam or Cross arm, or one inside a Wall or Unstable Fire). Wind, Fog and Quicksand never do. |
| Wall vs pillars | A pillar in a Wall's row is hit (and chipped), and in a doubled Wall it **shields the tile behind it**. |
| Several units pushed | The **farthest from you moves first**, so a line of units slides together instead of bumping into each other. |
| Pushes over hazards | Sliding into **Quicksand stops the push** there (the unit is stuck). Sliding over or onto **Magma burns**. |
| Holes | Holes don't block spells, sight or shots; only walking. |
| You and statuses | Nothing Roots or Stuns you now (only the cut Backfire rune could). A Stunned mage can't cast; a Rooted one can't move. |

**Merges and hazards**

| Topic | Decision |
|---|---|
| Element effects | A merge does **only** its hazard row: no Burn, Root, Stun or charge-cancel. |
| Duration | The casting turn counts: cast on your turn 2, gone at the end of your turn 4. |
| Fog check | Checked **every action**: a monster that wanders out of the fog acts normally for the rest of its turn. |
| Fog on you | Standing in fog **hides you** from Archers and the Warden. |
| Fog vs a marked line | A Warden line marked before the fog came **fires anyway**. |
| Avoiding hazards | Monsters path around Magma and Quicksand **unless it's the only way**. |
| Quicksand escape | Escape progress **carries over** between turns. While stuck you can still Meditate and Reroll. |
| After CLEARED! | Hazards, statuses and Erasure Zones fade. |

**Monsters**

| Topic | Decision |
|---|---|
| Archer vs pillars | A pillar (or fog) in between **breaks the line**: the Archer walks to a clear one. |
| Collisions vs immunity | Immunities apply: bumping a Page Ward, or the Redactor while Wards stand, hurts only the pushed unit. |
| Wards vs Magma | Page Wards are **fully immune** to Magma, even its cast damage. |
| Warden can't fire | A Warden lost in fog or stuck in quicksand when its line should fire loses the line. |

**Runes**

| Topic | Decision |
|---|---|
| The 3-card limit | A rune **takes one of the 3 slots**: rune + one element + one shape. No runes on merges, doubled spells or Unstable Fire. |
| Invalid table | CAST stays lit with a rune on the table. If the fragments make no spell, the cast **fizzles**: mana and cards are spent, and the rune's own drawback (Volatile's 2 damage, Free's 2 HP) still happens. |
| Cost shown | Always the spell's cost + 1, even for Free, so the button never gives a rune away. The preview never shows a rune's effect. |
| Echo | The same tiles are hit a second time, right after the first (pushed units may have moved). |
| Amplify, Volatile | Amplify gives Wind 2 damage. Volatile doubles 0 to 0 but still hurts you. |
| Siphon | Heals 1 per enemy affected (not immune), up to max HP. |
| Which rune you get | A random symbol you don't already hold this run. |
| Event | Read aloud can't take you below 1 HP. Runes go into your deck. |

**The run and the Grimoire**

| Topic | Decision |
|---|---|
| Map | Not built yet (a teammate's work): the run goes Cistern → Event → Scriptorium → Camp → Boss directly. |
| After CLEARED! | Click any tile and the mage walks there (no actions); every tile passed picks up its drops. |
| The door | Kept from the low-fi demo (team decision, Nov 4), not in the design: see [Rooms](#rooms). Continue walks you to it; clicking the open door does the same. The Cistern's door is always open, so you can leave it early (losing the survivors' drops); everywhere else there's no early exit. |
| Grimoire pages | 22: Fire/Water/Earth/Wind × Beam/Cross/Wall (doubling doesn't matter), the 3 merges × 3 shapes, and Unstable Fire. |
| Grimoire save | **Across runs**, saved on the computer like the rune mapping. A spell that fizzles writes nothing. |
| Camp | Tearing out a page can't break your grimoire (that card is greyed out). Runes can be torn out. |
| Unstable Fire | Always 7 damage; the spin wheel is gone. |
| The lectern's and the camp's rooms | Team decision (Nov 4), not in the design: see [Event and camp](#event-and-camp). Layouts (and the lectern's lines) are `LECTERN_ROOM` and `CAMP_ROOM` in `src/engine/data.ts`. |
| Hmmm... and rune notes | Team decisions (Nov 4), not in the design: see ["Hmmm..."](#hmmm-the-spell-note) and [Runes](#runes). The Grimoire is unchanged (pages per element + shape). |
| Stronger Wind | **Team decision (Nov 4), not in the design** (which had push 1 / push 2): Wind pushes 2 tiles, and doubled Wind pushes until the target hits something, taking the usual 1 collision damage. |
| Wind pushes the Warden and the Redactor | **Team decision (Nov 8), not in the design** (where massive units can't be pushed): Wind pushes them like any monster; Archer arrows still can't. They're too big to fall into a hole: it stops them at its edge like the wall (1 damage). Pushing the Warden off its tile cancels its marked line. |
| Fragment and unit art | **Art team (Nov 9):** the hand holds torn grimoire pages (`public/art/spell_fragments/`), not cards; hovering one (in the hand or on the crafting table) shows its full card big, right of the board (`public/art/info_cards/`; a rune shows its page, name and your note instead). Units are the art team's full-body drawings: monsters from `public/art/sprites/`, the mage from `public/art/mc/` with four poses: running while walking, casting while their spell plays, meditating for a moment after Meditate and while on the sleeping mat, idle otherwise; the mage turns to face the way they walk or cast. The Wind info card was corrected to "PUSH 2" (Nov 9). |
| Six runes | **Team decision (Nov 9):** Widen and Backfire were cut, so each of the 6 rune fragments the art team drew is one rune card. See [Runes](#runes). |
| Magma burns on landing | **Team decision (Nov 4), not in the design:** units the Magma cast hits gain Burn 3 right away (after its 2 damage, if they survive), not only units that step onto it later. Page Wards stay fully immune. On screen, every unit that catches fire shows a flame burst and a *Burn 3* pop-up, and each Burn tick shows its damage with the Burn icon. |

> **Note for the team:** Erasure Zones fade at the end of your turn and Page Scraps act before the Redactor, so a
> Scrap never actually sees a zone. "Outside Erasure Zones first" is built, but it can't come up with the current
> timing.

## Changes from the previous rules

What the Nov 3 design changed compared with the previous rules. All of it is built now (the map screen excepted).

| Area | Before | Now |
|---|---|---|
| Run structure | 3 rooms in a row, each left through an exit tile | Map → Cistern → Event → Scriptorium → Camp → Boss |
| Ending a room | Step onto the exit (Room 2's unlocks when the Warden dies); skipped enemies forfeit loot | Kill every enemy → CLEARED! (the door opens) → walk to pick up drops → Continue walks you out through the door. Only the Cistern's door is open from the start (early exit, survivors' drops lost) |
| Elements | Fire, Water, Rock | Fire, Water, **Earth** (renamed Rock), **Wind** (new: 0 damage, push 2 / doubled: until it hits something) |
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
| Unit types | — | Float (Wards) are immune to holes and pushes; Massive (Warden, Redactor) can't fall into holes and only Wind pushes them |
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
