import { useEffect, useRef, useState } from 'react';
import { TIMING } from '../config/timing';

/** The curse's words, line by line (the last two are the shout). */
export const CURSE_LINES = ['There is no more content in this demo.', 'NOW GO SUFFER THE DEMO’S ENDLESS CURSE', '(PCG applied)'];
const TOTAL = CURSE_LINES.reduce((n, l) => n + l.length, 0);

type Step = 'dark' | 'text' | 'hold' | 'flash' | 'fade';

/**
 * After the Redactor (Victory's Continue, or the dev Endless button): the game breaks the fourth wall. The screen
 * darkens to purple while the mage glows (scene/CurseGlow.tsx), the curse types itself out in glitchy purple, then a
 * purple flash: at its brightest `onTeleport` starts endless mode underneath, and the flash fades on the first
 * endless room. Once the words are out, Space, Enter or a click moves on.
 */
export function EndlessCurse({ onTeleport, onDone }: { onTeleport: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('dark');
  const [shown, setShown] = useState(0);
  const teleported = useRef(false);

  useEffect(() => {
    if (step === 'dark') {
      const t = window.setTimeout(() => setStep('text'), TIMING.curseDarken);
      return () => window.clearTimeout(t);
    }
    if (step === 'text') {
      if (shown >= TOTAL) {
        setStep('hold');
        return;
      }
      const t = window.setTimeout(() => setShown((n) => n + 1), TIMING.curseChar);
      return () => window.clearTimeout(t);
    }
    if (step === 'hold') {
      const t = window.setTimeout(() => setStep('flash'), TIMING.curseHold);
      return () => window.clearTimeout(t);
    }
    if (step === 'flash') {
      const t = window.setTimeout(() => {
        if (!teleported.current) {
          teleported.current = true;
          onTeleport();
        }
        setStep('fade');
      }, TIMING.curseFlash);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(onDone, TIMING.curseFade);
    return () => window.clearTimeout(t);
  }, [step, shown, onTeleport, onDone]);

  /** Skip ahead: finish the words, or go to the flash once they're out. Nothing skips the flash itself. */
  const skip = () => {
    if (step === 'dark' || step === 'text') {
      setShown(TOTAL);
      setStep('hold');
    } else if (step === 'hold') setStep('flash');
  };
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    // Captured first, so the game's own keys (Space ends the turn…) don't fire underneath.
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.key === ' ' || e.key === 'Enter') skipRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // The words typed so far, line by line.
  let left = shown;
  const lines = CURSE_LINES.map((l) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length;
    return part;
  });
  const typing = step === 'text';

  return (
    <div className={`curse is-${step}`} onPointerDown={skip} role="dialog" aria-label="The curse">
      <div className="curse-veil" style={{ animationDuration: `${TIMING.curseDarken}ms` }} />
      <div className="curse-words" aria-live="polite">
        {lines.map((l, i) =>
          l ? (
            <div key={i} className={`curse-line curse-line-${i}`} data-text={l}>
              {l}
              {typing && l.length < CURSE_LINES[i].length && <span className="curse-caret">▌</span>}
            </div>
          ) : null,
        )}
      </div>
      {step === 'hold' && <div className="curse-skip">Space or click</div>}
      {(step === 'flash' || step === 'fade') && <div className="curse-flash" style={{ animationDuration: `${TIMING.curseFlash + TIMING.curseFade}ms` }} />}
    </div>
  );
}
