import { useState } from 'react';
import { RULES, fragmentName, type Card, type FragmentKind } from '../engine';
import { CARD_BACK_ART, FRAGMENT_COLOR, iconArt } from '../config/art';

const KIND_ORDER: FragmentKind[] = ['fire', 'water', 'earth', 'wind', 'beam', 'cross', 'wall', 'rune'];

/** A fragment's small icon, or a coloured dot until it has art. */
function KindIcon({ kind }: { kind: FragmentKind }) {
  const src = iconArt(kind);
  return src ? <img src={src} alt="" /> : <span className="kind-dot" style={{ background: FRAGMENT_COLOR[kind] }} />;
}

/** "Fire ×2, Beam ×1" counts for the pile hover cards. */
function countKinds(cards: Card[]) {
  return KIND_ORDER.map((kind) => ({ kind, n: cards.filter((c) => c.kind === kind).length })).filter((k) => k.n > 0);
}

/** [UI-PLACEMENT] Mana orb, bottom left (LAYOUT.manaOrb). Slay the Spire's energy orb, but for mana. */
export function ManaOrb({ mana, maxMana, cost, runeGlow = false }: { mana: number; maxMana: number; cost?: number; runeGlow?: boolean }) {
  const short = cost !== undefined && cost > mana;
  return (
    <div className={`mana-orb ${short ? 'is-short' : ''} ${runeGlow ? 'is-rune' : ''}`} title={`Mana ${mana}/${maxMana}`}>
      <div className="mana-orb-glow" />
      <div className="mana-value">
        {mana}
        <span className="mana-max">/{maxMana}</span>
      </div>
      <div className="mana-label">Mana</div>
    </div>
  );
}

/**
 * [UI-PLACEMENT] Climb out of quicksand. While you're stuck you can't cast, so this big button takes the crafting
 * table's place (same spot and size: LAYOUT.craftingTable). Meditate and Reroll still work.
 */
export function EscapeButton({ stuck, disabled, onClick }: { stuck: number; disabled: boolean; onClick: () => void }) {
  return (
    <div className="escape-panel">
      <button className="escape-button" disabled={disabled} onClick={onClick} title="1 action. Progress carries over to your next turn.">
        <span className="escape-title">Climb out</span>
        <span className="escape-sub">
          You&apos;re stuck in the quicksand: {stuck} more action{stuck === 1 ? '' : 's'} to climb out (1 action per click).
        </span>
        <span className="escape-steps">
          {Array.from({ length: RULES.quicksandEscape }, (_, i) => (
            <span key={i} className={i < RULES.quicksandEscape - stuck ? 'step done' : 'step'} />
          ))}
        </span>
      </button>
      <div className="escape-note">No casting until you&apos;re out. You can still Meditate and Reroll.</div>
    </div>
  );
}

/** [UI-PLACEMENT] Meditate button, under the mana orb (LAYOUT.meditate). */
export function MeditateButton({ disabled, full, onClick }: { disabled: boolean; full: boolean; onClick: () => void }) {
  return (
    <button className="hud-button meditate-button" disabled={disabled} onClick={onClick} title={full ? 'Your mana is already full' : `+${RULES.meditateMana} mana (1 action)`}>
      <span className="button-main">Meditate</span>
      <span className="button-sub">+{RULES.meditateMana} mana</span>
    </button>
  );
}

/**
 * [UI-PLACEMENT] Draw pile (bottom-left, LAYOUT.drawPile) and discard pile (bottom-right, LAYOUT.discardPile).
 * Hover shows what's in the pile. The draw pile's order stays hidden, only its contents are listed.
 */
export function Pile({ which, cards, erased, flash = 0 }: { which: 'draw' | 'discard'; cards: Card[]; erased?: Card[]; flash?: number }) {
  const [open, setOpen] = useState(false);
  const counts = countKinds(cards);
  return (
    <div className={`pile pile-${which}`} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
      {/* `flash` changes when a picked-up card lands here: the key restarts the glow animation. */}
      {flash > 0 && <div key={flash} className="pile-flash" />}
      <div className="pile-stack">
        <img src={CARD_BACK_ART} alt="" draggable={false} />
        {cards.length > 1 && <img src={CARD_BACK_ART} alt="" draggable={false} className="pile-under" />}
      </div>
      <div className="pile-count">{cards.length}</div>
      <div className="pile-name">{which === 'draw' ? 'Draw' : 'Discard'}</div>
      {open && (
        <div className="pile-popup">
          <div className="pile-popup-title">
            {which === 'draw' ? 'Draw pile' : 'Discard pile'} · {cards.length} card{cards.length === 1 ? '' : 's'}
          </div>
          {counts.length === 0 && <div className="pile-empty">Empty</div>}
          {counts.map(({ kind, n }) => (
            <div key={kind} className="pile-row">
              <KindIcon kind={kind} />
              {kind === 'rune' ? 'Runes' : fragmentName(kind)} <b>×{n}</b>
            </div>
          ))}
          {which === 'draw' && <div className="pile-note">When it runs out, the discard pile is shuffled back in.</div>}
          {erased && erased.length > 0 && (
            <div className="pile-note">
              Erased for good: {countKinds(erased).map(({ kind, n }) => `${fragmentName(kind)} ×${n}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** [UI-PLACEMENT] End turn button with the action pips, above the discard pile (LAYOUT.endTurn). */
export function EndTurnButton({ actionsLeft, disabled, onClick }: { actionsLeft: number; disabled: boolean; onClick: () => void }) {
  return (
    <button className="hud-button end-turn-button" disabled={disabled} onClick={onClick}>
      <span className="button-main">End Turn</span>
      <span className="action-pips" title={`${actionsLeft} of ${RULES.actionsPerTurn} actions left`}>
        {Array.from({ length: RULES.actionsPerTurn }, (_, i) => (
          <span key={i} className={i < actionsLeft ? 'pip on' : 'pip'} />
        ))}
        <span className="pips-label">actions</span>
      </span>
    </button>
  );
}

/**
 * [UI-PLACEMENT] Reroll button, above End turn (LAYOUT.reroll). First click enters reroll mode (pick cards in
 * the hand); then it confirms the swap. The small Cancel button leaves reroll mode.
 */
export function RerollButton({ mode, marked, disabled, onStart, onConfirm, onCancel }: {
  mode: boolean;
  marked: number;
  disabled: boolean;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!mode) {
    return (
      <button className="hud-button reroll-button" disabled={disabled} onClick={onStart} title="Swap any cards in your hand for new ones (1 action)">
        <span className="button-main">Reroll</span>
        <span className="button-sub">swap cards</span>
      </button>
    );
  }
  return (
    <div className="reroll-group">
      <button className="hud-button reroll-button is-active" disabled={marked === 0} onClick={onConfirm}>
        <span className="button-main">Confirm ({marked})</span>
        <span className="button-sub">{marked === 0 ? 'pick cards in your hand' : '1 action'}</span>
      </button>
      <button className="reroll-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
