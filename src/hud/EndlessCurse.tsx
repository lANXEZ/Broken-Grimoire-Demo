import { useEffect, useRef, useState } from 'react';
import { TIMING } from '../config/timing';

type Step = 'dim' | 'notice' | 'flash' | 'fade';

/**
 * After the Redactor (Victory's Continue, or the dev Endless button): a small, deadpan notice that the demo is out of
 * content, like a system message, while the mage starts glowing purple (scene/CurseGlow.tsx). OK (or Space / Enter)
 * sets off a purple flash: at its brightest `onTeleport` starts endless mode underneath, and the flash fades on the
 * first endless room.
 */
export function EndlessCurse({ onTeleport, onDone }: { onTeleport: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('dim');
  const teleported = useRef(false);

  useEffect(() => {
    if (step === 'dim') {
      const t = window.setTimeout(() => setStep('notice'), TIMING.curseDim);
      return () => window.clearTimeout(t);
    }
    if (step === 'notice') return; // waits for OK
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
  }, [step, onTeleport, onDone]);

  const ok = () => setStep((s) => (s === 'notice' ? 'flash' : s));
  useEffect(() => {
    // Captured first, so the game's own keys (Space ends the turn…) don't fire underneath.
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.key === ' ' || e.key === 'Enter') ok();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className={`curse is-${step}`} role="dialog" aria-label="Notice">
      <div className="curse-veil" style={{ animationDuration: `${TIMING.curseDim}ms` }} />
      {(step === 'notice' || step === 'flash') && (
        <div className="curse-notice">
          <div className="curse-notice-head">Notice</div>
          <p>There is no more content in this demo.</p>
          <p>NOW GO SUFFER THE DEMO’S ENDLESS CURSE.</p>
          <p className="curse-notice-aside">(PCG applied)</p>
          <button className="hud-button primary small" onClick={ok} disabled={step !== 'notice'} autoFocus>
            OK
          </button>
        </div>
      )}
      {(step === 'flash' || step === 'fade') && <div className="curse-flash" style={{ animationDuration: `${TIMING.curseFlash + TIMING.curseFade}ms` }} />}
    </div>
  );
}
