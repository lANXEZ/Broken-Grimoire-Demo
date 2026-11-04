import { GRIMOIRE_PAGES, RUN, ownedCards, type GameState } from '../engine';
import { CARD_BACK_ART } from '../config/art';

/**
 * [UI-PLACEMENT] Top bar across the screen (LAYOUT.topBar), like Slay the Spire's:
 * left = HP, the Grimoire and the Deck, centre = where you are in the run, right = turn, log and menu.
 */
export function TopBar({ state, onGrimoire, onDeck, onToggleLog, onMenu }: {
  state: GameState;
  onGrimoire: () => void;
  onDeck: () => void;
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
        <button className="icon-button deck-button" onClick={onDeck} title="Your deck: every card you own (D)">
          <img src={CARD_BACK_ART} alt="" />
          Deck {ownedCards(state.cards).length}
        </button>
      </div>

      <div className="top-center" title={stage?.kind === 'room' ? state.room.blurb : undefined}>
        <span className="room-index">{state.stage < 0 ? 'Room 0' : `Stop ${state.stage + 1}/${RUN.length}`}</span>
        <span className="room-name">{where}</span>
      </div>

      <div className="top-right">
        {(state.phase === 'player' || state.phase === 'enemy') && state.stage >= 0 && <div className="turn-counter">Turn {state.turn}</div>}
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
