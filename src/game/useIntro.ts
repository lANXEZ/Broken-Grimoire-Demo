import { useCallback, useEffect, useRef, useState } from 'react';
import { PROLOGUE_ROOM, cloneState, createGame, freeWalkPath, parseCoord, type GameState, type Pos } from '../engine';
import { INTRO, INTRO_PLACES } from '../config/introScript';
import { TIMING } from '../config/timing';
import type { Flight } from '../scene/Unit';
import { shakeCamera } from '../scene/SpellFx';
import type { GameApi } from './useGame';
import { TUTORIAL_KINDS, introCistern, introRoom0, tutorialState, withInHand } from './intro';

/**
 * The opening cutscene and tutorial, played the first time Start is pressed on a computer (App.tsx). The words are
 * in config/introScript.ts; the order things happen in is `play` below.
 *
 * The cutscene shows its own game states (game/intro.ts) on the board, with no HUD. The tutorial in the middle is
 * the real game: room 0 with the fire out, and the HUD back on screen (App.tsx limits what can be done). A cast that
 * lights the fire ends it; any other cast is a miss, and the hand gets Fire and Beam back for another go.
 */
export interface IntroView {
  /** What the board shows, or null for the real game (the tutorial). */
  state: GameState | null;
  speech: string | null;
  dark: number;
  torchesLit: boolean;
  enemiesHidden: boolean;
  mageHidden: boolean;
  flight: Flight | null;
  /** The screen is faded to black. */
  black: boolean;
  /** An eye blink playing over the scene. */
  blink: 'wake' | null;
  /** The tutorial is on: the real game and its HUD are showing. */
  tutorial: boolean;
  /** Tutorial: the mage is talking (after a miss, or once it worked), so the hand and board wait. */
  tutorialWait: boolean;
}

const START: IntroView = {
  state: null,
  speech: null,
  dark: 1,
  torchesLit: true,
  enemiesHidden: false,
  mageHidden: true,
  flight: null,
  black: false,
  blink: null,
  tutorial: false,
  tutorialWait: false,
};

export interface IntroApi {
  active: boolean;
  view: IntroView;
  /** Start the cutscene (the real game must be a fresh room 0). */
  start: () => void;
  /** Jump to the end (the Skip button): `onDone` is called as if it had finished. */
  skip: () => void;
  /** A click: the line being said moves on sooner. */
  advance: () => void;
  /** Tutorial: a cast has resolved (the state after it). */
  afterCast: (after: GameState) => void;
  /** Back to the normal game (App calls this once the next run has started). */
  stop: () => void;
}

class Cancelled extends Error {}

interface Run {
  cancelled: boolean;
  timers: number[];
  /** Ends the line being said (Space, Enter or a click). */
  advance: (() => void) | null;
  lineShownAt: number;
  /** Tutorial: waiting for a cast. */
  cast: ((after: GameState) => void) | null;
}

export function useIntro({ game, onHurt, onPuff, onDone }: {
  game: GameApi;
  /** The mage is hurt (the red edge of the screen). */
  onHurt: () => void;
  /** A puff of air where the mage stands (a spell that doesn't work, a landing). */
  onPuff: (at: Pos) => void;
  /** The last line is said, or Skip: App closes the eyes and starts the game. */
  onDone: () => void;
}): IntroApi {
  const [active, setActive] = useState(false);
  const [view, setView] = useState<IntroView>(START);
  const run = useRef<Run | null>(null);
  // The callbacks read the latest game and handlers when they fire.
  const latest = useRef({ game, onHurt, onPuff, onDone });
  latest.current = { game, onHurt, onPuff, onDone };

  const cancel = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.cancelled = true;
    r.timers.forEach((t) => window.clearTimeout(t));
    run.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const start = useCallback(() => {
    cancel();
    const r: Run = { cancelled: false, timers: [], advance: null, lineShownAt: 0, cast: null };
    run.current = r;
    setActive(true);
    setView(START);
    play(r, latest, setView).catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
  }, [cancel]);

  const skip = useCallback(() => {
    cancel();
    latest.current.onDone();
  }, [cancel]);

  const advance = useCallback(() => {
    const r = run.current;
    if (r?.advance && performance.now() - r.lineShownAt > TIMING.speechMinShow) r.advance();
  }, []);

  // Space (or Enter) moves on to the next line. Holding the key down doesn't race through them.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, advance]);

  const afterCast = useCallback((after: GameState) => run.current?.cast?.(after), []);

  const stop = useCallback(() => {
    cancel();
    setActive(false);
    setView(START);
  }, [cancel]);

  return { active, view, start, skip, advance, afterCast, stop };
}

type Latest = { current: { game: GameApi; onHurt: () => void; onPuff: (at: Pos) => void; onDone: () => void } };

/** The cutscene, step by step. Every wait throws Cancelled once Skip is pressed, which ends it. */
async function play(r: Run, latest: Latest, setView: (v: IntroView) => void): Promise<void> {
  let cur: IntroView = START;
  let flights = 0;
  const check = () => {
    if (r.cancelled) throw new Cancelled();
  };
  const patch = (p: Partial<IntroView>) => {
    check();
    cur = { ...cur, ...p };
    setView(cur);
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      r.timers.push(window.setTimeout(resolve, ms));
    }).then(check);
  /** A line over the mage's head. It stays until the player presses Space (or Enter, or clicks). */
  const say = async (text: string, during?: () => void) => {
    patch({ speech: text });
    r.lineShownAt = performance.now();
    if (during) r.timers.push(window.setTimeout(() => !r.cancelled && during(), TIMING.shoutPuff));
    await new Promise<void>((resolve) => {
      r.advance = () => {
        r.advance = null;
        resolve();
      };
    });
    check();
    patch({ speech: null });
    await sleep(TIMING.speechGap);
  };
  const scene = () => cur.state!;
  const setScene = (s: GameState) => patch({ state: s });
  const mageAt = () => scene().player.pos;
  /** Walk to a tile, one step at a time. */
  const walk = async (to: string) => {
    for (const p of freeWalkPath(scene(), parseCoord(to)) ?? []) {
      const s = cloneState(scene());
      s.player.pos = p;
      setScene(s);
      await sleep(TIMING.introWalkStep);
    }
  };
  const moveBrute = (to: string) => {
    const s = cloneState(scene());
    s.enemies.forEach((e) => (e.pos = parseCoord(to)));
    setScene(s);
  };
  const puff = () => latest.current.onPuff(mageAt());
  const fly = (from: Pos | null, height: number, ms: number) => patch({ mageHidden: false, flight: { id: ++flights, from, height, ms } });
  const fadeToBlack = async (hold: number) => {
    patch({ black: true });
    await sleep(TIMING.introBlackFade + hold);
  };
  const fadeIn = async () => {
    patch({ black: false });
    await sleep(TIMING.introBlackFade);
  };

  // A fresh room 0 to build the scenes from (the game's own state may not be one yet when this starts).
  const base = createGame(Date.now(), { prologue: true, runeMap: latest.current.game.state.runeMap });
  const empty = introRoom0(base, { camp: false });

  // 1. Room 0, dark and empty. The mage comes to in front of the door they sealed (the last spell knocked them out).
  patch({ state: empty, dark: 1, mageHidden: false, blink: 'wake' });
  await sleep(TIMING.wakeBlink);
  patch({ blink: null });
  await sleep(700);
  for (const line of INTRO.waking) await say(line);

  // 2. Through the door into the Cistern: dark, then the torches catch and show the brute.
  await walk(PROLOGUE_DOOR);
  await fadeToBlack(250);
  patch({ state: introCistern(base), dark: 1, torchesLit: false, enemiesHidden: true });
  await fadeIn();
  await sleep(TIMING.roomDark);
  patch({ torchesLit: true, dark: 0, enemiesHidden: false });
  await sleep(1100);
  for (const line of INTRO.spotted) await say(line);

  // 3. The brute comes; no spell works.
  const [step1, step2, step3, step4] = INTRO_PLACES.brutePath;
  moveBrute(step1);
  await sleep(500);
  for (const line of INTRO.panic) await say(line);
  moveBrute(step2);
  await sleep(450);
  await say(INTRO.firstSpell, puff);
  for (const line of INTRO.noGrimoire) await say(line);
  moveBrute(step3);
  await sleep(450);
  await say(INTRO.hellNah);
  for (const line of INTRO.moreSpells) await say(line, puff);
  moveBrute(step4);
  await sleep(700);
  await say(INTRO.doomed);

  // 4. Back in room 0: a moment later the mage is hurt (off screen) and thrown back out through the door.
  await fadeToBlack(150);
  patch({ state: empty, dark: 1, torchesLit: true, mageHidden: true });
  await fadeIn();
  await sleep(900);
  latest.current.onHurt();
  shakeCamera(0.14, 0.4);
  await sleep(800);
  const thrown = cloneState(empty);
  thrown.player.pos = parseCoord(INTRO_PLACES.thrown);
  setScene(thrown);
  fly(parseCoord(PROLOGUE_DOOR), 1.2, TIMING.introThrow);
  await sleep(TIMING.introThrow);
  shakeCamera(0.1, 0.3);
  puff();
  await sleep(900);
  await say(INTRO.thrownOut);

  // 5. Black, then the campfire (not lit) and the mat are there. The mage calms down and finds the fragments on them.
  await fadeToBlack(TIMING.introCampBlack);
  const camp = introRoom0(base, { camp: true });
  camp.player.pos = parseCoord(INTRO_PLACES.thrown);
  patch({ state: camp, flight: null });
  await fadeIn();
  await sleep(400);
  for (const line of INTRO.campMade) await say(line);
  await sleep(1000);
  for (const line of INTRO.checkPockets) await say(line);
  await walk(INTRO_PLACES.atFire);
  await say(INTRO.atFire);

  // 6. The tutorial, in the real game: light the fire with Fire + Beam.
  const { game } = latest.current;
  game.newRun();
  game.amend(tutorialState);
  patch({ state: null, tutorial: true, tutorialWait: false });
  for (;;) {
    const after = await new Promise<GameState>((resolve) => (r.cast = resolve));
    r.cast = null;
    check();
    patch({ tutorialWait: true });
    await sleep(TIMING.introAfterCast);
    if (after.room.fireLit !== false) break;
    for (const line of INTRO.missed) await say(line);
    latest.current.game.amend((s) => withInHand(s, TUTORIAL_KINDS));
    patch({ tutorialWait: false });
  }

  // 7. It worked: the room fills with the fire's light. A step toward the door, then a rest on the mat.
  patch({ tutorial: false, tutorialWait: false, dark: 0 });
  for (const line of INTRO.lit) await say(line);
  patch({ state: cloneState(latest.current.game.state) });
  await walk(INTRO_PLACES.stepToDoor);
  for (const line of INTRO.warmth) await say(line);
  await walk(INTRO_PLACES.mat);
  await say(INTRO.lastLine);
  await sleep(300);
  latest.current.onDone();
}

const PROLOGUE_DOOR = PROLOGUE_ROOM.exit;
