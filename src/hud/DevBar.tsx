import { useEffect, useState } from 'react';
import { ROOMS, devEdit, devRemoveEnemy, enemyAt, killEnemy, loadRoom, type GameState, type Pos } from '../engine';
import type { GameApi } from '../game/useGame';
import { newAccount } from '../game/account';

/**
 * Dev toolbar: only rendered in dev mode (config/dev.ts), never in the built game or the .exe.
 * Undo/redo (also Ctrl+Z / Ctrl+Y) plus a few cheats to reach later rooms quickly, "Forget everything" to wipe
 * the Grimoire and the "Hmmm..." note, and "New account" to play as a brand-new player (game/account.ts). The last two
 * ask once more first: click again within a few seconds.
 */
export function DevBar({ game, hover }: { game: GameApi; hover: Pos | null }) {
  const s = game.state;
  const hovered = hover ? enemyAt(s, hover) : undefined;
  const cheat = (note: string, edit: (d: GameState) => void) => game.run((st) => devEdit(st, note, edit));
  const [confirmForget, setConfirmForget] = useState(false);
  useEffect(() => {
    if (!confirmForget) return;
    const t = window.setTimeout(() => setConfirmForget(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmForget]);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    if (!confirmNew) return;
    const t = window.setTimeout(() => setConfirmNew(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmNew]);
  const known = s.grimoire.length + s.combos.length;
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
        disabled={s.phase !== 'player' || s.enemies.length === 0}
        title="Kill every enemy (their drops land on the floor)"
        onClick={() => cheat('killed every enemy', (d) => [...d.enemies].forEach((e) => killEnemy(d, e)))}
      >
        Clear room
      </button>
      <button
        disabled={s.roomIndex + 1 >= ROOMS.length || s.phase !== 'player'}
        onClick={() => cheat(`skip to room ${s.roomIndex + 2}`, (d) => loadRoom(d, d.roomIndex + 1))}
      >
        Next room
      </button>
      <button
        className={confirmForget ? 'is-danger' : ''}
        disabled={known === 0}
        title="Wipe every Grimoire page and every Hmmm... line, on this computer too (rune notes stay)"
        onClick={() => {
          if (!confirmForget) return setConfirmForget(true);
          setConfirmForget(false);
          game.forgetKnowledge();
        }}
      >
        {confirmForget ? 'Really forget?' : 'Forget everything'}
      </button>
      <button
        className={confirmNew ? 'is-danger' : ''}
        title="Play as a brand-new player: wipe everything saved on this computer (run, Grimoire, Hmmm..., rune notes, rune meanings, the cutscene) and go back to the title. Dev mode stays on."
        onClick={() => (confirmNew ? newAccount() : setConfirmNew(true))}
      >
        {confirmNew ? 'Really start over?' : 'New account'}
      </button>
    </div>
  );
}
