import type { SoundName } from '../audio/synth';

/**
 * [SOUND] How loud everything is. The sounds themselves are made in code (audio/synth.ts); the player's own volume
 * and mute (Menu → Settings) sit on top of all of this.
 */
export const SOUND = {
  /** The volume a new player starts with (0-1). */
  defaultVolume: 0.7,
  /** How much of each effect goes into the dungeon's echo (0 = dry). */
  reverb: 0.22,
  /** How long the dungeon's echo rings, in seconds. */
  reverbTime: 1.8,
  /** All effects together, before the player's volume. */
  effects: 0.9,

  /** Each effect's loudness (1 = as made). Anything missing plays at 1. */
  levels: {
    // menus and cards
    click: 0.6,
    cardPick: 1,
    cardPlace: 0.9,
    cardReturn: 1,
    cardMark: 0.8,
    draw: 1.2,
    reroll: 0.8,
    // spells, and each tile they erupt on
    fire: 0.8,
    water: 1.8,
    earth: 0.6,
    wind: 2.5,
    fog: 0.8,
    magma: 0.9,
    quicksand: 1.8,
    unstable: 0.6,
    fizzle: 1.3,
    tickWater: 1.6,
    tickEarth: 0.45,
    tickWind: 1.8,
    tickFog: 1.2,
    tickMagma: 1.6,
    tickQuicksand: 1.8,
    // hits
    hit: 0.8,
    kill: 0.8,
    pillarChip: 2,
    pillarBreak: 0.8,
    bump: 0.8,
    // runes
    amplify: 0.65,
    volatile: 0.7,
    siphon: 1.2,
    runeFizzle: 1.2,
    // the mage and the monsters
    step: 0.8,
    enemyStep: 1.6,
    hurt: 0.85,
    loot: 1.4,
    meditate: 0.8,
    stuck: 1.2,
    spawn: 2,
    // the game moving on
    enemyTurn: 0.55,
    roomEnter: 0.9,
    cleared: 1.2,
    victory: 1.2,
    door: 0.8,
    torches: 2.5,
    eyesClose: 1.5,
    wake: 1.3,
    whisper: 3,
    // the background's events
    drip: 1.2,
    pebbles: 1.5,
    pop: 2,
  } as Partial<Record<SoundName, number>>,

  /** The background sounds: how loud, and how long they take to fade in and out (seconds). */
  ambience: {
    fade: 1.6,
    /** The title screen: wind in the trees, crickets, now and then an owl. */
    forest: 0.55,
    /** Every room: a cave. A deep steady hum, water dripping into pools, pebbles falling, a far rumble. */
    dungeon: 0.5,
    /** How long the cave's echo on those rings, in seconds. */
    caveEcho: 3.5,
    /** A lit campfire (room 0, the camp): crackling. */
    campfire: 0.7,
  },

  /** Several of the same effect at once (six monsters stepping) play as one if they start this close (seconds). */
  sameSoundGap: 0.035,
};
