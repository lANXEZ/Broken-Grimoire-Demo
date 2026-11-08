/**
 * [WRITING] The opening cutscene and tutorial (game/useIntro.ts), and the mage's other spoken lines. Edit the words
 * here; the order things happen in is in useIntro.ts. Each line shows in a speech bubble over the mage and stays
 * until the player presses Space (or Enter, or clicks) for the next one.
 *
 * Plays the first time Start is pressed on a computer (a Skip button jumps straight to the game).
 */
export const INTRO = {
  /**
   * Room 0, dark and empty: the mage comes to in front of the door they sealed with a string of spells (the last one
   * blew up and knocked them out). They have a few grimoire fragments on them, but don't notice yet.
   */
  waking: ['Ahh… What happened?', 'Where is this? Why is it so dark?', 'Maybe that door leads somewhere.'],
  /** The Cistern, the moment the torches light up and show the brute. */
  spotted: ['!!!', 'A monster??'],
  /** The brute's first step toward the mage. */
  panic: ['That’s not good.', 'Don’t come any closer!!'],
  /** Long spells shouted from memory: without the grimoire only a puff of air comes out after each. */
  firstSpell: 'SUPREME CRIMSON INFERNO DRAGON-SPIRAL NOVA!!!',
  noGrimoire: ['Huh??', 'Wait, where the hell is my grimoire?'],
  hellNah: 'Hell nah.',
  moreSpells: ['GRAND TERRA COLOSSUS EARTHSHATTER FIST!!', 'ETERNAL ABYSSAL TIDE-SERPENT MAELSTROM!!!'],
  /** The brute stops in front of the mage. */
  doomed: 'Naw man.',
  /** Back in room 0, after being thrown out through the door. */
  thrownOut: 'Guess I have to make a plan first.',
  /** The campfire and the mat are there now; the fire isn't lit. */
  campMade: ['Now, the first problem: how do I light this up?', '…'],
  /** The mage calms down and checks what they have on them: the grimoire fragments they've had all along. */
  checkPockets: [
    'Calm down. Think.',
    'What do I have on me?',
    'These… are pages of my grimoire!!!',
    'Why is it torn up like this?',
    'Hmm, spells are usually just words put together anyway.',
  ],
  atFire: 'Will this work?',
  /** The tutorial's tips: over the fragment to drag, then over the Cast button once both are on the table. */
  tipDrag: 'Drag the fragment and place it on the crafting table',
  tipAim: 'Select a direction',
  /** A cast that didn't light the fire; then the hand gets Fire and Beam back and it starts again. */
  missed: ['Ah, missed!', 'One more time!'],
  lit: ['YESSS!! It works!!!', 'I can gather more fragments to fight those monsters and find a way out.'],
  /**
   * Still at the fire: the mage counts the fragments they have (the starting deck, engine/cards.ts STARTING_DECK; a test
   * checks these numbers match it) and gets ready to head out, then takes a step toward the door.
   */
  takeStock: [
    'Let’s check first: how many fragments have I got?',
    'Three Fire, two Water, two Earth and two Wind…',
    'Two Beams, two Crosses and one Wall.',
    'Fourteen fragments. Not much of a grimoire, but it’s a start.',
    'That should be enough to fight my way out of here.',
  ],
  /** After one step toward the door. */
  warmth: ['When did a campfire’s warmth become this comfortable?', 'Let’s rest a little before I try again, then.'],
  /** On the mat, just before the eyes close and the game starts. */
  lastLine: 'Ah, I can’t wait to get out of here.',
};

/** Where things are in the cutscene (room 0 is 3×4: door c4, campfire b2, mat a1–b1, sealed door a4, its trail a3). */
export const INTRO_PLACES = {
  /** Room 0: where the mage comes to, on the spell trail in front of the sealed door. */
  wake: 'a3',
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
