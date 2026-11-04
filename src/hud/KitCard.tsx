import type { CSSProperties, ReactNode } from 'react';
import { ENEMY_DEFS, RULES, STARTING_DECK, type Card, type FragmentKind } from '../engine';

/**
 * PLACEHOLDER card faces for the fragments the paper kit never printed (Wind, Wall), drawn in code to match the
 * kit cards in public/art/cards/: a torn dark frame, a category label, a brushstroke banner with the name, a
 * picture, the rules text, the doubled rule, and a footer chip (deck count, or the loot source with a wax seal).
 * When the artist delivers real art for a kind, add it to `CARD_IMAGE` in config/art.ts and this stops being used.
 *
 * All sizes are in container units (cqw/cqh), so the card scales with whatever box it sits in, like the images do.
 */
interface KitText {
  label: 'Element' | 'Appearance';
  /** Banner colour (light) and ink colour for the picture and highlights (dark). */
  banner: string;
  ink: string;
  body: ReactNode;
  doubled: ReactNode;
  picture: ReactNode;
}

const KIT_CARDS: Partial<Record<FragmentKind, KitText>> = {
  wind: {
    label: 'Element',
    banner: '#bfe3d6',
    ink: '#2f7563',
    body: (
      <>
        <b>0 DMG.</b> Push: the target slides {RULES.windPush} tiles away from you.
      </>
    ),
    doubled: <>Doubled: pushes until it hits something (1 dmg). Wind can&rsquo;t be merged.</>,
    picture: <WindPicture />,
  },
  wall: {
    label: 'Appearance',
    banner: '#d6c8ec',
    ink: '#5a3f8c',
    body: (
      <>
        <b>Shape:</b> a row of {RULES.wallWidth} tiles in front of you, across your aim.
      </>
    ),
    doubled: <>Doubled: adds a second row behind it ({RULES.wallWidth}&times;2).</>,
    picture: <WallPicture />,
  },
};

/** True if this kind has a drawn kit-style face. */
export const hasKitCard = (kind: FragmentKind) => kind in KIT_CARDS;

export function KitCard({ card, className = '', style }: { card: Card; className?: string; style?: CSSProperties }) {
  const k = KIT_CARDS[card.kind];
  if (!k) return null;
  const name = card.kind.toUpperCase();
  const inDeck = STARTING_DECK.filter((x) => x === card.kind).length;
  const vars = { ...style, ['--kit-banner' as string]: k.banner, ['--kit-ink' as string]: k.ink };
  return (
    <div className={`fragment-card kit-card ${card.loot ? 'is-loot' : ''} ${className}`} style={vars} title={name}>
      <div className="kit-paper" style={{ clipPath: TORN_EDGE }}>
        <div className="kit-label">{k.label}</div>
        <div className="kit-banner">
          <span>{name}</span>
        </div>
        <div className="kit-picture">{k.picture}</div>
        <div className="kit-body">{k.body}</div>
        <div className="kit-doubled">{k.doubled}</div>
        <div className="kit-chip">
          {card.loot ? `Loot · ${ENEMY_DEFS[card.loot].name} drop` : <>&times;{inDeck} in deck</>}
        </div>
      </div>
      <div className="kit-holes" />
      {card.loot && <div className="kit-seal" />}
    </div>
  );
}

/** A rough, torn paper outline (fixed, so every card tears the same way, like a printed kit). */
const TORN_EDGE = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const pts: string[] = [];
  const inset = 4;
  const steps = 22;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t + (x0 === x1 ? rnd() * 0.9 : 0);
      const y = y0 + (y1 - y0) * t + (y0 === y1 ? rnd() * 0.7 : 0);
      pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
  };
  edge(inset, inset * 0.72, 100 - inset, inset * 0.72);
  edge(100 - inset, inset * 0.72, 100 - inset, 100 - inset * 0.72);
  edge(100 - inset, 100 - inset * 0.72, inset, 100 - inset * 0.72);
  edge(inset, 100 - inset * 0.72, inset, inset * 0.72);
  return `polygon(${pts.join(', ')})`;
})();

/** Gusts of wind curling into spirals, with two leaves caught in them. */
function WindPicture() {
  const gusts = [
    'M8 20 H52 a9 9 0 1 0 -9 -9',
    'M2 34 H70 a11 11 0 1 1 -11 11',
    'M14 50 H40 a6.5 6.5 0 1 0 -6.5 -6.5',
  ];
  return (
    <svg viewBox="0 0 90 64" aria-hidden>
      {gusts.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--kit-banner)" strokeWidth={7} strokeLinecap="round" />
      ))}
      {gusts.map((d) => (
        <path key={`i${d}`} d={d} fill="none" stroke="var(--kit-ink)" strokeWidth={3.2} strokeLinecap="round" />
      ))}
      <path d="M76 14 q6 -6 10 0 q-4 6 -10 0 Z" fill="var(--kit-ink)" opacity={0.85} />
      <path d="M62 56 q5 -7 10 -2 q-5 6 -10 2 Z" fill="var(--kit-ink)" opacity={0.7} />
    </svg>
  );
}

/** A brick emblem in a ring, and the area diagram (you, the row in front, the doubled row dashed behind it). */
function WallPicture() {
  const T = 10;
  const tile = (x: number, y: number, kind: 'hit' | 'double' | 'you') => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width={T}
      height={T}
      rx={0.6}
      fill={kind === 'hit' ? 'var(--kit-ink)' : kind === 'double' ? 'var(--kit-banner)' : 'none'}
      stroke="var(--kit-ink)"
      strokeWidth={0.8}
      strokeDasharray={kind === 'double' ? '1.6 1.2' : undefined}
    />
  );
  const gx = 58;
  const bricks: ReactNode[] = [];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? -5 : 0;
    for (let i = 0; i < 4; i++) {
      bricks.push(<rect key={`${row}-${i}`} x={8 + off + i * 10} y={18 + row * 7} width={9} height={6} rx={0.8} />);
    }
  }
  return (
    <svg viewBox="0 0 100 64" aria-hidden>
      <defs>
        <clipPath id="kit-wall-ring">
          <circle cx={23} cy={32} r={17} />
        </clipPath>
      </defs>
      <circle cx={23} cy={32} r={21} fill="none" stroke="var(--kit-ink)" strokeWidth={0.7} opacity={0.6} />
      <circle cx={23} cy={32} r={17.5} fill="var(--kit-banner)" />
      <g clipPath="url(#kit-wall-ring)" fill="var(--kit-ink)">
        {bricks}
      </g>
      {[0, 1, 2].map((i) => tile(gx + i * (T + 1), 8, 'double'))}
      {[0, 1, 2].map((i) => tile(gx + i * (T + 1), 8 + T + 1, 'hit'))}
      {tile(gx + T + 1, 8 + 2 * (T + 1) + 4, 'you')}
      <circle cx={gx + T + 1 + T / 2} cy={8 + 2 * (T + 1) + 4 + T / 2} r={2} fill="#b8862e" />
    </svg>
  );
}
