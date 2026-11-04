import { GRIMOIRE_PAGES, RUN, type GameState } from '../engine';

/**
 * [UI-PLACEMENT] Top bar across the screen (LAYOUT.topBar), like Slay the Spire's:
 * left = HP and the Grimoire, centre = where you are in the run, right = turn, log and menu.
 */
export function TopBar({ state, onGrimoire, onToggleLog, onMenu }: {
  state: GameState;
  onGrimoire: () => void;
  onToggleLog: () => void;
  onMenu: () => void;
}) {
  const p = state.player;
  const pages = GRIMOIRE_PAGES.filter((g) => state.grimoire.includes(g.id)).length;
  const stage = RUN[state.stage];
  const where = stage?.kind === 'event' ? 'The Whispering Lectern' : stage?.kind === 'camp' ? 'Camp' : state.room.name;
  return (
    <div className="top-bar">
      <div className="top-left">
        <div className="top-name">The Wizard</div>
        <div className="top-hp" title="HP. Carries over between rooms. Heal at the camp.">
          <span className="heart">&hearts;</span>
          {p.hp}/{p.maxHp}
        </div>
        <button className="icon-button grimoire-button" onClick={onGrimoire} title="The Grimoire: every spell you've discovered">
          &#128214; {pages}/{GRIMOIRE_PAGES.length}
        </button>
      </div>

      <div className="top-center" title={stage?.kind === 'room' ? state.room.blurb : undefined}>
        <span className="room-index">
          Stop {state.stage + 1}/{RUN.length}
        </span>
        <span className="room-name">{where}</span>
      </div>

      <div className="top-right">
        {(state.phase === 'player' || state.phase === 'enemy') && <div className="turn-counter">Turn {state.turn}</div>}
        <button className="icon-button" onClick={onToggleLog} title="Combat log (L)">
          &#9776; Log
        </button>
        <button className="icon-button" onClick={onMenu} title="Menu (Esc)">
          &#9881;
        </button>
      </div>
    </div>
  );
}
