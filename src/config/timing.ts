/** [TIMING] Animation speeds, in milliseconds unless noted. Lower = snappier game. */
export const TIMING = {
  /** Pause after the "Enemy turn" banner before the first enemy acts. */
  enemyTurnStartDelay: 700,
  /** Time between two enemy actions while the enemy turn plays out. */
  enemyStep: 560,
  /** How long the "Your turn" / "Enemy turn" banner stays up. */
  banner: 1100,
  /** Unit glide speed between tiles (higher = faster, it's an exponential ease rate per second). */
  unitMoveRate: 14,
  /** How long a spell's area flashes on the board after a cast. */
  castFlash: 650,
  /** How long a floating damage number stays up. */
  damageNumber: 950,
  /** How long the flame burst and "Burn 3" pop-up stay up when a unit catches fire. */
  burnPopup: 1300,
  /** A new line in the "Hmmm..." note glows this long. */
  noteFresh: 2600,
  /** After CLEARED!: time per tile when the wizard walks to a clicked tile. */
  freeWalkStep: 170,
  /** Picking up a drop: the card is shown big for this long… */
  pickupHold: 800,
  /** …then flies into the discard pile (or the hand) in this long. */
  pickupFly: 450,
  /** The lectern's room: pause before the wizard walks up to the lectern, and before walking out once it's over. */
  eventWalkInDelay: 700,
  eventWalkOutDelay: 1800,
  /** The opening: the title fading out (Continue), the eyes closing (New game), the waking blink, the first thought. */
  titleFade: 500,
  /** "Get some rest?" on room 0's mat: the eyes close slowly, then the title screen fades in. */
  restClose: 1100,
  eyesClose: 455,
  wakeBlink: 1820,
  wakeThought: 5500,
  /**
   * After a defeat (Continue): the screen fades to black, then the rune message appears left to right as if someone
   * were saying it (one letter every fateLetter ms, a little longer between words, a pause after , . ! ? as when
   * speaking), each letter fading in over fateLetterFade. It stays for fateHold once it's all there, fades out, and
   * the wizard wakes up in room 0 (the waking blink above).
   */
  fateFade: 900,
  fateLetter: 75,
  fateWordGap: 170,
  fatePause: 700,
  fateLetterFade: 450,
  fateHold: 2800,
  fateMessageOut: 1000,
  /** Toasts (loot, errors) auto-dismiss after this. */
  toast: 3400,
} as const;
