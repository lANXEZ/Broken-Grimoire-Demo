import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acknowledgeLoot,
  advanceRoom,
  devRemoveEnemy,
  endPlayerTurn,
  enemyAt,
  moveTarget,
  playerCast,
  playerDrinkPotion,
  playerMeditate,
  playerMove,
  playerReroll,
  playerUnstableFire,
  previewIntents,
  spellTiles,
  unstableTiles,
  type Dir,
  type Pos,
  type SpellSpec,
} from './engine';
import { ELEMENT_COLOR } from './config/art';
import { DEV_MODE } from './config/dev';
import { LAYOUT, layoutCssVars, uiScale } from './config/layout';
import { TIMING } from './config/timing';
import { DIRS, aimDirection, cleanTable, placeOnTable, previewCast, removeFromTable, tableCards, type CastPlan, type Table } from './game/casting';
import { useEnemyTurn } from './game/useEnemyTurn';
import { useGame } from './game/useGame';
import { GameScene } from './scene/GameScene';
import type { BoardOverlays, CastFlash } from './scene/TileOverlay';
import { EndTurnButton, ManaOrb, MeditateButton, Pile, RerollButton } from './hud/Controls';
import { DevBar } from './hud/DevBar';
import { GameOverDialog, MenuDialog, RoomExitDialog, SpinWheel } from './hud/Dialogs';
import { FragmentCard, Hand } from './hud/Hand';
import { EnemyCaption, LogDrawer, Toasts, TurnBanner, type Toast } from './hud/Overlays';
import { CraftingTable, TABLE_AREA_SELECTOR } from './hud/CraftingTable';
import { TopBar } from './hud/TopBar';
import { useCardDrag, type DragSource } from './hud/useCardDrag';

/** What the player is in the middle of, on top of the game state. */
type UiMode =
  /** Normal play. While a castable Beam is on the crafting table, the board is aiming it (see `aiming`). */
  | { kind: 'idle' }
  /** Picking hand cards to reroll. */
  | { kind: 'reroll'; marked: number[] }
  /** Unstable Fire's spin wheel is turning. */
  | { kind: 'spin'; plan: Extract<CastPlan, { kind: 'unstable' }> };

const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
let nextId = 1;

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
  const enemyTurn = useEnemyTurn(game);
  const state = game.state;
  const shown = enemyTurn.shown;
  const u = useUiScaleVar();

  const [rawTable, setTable] = useState<Table>([]);
  const [mode, setMode] = useState<UiMode>({ kind: 'idle' });
  const [hover, setHover] = useState<Pos | null>(null);
  const [flash, setFlash] = useState<CastFlash | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const dialogOpen = menuOpen || mode.kind === 'spin' || state.phase === 'roomExit' || finished;
  const canAct = state.phase === 'player' && !enemyTurn.playing && !dialogOpen && state.actionsLeft > 0;

  const onTable = useMemo(() => tableCards(hand, table), [hand, table]);
  const tablePlaced = useMemo(
    () => table.flatMap((place) => hand.filter((c) => c.id === place.id).map((card) => ({ card, place }))),
    [hand, table],
  );
  const preview = useMemo(() => previewCast(state, onTable), [state, onTable]);
  const intents = useMemo(() => (state.phase === 'player' ? previewIntents(state) : {}), [state]);

  // Leave reroll mode when the turn ends; clear the table when the room changes.
  useEffect(() => {
    if (state.phase !== 'player') setMode((m) => (m.kind === 'spin' ? m : { kind: 'idle' }));
  }, [state.phase]);
  useEffect(() => setTable([]), [state.roomIndex]);

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

  // Loot goes straight into the deck; tell the player with a toast instead of a popup.
  useEffect(() => {
    if (state.pendingLoot.length === 0 || finished) return;
    for (const n of state.pendingLoot) {
      const lines = [
        ...(n.discardCards?.length ? [`${n.discard.join(', ')} → your discard pile`] : []),
        ...(n.handCards?.length ? [`${n.toHand.join(', ')} → back to your hand`] : []),
        ...n.extras,
      ];
      if (lines.length) pushToast({ kind: 'loot', title: `${n.enemyName} dropped loot`, lines, cards: [...(n.discardCards ?? []), ...(n.handCards ?? [])] });
    }
    game.amend(acknowledgeLoot);
  }, [state.pendingLoot, finished, game, pushToast]);

  // "Your turn" / "Enemy turn" / room name banner.
  const bannerKey = `${state.roomIndex}-${state.turn}-${state.phase}`;
  useEffect(() => {
    if (state.phase !== 'player' && state.phase !== 'enemy') return;
    const b =
      state.phase === 'enemy'
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

  const castSpell = (spec: SpellSpec, cardIds: number[], dir: Dir | null) => {
    const tiles = spellTiles(state, spec, dir);
    if (game.run((s) => playerCast(s, spec, dir, cardIds))) {
      setFlash({ id: nextId++, tiles, color: ELEMENT_COLOR[spec.element] });
      resetCasting();
    }
  };

  const onCast = () => {
    if (!canAct || preview.status !== 'ready' || !preview.plan) return;
    const plan = preview.plan;
    if (plan.kind === 'unstable') setMode({ kind: 'spin', plan });
    else if (preview.needsAim) pushToast({ kind: 'info', title: 'Click a tile on the board', lines: ['The Beam fires in that direction.'] });
    else castSpell(plan.spec, plan.cardIds, null);
  };

  const onSpinDone = (damage: number) => {
    const tiles = unstableTiles(state);
    if (game.run((s) => playerUnstableFire(s, damage))) {
      setFlash({ id: nextId++, tiles, color: ELEMENT_COLOR.fire });
      setTable([]);
    }
    setMode({ kind: 'idle' });
  };

  // Beam aiming: as soon as a castable Beam is on the table, the board aims it. The direction follows the
  // pointer (on a diagonal it keeps the last direction) and a left-click casts it. No Cast click needed.
  const aimPlan = canAct && mode.kind === 'idle' && preview.status === 'ready' && preview.needsAim && preview.plan?.kind === 'spell' ? preview.plan : null;
  const aiming = !!aimPlan;
  const lastAim = useRef<Dir | null>(null);
  const aimDir = aiming ? aimDirection(state.player.pos, hover, lastAim.current) : null;
  lastAim.current = aimDir;

  const onTileClick = (p: Pos) => {
    if (!canAct) return;
    if (aimPlan) {
      // While aiming, a click on the board casts instead of moving. Clicking your own tile does nothing.
      const dir = aimDirection(state.player.pos, p, aimDir);
      if (dir) castSpell(aimPlan.spec, aimPlan.cardIds, dir);
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

  const handLocked = !(state.phase === 'player' && !enemyTurn.playing && !dialogOpen);
  const { drag, startDrag } = useCardDrag({ enabled: !handLocked && mode.kind === 'idle', onDrop, onClick: onCardClick });
  const draggedCard = drag ? hand.find((c) => c.id === drag.cardId) : undefined;
  const handCards = hand.filter((c) => !table.some((pl) => pl.id === c.id));

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (DEV_MODE && e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        game.undo();
      } else if (DEV_MODE && e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        game.redo();
      } else if (DEV_MODE && e.key.toLowerCase() === 'k' && hover) {
        const enemy = enemyAt(state, hover);
        if (enemy && state.phase === 'player') game.run((s) => devRemoveEnemy(s, enemy.id, true));
      } else if (e.key === 'Escape') {
        if (mode.kind === 'reroll') setMode({ kind: 'idle' });
        else if (!menuOpen && table.length > 0) setTable([]);
        else if (!finished && state.phase !== 'roomExit') setMenuOpen((o) => !o);
      } else if (e.key === ' ' && enemyTurn.playing) {
        e.preventDefault();
        enemyTurn.skip();
      } else if (e.key.toLowerCase() === 'l') {
        setLogOpen((o) => !o);
      } else if (e.key === 'F11') {
        e.preventDefault();
        window.grimoire?.toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, hover, state, mode, menuOpen, table, finished, enemyTurn]);

  // ------------------------------------------------------------ board highlights

  const overlays: BoardOverlays = useMemo(() => {
    const color = preview.element ? ELEMENT_COLOR[preview.element] : '#ffffff';
    const o: BoardOverlays = {
      move: [],
      spell: [],
      spellFaint: [],
      spellColor: color,
      focus: enemyTurn.step?.focus ?? [],
      marked: shown.enemies.flatMap((e) => e.markedLine ?? []),
      erasure: shown.erasureZone,
      hover,
      hoverColor: '#fff6e0',
    };
    if (state.phase !== 'player' || enemyTurn.playing || dialogOpen) return o;
    const moves = DIRS.map((d) => moveTarget(state, d)).filter((p): p is Pos => !!p);

    if (aiming) {
      const beams = preview.beamTiles!;
      o.spell = aimDir ? beams[aimDir] : [];
      o.spellFaint = DIRS.filter((d) => d !== aimDir).flatMap((d) => beams[d]);
      o.hoverColor = aimDir ? color : '#9a9087';
      return o;
    }
    // A valid spell on the table lights up its area right away (faint if you can't afford it yet).
    const spellValid = preview.status === 'ready' || (preview.status === 'blocked' && !!preview.title);
    if (spellValid && mode.kind === 'idle') {
      if (preview.needsAim) o.spellFaint = DIRS.flatMap((d) => preview.beamTiles![d]);
      else if (preview.status === 'ready') o.spell = preview.tiles;
      else o.spellFaint = preview.tiles;
    } else if (canAct && mode.kind === 'idle') {
      o.move = moves;
    }
    if (hover && canAct && mode.kind === 'idle' && moves.some((m) => samePos(m, hover))) o.hoverColor = '#ffd36b';
    return o;
  }, [preview, enemyTurn.step, enemyTurn.playing, shown, hover, state, dialogOpen, mode, aiming, aimDir, canAct]);

  // ------------------------------------------------------------ render

  const busy = !canAct || mode.kind !== 'idle';
  return (
    <div className={`game-root ${aiming ? 'is-aiming' : ''}`} style={{ ...layoutCssVars(), ['--u' as string]: `${u}px` }}>
      <GameScene state={shown} intents={intents} overlays={overlays} flash={flash} hover={hover} pointer={pointer} onRightClick={cancel} />

      <div className="hud">
        <TopBar state={shown} canDrink={canAct && mode.kind === 'idle'} onDrink={() => game.run(playerDrinkPotion)} onToggleLog={() => setLogOpen((o) => !o)} onMenu={() => setMenuOpen(true)} />
        {DEV_MODE && <DevBar game={game} hover={hover} />}

        <ManaOrb mana={shown.player.mana} maxMana={shown.player.maxMana} cost={preview.status === 'ready' || preview.status === 'blocked' ? preview.cost : undefined} />
        <MeditateButton disabled={busy} full={state.player.mana >= state.player.maxMana} onClick={() => game.run(playerMeditate)} />
        <Pile which="draw" cards={state.cards.deck} erased={state.cards.erased} />
        <Pile which="discard" cards={state.cards.discard} />

        <RerollButton
          mode={mode.kind === 'reroll'}
          marked={mode.kind === 'reroll' ? mode.marked.length : 0}
          disabled={busy || hand.length === 0}
          onStart={startReroll}
          onConfirm={confirmReroll}
          onCancel={cancel}
        />
        <EndTurnButton
          actionsLeft={state.phase === 'player' ? state.actionsLeft : 0}
          disabled={state.phase !== 'player' || enemyTurn.playing || dialogOpen}
          onClick={() => {
            setMode({ kind: 'idle' });
            game.run(endPlayerTurn);
          }}
        />

        {mode.kind !== 'reroll' && (
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

        <Hand
          cards={handCards}
          draggingId={drag?.cardId ?? null}
          dropHighlight={!!drag && drag.source.from === 'table' && drag.over !== 'table'}
          startDrag={startDrag}
          rerollMarked={mode.kind === 'reroll' ? mode.marked : null}
          disabled={handLocked}
        />

        {enemyTurn.playing && <EnemyCaption step={enemyTurn.step} onSkip={enemyTurn.skip} />}
        <TurnBanner banner={banner} />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
        {logOpen && <LogDrawer state={shown} onClose={() => setLogOpen(false)} />}
      </div>

      {drag && draggedCard && <FragmentCard card={draggedCard} className="drag-ghost" style={{ left: drag.x, top: drag.y }} />}

      {mode.kind === 'spin' && <SpinWheel onDone={onSpinDone} />}
      {state.phase === 'roomExit' && <RoomExitDialog state={state} onContinue={() => game.run(advanceRoom)} />}
      {finished && (
        <GameOverDialog
          state={state}
          onNewRun={() => {
            resetCasting();
            game.newRun();
          }}
        />
      )}
      {menuOpen && (
        <MenuDialog
          onResume={() => setMenuOpen(false)}
          onNewRun={() => {
            setMenuOpen(false);
            resetCasting();
            game.newRun();
          }}
        />
      )}
    </div>
  );
}
