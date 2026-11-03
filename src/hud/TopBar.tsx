import { useState } from 'react';
import { ROOMS, type GameState } from '../engine';
import { iconArt } from '../config/art';

/**
 * [UI-PLACEMENT] Top bar across the screen (LAYOUT.topBar), like Slay the Spire's:
 * left = HP and potion, centre = room, right = turn, log and menu.
 */
export function TopBar({ state, canDrink, onDrink, onToggleLog, onMenu }: {
  state: GameState;
  canDrink: boolean;
  onDrink: () => void;
  onToggleLog: () => void;
  onMenu: () => void;
}) {
  const [potionOpen, setPotionOpen] = useState(false);
  const p = state.player;
  return (
    <div className="top-bar">
      <div className="top-left">
        <div className="top-name">The Wizard</div>
        <div className="top-hp" title="HP. Carries over between rooms.">
          <span className="heart">♥</span>
          {p.hp}/{p.maxHp}
        </div>
        <div className="potion-slot">
          <button
            className={`potion-button ${p.potions > 0 ? 'has-potion' : ''}`}
            disabled={p.potions === 0}
            onClick={() => setPotionOpen((o) => !o)}
            title={p.potions > 0 ? 'Max Potion: restores full HP (1 action)' : 'Potion slot (the Warden drops a Max Potion)'}
          >
            {p.potions > 0 ? <img src={iconArt('potion')} alt="Max Potion" /> : <span className="potion-empty" />}
            {p.potions > 1 && <span className="potion-count">{p.potions}</span>}
          </button>
          {potionOpen && p.potions > 0 && (
            <div className="potion-menu">
              <div className="potion-menu-title">Max Potion</div>
              <div className="potion-menu-text">Restore full HP. Costs 1 action.</div>
              <button
                className="hud-button small"
                disabled={!canDrink}
                onClick={() => {
                  setPotionOpen(false);
                  onDrink();
                }}
              >
                Drink
              </button>
              <button className="text-button" onClick={() => setPotionOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="top-center" title={state.room.blurb}>
        <span className="room-index">
          Room {state.roomIndex + 1}/{ROOMS.length}
        </span>
        <span className="room-name">{state.room.name}</span>
      </div>

      <div className="top-right">
        <div className="turn-counter">Turn {state.turn}</div>
        <button className="icon-button" onClick={onToggleLog} title="Combat log (L)">
          ☰ Log
        </button>
        <button className="icon-button" onClick={onMenu} title="Menu (Esc)">
          ⚙
        </button>
      </div>
    </div>
  );
}
