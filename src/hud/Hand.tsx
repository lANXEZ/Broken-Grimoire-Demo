import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { RUNE_SYMBOLS, cardName, isShapeKind, type Card } from '../engine';
import { RuneLetter } from './RuneLetter';
import { FRAGMENT_COLOR, fragmentArt } from '../config/art';
import { LAYOUT } from '../config/layout';
import { RuneThought } from './Thought';
import { CardPreview } from './CardPreview';
import type { DragSource } from './useCardDrag';

/**
 * A fragment: a torn grimoire page from the art team (config/art.ts `fragmentArt`), with a wax seal on loot. Its full
 * card shows beside the board while it's hovered (hud/CardPreview.tsx).
 *
 * A rune card also wears the mage's thought bubble with the player's note on it (hud/Thought.tsx):
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
  const src = fragmentArt(card);
  // If a picture fails to load (a missing or renamed file), fall back to the drawn placeholder card below.
  const [failed, setFailed] = useState<string | null>(null);
  if (failed !== src) {
    return (
      <div className={`fragment-card is-fragment ${card.loot ? 'is-loot' : ''} ${className}`} style={style}>
        <img src={src} alt={`${cardName(card)} fragment`} draggable={false} onError={() => setFailed(src)} />
        {card.loot && <div className="kit-seal" />}
      </div>
    );
  }
  const rune = card.kind === 'rune' ? RUNE_SYMBOLS[card.rune ?? 0] : null;
  const kind = rune ? 'rune' : isShapeKind(card.kind) ? 'shape' : 'element';
  return (
    <div
      className={`fragment-card is-drawn drawn-${kind} ${card.loot ? 'is-loot' : ''} ${className}`}
      style={{ ...style, ['--frag-color' as string]: FRAGMENT_COLOR[card.kind] }}
      title={cardName(card)}
    >
      <div className="drawn-glyph">{rune ? <RuneLetter symbol={card.rune ?? 0} /> : cardName(card).charAt(0)}</div>
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
  /**
   * The opening tutorial: only the `only` cards can be picked up (they glow; the rest are dimmed), and the `tip`
   * floats over card `tipId`.
   */
  tutorial?: { only: number[]; tipId: number | null; tip: string } | null;
}

/**
 * [UI-PLACEMENT] The hand: fanned fragments at the bottom centre, Slay the Spire style (LAYOUT.hand).
 * Drag a fragment up onto the crafting table, or click it to put it there. Hovering one shows its card beside the
 * board (hud/CardPreview.tsx). In reroll mode, clicking marks fragments to swap instead.
 */
export function Hand({ cards, draggingId, dropHighlight, startDrag, rerollMarked, lifted, disabled, tutorial = null }: HandProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const L = LAYOUT.hand;
  const n = cards.length;
  // Squeeze the fan when the hand grows past 5 (Page Scraps can give stolen cards back).
  const spacing = Math.min(L.spacing, 820 / Math.max(1, n));
  const mid = (n - 1) / 2;
  const previewed = draggingId === null ? cards.find((c) => c.id === hovered) ?? null : null;

  return (
    <div className={`hand ${dropHighlight ? 'drop-highlight' : ''} ${disabled ? 'is-disabled' : ''}`} data-drop="hand">
      <CardPreview card={previewed} />
      {cards.map((card, i) => {
        const off = i - mid;
        const shut = !!tutorial && !tutorial.only.includes(card.id);
        const isHover = hovered === card.id && draggingId === null && !disabled && !shut;
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
            className={`hand-card ${draggingId === card.id ? 'is-dragging' : ''} ${marked ? 'is-marked' : ''} ${pulled ? 'is-pulled' : ''} ${rerollMarked ? 'is-rerolling' : ''} ${tutorial ? (shut ? 'is-shut' : 'is-tutorial') : ''}`}
            style={style}
            onPointerEnter={() => setHovered(card.id)}
            onPointerLeave={() => setHovered((h) => (h === card.id ? null : h))}
            onPointerDown={disabled || shut ? undefined : startDrag(card.id, { from: 'hand' })}
          >
            {tutorial?.tipId === card.id && <div className="tutorial-tip">{tutorial.tip}</div>}
            <FragmentCard card={card} />
            {marked && <div className="reroll-mark">↻</div>}
          </div>
        );
      })}
    </div>
  );
}
