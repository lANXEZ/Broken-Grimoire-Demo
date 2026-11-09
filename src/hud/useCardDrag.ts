import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { play } from '../audio/audio';

/**
 * Drag-and-drop for fragment cards, built on pointer events (works the same with mouse, pen and touch).
 *
 * A card starts a drag when it is pressed and moved a few pixels; a press without moving is a click.
 * Drop targets are plain elements marked with `data-drop="..."` (e.g. `table`, `hand`), found under the
 * pointer when the card is released, so any HUD element can become a drop target.
 */

/** Where a dragged card came from: the hand or the crafting table. */
export type DragSource = { from: 'hand' } | { from: 'table' };

export interface DragState {
  cardId: number;
  source: DragSource;
  x: number;
  y: number;
  /** The `data-drop` value under the pointer, if any. */
  over: string | null;
}

const DRAG_THRESHOLD_PX = 6;

function dropTargetAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const target = (el as HTMLElement).closest?.('[data-drop]');
    if (target) return target.getAttribute('data-drop');
  }
  return null;
}

export function useCardDrag(handlers: {
  enabled: boolean;
  /** `point` is where the pointer was released (viewport pixels), so drop targets can place the card there. */
  onDrop: (cardId: number, source: DragSource, target: string | null, point: { x: number; y: number }) => void;
  onClick: (cardId: number, source: DragSource) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ cardId: number; source: DragSource; startX: number; startY: number; active: boolean } | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;

  const onMove = useCallback((e: PointerEvent) => {
    const p = pending.current;
    if (!p) return;
    if (!p.active && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD_PX) return;
    if (!p.active) play('cardPick');
    p.active = true;
    setDrag({ cardId: p.cardId, source: p.source, x: e.clientX, y: e.clientY, over: dropTargetAt(e.clientX, e.clientY) });
  }, []);

  const onUp = useCallback(
    (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!p) return;
      if (p.active) latest.current.onDrop(p.cardId, p.source, dropTargetAt(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
      else latest.current.onClick(p.cardId, p.source);
    },
    [onMove],
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  /** Spread onto a card element: `onPointerDown={startDrag(card.id, source)}`. */
  const startDrag = useCallback(
    (cardId: number, source: DragSource) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      if (!latest.current.enabled) {
        latest.current.onClick(cardId, source);
        return;
      }
      e.preventDefault();
      pending.current = { cardId, source, startX: e.clientX, startY: e.clientY, active: false };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  return { drag, startDrag };
}
