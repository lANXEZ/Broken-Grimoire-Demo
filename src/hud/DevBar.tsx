import { ROOMS, devEdit, devRemoveEnemy, enemyAt, loadRoom, type GameState, type Pos } from '../engine';
import type { GameApi } from '../game/useGame';

/**
 * Dev toolbar: only rendered in dev mode (config/dev.ts), never in the built game or the .exe.
 * Undo/redo (also Ctrl+Z / Ctrl+Y) plus a few cheats to reach later rooms quickly.
 */
export function DevBar({ game, hover }: { game: GameApi; hover: Pos | null }) {
  const s = game.state;
  const hovered = hover ? enemyAt(s, hover) : undefined;
  const cheat = (note: string, edit: (d: GameState) => void) => game.run((st) => devEdit(st, note, edit));
  return (
    <div className="dev-bar">
      <span className="dev-tag">DEV</span>
      <button onClick={game.undo} disabled={!game.canUndo} title="Ctrl+Z">
        Undo
      </button>
      <button onClick={game.redo} disabled={!game.canRedo} title="Ctrl+Y">
        Redo
      </button>
      <button onClick={() => cheat('full mana', (d) => (d.player.mana = d.player.maxMana))}>Mana</button>
      <button onClick={() => cheat('full HP', (d) => (d.player.hp = d.player.maxHp))}>Heal</button>
      <button onClick={() => cheat('+3 actions', (d) => (d.actionsLeft += 3))}>+Actions</button>
      <button
        disabled={!hovered}
        title="Kill the enemy under the pointer (K)"
        onClick={() => hovered && game.run((st) => devRemoveEnemy(st, hovered.id, true))}
      >
        Kill {hovered ? hovered.id : 'hovered'}
      </button>
      <button
        disabled={s.roomIndex + 1 >= ROOMS.length || s.phase !== 'player'}
        onClick={() => cheat(`skip to room ${s.roomIndex + 2}`, (d) => loadRoom(d, d.roomIndex + 1))}
      >
        Next room
      </button>
    </div>
  );
}
