import { RUNE_SYMBOLS, fragmentName } from '../engine';
import { FRAGMENT_COLOR, iconArt } from '../config/art';
import type { NoteLine, NoteToken, NoteView } from '../game/notes';
import { useRuneNote } from '../game/runeNotes';
import { RUNE_THOUGHT_DEFAULT, ThoughtCloud } from './Thought';

/**
 * [UI-PLACEMENT] "Hmmm...": the wizard's memory of every card combination cast so far (LAYOUT.hmmm), drawn as one
 * of his foggy thoughts. Top: what the hand can make right now (hover = those hand cards rise, click = they go on
 * the crafting table). Bottom, ghosted: the rest. With cards on the table, only lines using them are shown and
 * those cards are highlighted. Lines with a rune keep its numbers a mystery ("?") and show the player's own note
 * on that rune instead. Logic: game/notes.ts.
 */
export function HmmmNote({ view, tableUsed, interactive, fresh, onHover, onPick }: {
  view: NoteView;
  /** Cards are on the crafting table (the note is filtered by them). */
  tableUsed: boolean;
  /** Lines can be clicked (your turn, nothing else going on). */
  interactive: boolean;
  /** Keys just added: they glow for a moment. */
  fresh: string[];
  onHover: (line: NoteLine | null) => void;
  onPick: (line: NoteLine) => void;
}) {
  const total = view.available.length + view.missing.length;
  const line = (l: NoteLine) => (
    <NoteRow key={l.key} line={l} interactive={interactive} fresh={fresh.includes(l.key)} onHover={onHover} onPick={onPick} />
  );
  return (
    <ThoughtCloud className="hmmm">
      <div className="hmmm-title">Hmmm&hellip;</div>
      <div className="hmmm-scroll" onPointerLeave={() => onHover(null)}>
        {total === 0 && (
          <p className="hmmm-empty">
            {tableUsed && view.hidden > 0
              ? 'Nothing I remember uses these…'
              : 'Nothing comes to mind yet. Once a spell works, I’ll remember how I made it.'}
          </p>
        )}
        {view.available.length > 0 && <div className="hmmm-section">I could make&hellip;</div>}
        {view.available.map(line)}
        {view.missing.length > 0 && <div className="hmmm-section is-missing">If only I had&hellip;</div>}
        {view.missing.map(line)}
        {tableUsed && view.hidden > 0 && total > 0 && (
          <p className="hmmm-hidden">
            ({view.hidden} other idea{view.hidden === 1 ? '' : 's'} don&rsquo;t use these)
          </p>
        )}
      </div>
    </ThoughtCloud>
  );
}

function NoteRow({ line, interactive, fresh, onHover, onPick }: {
  line: NoteLine;
  interactive: boolean;
  fresh: boolean;
  onHover: (line: NoteLine | null) => void;
  onPick: (line: NoteLine) => void;
}) {
  const usable = interactive && line.available && line.addIds.length > 0;
  return (
    <button
      className={`hmmm-line ${line.available ? 'is-available' : 'is-missing'} ${fresh ? 'is-fresh' : ''}`}
      disabled={!usable}
      onPointerEnter={() => onHover(usable ? line : null)}
      onFocus={() => onHover(usable ? line : null)}
      onBlur={() => onHover(null)}
      onClick={() => usable && onPick(line)}
      title={usable ? 'Put these on the crafting table' : undefined}
    >
      <span className="hmmm-tokens">
        {line.tokens.map((t, i) => (
          <TokenChip key={i} token={t} onTable={line.onTable[i]} />
        ))}
      </span>
      <span className="hmmm-info">
        <span className={`hmmm-cost ${line.tooExpensive ? 'is-short' : ''}`} title={line.cost === null ? 'The rune makes this a mystery' : 'Mana cost'}>
          {line.cost ?? '?'}
        </span>
        <span className="hmmm-effect">{line.effect ?? '?'}</span>
      </span>
      <span className="hmmm-name">{line.name}</span>
    </button>
  );
}

/** One card of a line: its picture (or colour) and name. A rune shows the player's note on it above. */
function TokenChip({ token, onTable }: { token: NoteToken; onTable: boolean }) {
  if (token.kind === 'rune') return <RuneChip symbol={token.rune ?? 0} onTable={onTable} />;
  const icon = iconArt(token.kind);
  return (
    <span className={`hmmm-chip ${onTable ? 'is-on-table' : ''}`} style={{ ['--frag-color' as string]: FRAGMENT_COLOR[token.kind] }}>
      {icon ? <img src={icon} alt="" /> : <span className="hmmm-dot" />}
      {fragmentName(token.kind)}
    </span>
  );
}

function RuneChip({ symbol, onTable }: { symbol: number; onTable: boolean }) {
  const note = useRuneNote(symbol);
  const rune = RUNE_SYMBOLS[symbol];
  return (
    <span className="hmmm-rune">
      <span className={`hmmm-rune-note ${note ? '' : 'is-default'}`}>{note || RUNE_THOUGHT_DEFAULT}</span>
      <span className={`hmmm-chip is-rune ${onTable ? 'is-on-table' : ''}`}>
        <span className="hmmm-glyph">{rune?.glyph ?? '?'}</span>
        {rune?.name ?? 'Rune'}
      </span>
    </span>
  );
}
