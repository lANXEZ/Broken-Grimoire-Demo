import { useEffect, useRef, useState } from 'react';
import { TITLE_ART } from '../config/art';
import { TIMING } from '../config/timing';
import { FATE_MESSAGE } from '../config/runeMessages';
import { inRunes } from '../game/runeMap';

/**
 * [UI-PLACEMENT] The title screen, shown when the game opens: a night forest under the moon (PLACEHOLDER photo, see
 * config/art.ts TITLE_ART), the game's name big across the top, and the buttons on the right. With a run saved
 * from last time: Continue, or New game (which asks once, since it drops that run). Otherwise just Start. A run
 * still in room 0 doesn't count as saved (App.tsx). Quit closes the game (the .exe only: a browser tab can't).
 */
export function TitleScreen({ canContinue, leaving, fading = false, onContinue, onNewGame }: {
  canContinue: boolean;
  /** On its way out: the buttons stop working (Continue fades it; New game closes the eyes over it). */
  leaving: boolean;
  /** Fade out (Continue). New game keeps it in view while the eyes close over it. */
  fading?: boolean;
  onContinue: () => void;
  onNewGame: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`title-screen ${fading ? 'is-leaving' : ''}`} style={{ backgroundImage: `url(${TITLE_ART})` }}>
      <div className="title-stars" />
      <div className="title-fog fog-a" />
      <div className="title-fog fog-b" />
      <h1 className="title-name">
        Broken <span>Grimoire</span>
      </h1>
      <div className="title-menu">
        {!canContinue && (
          <button className="title-button" onClick={onNewGame} disabled={leaving} autoFocus>
            Start
          </button>
        )}
        {canContinue && !confirm && (
          <>
            <button className="title-button" onClick={onContinue} disabled={leaving} autoFocus>
              Continue
            </button>
            <button className="title-button is-secondary" onClick={() => setConfirm(true)} disabled={leaving}>
              New game
            </button>
          </>
        )}
        {canContinue && confirm && (
          <div className="title-confirm">
            <span>Start over? Your saved run will be lost.</span>
            <button className="title-button" onClick={onNewGame} disabled={leaving}>
              Yes, new game
            </button>
            <button className="title-button is-secondary" onClick={() => setConfirm(false)} disabled={leaving}>
              No
            </button>
          </div>
        )}
        {window.grimoire?.isDesktop && !confirm && (
          <button className="title-button is-secondary" onClick={() => window.grimoire?.quit()} disabled={leaving}>
            Quit
          </button>
        )}
      </div>
      <div className="title-credit">Placeholder photo: Aron Visuals / Unsplash</div>
    </div>
  );
}

/**
 * How open the eyes are over a blink (0 = shut, 1 = open, past 1 the last of the dark edges clears), as keyframes
 * of [time 0-1, openness]. Waking: shut (with a warm glow, like light through eyelids), crack open a little and
 * blurry, shut again, then open all the way. Closing (over the title screen): the open view shrinks to black.
 */
const WAKE: [number, number][] = [[0, 0], [0.16, 0], [0.34, 0.3], [0.44, 0.32], [0.55, 0], [0.62, 0], [0.92, 1], [1, 1.3]];
const CLOSE: [number, number][] = [[0, 1.05], [1, 0]];

/** Smooth in-between of the keyframes at time `t` (0-1). */
function openness(keys: [number, number][], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      const e = u * u * (3 - 2 * u); // ease in and out
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Waking up, first person. One black layer over the whole screen with a soft oval hole cut in it (a mask), so the
 * sides and corners stay dark until the eyes are fully open: the hole opens from a thin wide slit to past the
 * screen's corners, its edge blurred into a vignette that lingers for a moment. While the eyes are nearly shut a
 * warm red glow shows through. 'close' shrinks the hole to black (over the title screen); 'wake' blinks awake.
 * App blurs and dims the game for the same time (hud.css `wake-focus`).
 */
export function Blink({ stage, duration }: { stage: 'close' | 'wake'; duration?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const keys = stage === 'wake' ? WAKE : CLOSE;
    const time = duration ?? (stage === 'wake' ? TIMING.wakeBlink : TIMING.eyesClose);
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const node = el.current;
      if (!node) return;
      const t = Math.min(1, (now - start) / time);
      const o = openness(keys, t);
      const w = window.innerWidth;
      const h = window.innerHeight;
      // The hole: wide and flat when barely open, past the corners when open (the soft edge starts at 55%).
      const rx = w * (0.42 + 0.68 * o);
      const ry = h * (0.015 + 1.1 * o);
      const mask = o < 0.005 ? 'none' : `radial-gradient(ellipse ${rx}px ${ry}px at 50% 50%, transparent 0%, transparent 55%, #000 100%)`;
      node.style.maskImage = mask;
      node.style.webkitMaskImage = mask;
      // Light through the eyelids: warm while (nearly) shut.
      node.style.setProperty('--lid-glow', String(Math.max(0, 1 - o * 3) * (stage === 'wake' ? 0.55 : 0.25)));
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [stage, duration]);
  return <div ref={el} className="blink" aria-hidden />;
}

/**
 * When each character of a spoken line appears (ms after it starts), like someone saying it: a letter every
 * TIMING.fateLetter, a bit more between words, and a pause after a comma or full stop. `total`: until the last one
 * has fully faded in.
 */
export function spokenTimeline(text: string): { delays: number[]; total: number } {
  const T = TIMING;
  const delays: number[] = [];
  let at = 0;
  for (const c of text) {
    delays.push(at);
    at += c === ' ' ? T.fateWordGap : /[,.;:!?]/.test(c) ? T.fatePause : T.fateLetter;
  }
  const last = delays.length ? delays[delays.length - 1] : 0;
  return { delays, total: last + T.fateLetterFade };
}

/**
 * After a defeat: everything fades to black, then the rune message (config/runeMessages.ts FATE_MESSAGE, in this
 * computer's rune alphabet) appears in the middle of the screen from left to right, the way the wizard hears it
 * (spokenTimeline), stays, and fades out. Then `onDone`: the wizard wakes up in room 0 (App.tsx). Once it's fully
 * shown, a click (or Space / Enter) moves on to the fade-out. Timing: TIMING.fate*.
 */
export function FateScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'dark' | 'in' | 'out'>('dark');
  const [ready, setReady] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const plain = [...FATE_MESSAGE];
  const runes = [...inRunes(FATE_MESSAGE)];
  const { delays, total } = spokenTimeline(FATE_MESSAGE);
  useEffect(() => {
    const T = TIMING;
    const timers = [
      window.setTimeout(() => setStep('in'), T.fateFade),
      window.setTimeout(() => setReady(true), T.fateFade + total),
      window.setTimeout(() => setStep('out'), T.fateFade + total + T.fateHold),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [total]);
  useEffect(() => {
    if (step !== 'out') return;
    const t = window.setTimeout(() => done.current(), TIMING.fateMessageOut);
    return () => window.clearTimeout(t);
  }, [step]);
  // Skipping the wait: straight to the fade-out, but never before the message is fully shown.
  const skip = () => {
    if (ready && step === 'in') setStep('out');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Words are kept whole so a line never breaks inside one; each character fades in at its own time.
  const words: { start: number; end: number }[] = [];
  plain.forEach((c, i) => {
    if (c === ' ') return;
    const w = words[words.length - 1];
    if (w && w.end === i) w.end = i + 1;
    else words.push({ start: i, end: i + 1 });
  });
  return (
    <div
      className={`fate-screen is-${step}`}
      style={{
        ['--fate-fade' as string]: `${TIMING.fateFade}ms`,
        ['--fate-letter' as string]: `${TIMING.fateLetterFade}ms`,
        ['--fate-out' as string]: `${TIMING.fateMessageOut}ms`,
      }}
      onPointerDown={skip}
    >
      {step !== 'dark' && (
        <div className="fate-message rune-text" aria-hidden>
          {words.map((w, wi) => (
            <span key={w.start}>
              {wi > 0 && ' '}
              <span className="fate-word">
                {runes.slice(w.start, w.end).map((r, k) => (
                  <span key={k} className="fate-char" style={{ animationDelay: `${delays[w.start + k]}ms` }}>
                    {r}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
