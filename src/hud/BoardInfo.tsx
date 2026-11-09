import { HAZARD_INFO, RULES, type Hazard, type HazardKind } from '../engine';
import type { UnitView } from '../scene/Unit';
import { describeIntents } from './intents';

/**
 * [UI-PLACEMENT] What's under the pointer on the board, in the top-right spot where a hovered fragment's info card
 * shows (LAYOUT.cardPreview), so nothing covers the board: the unit standing there (the mage or a monster: name, HP,
 * statuses, what it does, its plan for next turn) and the hazard on that tile (what it does, when it fades). A unit
 * standing in a hazard shows both, the unit first.
 */
export function BoardInfo({ unit, hazard, turn }: { unit: UnitView | null; hazard: Hazard | null; turn: number }) {
  if (!unit && !hazard) return null;
  return (
    <div className="board-info" key={`${unit?.key ?? ''}|${hazard ? `${hazard.pos.x},${hazard.pos.y}` : ''}`}>
      {unit && <UnitCard unit={unit} />}
      {hazard && <HazardCard hazard={hazard} turn={turn} />}
    </div>
  );
}

/** A unit: name, HP, what it does, and its plan for next turn in words. */
function UnitCard({ unit }: { unit: UnitView }) {
  const s = unit.status;
  const statuses = [s.burn > 0 && `Burn ${s.burn}`, s.root > 0 && 'Rooted', s.stun > 0 && 'Stunned', s.stuck > 0 && `Stuck (${s.stuck})`].filter(Boolean).join(' · ');
  return (
    <div className="unit-card">
      <div className="unit-card-title">
        {unit.name}
        {unit.tag && <span className="unit-tag">{unit.tag}</span>}
      </div>
      <div className="unit-card-stats">
        HP {unit.hp}/{unit.maxHp}
        {unit.isPlayer && unit.mana !== undefined && ` · Mana ${unit.mana}/${unit.maxMana}`}
        {statuses && ` · ${statuses}`}
      </div>
      {unit.behavior && <p className="unit-card-text">{unit.behavior}</p>}
      {!unit.isPlayer && (
        <p className="unit-card-plan">
          <b>Next turn:</b> {describeIntents(unit.intents)}
        </p>
      )}
    </div>
  );
}

/** [TEXT] What each hazard does, on its card. */
const HAZARD_HOVER_TEXT: Record<HazardKind, string> = {
  fog: 'Blocks sight: Archers and the Warden can’t see or shoot through it. A monster inside wanders at random and doesn’t attack. Doesn’t affect you. Wind blows it away.',
  magma: `A unit that steps onto it catches Burn (1 damage at the start of each of its next ${RULES.burnTicks} turns). Monsters avoid it. Water turns it back to floor.`,
  quicksand: `A unit in it can’t move, attack or cast until it spends ${RULES.quicksandEscape} actions to climb out, which clears it. Monsters avoid stepping in.`,
};

function fadesText(hazard: Hazard, turn: number): string {
  const left = hazard.until - turn;
  if (left <= 0) return 'Fades at the end of this turn.';
  if (left === 1) return 'Fades at the end of your next turn.';
  return `Fades at the end of your turn ${hazard.until}.`;
}

/** A hazard, edged in its colour. */
function HazardCard({ hazard, turn }: { hazard: Hazard; turn: number }) {
  return (
    <div className={`unit-card hazard-card is-${hazard.kind}`}>
      <div className="unit-card-title">{HAZARD_INFO[hazard.kind].name}</div>
      <p className="unit-card-text">{HAZARD_HOVER_TEXT[hazard.kind]}</p>
      <p className="hazard-card-fades">{fadesText(hazard, turn)}</p>
    </div>
  );
}
