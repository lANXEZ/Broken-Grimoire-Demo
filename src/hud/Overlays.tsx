import { useEffect, useRef } from 'react';
import type { EnemyStep, GameState } from '../engine';
import { cardArt } from '../config/art';
import type { Card } from '../engine';

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
                <img key={c.id} src={cardArt(c)} alt="" />
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

/** [UI-PLACEMENT] Combat log drawer on the right (LAYOUT.logDrawer). Shows the current room. */
export function LogDrawer({ state, onClose }: { state: GameState; onClose: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const entries = state.log.filter((l) => l.roomIndex === state.roomIndex);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [entries.length]);
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
