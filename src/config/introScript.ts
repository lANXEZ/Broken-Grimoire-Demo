/**
 * [WRITING] The opening cutscene and tutorial (game/useIntro.ts), and the mage's other spoken lines. Edit the words
 * here; the order things happen in is in useIntro.ts. Each line shows in a speech bubble over the mage and stays
 * until the player presses Space (or Enter, or clicks) for the next one.
 *
 * Plays the first time Start is pressed on a computer (a Skip button jumps straight to the game).
 */
export const INTRO = {
  /** Room 0, dark and empty: the mage has just fallen in through the hole in the ceiling. */
  waking: ['Ahh… What happened?', 'Where is this? Why is it so dark?', 'Maybe that door leads somewhere.'],
  /** The Cistern, the moment the torches light up and show the brute. */
  spotted: ['!!!', 'A monster??', 'Is that a brute?'],
  /** The brute's first step toward the mage. */
  panic: ['That’s not good.', 'Don’t come any closer!!'],
  /** Shouted spells: only a puff of air comes out after each. */
  firstSpell: 'HERE! ROCK BEAM!!!',
  noGrimoire: ['Huh??', 'Wait, where the hell is my grimoire?'],
  hellNah: 'Hell nah.',
  moreSpells: ['FIRE BEAM!!!', 'ROCK SPEAR!!'],
  /** The brute stops in front of the mage. */
  doomed: 'Naw man.',
  /** Back in room 0, after being thrown out through the door. */
  thrownOut: 'Guess I have to make a plan first.',
  /** The campfire and the mat are there now; the fire isn't lit. */
  campMade: ['Now, the first problem: how do I light this up?', '…'],
  noticeItem: 'Wait, is that a…',
  pickUp: ['A fragment of my grimoire!!!', 'Why is it torn up like this?', 'Hmm, spells are usually just words put together anyway.'],
  atFire: 'Will this work?',
  /** The tutorial's tips: over the fragment to drag, then over the Cast button once both are on the table. */
  tipDrag: 'Drag the fragment and place it on the crafting table',
  tipAim: 'Select a direction',
  /** A cast that didn't light the fire; then the hand gets Fire and Beam back and it starts again. */
  missed: ['Ah, missed!', 'One more time!'],
  lit: ['YESSS!! It works!!!', 'I can gather more fragments to fight those monsters and find a way out.'],
  /** After one step toward the door. */
  warmth: ['When did a campfire’s warmth become this comfortable?', 'Let’s rest a little before I try again, then.'],
  /** On the mat, just before the eyes close and the game starts. */
  lastLine: 'Ah, I can’t wait to get out of here.',
};

/** Where things are in the cutscene (room 0 is 3×4: door c4, campfire b2, mat a1–b1, moonlight a3–a4). */
export const INTRO_PLACES = {
  /** Room 0: where the mage lands from the hole (in the moonlight). */
  fall: 'a3',
  /** Room 0: the item (a grimoire fragment) lying on the far side from the door. */
  item: 'c1',
  /** Room 0: where the mage lands when thrown back out of the door. */
  thrown: 'b3',
  /** Room 0: in front of the campfire, facing it (the tutorial is played from here). */
  atFire: 'b1',
  /** Room 0: one step toward the door after the fire is lit, then onto the mat. */
  stepToDoor: 'c1',
  mat: 'a1',
  /** The Cistern: the one brute (the room's real rat and other brute aren't in the cutscene) and its walk. */
  bruteFrom: 'e2',
  brutePath: ['d2', 'c2', 'b2', 'b1'],
};

/** The mage's reaction when they feed the Whispering Lectern their blood. */
export const LECTERN_OUCH = 'Ah! How???';
