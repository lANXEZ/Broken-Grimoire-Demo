import { describe, expect, it } from 'vitest';
import { comboKey, comboTokens, type Card, type FragmentKind } from '../engine';
import { board, cast, dummy, giveRune, idsFor } from '../engine/testkit';
import { playerCast } from '../engine';
import { noteView } from './notes';

let nextId = 2000;
const card = (kind: FragmentKind, rune?: number): Card => ({ id: nextId++, kind, ...(rune !== undefined ? { rune } : {}) });
const keys = (lines: { key: string }[]) => lines.map((l) => l.key);

describe('"Hmmm..." note: recording', () => {
  it('names a combination the same whatever the card order', () => {
    expect(comboKey([card('beam'), card('fire'), card('fire')])).toBe('fire+fire+beam');
    expect(comboKey([card('rune', 3), card('wall'), card('water')])).toBe('water+wall+rune-3');
    expect(comboTokens('water+wall+rune-3')).toEqual([{ kind: 'water' }, { kind: 'wall' }, { kind: 'rune', rune: 3 }]);
  });

  it('records each exact combination the first time it is cast, doubles separately', () => {
    const s = board({ player: 'c3', enemies: [dummy()], hand: ['fire', 'fire', 'beam', 'beam', 'water'] });
    const once = cast(s, ['fire', 'beam'], 'up');
    expect(once.combos).toEqual(['fire+beam']);
    expect(cast(once, ['fire', 'beam'], 'up').combos).toEqual(['fire+beam']);
    const s2 = board({ player: 'c3', enemies: [dummy()], hand: ['fire', 'fire', 'beam'] });
    expect(cast(s2, ['fire', 'fire', 'beam'], 'up').combos).toEqual(['fire+fire+beam']);
  });

  it('records a rune combination (even one that fizzles), but never a table that makes no spell', () => {
    const s = board({ player: 'c3', enemies: [dummy()], hand: ['fire', 'beam', 'water'] });
    const fizzle = giveRune(s, 'fizzle');
    const after = playerCast(s, [...idsFor(s, ['fire', 'beam']), fizzle.id], 'up');
    expect(after.combos).toEqual([`fire+beam+rune-${fizzle.rune}`]);

    const t = board({ player: 'c3', enemies: [dummy()], hand: ['fire', 'water'] });
    const rune = giveRune(t, 'amplify');
    const nothing = playerCast(t, [...idsFor(t, ['fire', 'water']), rune.id], null);
    expect(nothing.combos).toEqual([]);
  });
});

describe('"Hmmm..." note: what it shows', () => {
  const combos = ['fire+beam', 'fire+fire+beam', 'water+cross', 'fire+earth+wall', 'earth+wall+rune-2'];

  it('splits lines into what the hand can make and what it can not, cheapest first', () => {
    const hand = [card('fire'), card('beam'), card('water'), card('cross'), card('wall')];
    const v = noteView(combos, hand, [], 6);
    expect(keys(v.available)).toEqual(['fire+beam', 'water+cross']);
    // Cost order: Earth + Wall + rune (3), Magma Wall (3), Fire ×2 + Beam (4).
    expect(keys(v.missing)).toEqual(['earth+wall+rune-2', 'fire+earth+wall', 'fire+fire+beam']);
    const fb = v.available[0];
    expect(fb).toMatchObject({ name: 'Fire + Beam', cost: 2, effect: '1 dmg · Burn', tooExpensive: false });
    expect(fb.addIds).toEqual([hand[0].id, hand[1].id]);
  });

  it('with cards on the table, shows only lines using them and highlights those cards', () => {
    const fire = card('fire');
    const hand = [fire, card('fire'), card('beam'), card('water'), card('cross')];
    const v = noteView(combos, hand, [fire], 6);
    expect([...keys(v.available), ...keys(v.missing)].sort()).toEqual(['fire+beam', 'fire+earth+wall', 'fire+fire+beam']);
    expect(v.hidden).toBe(2);
    const fb = v.available.find((l) => l.key === 'fire+beam')!;
    expect(fb.onTable).toEqual([true, false]);
    // Clicking it adds only the missing Beam.
    expect(fb.addIds).toEqual([hand[2].id]);
  });

  it('a line the hand can make but mana can not pay for stays on top, marked too expensive', () => {
    const hand = [card('fire'), card('fire'), card('beam')];
    const v = noteView(['fire+fire+beam'], hand, [], 3);
    expect(v.available[0]).toMatchObject({ cost: 4, tooExpensive: true });
  });

  it('a rune line keeps its numbers a mystery and needs that exact rune symbol', () => {
    const v = noteView(['earth+wall+rune-2'], [card('earth'), card('wall'), card('rune', 5)], [], 6);
    expect(v.missing[0]).toMatchObject({ cost: null, effect: null, name: 'Earth + Wall' });
    const w = noteView(['earth+wall+rune-2'], [card('earth'), card('wall'), card('rune', 2)], [], 6);
    expect(w.available[0].cost).toBeNull();
  });
});
