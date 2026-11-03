import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { fragmentName, type Card } from '../engine';
import { cardArt } from '../config/art';
import { LAYOUT } from '../config/layout';
import type { DragSource } from './useCardDrag';

/** A fragment card face. PLACEHOLDER art: the printed kit cards (config/art.ts). */
export function FragmentCard({ card, className = '', style }: { card: Card; className?: string; style?: CSSProperties }) {
  return (
    <div className={`fragment-card ${card.loot ? 'is-loot' : ''} ${className}`} style={style}>
      <img src={cardArt(card)} alt={`${fragmentName(card.kind)} fragment`} draggable={false} />
    </div>
  );
}

interface HandProps {
  /** Cards in hand that aren't on the crafting table, in hand order. */
  cards: Card[];
  draggingId: number | null;
  /** True while a card from the crafting table is dragged off it (drop it to take it back). */
  dropHighlight: boolean;
  startDrag: (cardId: number, source: DragSource) => (e: ReactPointerEvent) => void;
  /** Reroll mode: cards marked to be swapped. */
  rerollMarked: number[] | null;
  disabled: boolean;
}

/**
 * [UI-PLACEMENT] The hand: fanned cards at the bottom centre, Slay the Spire style (LAYOUT.hand).
 * Drag a card up onto the crafting table, or click it to put it there.
 * In reroll mode, clicking marks cards to swap instead.
 */
export function Hand({ cards, draggingId, dropHighlight, startDrag, rerollMarked, disabled }: HandProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const L = LAYOUT.hand;
  const n = cards.length;
  // Squeeze the fan when the hand grows past 5 (Page Scraps can give stolen cards back).
  const spacing = Math.min(L.spacing, 820 / Math.max(1, n));
  const mid = (n - 1) / 2;

  return (
    <div className={`hand ${dropHighlight ? 'drop-highlight' : ''} ${disabled ? 'is-disabled' : ''}`} data-drop="hand">
      {cards.map((card, i) => {
        const off = i - mid;
        const isHover = hovered === card.id && draggingId === null && !disabled;
        const marked = rerollMarked?.includes(card.id) ?? false;
        const lift = isHover ? L.hoverLift : marked ? 40 : 0;
        const style: CSSProperties = {
          // Positions in design pixels, scaled by --u (see config/layout.ts).
          transform: `translateX(calc(${off * spacing} * var(--u))) translateY(calc(${L.arcDrop * off * off - lift} * var(--u))) rotate(${isHover ? 0 : off * L.fanDeg}deg) scale(${isHover ? L.hoverScale : 1})`,
          zIndex: isHover ? 50 : 10 + i,
        };
        return (
          <div
            key={card.id}
            className={`hand-card ${draggingId === card.id ? 'is-dragging' : ''} ${marked ? 'is-marked' : ''} ${rerollMarked ? 'is-rerolling' : ''}`}
            style={style}
            onPointerEnter={() => setHovered(card.id)}
            onPointerLeave={() => setHovered((h) => (h === card.id ? null : h))}
            onPointerDown={disabled ? undefined : startDrag(card.id, { from: 'hand' })}
          >
            <FragmentCard card={card} />
            {marked && <div className="reroll-mark">↻</div>}
          </div>
        );
      })}
    </div>
  );
}
