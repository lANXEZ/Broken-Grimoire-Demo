import type { Intent, IntentKind } from '../engine';

/**
 * Slay the Spire–style intents: small chips above each enemy showing what it will do on its next turn.
 * The engine works the plan out (`previewIntents`); this file turns it into chips and sentences.
 */

interface IntentInfo {
  color: string;
  /** Plain-language phrase for the hover card. `n` = how many times in a row, `v` = value. */
  describe: (n: number, v?: number) => string;
  /** Kinds that deal damage show their value on the chip. */
  showsValue?: boolean;
}

const times = (n: number) => (n === 1 ? '' : ` ×${n}`);

export const INTENT_INFO: Record<IntentKind, IntentInfo> = {
  move: { color: '#7cc0f0', describe: (n) => `Moves ${n} tile${n === 1 ? '' : 's'}` },
  retreat: { color: '#a9bccd', describe: (n) => `Backs away ${n} tile${n === 1 ? '' : 's'}` },
  attack: { color: '#ff6b60', showsValue: true, describe: (n, v) => `Attacks for ${v}${times(n)}` },
  shoot: { color: '#ff6b60', showsValue: true, describe: (n, v) => `Shoots you for ${v}${times(n)}` },
  drain: { color: '#62b6f2', showsValue: true, describe: (_n, v) => `Drains ${v} mana` },
  mark: { color: '#f4b04a', describe: (_n, v) => `Marks a line at you (fires ${v} dmg next turn) and ends its turn` },
  fire: { color: '#ff8a55', showsValue: true, describe: (_n, v) => `Fires the marked line for ${v}` },
  watch: { color: '#e0c06a', describe: () => 'Holds still with a clear line to you' },
  steal: { color: '#c9a2f0', describe: () => 'Steals a fragment from your hand' },
  deliver: { color: '#c9a2f0', describe: () => 'Brings the fragment to the Redactor: +1 mark' },
  block: { color: '#c7ae86', describe: () => 'Blocks your path' },
  explode: { color: '#ff7a4d', showsValue: true, describe: (n, v) => `Explodes for ${v}${times(n)}` },
  cooldown: { color: '#b3b9c6', describe: (n) => `Cools down${times(n)}` },
  spawn: { color: '#c9a2f0', describe: () => 'Summons a Page Scrap next to it' },
  wait: { color: '#b3b9c6', describe: () => 'Does nothing' },
};

/** A shot that will hit another monster in the way (friendly fire) instead of you. */
const FRIENDLY_FIRE_COLOR = '#f0b54a';
const isFriendlyFire = (g: { kind: IntentKind; note?: string }) => g.kind === 'shoot' && !!g.note;
const intentColor = (g: { kind: IntentKind; note?: string }) => (isFriendlyFire(g) ? FRIENDLY_FIRE_COLOR : INTENT_INFO[g.kind].color);

export interface IntentGroup {
  kind: IntentKind;
  value?: number;
  count: number;
  note?: string;
}

/** Collapse runs of the same intent (e.g. three moves) into one chip with a count. */
export function groupIntents(intents: Intent[] = []): IntentGroup[] {
  const out: IntentGroup[] = [];
  for (const i of intents) {
    const last = out[out.length - 1];
    if (last && last.kind === i.kind && last.value === i.value && last.note === i.note) last.count++;
    else out.push({ kind: i.kind, value: i.value, count: 1, note: i.note });
  }
  return out;
}

/** Sentence for the hover card: "Moves 2 tiles, then attacks for 3." */
export function describeIntents(intents: Intent[] = []): string {
  const groups = groupIntents(intents);
  if (groups.length === 0) return 'Nothing this turn.';
  const parts = groups.map((g) => {
    if (isFriendlyFire(g)) return `Shoots at you, but ${g.note}: it takes the ${g.value} dmg arrow instead`;
    const text = INTENT_INFO[g.kind].describe(g.count, g.value);
    return g.kind === 'wait' && g.note ? `Waits (it ${g.note.replace(/[.,].*$/, '')})` : text;
  });
  const sentence = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join(', then ');
  return `${sentence}.`;
}

function chipLabel(g: IntentGroup): string {
  const info = INTENT_INFO[g.kind];
  if (g.kind === 'deliver') return '+1';
  if (info.showsValue && g.value !== undefined) return g.count > 1 ? `${g.value}×${g.count}` : String(g.value);
  return g.count > 1 ? `×${g.count}` : '';
}

/** Icon glyphs drawn in a 14×14 box centred on 0,0 (ported from the low-fi board). */
export function IntentGlyph({ kind, color }: { kind: IntentKind; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'move':
      return <path d="M-5 -4 L-1 0 L-5 4 M0 -4 L4 0 L0 4" {...stroke} />;
    case 'retreat':
      return <path d="M5 -4 L1 0 L5 4 M0 -4 L-4 0 L0 4" {...stroke} />;
    case 'attack':
      return (
        <g {...stroke}>
          <path d="M-4 4 L5 -5" strokeWidth={2.2} />
          <path d="M-5.5 1 L-1 5.5" />
        </g>
      );
    case 'shoot':
      return (
        <g {...stroke}>
          <path d="M-5 5 L4.5 -4.5" />
          <path d="M0.5 -5 L5 -5 L5 -0.5" />
          <path d="M-5 2 L-3 2 L-3 4 M-2.5 4.5 L-2.5 2.5" strokeWidth={1.3} />
        </g>
      );
    case 'drain':
      return <path d="M0 -6 C2.5 -2.5 4.5 0 4.5 2.2 A4.5 4.5 0 0 1 -4.5 2.2 C-4.5 0 -2.5 -2.5 0 -6 Z" fill={color} />;
    case 'mark':
      return (
        <g {...stroke}>
          <circle r={4} />
          <path d="M0 -6.5 V-2.5 M0 2.5 V6.5 M-6.5 0 H-2.5 M2.5 0 H6.5" strokeWidth={1.4} />
        </g>
      );
    case 'fire':
      return <path d="M1.5 -6 L-4 1 L-0.5 1 L-1.5 6 L4 -1 L0.5 -1 Z" fill={color} />;
    case 'watch':
      return (
        <g>
          <path d="M-6 0 Q0 -5.5 6 0 Q0 5.5 -6 0 Z" fill="none" stroke={color} strokeWidth={1.5} />
          <circle r={1.9} fill={color} />
        </g>
      );
    case 'steal':
      return (
        <g {...stroke}>
          <rect x={-4.5} y={-5} width={6.5} height={9} rx={1} />
          <path d="M3 1 L6 1 M4.5 -0.8 L6 1 L4.5 2.8" strokeWidth={1.4} />
        </g>
      );
    case 'deliver':
      return (
        <g>
          <circle r={4.6} fill={color} />
          <path d="M0 -2.4 V2.4 M-2.4 0 H2.4" stroke="#2b2230" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case 'block':
      return <path d="M0 -6 L5 -4 V0 C5 3 3 5 0 6 C-3 5 -5 3 -5 0 V-4 Z" fill={color} />;
    case 'explode':
      return (
        <path
          d="M0 -6.5 L1.6 -2.2 L5.8 -3.6 L3 0 L5.8 3.6 L1.6 2.2 L0 6.5 L-1.6 2.2 L-5.8 3.6 L-3 0 L-5.8 -3.6 L-1.6 -2.2 Z"
          fill={color}
        />
      );
    case 'cooldown':
      return <path d="M-4 -5.5 H4 L0 0 L4 5.5 H-4 L0 0 Z" {...stroke} strokeWidth={1.5} />;
    case 'spawn':
      return (
        <g {...stroke}>
          <circle r={5} strokeWidth={1.5} />
          <path d="M0 -2.6 V2.6 M-2.6 0 H2.6" />
        </g>
      );
    case 'wait':
      return (
        <g fill={color}>
          <rect x={-3.6} y={-4.5} width={2.6} height={9} rx={0.8} />
          <rect x={1} y={-4.5} width={2.6} height={9} rx={0.8} />
        </g>
      );
  }
}

/** The row of chips that floats above an enemy. */
export function IntentChips({ intents }: { intents?: Intent[] }) {
  const groups = groupIntents(intents);
  if (groups.length === 0) return null;
  return (
    <div className="intent-row">
      {groups.map((g, i) => {
        const label = chipLabel(g);
        const color = intentColor(g);
        return (
          <span key={i} className="intent-chip" style={{ borderColor: color }}>
            <svg viewBox="-7 -7 14 14" className="intent-glyph" aria-hidden>
              <IntentGlyph kind={g.kind} color={color} />
            </svg>
            {label && <span className="intent-value">{label}</span>}
          </span>
        );
      })}
    </div>
  );
}
