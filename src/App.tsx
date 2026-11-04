import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ENEMY_DEFS,
  GRIMOIRE_PAGES,
  castFx,
  onOpenExit,
  exitOpen,
  campChoice,
  continueRun,
  devRemoveEnemy,
  endPlayerTurn,
  enemyAt,
  eventChoice,
  freeStep,
  freeWalkPath,
  isPrologue,
  PROLOGUE_ROOM,
  moveTarget,
  playerCast,
  playerEscape,
  playerMeditate,
  playerMove,
  playerReroll,
  previewIntents,
  type CastFx,
  type Dir,
  type GameState,
  type Pos,
} from './engine';
import { setDevMode, useDevMode } from './config/dev';
import { LAYOUT, layoutCssVars, uiScale } from './config/layout';
import { TIMING } from './config/timing';
import { DIRS, aimDirection, cleanTable, placeOnTable, previewCast, removeFromTable, tableCards, type Table } from './game/casting';
import { useEnemyTurn } from './game/useEnemyTurn';
import { noteView, type NoteLine } from './game/notes';
import { useGame } from './game/useGame';
import { GameScene } from './scene/GameScene';
import type { BoardOverlays } from './scene/TileOverlay';
import { fxEventDuration, type CastEvent, type FxEvent, type RuneEvent } from './scene/SpellFx';
import { FX } from './config/fx';
import { EndTurnButton, EscapeButton, ManaOrb, MeditateButton, Pile, RerollButton } from './hud/Controls';
import { DevBar } from './hud/DevBar';
import { CampPanel, ClearedPanel, DeckView, EventPanel, GameOverDialog, GrimoireBook, LeaveEarlyDialog, MenuDialog } from './hud/Dialogs';
import { HmmmNote } from './hud/HmmmNote';
import { Blink, FateScreen, TitleScreen } from './hud/TitleScreen';
import { ThoughtFilters } from './hud/Thought';
import { FragmentCard, Hand } from './hud/Hand';
import { EnemyCaption, LogDrawer, PickupReveal, Toasts, TurnBanner, type Pickup, type Toast } from './hud/Overlays';
import { CraftingTable, TABLE_AREA_SELECTOR } from './hud/CraftingTable';
import { TopBar } from './hud/TopBar';
import { useCardDrag, type DragSource } from './hud/useCardDrag';

/** What the player is in the middle of, on top of the game state. */
type UiMode =
  /** Normal play. While a castable Beam or Wall is on the crafting table, the board is aiming it (see `aiming`). */
  | { kind: 'idle' }
  /** Picking hand cards to reroll. */
  | { kind: 'reroll'; marked: number[] };

const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
let nextId = 1;

/** A rune cast playing out in parts (see `castTable`). */
interface CastPlay {
  /** The state the board shows meanwhile (the spell part alone), or null for the real one. */
  shown: GameState | null;
  /** The rune's part: HP changes show as purple numbers. */
  runeTint: boolean;
  /** Free: the mana orb glows purple as the mana comes back. */
  manaGlow: boolean;
  timers: number[];
  fxIds: number[];
}

/**
 * [UI-PLACEMENT] Keeps the HUD scaled to the window: `--u` is one design pixel (config/layout.ts) and the page's
 * root font size is 16 design pixels, so `1rem` in hud.css means "16px on a 1920×1080 screen".
 */
function useUiScaleVar() {
  const [u, setU] = useState(() => uiScale(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setU(uiScale(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * u}px`;
  }, [u]);
  return u;
}

export function App() {
  const game = useGame();
  const dev = useDevMode();
  const enemyTurn = useEnemyTurn(game);
  const state = game.state;
  const shown = enemyTurn.shown;
  const u = useUiScaleVar();

  const [rawTable, setTable] = useState<Table>([]);
  const [mode, setMode] = useState<UiMode>({ kind: 'idle' });
  const [hover, setHover] = useState<Pos | null>(null);
  const [fx, setFx] = useState<FxEvent[]>([]);
  const [castPlay, setCastPlay] = useState<CastPlay | null>(null);
  const castPlayRef = useRef<CastPlay | null>(null);
  const castPlaying = !!castPlay;
  /** What the board and HUD show: a rune cast's part while it plays, else the (enemy turn's) state. */
  const view = castPlay?.shown ?? shown;
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * The opening: the title screen ('title'), fading out on Continue ('leaving'), eyes closing over it on New game
   * ('closing'), then waking in room 0 ('waking'); null once playing.
   */
  const [intro, setIntro] = useState<'title' | 'leaving' | 'closing' | 'fate' | 'resting' | 'waking' | null>('title');
  /** What the wizard is thinking (a thought cloud over their head), e.g. on waking in room 0. */
  const [thought, setThought] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  /**
   * After CLEARED!: the tiles still to walk through (one free step every TIMING.freeWalkStep). `leave` = this is
   * the walk to the door: when it ends, the wizard goes on to the next stop.
   */
  const [walk, setWalk] = useState<{ path: Pos[]; leave: boolean }>({ path: [], leave: false });
  /** "You left n items behind. Leave anyway?" is showing. */
  const [leaveAsk, setLeaveAsk] = useState(false);
  /** Mid-fight in an always-open door: the "Leave now?" prompt is showing. */
  const [earlyAsk, setEarlyAsk] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<{ id: number; title: string; sub?: string; kind: 'player' | 'enemy' | 'room' } | null>(null);

  const hand = state.cards.hand;
  // Cards can leave the hand behind the table's back (stolen, erased, cast): drop them from the table.
  const table = cleanTable(hand, rawTable);
  useEffect(() => {
    if (table !== rawTable) setTable(table);
  }, [table, rawTable]);

  const finished = state.phase === 'won' || state.phase === 'lost';
  // The camp is a screen between rooms; the lectern's event is a small room of its own (walk around, no combat).
  /** In the lectern's or the camp's room: no combat; the wizard walks in, the player chooses, the wizard walks out. */
  const inEvent = state.phase === 'event' || state.phase === 'camp';
  /** Room 0: no enemies; click anywhere to walk, the door starts the run, spells are free to try. */
  const prologue = isPrologue(state) && state.phase === 'player';
  /** Walking around without turns: after CLEARED!, in the event and camp rooms, and in room 0. */
  const freeWalk = state.phase === 'cleared' || inEvent || prologue;
  const dialogOpen = menuOpen || bookOpen || deckOpen || finished || earlyAsk;
  // Room 0: standing still on the mat, with nothing else going on (not even the wake-up thought), offers rest.
  const onMat = !!state.room.mat?.some((p) => samePos(p, state.player.pos));
  const restPrompt =
    prologue && onMat && !intro && !thought && !castPlaying && !dialogOpen && walk.path.length === 0 && mode.kind === 'idle' && table.length === 0;
  const canAct = state.phase === 'player' && !enemyTurn.playing && !castPlaying && !dialogOpen && state.actionsLeft > 0;

  const onTable = useMemo(() => tableCards(hand, table), [hand, table]);
  const tablePlaced = useMemo(
    () => table.flatMap((place) => hand.filter((c) => c.id === place.id).map((card) => ({ card, place }))),
    [hand, table],
  );
  const preview = useMemo(() => previewCast(state, onTable), [state, onTable]);
  const intents = useMemo(() => (state.phase === 'player' ? previewIntents(state) : {}), [state]);

  // Leave reroll mode when the turn ends; clear the table when the run moves on.
  useEffect(() => {
    if (state.phase !== 'player') setMode({ kind: 'idle' });
  }, [state.phase]);
  useEffect(() => setTable([]), [state.stage]);
  // Stuck in quicksand: no casting, so the crafting table makes way for the Climb out button (cards go back to the hand).
  const stuck = state.phase === 'player' && state.player.status.stuck > 0;
  useEffect(() => {
    if (stuck) setTable([]);
  }, [stuck]);

  // ------------------------------------------------------------ the opening: title screen, waking up in room 0

  /** Open your eyes in room 0 (a new run): blink awake, then the wizard thinks out loud. */
  const wakeUp = useCallback(() => {
    setIntro('waking');
    window.setTimeout(() => {
      setIntro(null);
      setThought(PROLOGUE_ROOM.wakeThought);
    }, TIMING.wakeBlink);
  }, []);
  const startNewGame = () => {
    setIntro('closing');
    window.setTimeout(() => {
      // A fresh run in room 0 (the game opened on one already unless a run was saved).
      if (game.resumable || !isPrologue(game.state) || game.state.log.length > 3) game.newRun();
      resetCasting();
      wakeUp();
    }, TIMING.eyesClose);
  };
  const continueGame = () => {
    setIntro('leaving');
    window.setTimeout(() => setIntro(null), TIMING.titleFade);
  };
  /** "Get some rest?" on room 0's mat: the eyes close slowly, and the title screen comes back (Start, Quit). */
  const rest = () => {
    resetCasting();
    setIntro('resting');
    window.setTimeout(() => setIntro('title'), TIMING.restClose);
  };
  /** After the rune message on the black screen (a defeat): a new run, waking up in room 0 like at the start. */
  const afterFate = () => {
    resetCasting();
    game.newRun();
    wakeUp();
  };
  // The thought fades on its own (or at the first click).
  useEffect(() => {
    if (!thought) return;
    const t = window.setTimeout(() => setThought(null), TIMING.wakeThought);
    return () => window.clearTimeout(t);
  }, [thought]);
  // Room 0's door: arriving on it starts the run.
  useEffect(() => {
    const door = state.room.exit;
    if (prologue && door && samePos(state.player.pos, door) && walk.path.length === 0 && !walk.leave) game.run(continueRun);
  }, [prologue, state.room.exit, state.player.pos, walk, game]);

  // ------------------------------------------------------------ toasts, banners

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const toast = { ...t, id: nextId++ };
    setToasts((ts) => [...ts, toast].slice(-5));
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== toast.id)), TIMING.toast);
  }, []);

  // Rule errors (e.g. "That tile is blocked.") show as a toast.
  useEffect(() => {
    if (!game.error) return;
    pushToast({ kind: 'error', title: game.error, lines: [] });
    game.clearError();
  }, [game.error, game, pushToast]);

  // A new Grimoire page: tell the player with a toast.
  const knownPages = useRef(state.grimoire);
  useEffect(() => {
    const fresh = state.grimoire.filter((id) => !knownPages.current.includes(id));
    knownPages.current = state.grimoire;
    for (const id of fresh) {
      const page = GRIMOIRE_PAGES.find((g) => g.id === id);
      if (page) pushToast({ kind: 'loot', title: 'A new page in the Grimoire', lines: [page.title] });
    }
  }, [state.grimoire, pushToast]);

  // A new line in the "Hmmm..." note glows for a moment.
  const knownCombos = useRef(state.combos);
  const [freshCombos, setFreshCombos] = useState<string[]>([]);
  useEffect(() => {
    const fresh = state.combos.filter((k) => !knownCombos.current.includes(k));
    knownCombos.current = state.combos;
    if (fresh.length === 0) return;
    setFreshCombos((f) => [...f, ...fresh]);
    window.setTimeout(() => setFreshCombos((f) => f.filter((k) => !fresh.includes(k))), TIMING.noteFresh);
  }, [state.combos]);

  const [pickups, setPickups] = useState<Pickup[]>([]);
  // Runes the lectern gives: shown like a pickup, then they fly into the deck.
  const knownRunes = useRef(state.runesFound.length);
  useEffect(() => {
    const before = knownRunes.current;
    knownRunes.current = state.runesFound.length;
    if (state.phase !== 'event' || state.runesFound.length <= before) return;
    const fresh = state.runesFound.slice(before);
    const cards = state.cards.deck.filter((c) => c.kind === 'rune' && fresh.includes(c.rune ?? -1));
    if (cards.length) setPickups((ps) => [...ps, { id: nextId++, cards, toHand: false, toDeck: true }]);
  }, [state.runesFound, state.phase, state.cards.deck]);

  // Picked-up drops: a drop that vanishes while you're still in the same room was picked up (drops never leave
  // the floor any other way). Show it, then fly it into the discard pile, which flashes as it lands.
  const [discardFlash, setDiscardFlash] = useState(0);
  const lastDrops = useRef({ stage: state.stage, drops: state.room.drops });
  useEffect(() => {
    const prev = lastDrops.current;
    lastDrops.current = { stage: state.stage, drops: state.room.drops };
    if (prev.stage !== state.stage || prev.drops === state.room.drops) return;
    const gone = prev.drops.filter((d) => !state.room.drops.some((x) => x.id === d.id));
    if (gone.length === 0) return;
    setPickups((ps) => [...ps, ...gone.map((d) => ({ id: nextId++, cards: d.cards, toHand: d.toHand }))]);
    // No cleanup: the drop list is a new array after every action, and a cleanup would cancel the flash.
    if (gone.some((d) => !d.toHand)) window.setTimeout(() => setDiscardFlash((n) => n + 1), TIMING.pickupHold + TIMING.pickupFly - 80);
  }, [state.room.drops, state.stage]);

  // After CLEARED!: walk the path one free step at a time (each step picks up anything lying there). At the end of
  // the walk to the door, go through it.
  useEffect(() => {
    if (!freeWalk) {
      if (walk.path.length || walk.leave) setWalk({ path: [], leave: false });
      return;
    }
    if (walk.path.length === 0) {
      if (walk.leave) {
        setWalk({ path: [], leave: false });
        game.run(continueRun);
      }
      return;
    }
    const t = window.setTimeout(() => {
      const [next, ...rest] = walk.path;
      setWalk(game.run((s) => freeStep(s, next)) ? { ...walk, path: rest } : { path: [], leave: false });
    }, TIMING.freeWalkStep);
    return () => window.clearTimeout(t);
  }, [walk, freeWalk, game]);
  useEffect(() => setLeaveAsk(false), [state.stage]);

  // The Cistern's door is open the whole fight: stepping into it on your turn asks whether to leave now. Choosing
  // "Stay" isn't asked again until you step off the door and back on (click your own tile to be asked again).
  const onDoor = state.phase !== 'cleared' && onOpenExit(state);
  // (Room 0's door just starts the run: no question.)
  const inOpenDoor = onDoor && state.phase === 'player' && !prologue;
  const stayed = useRef(false);
  useEffect(() => {
    if (!onDoor) stayed.current = false;
  }, [onDoor]);
  useEffect(() => {
    if (inOpenDoor && !enemyTurn.playing && !stayed.current) setEarlyAsk(true);
    if (!inOpenDoor) setEarlyAsk(false);
  }, [inOpenDoor, enemyTurn.playing]);

  // Leaving a cleared room: Continue (or clicking the open door) walks the wizard to the door, then on.
  const exit = state.room.exit;
  const doorPath = freeWalk && exit ? freeWalkPath(state, exit) : null;
  const itemsLeft = state.room.drops
    .filter((d) => !samePos(d.pos, state.player.pos) && !(doorPath ?? []).some((p) => samePos(p, d.pos)))
    .reduce((n, d) => n + d.cards.length, 0);
  const startLeaving = () => {
    setLeaveAsk(false);
    if (!exit) {
      game.run(continueRun);
      return;
    }
    if (!doorPath) {
      pushToast({ kind: 'error', title: 'There’s no way to the door.', lines: [] });
      return;
    }
    setWalk({ path: doorPath, leave: true });
  };
  const requestLeave = () => {
    if (walk.leave) return;
    if (itemsLeft > 0) setLeaveAsk(true);
    else startLeaving();
  };

  // The lectern's and the camp's rooms: on arrival the wizard walks up to the lectern / fire by themselves; once it's over they
  // walk out (after a moment to read what it said). Each happens once per visit, so a click can still override.
  const eventStep = inEvent ? state.event?.step ?? null : null;
  const autoWalked = useRef({ in: -1, out: -1 });
  // The timers read the latest state and leave function when they fire (the wizard may have moved meanwhile).
  const latest = useRef({ state, startLeaving });
  latest.current = { state, startLeaving };
  useEffect(() => {
    const stage = state.stage;
    if (eventStep === 'approach' && autoWalked.current.in !== stage) {
      const t = window.setTimeout(() => {
        autoWalked.current.in = stage;
        const read = latest.current.state.room.feature?.read;
        const path = read ? freeWalkPath(latest.current.state, read) : null;
        if (path?.length) setWalk({ path, leave: false });
      }, TIMING.eventWalkInDelay);
      return () => window.clearTimeout(t);
    }
    if (eventStep === 'done' && autoWalked.current.out !== stage) {
      const t = window.setTimeout(() => {
        autoWalked.current.out = stage;
        latest.current.startLeaving();
      }, state.event?.said ? TIMING.eventWalkOutDelay : TIMING.eventWalkOutDelay / 2);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the event moves on, not on every state change
  }, [eventStep, state.stage]);

  // "Your turn" / "Enemy turn" / room name banner.
  const bannerKey = `${state.stage}-${state.roomIndex}-${state.turn}-${state.phase}`;
  useEffect(() => {
    if (state.phase !== 'player' && state.phase !== 'enemy' && state.phase !== 'event' && state.phase !== 'camp') return;
    const b =
      state.phase === 'event' || state.phase === 'camp'
        ? { title: state.room.name, sub: state.phase === 'camp' ? 'A place to rest' : 'An event', kind: 'room' as const }
        : state.phase === 'enemy'
        ? { title: 'Enemy Turn', kind: 'enemy' as const }
        : state.turn === 1
          ? { title: state.room.name, sub: `Room ${state.roomIndex + 1}`, kind: 'room' as const }
          : { title: 'Your Turn', sub: `Turn ${state.turn}`, kind: 'player' as const };
    const id = nextId++;
    setBanner({ ...b, id });
    const t = window.setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), TIMING.banner);
    return () => window.clearTimeout(t);
  }, [bannerKey]);

  // ------------------------------------------------------------ actions

  const resetCasting = () => {
    setTable([]);
    setMode({ kind: 'idle' });
  };

  /** One effect on the board for its own duration (scene/SpellFx.tsx). */
  const addFx = (e: FxEvent) => {
    setFx((list) => [...list, e]);
    window.setTimeout(() => setFx((list) => list.filter((x) => x.id !== e.id)), fxEventDuration(e));
  };

  /** The effect of a cast, with what it did: pillars it broke, pushed units that hit something. */
  const castEvent = (cast: CastFx, done: GameState): CastEvent => {
    const broken = (cast.area?.pillars ?? []).filter((p) => !done.room.pillars.some((q) => samePos(q.pos, p)));
    // A pushed unit that ended short of where the push would take it hit something (wall, pillar or unit).
    const bumps: CastEvent['bumps'] = [];
    if (cast.push > 0 && cast.area) {
      for (const h of cast.hits) {
        const tile = cast.area.tiles.find((t) => samePos(t.pos, h.pos));
        const e = done.enemies.find((x) => x.id === h.id);
        if (h.immune || !tile?.push || !e || ENEMY_DEFS[e.kind].size !== 'normal') continue;
        const goal = { x: h.pos.x + tile.push.x * cast.push, y: h.pos.y + tile.push.y * cast.push };
        if (!samePos(e.pos, goal) && !done.room.hazards.some((z) => z.kind === 'quicksand' && samePos(z.pos, e.pos))) bumps.push({ at: e.pos, dir: tile.push });
      }
    }
    return { type: 'cast', id: nextId++, fx: cast, broken, bumps };
  };

  /** Jump to the end of a rune cast's playback (Space or a click). */
  const skipCast = useCallback(() => {
    const play = castPlayRef.current;
    if (!play) return;
    play.timers.forEach((t) => window.clearTimeout(t));
    setFx((list) => list.filter((x) => !play.fxIds.includes(x.id)));
    castPlayRef.current = null;
    setCastPlay(null);
  }, []);

  /**
   * Cast what's on the table (in `dir` for Beam and Wall), then play its effect (scene/SpellFx.tsx). The game state
   * changes at once; the board catches up with it.
   *
   * A cast with a rune on a real spell plays in two parts, so the player can see what the rune did:
   * 1. the spell itself: the board shows the cast resolved as if the rune did nothing (engine `ignoreRune`);
   * 2. the rune's symbol glows purple on the floor around the wizard;
   * 3. the rune's part: the board shows the real result, with a purple effect and purple numbers.
   * The Fizzle rune skips part 1 (nothing happened). A rune on a table that makes no spell just puffs grey smoke.
   */
  const castTable = (dir: Dir | null) => {
    const ids = preview.cardIds;
    const before = state;
    const cast = castFx(before, ids, dir);
    let after: GameState | null = null;
    if (!game.run((s) => (after = playerCast(s, ids, dir)))) return;
    resetCasting();
    if (!cast || !after) return;
    const done = after as GameState;

    if (cast.runeSymbol === null || !cast.spell || !cast.rune) {
      addFx({ ...castEvent(cast, done), grey: cast.runeSymbol !== null });
      return;
    }

    // A rune cast: the timeline.
    const fizzle = cast.rune === 'fizzle';
    const base = fizzle ? null : playerCast(before, ids, dir, { ignoreRune: true });
    const baseFx = fizzle ? null : castFx(before, ids, dir, { ignoreRune: true });
    const play: CastPlay = { shown: base ?? done, runeTint: false, manaGlow: false, timers: [], fxIds: [] };
    castPlayRef.current = play;
    setCastPlay({ ...play });
    const show = (e: FxEvent) => {
      play.fxIds.push(e.id);
      addFx(e);
    };
    const at = (ms: number, fn: () => void) => play.timers.push(window.setTimeout(fn, ms));

    let t = 0;
    if (base && baseFx) {
      const spellPart = castEvent(baseFx, base);
      show(spellPart);
      t += fxEventDuration(spellPart) * FX.rune.spellHold;
    }
    at(t, () => show({ type: 'sigil', id: nextId++, origin: cast.origin, symbol: cast.runeSymbol! }));
    t += FX.rune.sigilTime * 1000;

    // What the rune acts on: the enemies the spell reached, where they stand after the spell part.
    const from = base ?? before;
    const targets = cast.hits
      .filter((h) => !h.immune)
      .flatMap((h) => from.enemies.filter((e) => e.id === h.id).map((e) => e.pos));
    const baseTiles = baseFx?.area?.tiles ?? [];
    const extra = (cast.area?.tiles ?? []).map((x) => x.pos).filter((p) => !baseTiles.some((b) => samePos(b.pos, p)));
    const broken = from.room.pillars.filter((p) => !done.room.pillars.some((q) => samePos(q.pos, p.pos))).map((p) => p.pos);
    const runePart: RuneEvent = { type: 'rune', id: nextId++, effect: cast.rune, fx: cast, base: baseFx, targets, extra, broken };
    at(t, () => {
      play.shown = null;
      play.runeTint = true;
      play.manaGlow = cast.rune === 'free';
      setCastPlay({ ...play });
      show(runePart);
    });
    t += fxEventDuration(runePart);
    at(t, () => {
      castPlayRef.current = null;
      setCastPlay(null);
    });
  };

  const onCast = () => {
    if (!canAct || preview.status !== 'ready') return;
    if (preview.needsAim) pushToast({ kind: 'info', title: 'Click a tile on the board', lines: ['The spell fires in that direction.'] });
    else castTable(null);
  };

  // Aiming: as soon as a castable Beam or Wall is on the table, the board aims it. The direction follows the
  // pointer (on a diagonal it keeps the last direction) and a left-click casts it. No Cast click needed.
  const aiming = canAct && mode.kind === 'idle' && preview.status === 'ready' && preview.needsAim;
  const lastAim = useRef<Dir | null>(null);
  const aimDir = aiming ? aimDirection(state.player.pos, hover, lastAim.current) : null;
  lastAim.current = aimDir;

  const onTileClick = (p: Pos) => {
    // The lectern's and the camp's rooms: the wizard walks in and out by themselves; clicks don't move them.
    if (inEvent) return;
    // In room 0 a click walks, unless a Beam or Wall is being aimed (then it casts, below).
    if (freeWalk && !dialogOpen && !(prologue && aiming)) {
      // Room cleared (or room 0): walk there for free, one step at a time. The open door means "leave".
      if (walk.leave) return;
      if (exit && samePos(p, exit) && exitOpen(state)) {
        requestLeave();
        return;
      }
      setLeaveAsk(false);
      const path = freeWalkPath(state, p);
      if (path?.length) setWalk({ path, leave: false });
      return;
    }
    if (!canAct) return;
    // Clicking your own tile while standing in the open door asks again whether to leave.
    if (inOpenDoor && samePos(p, state.player.pos) && !aiming) {
      setEarlyAsk(true);
      return;
    }
    if (aiming) {
      // While aiming, a click on the board casts instead of moving. Clicking your own tile does nothing.
      const dir = aimDirection(state.player.pos, p, aimDir);
      if (dir) castTable(dir);
      return;
    }
    if (mode.kind !== 'idle') return;
    const dir = DIRS.find((d) => {
      const t = moveTarget(state, d);
      return !!t && samePos(t, p);
    });
    if (dir) game.run((s) => playerMove(s, dir));
  };

  const onTileHover = useCallback((p: Pos | null, from?: Pos) => {
    setHover((h) => {
      if (p) return h && samePos(h, p) ? h : p;
      return h && from && samePos(h, from) ? null : h;
    });
  }, []);
  const pointer = { onHover: onTileHover, onClick: onTileClick };

  const cancel = () => {
    if (mode.kind === 'reroll') setMode({ kind: 'idle' });
  };

  const startReroll = () => {
    setTable([]);
    setMode({ kind: 'reroll', marked: [] });
  };
  const confirmReroll = () => {
    if (mode.kind !== 'reroll' || mode.marked.length === 0) return;
    const ids = mode.marked;
    if (game.run((s) => playerReroll(s, ids))) setMode({ kind: 'idle' });
  };

  // ------------------------------------------------------------ drag & drop between hand and crafting table

  /**
   * Where a card would lie on the table, as fractions of the table's card area. `at` = a pointer position in
   * viewport pixels, or omitted for a random spot. Cards may stick out past the edge by LAYOUT.craftingTable.overhang.
   */
  const tableSpot = (at?: { x: number; y: number }) => {
    const T = LAYOUT.craftingTable;
    const tilt = (Math.random() * 2 - 1) * T.maxTiltDeg;
    const area = document.querySelector(TABLE_AREA_SELECTOR)?.getBoundingClientRect();
    if (!area) return { x: 0.5, y: 0.5, tilt };
    // Limits for the card centre: it may overhang the sides and the bottom, but never cover the strip on top.
    const mx = Math.min(0.5, (T.cardWidth * u * (0.5 - T.overhang)) / area.width);
    const top = Math.min(0.5, (T.cardHeight * u * 0.5) / area.height);
    const bottom = Math.max(top, 1 - (T.cardHeight * u * (0.5 - T.overhang)) / area.height);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    if (!at) return { x: mx + Math.random() * (1 - 2 * mx), y: top + Math.random() * (bottom - top), tilt };
    return { x: clamp((at.x - area.left) / area.width, mx, 1 - mx), y: clamp((at.y - area.top) / area.height, top, bottom), tilt };
  };

  const onDrop = (cardId: number, source: DragSource, target: string | null, point: { x: number; y: number }) => {
    if (target === 'table') {
      // The card stays exactly where it was dropped (moving a table card keeps its tilt) and lands on top.
      const spot = tableSpot(point);
      setTable((cur) => {
        const next = cleanTable(hand, cur);
        const tilt = next.find((pl) => pl.id === cardId)?.tilt ?? spot.tilt;
        return placeOnTable(next, { id: cardId, ...spot, tilt });
      });
    } else if (source.from === 'table') {
      // Dropped anywhere off the table: the card goes back to the hand.
      setTable((cur) => removeFromTable(cleanTable(hand, cur), cardId));
    }
  };

  const onCardClick = (cardId: number, source: DragSource) => {
    if (mode.kind === 'reroll') {
      if (source.from !== 'hand') return;
      setMode((m) =>
        m.kind !== 'reroll' ? m : { kind: 'reroll', marked: m.marked.includes(cardId) ? m.marked.filter((x) => x !== cardId) : [...m.marked, cardId] },
      );
      return;
    }
    if (mode.kind !== 'idle') return;
    // Click = shortcut for dragging: a hand card lands at a random spot on the table, a table card goes back to the hand.
    if (source.from === 'table') {
      setTable((cur) => removeFromTable(cleanTable(hand, cur), cardId));
      return;
    }
    const spot = tableSpot();
    setTable((cur) => {
      const next = cleanTable(hand, cur);
      return next.some((pl) => pl.id === cardId) ? next : placeOnTable(next, { id: cardId, ...spot });
    });
  };

  const handLocked = !(state.phase === 'player' && !enemyTurn.playing && !castPlaying && !dialogOpen);
  const { drag, startDrag } = useCardDrag({ enabled: !handLocked && mode.kind === 'idle', onDrop, onClick: onCardClick });
  const draggedCard = drag ? hand.find((c) => c.id === drag.cardId) : undefined;
  const handCards = hand.filter((c) => !table.some((pl) => pl.id === c.id));

  // ------------------------------------------------------------ the "Hmmm..." note

  const note = useMemo(() => noteView(state.combos, hand, onTable, state.player.mana), [state.combos, hand, onTable, state.player.mana]);
  const noteInteractive = !handLocked && mode.kind === 'idle' && !stuck && state.phase === 'player';
  const [noteHover, setNoteHover] = useState<string | null>(null);
  // Hovering an available line pulls its cards up out of the hand.
  const hovered = noteInteractive && noteHover ? note.available.find((l) => l.key === noteHover) : undefined;
  const lifted = hovered?.addIds ?? [];
  // Clicking it puts the missing cards on the crafting table, ready to cast.
  const pickNote = (line: NoteLine) => {
    if (!noteInteractive || !line.available) return;
    setTable((cur) => line.addIds.reduce((t, id) => placeOnTable(t, { id, ...tableSpot() }), cleanTable(hand, cur)));
    setNoteHover(null);
  };
  const showNote = state.phase === 'player' || state.phase === 'enemy' || state.phase === 'cleared';

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The title screen and waking up: no shortcuts.
      if (intro) return;
      // Typing a rune note: keys are text, not shortcuts.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
      if (dev && e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        game.undo();
      } else if (dev && e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        game.redo();
      } else if (dev && e.key.toLowerCase() === 'k' && hover) {
        const enemy = enemyAt(state, hover);
        if (enemy && state.phase === 'player') game.run((s) => devRemoveEnemy(s, enemy.id, true));
      } else if (e.key === 'Escape') {
        if (mode.kind === 'reroll') setMode({ kind: 'idle' });
        else if (!menuOpen && table.length > 0) setTable([]);
        else if (bookOpen) setBookOpen(false);
        else if (deckOpen) setDeckOpen(false);
        else if (!finished) setMenuOpen((o) => !o);
      } else if (e.key === ' ' && castPlaying) {
        e.preventDefault();
        skipCast();
      } else if (e.key === ' ' && enemyTurn.playing) {
        e.preventDefault();
        enemyTurn.skip();
      } else if (e.key.toLowerCase() === 'l') {
        setLogOpen((o) => !o);
      } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !finished && !menuOpen && !bookOpen) {
        setDeckOpen((o) => !o);
      } else if (e.key === 'F11') {
        e.preventDefault();
        window.grimoire?.toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, dev, hover, state, mode, menuOpen, bookOpen, deckOpen, table, finished, enemyTurn, castPlaying, skipCast, intro]);

  // ------------------------------------------------------------ board highlights

  const overlays: BoardOverlays = useMemo(() => {
    const color = preview.color ?? '#ffffff';
    const o: BoardOverlays = {
      move: [],
      spell: [],
      spellFaint: [],
      aim: [],
      spellColor: color,
      focus: enemyTurn.step?.focus ?? [],
      marked: shown.enemies.flatMap((e) => e.markedLine ?? []),
      erasure: shown.erasureZone,
      hover,
      hoverColor: '#fff6e0',
    };
    // The lectern's and the camp's rooms: nothing to click on the board, so no hover highlight either.
    if (inEvent) return { ...o, hover: null };
    if (freeWalk && !dialogOpen && !prologue) {
      // Gold where a click walks somewhere.
      if (hover && freeWalkPath(state, hover)?.length) o.hoverColor = '#ffd36b';
      return o;
    }
    if (state.phase !== 'player' || enemyTurn.playing || dialogOpen) return o;
    const moves = DIRS.map((d) => moveTarget(state, d)).filter((p): p is Pos => !!p);

    if (aiming) {
      const beams = preview.aimTiles!;
      // The aimed direction glows (bright, outlined); the other three stay faint.
      o.aim = aimDir ? beams[aimDir] : [];
      o.spellFaint = DIRS.filter((d) => d !== aimDir).flatMap((d) => beams[d]);
      o.hoverColor = aimDir ? color : '#9a9087';
      return o;
    }
    // A valid spell on the table lights up its area right away (faint if you can't afford it yet).
    const spellValid = preview.status === 'ready' || (preview.status === 'blocked' && !!preview.title);
    if (spellValid && mode.kind === 'idle') {
      if (preview.needsAim) o.spellFaint = DIRS.flatMap((d) => preview.aimTiles![d]);
      else if (preview.status === 'ready') o.spell = preview.tiles;
      else o.spellFaint = preview.tiles;
    } else if (canAct && mode.kind === 'idle') {
      o.move = prologue ? [] : moves;
    }
    const walkable = prologue ? !!hover && !!freeWalkPath(state, hover)?.length : !!hover && moves.some((m) => samePos(m, hover));
    if (hover && canAct && mode.kind === 'idle' && walkable) o.hoverColor = '#ffd36b';
    return o;
  }, [preview, enemyTurn.step, enemyTurn.playing, shown, hover, state, dialogOpen, mode, aiming, aimDir, canAct]);

  // ------------------------------------------------------------ render

  const busy = !canAct || mode.kind !== 'idle';
  return (
    <div
      className={`game-root ${aiming ? 'is-aiming' : ''} ${intro === 'waking' ? 'is-waking' : ''}`}
      style={{ ...layoutCssVars(), ['--u' as string]: `${u}px` }}
      onPointerDownCapture={castPlaying ? skipCast : thought ? () => setThought(null) : undefined}
    >
      <ThoughtFilters />
      <GameScene
        state={view}
        runeTint={!!castPlay?.runeTint}
        playerThought={thought}
        restPrompt={restPrompt}
        onRest={rest}
        intents={intents}
        overlays={overlays}
        fx={fx}
        hover={hover}
        pointer={pointer}
        onRightClick={cancel}
      />

      <div className="hud">
        <TopBar state={view} onGrimoire={() => setBookOpen(true)} onDeck={() => setDeckOpen(true)} onToggleLog={() => setLogOpen((o) => !o)} onMenu={() => setMenuOpen(true)} />
        {dev && <DevBar game={game} hover={hover} />}

        {showNote && (
          <HmmmNote view={note} tableUsed={onTable.length > 0} interactive={noteInteractive} fresh={freshCombos} onHover={(l) => setNoteHover(l?.key ?? null)} onPick={pickNote} />
        )}
        {!inEvent && <ManaOrb mana={view.player.mana} maxMana={view.player.maxMana} runeGlow={!!castPlay?.manaGlow} cost={preview.status === 'ready' || preview.status === 'blocked' ? preview.cost : undefined} />}
        {!inEvent && !prologue && <MeditateButton disabled={busy} full={state.player.mana >= state.player.maxMana} onClick={() => game.run(playerMeditate)} />}
        <Pile which="draw" cards={state.cards.deck} erased={state.cards.erased} />
        <Pile which="discard" cards={state.cards.discard} flash={discardFlash} />

        {!inEvent && (
          <RerollButton
          mode={mode.kind === 'reroll'}
          marked={mode.kind === 'reroll' ? mode.marked.length : 0}
          disabled={busy || hand.length === 0}
          onStart={startReroll}
          onConfirm={confirmReroll}
          onCancel={cancel}
        />
        )}
        {!inEvent && !prologue && (
          <EndTurnButton
          actionsLeft={state.phase === 'player' ? state.actionsLeft : 0}
          disabled={state.phase !== 'player' || enemyTurn.playing || castPlaying || dialogOpen}
          onClick={() => {
            setMode({ kind: 'idle' });
            game.run(endPlayerTurn);
          }}
        />
        )}

        {state.phase === 'cleared' && !castPlaying && (
          <ClearedPanel
            state={state}
            itemsLeft={itemsLeft}
            asking={leaveAsk}
            leaving={walk.leave}
            onContinue={requestLeave}
            onConfirm={startLeaving}
            onStay={() => setLeaveAsk(false)}
          />
        )}
        {stuck && mode.kind !== 'reroll' && <EscapeButton stuck={state.player.status.stuck} disabled={busy} onClick={() => game.run(playerEscape)} />}
        {state.phase === 'event' && <EventPanel state={state} onChoose={(c) => game.run((st) => eventChoice(st, c))} />}
        {state.phase === 'camp' && <CampPanel state={state} onChoose={(c) => game.run((st) => campChoice(st, c))} />}
        {mode.kind !== 'reroll' && state.phase !== 'cleared' && !inEvent && !stuck && (
          <CraftingTable
            cards={tablePlaced}
            preview={preview}
            dragOver={drag?.over === 'table'}
            dragging={!!drag}
            draggingId={drag?.cardId ?? null}
            locked={handLocked}
            startDrag={startDrag}
            onCast={onCast}
          />
        )}
        {mode.kind === 'reroll' && <div className="reroll-hint">Click the cards you want to swap, then Confirm</div>}

        {!inEvent && (
        <Hand
          cards={handCards}
          draggingId={drag?.cardId ?? null}
          dropHighlight={!!drag && drag.source.from === 'table' && drag.over !== 'table'}
          startDrag={startDrag}
          rerollMarked={mode.kind === 'reroll' ? mode.marked : null}
          lifted={lifted}
          disabled={handLocked}
        />
        )}

        {castPlaying && <div className="cast-skip-hint">Space or click to skip</div>}
        {enemyTurn.playing && <EnemyCaption step={enemyTurn.step} onSkip={enemyTurn.skip} />}
        <TurnBanner banner={banner} />
        {pickups.length > 0 && <PickupReveal key={pickups[0].id} pickup={pickups[0]} onDone={(id) => setPickups((ps) => ps.filter((p) => p.id !== id))} />}
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
        {logOpen && <LogDrawer state={shown} onClose={() => setLogOpen(false)} />}
      </div>

      {drag && draggedCard && <FragmentCard card={draggedCard} className="drag-ghost" style={{ left: drag.x, top: drag.y }} thought="none" />}

      {bookOpen && <GrimoireBook pages={state.grimoire} onClose={() => setBookOpen(false)} />}
      {deckOpen && <DeckView state={state} onClose={() => setDeckOpen(false)} />}
      {earlyAsk && inOpenDoor && (
        <LeaveEarlyDialog
          state={state}
          onLeave={() => {
            setEarlyAsk(false);
            resetCasting();
            game.run(continueRun);
          }}
          onStay={() => {
            stayed.current = true;
            setEarlyAsk(false);
          }}
        />
      )}
      {finished && !castPlaying && intro !== 'fate' && (
        <GameOverDialog
          state={state}
          onNewRun={() => {
            // Defeat: everything goes dark and the rune message shows first (FateScreen), then the same waking.
            if (state.phase === 'lost') return setIntro('fate');
            resetCasting();
            game.newRun();
            wakeUp();
          }}
        />
      )}
      {intro === 'fate' && <FateScreen onDone={afterFate} />}
      {(intro === 'title' || intro === 'leaving' || intro === 'closing') && (
        <TitleScreen canContinue={game.resumable && !isPrologue(state)} leaving={intro !== 'title'} fading={intro === 'leaving'} onContinue={continueGame} onNewGame={startNewGame} />
      )}
      {(intro === 'closing' || intro === 'resting' || intro === 'waking') && (
        <Blink stage={intro === 'waking' ? 'wake' : 'close'} duration={intro === 'resting' ? TIMING.restClose : undefined} />
      )}
      {menuOpen && (
        <MenuDialog
          devMode={dev}
          onDevMode={setDevMode}
          onResume={() => setMenuOpen(false)}
          onNewRun={() => {
            setMenuOpen(false);
            resetCasting();
            game.newRun();
            wakeUp();
          }}
        />
      )}
    </div>
  );
}
