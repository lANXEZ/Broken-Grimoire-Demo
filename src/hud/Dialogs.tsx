import { useState, type ReactNode } from 'react';
import {
  GRIMOIRE_PAGES,
  RULES,
  campError,
  stageName,
  cardName,
  ownedCards,
  type CampChoice,
  type EventChoice,
  type GameState,
} from '../engine';
import { FragmentCard } from './Hand';

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

/** The Whispering Lectern (fixed event between rooms 1 and 2). */
export function EventDialog({ state, onChoose }: { state: GameState; onChoose: (c: EventChoice) => void }) {
  return (
    <Modal className="event-modal">
      <h2>The Whispering Lectern</h2>
      <p className="flavor">
        A lectern of torn pages, written in the dungeon&apos;s gibberish. &ldquo;These pages are written in the dungeon&apos;s own tongue.
        You&apos;ll have to work out what they mean yourself&hellip; better keep notes.&rdquo;
      </p>
      <div className="choice-list">
        <button className="choice" onClick={() => onChoose('read')}>
          <b>Read the pages aloud</b>
          <span>
            Take {RULES.eventReadRunes} runes. Lose {RULES.eventReadHpCost} HP (you have {state.player.hp}).
          </span>
        </button>
        <button className="choice" onClick={() => onChoose('copy')}>
          <b>Copy one page carefully</b>
          <span>Take {RULES.eventCopyRunes} rune.</span>
        </button>
        <button className="choice" onClick={() => onChoose('leave')}>
          <b>Leave it</b>
          <span>Nothing happens.</span>
        </button>
      </div>
    </Modal>
  );
}

/** The camp (between rooms 2 and 3): rest, or tear a page out of the deck. */
export function CampDialog({ state, onChoose }: { state: GameState; onChoose: (c: CampChoice) => void }) {
  const [tearing, setTearing] = useState(false);
  const deck = ownedCards(state.cards)
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
  return (
    <Modal className="camp-modal">
      <h2>Camp</h2>
      {!tearing ? (
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
      ) : (
        <>
          <p>Pick the fragment to tear out.</p>
          <div className="camp-cards">
            {deck.map((c) => {
              const err = campError(state, { kind: 'tear', cardId: c.id });
              return (
                <button
                  key={c.id}
                  className="camp-card"
                  disabled={!!err}
                  title={err ?? `Tear out ${cardName(c)}`}
                  onClick={() => onChoose({ kind: 'tear', cardId: c.id })}
                >
                  <FragmentCard card={c} />
                </button>
              );
            })}
          </div>
          <button className="text-button" onClick={() => setTearing(false)}>
            Back
          </button>
        </>
      )}
    </Modal>
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
        New run
      </button>
    </Modal>
  );
}

export function MenuDialog({ onResume, onNewRun }: { onResume: () => void; onNewRun: () => void }) {
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
      <p className="muted">Your run is saved automatically.</p>
    </Modal>
  );
}
