import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { RUNE_SYMBOLS, cardName, isShapeKind, type Card } from '../engine';
import { FRAGMENT_COLOR, cardArt } from '../config/art';
import { LAYOUT } from '../config/layout';
import { KitCard, hasKitCard } from './KitCard';
import { RuneThought } from './Thought';
import type { DragSource } from './useCardDrag';

/**
 * A fragment card face. PLACEHOLDER art: the printed kit cards (config/art.ts). Wind and Wall, which the kit never
 * had, are drawn in the kit's layout (hud/KitCard.tsx); runes are plain cards with their gibberish symbol.
 *
 * A rune card also wears the wizard's thought bubble with the player's note on it (hud/Thought.tsx):
 * `thought` = 'edit' (default: the pencil works), 'show' (read only, e.g. on buttons) or 'none' (tiny copies).
 */
export function FragmentCard({ card, className = '', style, thought = 'edit' }: {
  card: Card;
  className?: string;
  style?: CSSProperties;
  thought?: 'edit' | 'show' | 'none';
}) {
  if (card.kind === 'rune' && thought !== 'none') {
    return (
      <div className="rune-holder">
        <CardFace card={card} className={className} style={style} />
        <RuneThought symbol={card.rune ?? 0} editable={thought === 'edit'} />
      </div>
    );
  }
  return <CardFace card={card} className={className} style={style} />;
}

function CardFace({ card, className = '', style }: { card: Card; className?: string; style?: CSSProperties }) {
  const art = cardArt(card);
  // If a picture fails to load (a missing or renamed file), fall back to the drawn placeholder card below.
  const [failed, setFailed] = useState<string | null>(null);
  if (art && failed !== art.src) {
    return (
      <div className={`fragment-card has-art ${card.loot ? 'is-loot' : ''} ${className}`} style={style}>
        <img src={art.src} alt={`${cardName(card)} fragment`} draggable={false} onError={() => setFailed(art.src)} />
        {art.seal && <div className="kit-seal" />}
      </div>
    );
  }
  // Wind and Wall: drawn in the kit's card layout (hud/KitCard.tsx).
  if (hasKitCard(card.kind)) return <KitCard card={card} className={className} style={style} />;
  const rune = card.kind === 'rune' ? RUNE_SYMBOLS[card.rune ?? 0] : null;
  const kind = rune ? 'rune' : isShapeKind(card.kind) ? 'shape' : 'element';
  return (
    <div
      className={`fragment-card is-drawn drawn-${kind} ${card.loot ? 'is-loot' : ''} ${className}`}
      style={{ ...style, ['--frag-color' as string]: FRAGMENT_COLOR[card.kind] }}
      title={cardName(card)}
    >
      <div className="drawn-glyph">{rune ? rune.glyph : cardName(card).charAt(0)}</div>
      <div className="drawn-name">{rune ? rune.name : cardName(card)}</div>
      {card.loot && <div className="drawn-seal" />}
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
  /** Cards pulled up out of the fan (the "Hmmm..." line under the pointer would use them). */
  lifted: number[];
  disabled: boolean;
}

/**
 * [UI-PLACEMENT] The hand: fanned cards at the bottom centre, Slay the Spire style (LAYOUT.hand).
 * Drag a card up onto the crafting table, or click it to put it there.
 * In reroll mode, clicking marks cards to swap instead.
 */
export function Hand({ cards, draggingId, dropHighlight, startDrag, rerollMarked, lifted, disabled }: HandProps) {
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
        const pulled = lifted.includes(card.id);
        const lift = isHover ? L.hoverLift : pulled ? L.noteLift : marked ? 40 : 0;
        const style: CSSProperties = {
          // Positions in design pixels, scaled by --u (see config/layout.ts).
          transform: `translateX(calc(${off * spacing} * var(--u))) translateY(calc(${L.arcDrop * off * off - lift} * var(--u))) rotate(${isHover ? 0 : off * L.fanDeg}deg) scale(${isHover ? L.hoverScale : 1})`,
          zIndex: isHover ? 50 : 10 + i,
        };
        return (
          <div
            key={card.id}
            className={`hand-card ${draggingId === card.id ? 'is-dragging' : ''} ${marked ? 'is-marked' : ''} ${pulled ? 'is-pulled' : ''} ${rerollMarked ? 'is-rerolling' : ''}`}
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
