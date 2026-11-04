import { describe, expect, it } from 'vitest';
import { coordLabel } from './data';
import { board, cast, dummy, enemy, runEnemyTurn } from './testkit';
import type { Dir, FragmentKind } from './types';

/** Regression: a push stopped by the edge of the map always costs the pushed unit 1 HP, like a pillar does. */
describe('pushes into the map edge', () => {
  const cases: [string, string, string, FragmentKind[], Dir | null, string][] = [
    ['Beam right', 'e3', 'f3', ['wind', 'beam'], 'right', 'f3'],
    ['Beam up', 'c5', 'c6', ['wind', 'beam'], 'up', 'c6'],
    ['Cross (left arm)', 'b3', 'a3', ['wind', 'cross'], null, 'a3'],
    ['Wall left', 'b3', 'a4', ['wind', 'wall'], 'left', 'a4'],
    ['doubled Wind: one tile, then the edge', 'c4', 'c5', ['wind', 'wind', 'beam'], 'up', 'c6'],
  ];
  for (const [name, player, rat, kinds, dir, endsAt] of cases) {
    it(`${name}: 1 damage`, () => {
      const s = board({ player, enemies: [{ kind: 'rat', at: rat }, dummy('f1')] });
      const after = cast(s, kinds, dir);
      expect(enemy(after, '1a').hp).toBe(1);
      expect(coordLabel(enemy(after, '1a').pos)).toBe(endsAt);
    });
  }

  it('an Archer shot pushing you into the edge: 2 + 1 damage', () => {
    const after = runEnemyTurn(board({ player: 'a1', enemies: [{ kind: 'archer', at: 'a6' }] }));
    expect(after.player.hp).toBe(17);
    expect(coordLabel(after.player.pos)).toBe('a1');
  });
});
