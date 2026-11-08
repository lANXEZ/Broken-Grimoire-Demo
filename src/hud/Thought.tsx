import { useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { RUNE_NOTE_MAX, setRuneNote, useRuneNote } from '../game/runeNotes';

/**
 * PLACEHOLDER look for the mage's thoughts: a twisted, foggy, blurry cloud (hud.css `.thought`). Used for the
 * bubble over every rune card and for the whole "Hmmm..." note. `tail` adds the little puffs of a thought bubble
 * trailing down from it.
 */
export function ThoughtCloud({ children, className = '', tail = false }: { children: ReactNode; className?: string; tail?: boolean }) {
  return (
    <div className={`thought ${className}`}>
      <div className="thought-fog" aria-hidden />
      <div className="thought-body">{children}</div>
      {tail && (
        <>
          <span className="thought-puff puff-a" aria-hidden />
          <span className="thought-puff puff-b" aria-hidden />
        </>
      )}
    </div>
  );
}

/**
 * The SVG filters that twist the edges of every thought cloud (wavy noise, then a soft blur). Rendered once, by App.
 * `thought-warp` is for the big "Hmmm..." note, `thought-warp-sm` for the small bubbles over rune cards.
 */
export function ThoughtFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="thought-warp" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="1.3" />
      </filter>
      <filter id="thought-warp-sm" x="-25%" y="-40%" width="150%" height="180%">
        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="0.5" />
      </filter>
    </svg>
  );
}

/** What the mage thinks before the player writes anything. */
export const RUNE_THOUGHT_DEFAULT = 'Hmm, what is it?';

const stop = (e: ReactPointerEvent) => e.stopPropagation();

/**
 * The thought bubble over a rune card: the player's own note on that rune ("Hmm, what is it?" until they write
 * one). With `editable`, the pencil opens a text box: Enter saves, Esc cancels, clicking away saves. The note
 * belongs to the rune's symbol, so every card with that symbol shows the same one (game/runeNotes.ts).
 */
export function RuneThought({ symbol, editable }: { symbol: number; editable: boolean }) {
  const note = useRuneNote(symbol);
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null) setRuneNote(symbol, draft);
    setDraft(null);
  };
  return (
    <div className={`rune-thought ${draft !== null ? 'is-editing' : ''}`} onPointerDown={stop}>
      <ThoughtCloud tail>
        {draft !== null ? (
          <textarea
            className="rune-thought-input"
            value={draft}
            maxLength={RUNE_NOTE_MAX}
            autoFocus
            placeholder="What does it do?"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={save}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(null);
              }
            }}
          />
        ) : (
          <span className={`rune-thought-text ${note ? '' : 'is-default'}`}>{note || RUNE_THOUGHT_DEFAULT}</span>
        )}
        {editable && draft === null && (
          <button
            className="rune-thought-edit"
            title="Write what you think this rune does"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(note);
            }}
          >
            &#9998;
          </button>
        )}
      </ThoughtCloud>
    </div>
  );
}
