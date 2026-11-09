/**
 * What the mage thinks out loud on waking up in room 0 (a thought cloud over their head).
 *
 * WRITERS' NOTE (story, not for the player): the mage has lost their memory; the title screen's forest is their
 * dream of outside. They've been down here for about 2000 years, lured in by the rune magic, and the dungeon (the
 * source of that magic) is trying to make them its guardian. It never quite succeeds: at the end, when the mage
 * realises the truth, they tear their grimoire apart to stop the dungeon and cast a spell that wakes them up in the
 * past, hoping the next time round will win. The dungeon's voice is the mage's own: the dark part of them that was
 * torn away with the grimoire, lingering down here and luring them into the same fate (the Whispering Lectern's
 * "familiar voice"). The "monsters" are people trying to clear the dungeon, whom the runes make the mage see as
 * monsters. The lines only hint at this: never say it outright.
 */

/** The first waking on this computer, right after the opening cutscene and tutorial. */
export const FIRST_WAKE_THOUGHT = 'Camp’s made. Now let’s see if those scrambled words can get me out of here.';

/** Every waking after that (a new run, after resting on the mat, after a defeat): one at random, never twice in a row. */
export const WAKE_THOUGHTS = [
  'That dream of outside again… How long have I been stuck here?',
  'I almost remembered my own name this time…',
  'The forest felt further away tonight. Was it ever real?',
  'These scratches on the wall… did I make all of them?',
  'My robe is falling apart at the hems. How long did I sleep?',
  'That voice in my sleep again… Why do I know it so well?',
  'The whispers sounded almost fond of me tonight. Like an old friend.',
  'These walls feel more like home every time I wake. That should worry me.',
  'Something down here doesn’t want me to leave. Then I’ll find the way out myself.',
  'Screams again in my sleep. For a moment, they almost sounded like words…',
  'I’ve walked this room before. Every stone of it. But when?',
  'Torn pages in my dream again. Why does that feel like hope?',
];

const LAST_KEY = 'broken-grimoire/wake-thought/v1';

/** A waking line: the first-time one, or a random one from the rest that isn't the line shown last time. */
export function pickWakeThought(first: boolean): string {
  if (first) return FIRST_WAKE_THOUGHT;
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST_KEY) ?? -1);
  } catch {
    // No storage: any line will do.
  }
  const choices = WAKE_THOUGHTS.map((_, i) => i).filter((i) => i !== last);
  const i = choices[Math.floor(Math.random() * choices.length)];
  try {
    localStorage.setItem(LAST_KEY, String(i));
  } catch {
    // Not remembered; fine.
  }
  return WAKE_THOUGHTS[i];
}
