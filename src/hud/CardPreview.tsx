import { cardName, runeName, type Card } from '../engine';
import { fragmentArt, infoCardArt } from '../config/art';
import { useRuneNote } from '../game/runeNotes';

/**
 * [UI-PLACEMENT] The card for the fragment under the pointer, shown big in the empty space right of the board
 * (LAYOUT.cardPreview). Elements and shapes show their info card (public/art/info_cards/). Runes have none: they show
 * the rune fragment itself, its name and the player's note about it.
 */
export function CardPreview({ card }: { card: Card | null }) {
  if (!card) return null;
  if (card.kind === 'rune') return <RunePreview card={card} />;
  const src = infoCardArt(card.kind);
  if (!src) return null;
  return (
    <div className="card-preview" key={card.id}>
      <img src={src} alt={`${cardName(card)} card`} draggable={false} />
    </div>
  );
}

function RunePreview({ card }: { card: Card }) {
  const symbol = card.rune ?? 0;
  const note = useRuneNote(symbol);
  return (
    <div className="card-preview is-rune" key={card.id}>
      <img src={fragmentArt(card)} alt={`${runeName(symbol)} rune`} draggable={false} />
      <div className="card-preview-name">{runeName(symbol)}</div>
      <div className={`card-preview-note ${note ? '' : 'is-empty'}`}>{note || 'No idea what it does yet.'}</div>
    </div>
  );
}
