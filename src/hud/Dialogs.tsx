import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ENEMY_DEFS, ROOMS, RULES, cardsLabel, type GameState } from '../engine';
import { TIMING } from '../config/timing';

/** The bridge the Electron app exposes (electron/preload.cjs). Undefined when running in a browser. */
declare global {
  interface Window {
    grimoire?: { quit: () => void; toggleFullscreen: () => void; isDesktop: true };
  }
}

function Modal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal ${className}`}>{children}</div>
    </div>
  );
}

export function RoomExitDialog({ state, onContinue }: { state: GameState; onContinue: () => void }) {
  const next = ROOMS[state.roomIndex + 1];
  const leftBehind = state.enemies.filter((e) => ENEMY_DEFS[e.kind].drop);
  const carried = state.enemies.flatMap((e) => e.carried ?? []);
  return (
    <Modal>
      <h2>The way onward</h2>
      <p>You leave {state.room.name}.</p>
      {leftBehind.length > 0 && <p className="warn">Monsters left alive keep their fragments: {leftBehind.map((e) => ENEMY_DEFS[e.kind].name).join(', ')}.</p>}
      {carried.length > 0 && <p className="warn">Lost with the Page Scraps: {cardsLabel(carried)}.</p>}
      <p className="muted">HP and potion carry over. Mana resets to {RULES.roomStartMana}. Your deck is reshuffled.</p>
      <button className="hud-button primary" onClick={onContinue} autoFocus>
        {next ? `Enter ${next.name}` : 'Continue'}
      </button>
    </Modal>
  );
}

export function GameOverDialog({ state, onNewRun }: { state: GameState; onNewRun: () => void }) {
  const won = state.phase === 'won';
  return (
    <Modal className={won ? 'is-won' : 'is-lost'}>
      <h2>{won ? 'Victory' : 'Defeat'}</h2>
      <p>
        {won
          ? 'The Redactor is destroyed. The grimoire is yours.'
          : state.lostReason === 'grimoire'
            ? 'Your grimoire is broken: your cards can no longer make a spell.'
            : 'The wizard has fallen.'}
      </p>
      <button className="hud-button primary" onClick={onNewRun} autoFocus>
        New run
      </button>
    </Modal>
  );
}

export function MenuDialog({ onResume, onNewRun }: { onResume: () => void; onNewRun: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const desktop = window.grimoire?.isDesktop;
  const toggleFullscreen = () => {
    if (window.grimoire) window.grimoire.toggleFullscreen();
    else if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };
  return (
    <Modal className="menu-modal">
      <h2>Menu</h2>
      <button className="hud-button" onClick={onResume} autoFocus>
        Resume
      </button>
      <button className="hud-button" onClick={toggleFullscreen}>
        Toggle fullscreen (F11)
      </button>
      {confirm ? (
        <div className="confirm-row">
          <span>Abandon this run?</span>
          <button className="hud-button danger small" onClick={onNewRun}>
            Yes, new run
          </button>
          <button className="text-button" onClick={() => setConfirm(false)}>
            No
          </button>
        </div>
      ) : (
        <button className="hud-button" onClick={() => setConfirm(true)}>
          New run
        </button>
      )}
      {desktop && (
        <button className="hud-button" onClick={() => window.grimoire!.quit()}>
          Quit game
        </button>
      )}
      <p className="muted">Your run is saved automatically.</p>
    </Modal>
  );
}

const SEGMENTS = 8;

/** Unstable Fire's spin wheel: a quick spin that lands on 6 or 7 damage, then applies the blast. */
export function SpinWheel({ onDone }: { onDone: (damage: number) => void }) {
  const options = RULES.unstableDamageOptions;
  const [landing] = useState(() => Math.floor(Math.random() * SEGMENTS));
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const seg = 360 / SEGMENTS;
  const valueAt = (i: number) => options[i % options.length];

  useEffect(() => {
    // Rotate so the chosen segment's centre ends under the pointer at the top.
    const raf = requestAnimationFrame(() => setAngle(360 * 4 + (360 - (landing * seg + seg / 2))));
    const t1 = window.setTimeout(() => setResult(valueAt(landing)), TIMING.spinWheel);
    const t2 = window.setTimeout(() => done.current(valueAt(landing)), TIMING.spinWheel + 550);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const R = 110;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    return `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
  };
  const mid = (i: number) => (((i + 0.5) * seg - 90) * Math.PI) / 180;

  return (
    <div className="modal-backdrop light" role="dialog" aria-modal="true">
      <div className="wheel-wrap">
        <div className="wheel-title">Unstable Fire</div>
        <svg viewBox="-120 -132 240 252" className="wheel" aria-hidden>
          <g style={{ transform: `rotate(${angle}deg)`, transition: `transform ${TIMING.spinWheel}ms cubic-bezier(0.15, 0.75, 0.2, 1)` }}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <g key={i}>
                <path d={arc(i)} className={valueAt(i) === options[0] ? 'wheel-seg a' : 'wheel-seg b'} />
                <text x={R * 0.66 * Math.cos(mid(i))} y={R * 0.66 * Math.sin(mid(i)) + 8} className="wheel-num">
                  {valueAt(i)}
                </text>
              </g>
            ))}
          </g>
          <path d="M0 -112 L-10 -130 L10 -130 Z" className="wheel-pointer" />
        </svg>
        <div className={`wheel-result ${result !== null ? 'show' : ''}`}>{result !== null ? `${result} damage!` : ' '}</div>
      </div>
    </div>
  );
}
