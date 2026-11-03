import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '../engine';
import { ELEMENT_COLOR } from '../config/art';
import type { CastPreview, TablePlacement } from '../game/casting';
import { FragmentCard } from './Hand';
import type { DragSource } from './useCardDrag';

interface Props {
  /** Cards on the table with where they lie, bottom of the pile first. */
  cards: { card: Card; place: TablePlacement }[];
  preview: CastPreview;
  /** True while a dragged card is over the table. */
  dragOver: boolean;
  dragging: boolean;
  draggingId: number | null;
  locked: boolean;
  startDrag: (cardId: number, source: DragSource) => (e: ReactPointerEvent) => void;
  onCast: () => void;
}

/** The element whose box card positions are measured against (App.tsx reads it on drop). */
export const TABLE_AREA_SELECTOR = '[data-table-area]';

/**
 * [UI-PLACEMENT] The crafting table: one big drop area centred above the hand (LAYOUT.craftingTable), with the
 * Cast button hanging off its right side (LAYOUT.castButton).
 *
 * Drag fragments onto the table and they stay where you drop them, slightly tilted, like cards tossed on a desk
 * (clicking a hand card drops it at a random spot). Drag a table card to move it around (it comes to the top),
 * drag it off the table or click it to take it back. The strip along the top says what the cards make. The Cast
 * button lights up only when the cards make a castable spell (2–3 fragments, enough mana, an action left).
 * Beams don't need the button: while a Beam is castable the board is already aiming, and clicking a direction
 * casts it. The button then just says so.
 */
export function CraftingTable({ cards, preview, dragOver, dragging, draggingId, locked, startDrag, onCast }: Props) {
  const ready = preview.status === 'ready';
  const aimOnBoard = ready && preview.needsAim;
  const accent = preview.element ? ELEMENT_COLOR[preview.element] : undefined;

  return (
    <div
      className={`crafting ${ready ? 'is-ready' : ''} ${aimOnBoard ? 'is-aiming' : ''}`}
      style={accent ? ({ '--spell-accent': accent } as CSSProperties) : undefined}
    >
      <div
        data-drop="table"
        className={`crafting-table status-${preview.status} ${dragOver ? 'is-over' : ''} ${dragging && !dragOver ? 'is-inviting' : ''}`}
      >
        <div className="table-strip">
          {preview.title && <span className="table-title">{preview.title}</span>}
          <span className="table-message">{preview.message}</span>
        </div>
        <div className="table-cards" data-table-area>
          {cards.length === 0 && <div className="table-empty">Crafting table</div>}
          {cards.map(({ card, place }, i) => (
            <div
              key={card.id}
              className={`table-card ${draggingId === card.id ? 'is-dragging' : ''}`}
              style={{
                left: `${place.x * 100}%`,
                top: `${place.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${place.tilt}deg)`,
                zIndex: i + 1,
              }}
              onPointerDown={locked ? undefined : startDrag(card.id, { from: 'table' })}
            >
              <FragmentCard card={card} />
            </div>
          ))}
        </div>
      </div>

      {aimOnBoard ? (
        <button className="cast-button is-lit is-aim" onClick={onCast} title="Click a tile on the board in the direction you want to cast">
          {preview.cost !== undefined && <span className="cast-cost">{preview.cost}</span>}
          <span className="cast-label">Aim</span>
          <span className="cast-sub">click a direction on the board</span>
        </button>
      ) : (
        <button className={`cast-button ${ready ? 'is-lit' : ''}`} disabled={!ready} onClick={onCast} title={ready ? undefined : preview.message}>
          {preview.cost !== undefined && <span className={`cast-cost ${preview.status === 'blocked' ? 'is-short' : ''}`}>{preview.cost}</span>}
          <span className="cast-label">Cast</span>
        </button>
      )}
    </div>
  );
}
