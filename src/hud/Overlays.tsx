import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cardName } from '../engine';
import { TIMING } from '../config/timing';
import type { Card, EnemyStep, GameState } from '../engine';
import { FragmentCard } from './Hand';

/** [UI-PLACEMENT] Big "Your turn" / "Enemy turn" banner across the middle (LAYOUT.banner.top). */
export function TurnBanner({ banner }: { banner: { id: number; title: string; sub?: string; kind: 'player' | 'enemy' | 'room' } | null }) {
  if (!banner) return null;
  return (
    <div key={banner.id} className={`turn-banner banner-${banner.kind}`}>
      <div className="banner-title">{banner.title}</div>
      {banner.sub && <div className="banner-sub">{banner.sub}</div>}
    </div>
  );
}

/** [UI-PLACEMENT] What the enemy is doing right now, under the top bar (LAYOUT.banner.captionTop). */
export function EnemyCaption({ step, onSkip }: { step: EnemyStep | null; onSkip: () => void }) {
  return (
    <div className="enemy-caption">
      <div className="caption-text">{step ? step.entries.map((e) => e.text).join(' ') : 'The enemies stir…'}</div>
      <button className="text-button" onClick={onSkip} title="Space">
        Skip ▸▸
      </button>
    </div>
  );
}

export interface Toast {
  id: number;
  kind: 'loot' | 'error' | 'info';
  title: string;
  lines: string[];
  cards?: Card[];
}

/** [UI-PLACEMENT] Loot and error toasts, top right (LAYOUT.toasts). */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => onDismiss(t.id)}>
          {t.cards && t.cards.length > 0 && (
            <div className="toast-cards">
              {t.cards.map((c) => (
                <FragmentCard key={c.id} card={c} className="toast-card" thought="none" />
              ))}
            </div>
          )}
          <div>
            <div className="toast-title">{t.title}</div>
            {t.lines.map((l, i) => (
              <div key={i} className="toast-line">
                {l}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Something the mage just picked up off the floor. */
export interface Pickup {
  id: number;
  cards: Card[];
  /** true = back into the hand (a Page Scrap's stolen cards); false = into the discard pile. */
  toHand: boolean;
  /** Into the deck instead (runes from the lectern). */
  toDeck?: boolean;
}

/**
 * [UI-PLACEMENT] Picking up a drop (LAYOUT.pickup): the cards pop up big in the middle of the screen with their
 * names, hold for TIMING.pickupHold, then fly into the discard pile (or the hand) and vanish.
 */
export function PickupReveal({ pickup, onDone }: { pickup: Pickup; onDone: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // Where to fly: the centre of the discard pile (or the hand), relative to where the cards are shown.
  useLayoutEffect(() => {
    const target = document.querySelector(pickup.toHand ? '.hand' : pickup.toDeck ? '.pile-draw .pile-stack' : '.pile-discard .pile-stack')?.getBoundingClientRect();
    const from = box.current?.getBoundingClientRect();
    if (target && from) {
      setFly({ x: target.left + target.width / 2 - (from.left + from.width / 2), y: target.top + target.height / 2 - (from.top + from.height / 2) });
    }
    const t = window.setTimeout(() => done.current(pickup.id), TIMING.pickupHold + TIMING.pickupFly);
    return () => window.clearTimeout(t);
  }, [pickup]);

  const style = {
    '--fly-x': `${fly?.x ?? 0}px`,
    '--fly-y': `${fly?.y ?? 0}px`,
    '--hold': `${TIMING.pickupHold}ms`,
    '--fly': `${TIMING.pickupFly}ms`,
  } as CSSProperties;
  return (
    <div ref={box} className="pickup-reveal" style={style}>
      <div className="pickup-label">{pickup.toHand ? 'Recovered' : pickup.toDeck ? 'You take' : 'Picked up'}</div>
      <div className="pickup-cards">
        {pickup.cards.map((c) => (
          <div key={c.id} className="pickup-card">
            <FragmentCard card={c} thought="show" />
            <div className="pickup-name">{cardName(c)}</div>
          </div>
        ))}
      </div>
      <div className="pickup-where">{pickup.toHand ? '→ back to your hand' : pickup.toDeck ? '→ your deck' : '→ discard pile'}</div>
    </div>
  );
}

/** [UI-PLACEMENT] Combat log drawer on the right (LAYOUT.logDrawer). Shows the current room. */
export function LogDrawer({ state, onClose }: { state: GameState; onClose: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const entries = state.log.filter((l) => l.roomIndex === state.roomIndex);
  // Braces matter: newer Chromium returns a Promise from scrollIntoView, and React would call it as the cleanup
  // when the drawer closes ("destroy is not a function"), unmounting the whole game to a black screen.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);
  return (
    <div className="log-drawer">
      <div className="log-head">
        <span>Combat log · {state.room.name}</span>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="log-body">
        {entries.map((l) => (
          <div key={l.id} className={`log-entry side-${l.side}`}>
            <span className="log-turn">T{l.turn}</span>
            {l.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
