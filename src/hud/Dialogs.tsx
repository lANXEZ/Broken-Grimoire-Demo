import { useState, type ReactNode } from 'react';
import {
  GRIMOIRE_PAGES,
  campError,
  stageName,
  cardName,
  isElementKind,
  isShapeKind,
  ownedCards,
  type Card,
  type CampChoice,
  type EventChoice,
  type GameState,
} from '../engine';
import { FragmentCard } from './Hand';
import { RuneText } from './RuneLetter';
import { LECTERN_MESSAGE } from '../config/runeMessages';

/** The bridge the Electron app exposes (electron/preload.cjs). Undefined when running in a browser. */
declare global {
  interface Window {
    grimoire?: { quit: () => void; toggleFullscreen: () => void; isDesktop: true };
  }
}

function Modal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal ${className}`}>{children}</div>
    </div>
  );
}

/**
 * [UI-PLACEMENT] CLEARED!: every enemy is down (LAYOUT.cleared). Not a modal: the wizard keeps walking around the
 * board (click a tile) to pick up drops. Continue (or clicking the open door) walks the wizard to the door and on
 * to the next stop, asking once if items would be left on the floor.
 */
export function ClearedPanel({ state, itemsLeft, asking, leaving, onContinue, onConfirm, onStay }: {
  state: GameState;
  /** Items still on the floor that the walk to the door won't pick up. */
  itemsLeft: number;
  /** Showing "You left n items behind. Leave anyway?". */
  asking: boolean;
  /** On the way to the door. */
  leaving: boolean;
  onContinue: () => void;
  onConfirm: () => void;
  onStay: () => void;
}) {
  const nextName = stageName(state.stage + 1);
  const onFloor = state.room.drops.reduce((n, d) => n + d.cards.length, 0);
  return (
    <div className="cleared-panel">
      <div className="cleared-title">Cleared!</div>
      <div className="cleared-sub">
        {leaving
          ? 'Walking to the door…'
          : onFloor > 0
            ? `Click the board to walk over and pick up ${onFloor === 1 ? 'the drop' : `the ${onFloor} drops`}. The door is open.`
            : 'Nothing left on the floor. The door is open.'}
      </div>
      {asking ? (
        <div className="confirm-row">
          <span>
            You left {itemsLeft} item{itemsLeft === 1 ? '' : 's'} behind. Leave anyway?
          </span>
          <button className="hud-button danger small" onClick={onConfirm}>
            Leave
          </button>
          <button className="text-button" onClick={onStay}>
            Stay
          </button>
        </div>
      ) : (
        <button className="hud-button primary" disabled={leaving} onClick={onContinue}>
          Continue to {nextName}
        </button>
      )}
    </div>
  );
}

/**
 * Standing in a door that's always open (the Cistern) mid-fight: leave now, or stay and fight on.
 * Leaving early loses whatever the monsters still alive would have dropped, and anything on the floor.
 */
export function LeaveEarlyDialog({ state, onLeave, onStay }: { state: GameState; onLeave: () => void; onStay: () => void }) {
  const alive = state.enemies.length;
  const floor = state.room.drops.reduce((n, d) => n + d.cards.length, 0);
  return (
    <Modal>
      <h2>Leave {state.room.name}?</h2>
      <p>
        {alive} enem{alive === 1 ? 'y is' : 'ies are'} still alive. Whatever they would drop is lost
        {floor > 0 ? `, and so ${floor === 1 ? 'is the item' : `are the ${floor} items`} on the floor` : ''}.
      </p>
      <div className="confirm-row">
        <button className="hud-button danger" onClick={onLeave}>
          Leave now
        </button>
        <button className="hud-button" onClick={onStay} autoFocus>
          Stay and fight
        </button>
      </div>
    </Modal>
  );
}

/**
 * [UI-PLACEMENT] The Whispering Lectern's choices, in the crafting table's place (LAYOUT.cleared). The board stays in
 * view: the lectern whispers in runes over its stand, and what it says in plain words floats over it too
 * (scene/Lectern.tsx). After the last choice the wizard walks out by themselves.
 */
export function EventPanel({ state, onChoose }: { state: GameState; onChoose: (c: EventChoice) => void }) {
  const ev = state.event;
  if (!ev) return null;
  return (
    <div className="cleared-panel event-panel">
      <div className="event-title">The Whispering Lectern</div>
      {ev.step === 'approach' && <div className="cleared-sub">A familiar voice whispers from the lectern&hellip;</div>}
      {ev.step === 'offer' && (
        <>
          <div className="cleared-sub">It whispers in a familiar voice, in a language you don&rsquo;t understand:</div>
          <RuneText className="event-runes" text={LECTERN_MESSAGE} />
          <div className="choice-list">
            <button className="choice" onClick={() => onChoose('take')}>
              <b>Take a rune fragment</b>
              <span>A page of the dungeon&rsquo;s own tongue.</span>
            </button>
            <button className="choice" onClick={() => onChoose('leave')}>
              <b>Leave it</b>
              <span>Walk out. Nothing happens.</span>
            </button>
          </div>
        </>
      )}
      {ev.step === 'blood' && (
        <>
          <div className="event-said">&ldquo;{ev.said}&rdquo;</div>
          {/* Plain choices on purpose: the player isn't told what feeding it costs or gives. */}
          <div className="choice-list">
            <button className="choice" onClick={() => onChoose('blood')}>
              <b>Sate the lectern&rsquo;s desire.</b>
            </button>
            <button className="choice" onClick={() => onChoose('walk')}>
              <b>Leave</b>
            </button>
          </div>
        </>
      )}
      {ev.step === 'done' && (
        <>
          {ev.said && <div className="event-said">&ldquo;{ev.said}&rdquo;</div>}
          <div className="cleared-sub">You walk out of the room&hellip;</div>
        </>
      )}
    </div>
  );
}

/**
 * [UI-PLACEMENT] The camp's choices, in the crafting table's place (LAYOUT.cleared), while the board shows the
 * campfire. Rest, or tear out a page (the pages to pick from open over the board). After the choice the wizard
 * walks out by themselves.
 */
export function CampPanel({ state, onChoose }: { state: GameState; onChoose: (c: CampChoice) => void }) {
  const [tearing, setTearing] = useState(false);
  const ev = state.event;
  if (!ev) return null;
  const deck = ownedCards(state.cards)
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
  return (
    <>
      <div className="cleared-panel event-panel camp-panel">
        <div className="event-title">Camp</div>
        {ev.step === 'approach' && <div className="cleared-sub">You head for the fire&hellip;</div>}
        {ev.step === 'offer' && (
          <>
            <div className="cleared-sub">The fire crackles. Sit a while.</div>
            <div className="choice-list">
              <button className="choice" onClick={() => onChoose({ kind: 'rest' })}>
                <b>Rest</b>
                <span>
                  Heal to full ({state.player.hp} &rarr; {state.player.maxHp} HP).
                </span>
              </button>
              <button className="choice" onClick={() => setTearing(true)}>
                <b>Tear out a page</b>
                <span>Remove one fragment from your deck for good.</span>
              </button>
            </div>
          </>
        )}
        {ev.step === 'done' && (
          <>
            {ev.said && <div className="event-said">{ev.said}</div>}
            <div className="cleared-sub">You walk out of the camp&hellip;</div>
          </>
        )}
      </div>
      {tearing && ev.step === 'offer' && (
        <Modal className="camp-modal">
          <h2>Tear out a page</h2>
          <p>Pick the fragment to remove from your deck for good.</p>
          <div className="camp-cards">
            {deck.map((c) => {
              const err = campError(state, { kind: 'tear', cardId: c.id });
              return (
                <button
                  key={c.id}
                  className="camp-card"
                  disabled={!!err}
                  title={err ?? `Tear out ${cardName(c)}`}
                  onClick={() => {
                    setTearing(false);
                    onChoose({ kind: 'tear', cardId: c.id });
                  }}
                >
                  <FragmentCard card={c} thought="show" />
                </button>
              );
            })}
          </div>
          <button className="text-button" onClick={() => setTearing(false)} autoFocus>
            Back
          </button>
        </Modal>
      )}
    </>
  );
}

/**
 * The Grimoire: every spell you've ever cast on this computer, written in as you discover it.
 * Runes are never recorded (keep your own notes).
 */
export function GrimoireBook({ pages, onClose }: { pages: string[]; onClose: () => void }) {
  const groups: { title: string; group: (typeof GRIMOIRE_PAGES)[number]['group'] }[] = [
    { title: 'Elements', group: 'element' },
    { title: 'Merges', group: 'merge' },
    { title: 'Forbidden', group: 'unstable' },
  ];
  const known = GRIMOIRE_PAGES.filter((p) => pages.includes(p.id)).length;
  return (
    <Modal className="grimoire-modal">
      <h2>The Grimoire</h2>
      <p className="muted">
        {known}/{GRIMOIRE_PAGES.length} pages restored
        {known === GRIMOIRE_PAGES.length ? ': the book is whole again.' : '. Cast a new combination to write its page.'}
      </p>
      {groups.map((g) => (
        <div key={g.group} className="grimoire-group">
          <div className="grimoire-group-title">{g.title}</div>
          <div className="grimoire-pages">
            {GRIMOIRE_PAGES.filter((p) => p.group === g.group).map((p) => (
              <div key={p.id} className={`grimoire-page ${pages.includes(p.id) ? 'is-known' : ''}`}>
                {pages.includes(p.id) ? p.title : '? ? ?'}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button className="hud-button" onClick={onClose} autoFocus>
        Close
      </button>
    </Modal>
  );
}

/**
 * [UI-PLACEMENT] The Deck (top bar button): every card the wizard owns right now (draw pile, hand, crafting table
 * and discard pile), sorted into elements, shapes and runes. Rune cards keep their thought bubble here, and the
 * player can write or change their notes on them.
 */
export function DeckView({ state, onClose }: { state: GameState; onClose: () => void }) {
  const owned = ownedCards(state.cards);
  const order = ['fire', 'water', 'earth', 'wind', 'beam', 'cross', 'wall'];
  const sort = (cards: Card[]) =>
    [...cards].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.rune ?? 0) - (b.rune ?? 0) || Number(!!a.loot) - Number(!!b.loot));
  const sections = [
    { title: 'Elements', cards: sort(owned.filter((c) => isElementKind(c.kind))) },
    { title: 'Shapes', cards: sort(owned.filter((c) => isShapeKind(c.kind))) },
    { title: 'Runes', cards: sort(owned.filter((c) => c.kind === 'rune')), runes: true },
  ].filter((s) => s.cards.length > 0);
  return (
    <div className="modal-backdrop light" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal deck-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your Deck</h2>
        <p className="muted">
          {owned.length} card{owned.length === 1 ? '' : 's'}: draw pile, hand and discard pile together.
          {sections.some((s) => s.runes) && ' Click the pencil on a rune’s thought to note what you think it does.'}
        </p>
        <div className="deck-scroll">
          {sections.map((s) => (
            <div key={s.title} className={`deck-section ${s.runes ? 'is-runes' : ''}`}>
              <div className="deck-section-title">
                {s.title} <span className="muted">×{s.cards.length}</span>
              </div>
              <div className="deck-grid">
                {s.cards.map((c) => (
                  <div key={c.id} className="deck-card">
                    <FragmentCard card={c} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="hud-button" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * The end of a run. Victory: New run. Defeat: Continue, which goes dark and shows the rune message before the
 * wizard wakes up in room 0 again (App.tsx, hud/TitleScreen.tsx FateScreen).
 */
export function GameOverDialog({ state, onNewRun }: { state: GameState; onNewRun: () => void }) {
  const won = state.phase === 'won';
  return (
    <Modal className={won ? 'is-won' : 'is-lost'}>
      <h2>{won ? 'Victory' : 'Defeat'}</h2>
      <p>
        {won
          ? 'The Redactor is destroyed. The grimoire is yours.'
          : state.lostReason === 'grimoire'
            ? 'Your grimoire is broken: your cards can no longer make a spell.'
            : state.lostReason === 'hole'
              ? 'The wizard fell into a hole.'
              : 'The wizard has fallen.'}
      </p>
      <button className="hud-button primary" onClick={onNewRun} autoFocus>
        {won ? 'New run' : 'Continue'}
      </button>
    </Modal>
  );
}

export function MenuDialog({ onResume, onNewRun, devMode, onDevMode }: {
  onResume: () => void;
  onNewRun: () => void;
  devMode: boolean;
  onDevMode: (on: boolean) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const desktop = window.grimoire?.isDesktop;
  const toggleFullscreen = () => {
    if (window.grimoire) window.grimoire.toggleFullscreen();
    else if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };
  return (
    <Modal className="menu-modal">
      <h2>Menu</h2>
      <button className="hud-button" onClick={onResume} autoFocus>
        Resume
      </button>
      <button className="hud-button" onClick={toggleFullscreen}>
        Toggle fullscreen (F11)
      </button>
      {confirm ? (
        <div className="confirm-row">
          <span>Abandon this run?</span>
          <button className="hud-button danger small" onClick={onNewRun}>
            Yes, new run
          </button>
          <button className="text-button" onClick={() => setConfirm(false)}>
            No
          </button>
        </div>
      ) : (
        <button className="hud-button" onClick={() => setConfirm(true)}>
          New run
        </button>
      )}
      {desktop && (
        <button className="hud-button" onClick={() => window.grimoire!.quit()}>
          Quit game
        </button>
      )}
      <div className="settings">
        <div className="settings-title">Settings</div>
        <label className="toggle-row" title="Dev toolbar (cheats), undo/redo with Ctrl+Z / Ctrl+Y, K kills the enemy under the pointer">
          <span className="toggle-label">
            Dev mode
            <span className="toggle-hint">Dev toolbar, undo/redo (Ctrl+Z / Ctrl+Y), K to kill</span>
          </span>
          <input type="checkbox" className="toggle" checked={devMode} onChange={(e) => onDevMode(e.target.checked)} />
        </label>
      </div>
      <p className="muted">Your run is saved automatically.</p>
    </Modal>
  );
}
