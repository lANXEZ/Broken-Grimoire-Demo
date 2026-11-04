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
  /** After CLEARED!: time per tile when the wizard walks to a clicked tile. */
  freeWalkStep: 170,
  /** Picking up a drop: the card is shown big for this long… */
  pickupHold: 800,
  /** …then flies into the discard pile (or the hand) in this long. */
  pickupFly: 450,
  /** Toasts (loot, errors) auto-dismiss after this. */
  toast: 3400,
} as const;
