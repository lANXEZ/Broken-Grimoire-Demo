import { describe, expect, it } from 'vitest';
import {
  ROOMS,
  actionsNextTurn,
  campChoice,
  continueRun,
  eventChoice,
  freeStep,
  freeWalkPath,
  comboFromCards,
  coordLabel,
  createGame,
  devRemoveEnemy,
  dropWeights,
  endPlayerTurn,
  parseCoord,
  planCast,
  planEnemyTurn,
  restartStage,
  isPrologue,
  campError,
  eventError,
  exitOpen,
  isWalkable,
  playerCast,
  RUNE_EFFECTS,
  ALPHABET,
  CIPHER_SYMBOLS,
  makeCipher,
  encryptRunes,
  decryptRunes,
  castFx,
  playerEscape,
  playerMeditate,
  playerMove,
  previewIntents,
  spellArea,
  spellCost,
  spellDamage,
  turnOrder,
  wardenChargedNextTurn,
  wardenSightLine,
  type Card,
  type FragmentKind,
  type GameState,
  type Spell,
} from './index';
import { at, board, cast, castErr, dummy, enemy, give, giveRune, hazard, hp, idsFor, labels, runEnemyTurn, toEnemyTurn } from './testkit';

const basic = (element: 'fire' | 'water' | 'earth' | 'wind', elementCount: 1 | 2, shape: 'beam' | 'cross' | 'wall', shapeCount: 1 | 2 = 1): Spell => ({
  kind: 'basic',
  element,
  elementCount,
  shape,
  shapeCount,
});
const cards = (...kinds: FragmentKind[]): Card[] => kinds.map((kind, id) => ({ id, kind, ...(kind === 'rune' ? { rune: 0 } : {}) }));

describe('spell math', () => {
  it('costs fragments + 1 per doubled part; merges 3, Unstable Fire 5', () => {
    expect(spellCost(basic('fire', 1, 'beam'))).toBe(2);
    expect(spellCost(basic('fire', 2, 'beam'))).toBe(4);
    expect(spellCost(basic('water', 1, 'cross', 2))).toBe(4);
    expect(spellCost({ kind: 'merge', elements: ['fire', 'earth'], shape: 'wall' })).toBe(3);
    expect(spellCost({ kind: 'unstable' })).toBe(5);
  });

  it('damage: Fire 1/3, Water and Earth 2/4, Wind 0, Magma 2, Fog 0, Unstable Fire 7, and the rune boosts', () => {
    expect(spellDamage(basic('fire', 1, 'beam'))).toBe(1);
    expect(spellDamage(basic('fire', 2, 'beam'))).toBe(3);
    expect(spellDamage(basic('earth', 1, 'beam'))).toBe(2);
    expect(spellDamage(basic('water', 2, 'cross'))).toBe(4);
    expect(spellDamage(basic('wind', 2, 'beam'))).toBe(0);
    expect(spellDamage({ kind: 'merge', elements: ['fire', 'earth'], shape: 'beam' })).toBe(2);
    expect(spellDamage({ kind: 'merge', elements: ['water', 'fire'], shape: 'beam' })).toBe(0);
    expect(spellDamage({ kind: 'unstable' })).toBe(7);
    expect(spellDamage(basic('wind', 1, 'beam'), 'amplify')).toBe(2);
    expect(spellDamage(basic('water', 1, 'beam'), 'volatile')).toBe(4);
  });

  it('reads the crafting table', () => {
    expect(comboFromCards(cards('fire', 'beam'))).toMatchObject({ kind: 'spell', spell: basic('fire', 1, 'beam') });
    expect(comboFromCards(cards('wall', 'wind', 'wall'))).toMatchObject({ kind: 'spell', spell: basic('wind', 1, 'wall', 2) });
    expect(comboFromCards(cards('fire', 'water', 'beam'))).toMatchObject({ kind: 'spell', spell: { kind: 'merge', shape: 'beam' } });
    expect(comboFromCards(cards('fire', 'wind', 'beam'))).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/Wind/) });
    expect(comboFromCards(cards('fire', 'fire', 'fire'))).toMatchObject({ kind: 'spell', spell: { kind: 'unstable' } });
    expect(comboFromCards(cards('fire', 'fire', 'beam', 'beam'))).toMatchObject({ kind: 'invalid', castable: false });
    expect(comboFromCards(cards('beam', 'cross'))).toMatchObject({ kind: 'invalid', castable: false });
  });

  it('a rune takes one of the 3 slots; with a rune, CAST stays lit even if the fragments make nothing', () => {
    expect(comboFromCards(cards('fire', 'beam', 'rune'))).toMatchObject({ kind: 'spell', spell: basic('fire', 1, 'beam') });
    expect(comboFromCards(cards('fire', 'water', 'rune'))).toMatchObject({ kind: 'invalid', castable: true });
    expect(comboFromCards(cards('fire', 'rune'))).toMatchObject({ kind: 'invalid', castable: true });
    expect(comboFromCards(cards('rune'))).toMatchObject({ kind: 'invalid', castable: false });
    expect(comboFromCards(cards('fire', 'fire', 'beam', 'rune'))).toMatchObject({ kind: 'invalid', castable: false });
    expect(comboFromCards(cards('fire', 'rune', 'rune'))).toMatchObject({ kind: 'invalid', castable: false });
  });

  it('the cost shown never gives a rune away', () => {
    expect(planCast(cards('fire', 'beam', 'rune')).cost).toBe(3);
    expect(planCast(cards('fire', 'water', 'rune')).cost).toBe(3);
  });
});

describe('spell areas', () => {
  it('a beam stops at a pillar, which counts as hit', () => {
    const s = board({ player: 'a1', pillars: ['a3'] });
    const up = spellArea(s, basic('fire', 1, 'beam', 2), 'up');
    expect(labels(up.tiles.map((t) => t.pos))).toEqual(['a2']);
    expect(labels(up.pillars)).toEqual(['a3']);
    expect(labels(spellArea(s, basic('fire', 1, 'beam', 2), 'right').tiles.map((t) => t.pos))).toEqual(['b1', 'c1', 'd1', 'e1']);
  });

  it('a doubled cross reaches 2 tiles each way', () => {
    const s = board({ player: 'c3' });
    expect(spellArea(s, basic('fire', 1, 'cross', 2), null).tiles).toHaveLength(8);
  });

  it('a wall is a row of 3 in front of you; doubled it adds a row, and a pillar shields the tile behind it', () => {
    const s = board({ player: 'c3' });
    expect(labels(spellArea(s, basic('fire', 1, 'wall'), 'up').tiles.map((t) => t.pos))).toEqual(['b4', 'c4', 'd4']);
    const p = board({ player: 'c3', pillars: ['c4'] });
    const area = spellArea(p, basic('fire', 1, 'wall', 2), 'up');
    expect(labels(area.tiles.map((t) => t.pos))).toEqual(['b4', 'b5', 'd4', 'd5']);
    expect(labels(area.pillars)).toEqual(['c4']);
  });

  it('widen: beam gets side lanes, cross the diagonals, wall 5 wide', () => {
    const s = board({ player: 'c1' });
    expect(labels(spellArea(s, basic('fire', 1, 'beam'), 'up', 'widen').tiles.map((t) => t.pos))).toEqual(['b2', 'b3', 'c2', 'c3', 'd2', 'd3']);
    const c = board({ player: 'c3' });
    expect(spellArea(c, basic('fire', 1, 'cross'), null, 'widen').tiles).toHaveLength(8);
    expect(spellArea(c, basic('fire', 1, 'wall'), 'up', 'widen').tiles).toHaveLength(5);
  });

  it('Unstable Fire hits the 3×3 around you; pillars there count as hit', () => {
    const s = board({ player: 'b2', pillars: ['c3'] });
    const area = spellArea(s, { kind: 'unstable' }, null);
    expect(area.tiles).toHaveLength(7);
    expect(labels(area.pillars)).toEqual(['c3']);
  });
});

describe('player turn', () => {
  it('a cast damages, applies its status and spends mana and an action', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a3' }] });
    const next = cast(s, ['water', 'beam'], 'up');
    expect(hp(next, '3a')).toBe(4);
    expect(next.enemies[0].status.root).toBe(1);
    expect(next.player.mana).toBe(4);
    expect(next.actionsLeft).toBe(2);
  });

  it('page wards only feel spells containing their element (never Magma); the redactor is immune while wards stand', () => {
    const s = board({ player: 'c3', enemies: [{ kind: 'ward', at: 'c4', element: 'fire' }, { kind: 'redactor', at: 'd3' }] });
    const earth = cast(s, ['earth', 'cross']);
    expect(hp(earth, '6a')).toBe(4);
    expect(hp(earth, '8a')).toBe(18);
    expect(hp(cast(s, ['fire', 'cross']), '6a')).toBe(3);
    expect(hp(cast(s, ['fire', 'earth', 'cross']), '6a')).toBe(4);
  });

  it('Burn ticks at the start of each of your turns, whether or not you act', () => {
    const s = board({ player: 'a1', enemies: [dummy()] });
    s.player.status.burn = 3;
    const next = runEnemyTurn(s);
    expect(next.turn).toBe(2);
    expect(next.player.hp).toBe(19);
    expect(next.player.status.burn).toBe(2);
  });

  it('the turn ends by itself after 3 actions', () => {
    let s = board({ player: 'a1', enemies: [dummy()] });
    s = playerMeditate(playerMeditate(playerMeditate(s)));
    expect(s.phase).toBe('enemy');
  });

  it('Unstable Fire: 7 damage on the 3×3, Burn 3 on you, once per room', () => {
    let s = board({ player: 'c3', enemies: [{ kind: 'rat', at: 'b2' }, { kind: 'brute', at: 'e5' }, { kind: 'brute', at: 'd4' }] });
    s = cast(s, ['fire', 'fire', 'fire']);
    expect(s.enemies.map((e) => e.id)).toEqual(['3a']);
    expect(hp(s, '3a')).toBe(6);
    expect(s.player.mana).toBe(1);
    expect(s.player.status.burn).toBe(3);
    s.player.mana = 6;
    give(s, 'fire', 'fire', 'fire');
    expect(castErr(s, ['fire', 'fire', 'fire'])).toMatch(/already used/);
  });

  it('moves never go into a hole', () => {
    const s = board({ player: 'a1', holes: ['a2'], enemies: [dummy()] });
    expect(() => playerMove(s, 'up')).toThrow(/blocked/);
  });
});

describe('wind, pushes and collisions', () => {
  it('Wind pushes 2 tiles along a beam and deals no damage', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    const one = cast(s, ['wind', 'beam'], 'up');
    expect(at(one, '1a')).toBe('a4');
    expect(hp(one, '1a')).toBe(2);
  });

  it('doubled Wind pushes until the target hits something: the wall, or a unit (both take 1)', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    const wall = cast(s, ['wind', 'wind', 'beam'], 'up');
    expect(at(wall, '1a')).toBe('a6');
    expect(hp(wall, '1a')).toBe(1);

    const t = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }, { kind: 'brute', at: 'a6' }] });
    const unit = cast(t, ['wind', 'wind', 'beam'], 'up');
    expect(at(unit, '1a')).toBe('a5');
    expect([hp(unit, '1a'), hp(unit, '3a')]).toEqual([1, 5]);
  });

  it('pushes the farthest unit first, so a line slides together', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }, { kind: 'rat', at: 'a3' }] });
    const after = cast(s, ['wind', 'beam'], 'up');
    expect([at(after, '1a'), at(after, '1b')]).toEqual(['a4', 'a5']);
    expect([hp(after, '1a'), hp(after, '1b')]).toEqual([2, 2]);
  });

  it('a Cross pushes outward; hitting a unit hurts both by 1', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }, { kind: 'brute', at: 'a3' }] });
    const after = cast(s, ['wind', 'cross']);
    expect(at(after, '1a')).toBe('a2');
    expect([hp(after, '1a'), hp(after, '3a')]).toEqual([1, 5]);
  });

  it('hitting a pillar hurts the unit and the pillar; Wind alone never chips pillars', () => {
    const s = board({ player: 'a1', pillars: ['a3'], enemies: [{ kind: 'rat', at: 'a2' }] });
    const after = cast(s, ['wind', 'beam'], 'up');
    expect(hp(after, '1a')).toBe(1);
    expect(after.room.pillars[0].hp).toBe(1);
  });

  it('hitting the room wall hurts only the pushed unit', () => {
    const s = board({ player: 'a2', enemies: [{ kind: 'rat', at: 'a1' }] });
    const after = cast(s, ['wind', 'beam'], 'down');
    expect(at(after, '1a')).toBe('a1');
    expect(hp(after, '1a')).toBe(1);
  });

  it('a unit pushed into a hole dies and its loot is lost', () => {
    const s = board({ player: 'a1', holes: ['a3'], enemies: [{ kind: 'rat', at: 'a2' }, dummy()] });
    const after = cast(s, ['wind', 'beam'], 'up');
    expect(after.enemies.some((e) => e.kind === 'rat')).toBe(false);
    expect(after.room.drops).toEqual([]);
  });

  it('floating units can’t be pushed; Wind pushes massive ones', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a2' }, { kind: 'ward', at: 'b1', element: 'wind' }] });
    const after = cast(s, ['wind', 'cross']);
    expect([at(after, '5a'), at(after, '6a')]).toEqual(['a4', 'b1']);
  });

  it('pushing the Warden off its tile cancels its marked line', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a3' }] });
    enemy(s, '5a').markedLine = [parseCoord('a2'), parseCoord('a1')];
    const after = cast(s, ['wind', 'beam'], 'up');
    expect(at(after, '5a')).toBe('a5');
    expect(enemy(after, '5a').markedLine).toBeNull();
  });

  it('a hole stops a pushed Warden or Redactor at its edge (1 damage) instead of swallowing it', () => {
    for (const kind of ['warden', 'redactor'] as const) {
      const s = board({ player: 'a1', holes: ['a4'], enemies: [{ kind, at: 'a2' }] });
      const id = s.enemies[0].id;
      const hp = s.enemies[0].hp;
      const after = cast(s, ['wind', 'wind', 'beam'], 'up');
      const e = after.enemies.find((x) => x.id === id)!;
      expect(coordLabel(e.pos)).toBe('a3');
      expect(e.hp).toBe(hp - 1);
    }
  });

  it('Quicksand catches a sliding unit; Magma burns it on the way past', () => {
    const q = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    hazard(q, 'a3', 'quicksand');
    const caught = cast(q, ['wind', 'wind', 'beam'], 'up');
    expect(at(caught, '1a')).toBe('a3');
    expect(enemy(caught, '1a').status.stuck).toBe(2);

    const m = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    hazard(m, 'a3', 'magma');
    const burnt = cast(m, ['wind', 'wind', 'beam'], 'up');
    expect(at(burnt, '1a')).toBe('a6');
    expect(enemy(burnt, '1a').status.burn).toBe(3);
  });

  it('an Archer shot pushes you, and a push into a hole is game over', () => {
    const s = board({ player: 'a2', holes: ['a1'], enemies: [{ kind: 'archer', at: 'a6' }] });
    const after = runEnemyTurn(s);
    expect(after.player.hp).toBe(18);
    expect(after.phase).toBe('lost');
    expect(after.lostReason).toBe('hole');
  });
});

describe('pillars', () => {
  it('have 2 HP: damaging spells chip the pillar that stops them, and a broken pillar becomes floor', () => {
    let s = board({ player: 'a1', pillars: ['a2'], enemies: [dummy()] });
    s = cast(s, ['fire', 'beam'], 'up');
    expect(s.room.pillars[0].hp).toBe(1);
    s = cast(s, ['earth', 'beam'], 'up');
    expect(s.room.pillars).toEqual([]);
  });
});

describe('merges and hazards', () => {
  it('Fog: 0 damage, covers the shape and lasts through your 3rd turn (the casting turn counts)', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a3' }] });
    const after = cast(s, ['fire', 'water', 'beam'], 'up');
    expect(hp(after, '3a')).toBe(6);
    expect(after.enemies[0].status.burn).toBe(0);
    expect(after.room.hazards.map((h) => [coordLabel(h.pos), h.kind, h.until])).toEqual([
      ['a2', 'fog', 3],
      ['a3', 'fog', 3],
    ]);
    const late = { ...after, turn: 3 };
    expect(endPlayerTurn(late).room.hazards).toEqual([]);
    expect(endPlayerTurn({ ...after, turn: 2 }).room.hazards).toHaveLength(2);
  });

  it('Magma: 2 damage and Burn on the units it lands on; stepping onto it later burns too', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a2' }] });
    const after = cast(s, ['fire', 'earth', 'beam'], 'up');
    expect(hp(after, '3a')).toBe(4);
    expect(after.enemies[0].status).toMatchObject({ burn: 3, stun: 0 });
    // The Burn ticks at the start of its next turn.
    expect(hp(runEnemyTurn(after), '3a')).toBe(3);
    expect(after.room.hazards.every((h) => h.kind === 'magma')).toBe(true);

    const walk = board({ player: 'a1', enemies: [dummy()] });
    hazard(walk, 'b1', 'magma');
    expect(playerMove(walk, 'right').player.status.burn).toBe(3);
  });

  it('Quicksand: a monster caught in it spends 2 actions climbing out (the puddle goes), then acts', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    const after = cast(s, ['earth', 'water', 'cross']);
    expect(after.enemies[0].status.stuck).toBe(2);
    const plan = planEnemyTurn(toEnemyTurn(after));
    expect(plan.intents['1a'].map((i) => i.kind)).toEqual(['escape', 'escape', 'attack']);
    expect(plan.final.room.hazards.map((h) => coordLabel(h.pos))).toEqual(['b1']);
    expect(plan.final.player.hp).toBe(19);
  });

  it('a stuck mage can’t move or cast until climbing out (2 actions)', () => {
    let s = board({ player: 'a1', enemies: [dummy()] });
    hazard(s, 'a1', 'quicksand');
    s.player.status.stuck = 2;
    expect(() => playerMove(s, 'up')).toThrow(/quicksand/);
    expect(castErr(s, ['fire', 'beam'], 'up')).toMatch(/quicksand/);
    s = playerEscape(playerEscape(s));
    expect(s.player.status.stuck).toBe(0);
    expect(s.room.hazards).toEqual([]);
  });

  it('Wind clears fog; Water cools magma', () => {
    const s = board({ player: 'a1', enemies: [dummy()] });
    hazard(s, 'a2', 'fog');
    hazard(s, 'b1', 'magma');
    expect(cast(s, ['wind', 'beam'], 'up').room.hazards.map((h) => h.kind)).toEqual(['magma']);
    expect(cast(s, ['water', 'beam'], 'right').room.hazards.map((h) => h.kind)).toEqual(['fog']);
  });

  it('monsters walk around Magma and Quicksand when there is another way', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'c1' }] });
    hazard(s, 'b1', 'magma');
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('a2');
    expect(enemy(after, '1a').status.burn).toBe(0);
  });

  it('…but step on one when it is the only way', () => {
    const s = board({ player: 'a1', pillars: ['a2'], enemies: [{ kind: 'rat', at: 'c1' }] });
    hazard(s, 'b1', 'magma');
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('b1');
    expect(enemy(after, '1a').status.burn).toBe(3);
    expect(after.player.hp).toBe(19);
  });

  it('a monster in fog wanders at random (checked every action)', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'd4' }] });
    hazard(s, 'd4', 'fog');
    const intents = previewIntents(s)['1a'];
    expect(intents[0].kind).toBe('wander');
    expect(intents.slice(1).every((i) => i.kind === 'move')).toBe(true);
  });

  it('standing in fog hides you from Archers; fog in between blocks the Warden’s sight', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'archer', at: 'a5' }] });
    hazard(s, 'a1', 'fog');
    const after = runEnemyTurn(s);
    expect(after.player.hp).toBe(20);
    expect(at(after, '2a')).toBe('a5');

    const w = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a6' }] });
    expect(wardenSightLine(w, w.enemies[0])).not.toBeNull();
    hazard(w, 'a3', 'fog');
    expect(wardenSightLine(w, w.enemies[0])).toBeNull();
  });
});

describe('statuses', () => {
  it('root stops movement for one turn, stun stops attacks for one turn', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a4' }] });
    s.enemies[0].status.root = 1;
    s = runEnemyTurn(s);
    expect(at(s, '3a')).toBe('a4');
    expect(s.enemies[0].status.root).toBe(0);

    let t = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a2' }] });
    t.enemies[0].status.stun = 1;
    t = runEnemyTurn(t);
    expect(t.player.hp).toBe(20);
    t = runEnemyTurn(t);
    expect(t.player.hp).toBe(17);
  });

  it('Burn ticks at the start of an enemy’s turn even if it can’t act', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a5' }] });
    s.enemies[0].status.burn = 3;
    s.enemies[0].status.root = 1;
    s = runEnemyTurn(s);
    expect(hp(s, '3a')).toBe(5);
    expect(s.enemies[0].status.burn).toBe(2);
  });
});

describe('enemy turn', () => {
  it('acts by type number, then deploy order', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'f6' }, { kind: 'rat', at: 'f1' }, { kind: 'brute', at: 'e6' }] });
    expect(turnOrder(s).map((e) => e.id)).toEqual(['1a', '3a', '3b']);
  });

  it('a melee enemy walks in and attacks only once per turn', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a4' }] });
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('a2');
    expect(after.player.hp).toBe(19);
    expect(after.phase).toBe('player');
    expect(after.turn).toBe(2);
  });

  it('units never share tiles', () => {
    const s = board({ player: 'a1', pillars: ['a2'], enemies: [{ kind: 'rat', at: 'd1' }, { kind: 'rat', at: 'e1' }] });
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('b1');
    expect(new Set(after.enemies.map((e) => coordLabel(e.pos))).size).toBe(2);
  });

  it('leech drains mana, not HP', () => {
    const s = board({ player: 'a1', mana: 3, enemies: [{ kind: 'leech', at: 'a2' }] });
    const after = runEnemyTurn(s);
    expect(after.player.mana).toBe(2);
    expect(after.player.hp).toBe(20);
  });
});

describe('archer', () => {
  it('backs off in the opposite direction when adjacent', () => {
    const after = runEnemyTurn(board({ player: 'c3', enemies: [{ kind: 'archer', at: 'c4' }] }));
    expect(at(after, '2a')).toBe('c6');
    expect(after.player.hp).toBe(20);
  });

  it('shoots any distance on the 8 lines: 2 damage and a push along the shot', () => {
    const after = runEnemyTurn(board({ player: 'b2', enemies: [{ kind: 'archer', at: 'f6' }] }));
    expect(after.player.hp).toBe(18);
    expect(coordLabel(after.player.pos)).toBe('a1');
  });

  it('a pillar in between breaks the line, so it walks', () => {
    const after = runEnemyTurn(board({ player: 'a1', pillars: ['b2'], enemies: [{ kind: 'archer', at: 'd4' }] }));
    expect(at(after, '2a')).not.toBe('d4');
  });

  it('friendly fire: a monster in the way takes the arrow and the push', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'archer', at: 'a5' }, { kind: 'brute', at: 'a3' }] });
    Object.assign(enemy(s, '3a').status, { root: 1, stun: 1 });
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.final.player.hp).toBe(20);
    expect(hp(plan.final, '3a')).toBe(4);
    expect(at(plan.final, '3a')).toBe('a2');
    expect(plan.intents['2a']).toEqual([{ kind: 'shoot', value: 2, note: 'Brute 3a is in the way' }]);
  });

  it('an arrow hurts a Warden in the way but can’t push it', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'archer', at: 'a5' }, { kind: 'warden', at: 'a3' }] });
    Object.assign(enemy(s, '5a').status, { root: 1, stun: 1 });
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(hp(plan.final, '5a')).toBe(6);
    expect(at(plan.final, '5a')).toBe('a3');
  });

  it('a Page Ward in the way stops the arrow but takes nothing', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'archer', at: 'a5' }, { kind: 'ward', at: 'a3', element: 'fire' }] });
    const after = runEnemyTurn(s);
    expect(after.player.hp).toBe(20);
    expect(hp(after, '6a')).toBe(4);
  });
});

describe('warden', () => {
  it('walks to a tile with a clear line to you, then holds still', () => {
    const plan = planEnemyTurn(toEnemyTurn(board({ player: 'a1', enemies: [{ kind: 'warden', at: 'c4' }] })));
    const w = plan.final.enemies[0];
    expect(plan.final.player.hp).toBe(20);
    expect(wardenSightLine(plan.final, w)).not.toBeNull();
    expect(plan.intents['5a'].map((i) => i.kind)).toEqual(['move', 'watch']);
  });

  it('marking ends its turn; the wave fires at the start of its next turn', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a6' }] });
    s.enemies[0].turnCount = 1;
    s = runEnemyTurn(s);
    expect(s.player.hp).toBe(20);
    expect(s.enemies[0].markedLine?.map(coordLabel)).toEqual(['a5', 'a4', 'a3', 'a2', 'a1']);
    s = runEnemyTurn(s);
    expect(s.player.hp).toBe(15);
    expect(s.enemies[0].markedLine).toBeNull();
  });

  it('the wave hits every unit on the line, monsters included', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a3' }, { kind: 'warden', at: 'a6' }] });
    enemy(s, '1a').status.root = 1;
    enemy(s, '5a').turnCount = 2;
    enemy(s, '5a').markedLine = ['a5', 'a4', 'a3', 'a2', 'a1'].map(parseCoord);
    const after = runEnemyTurn(s);
    expect(after.enemies.some((e) => e.kind === 'rat')).toBe(false);
    expect(after.room.drops).toHaveLength(1);
    expect(after.player.hp).toBe(15);
  });

  it('the pillar that ends the line takes 1 damage when it fires', () => {
    let s = board({ player: 'a3', pillars: ['a1'], enemies: [{ kind: 'warden', at: 'a6' }] });
    s.enemies[0].turnCount = 1;
    s = runEnemyTurn(s);
    expect(s.enemies[0].markedPillar).toEqual(parseCoord('a1'));
    s = runEnemyTurn(s);
    expect(s.player.hp).toBe(15);
    expect(s.room.pillars[0].hp).toBe(1);
  });

  it('Earth cancels a marked line right away', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a3' }] });
    s.enemies[0].markedLine = ['a2', 'a1'].map(parseCoord);
    const after = cast(s, ['earth', 'beam'], 'up');
    expect(after.enemies[0].markedLine).toBeNull();
    expect(hp(after, '5a')).toBe(6);
  });

  it('loses its charge if no tile can see you', () => {
    let s = board({ player: 'a1', pillars: ['a2', 'b1', 'b2'], enemies: [{ kind: 'warden', at: 'e4' }] });
    s.enemies[0].turnCount = 1;
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['5a'].map((i) => i.kind)).toEqual(['wait']);
    s = plan.final;
    expect(s.enemies[0].charge).toBe(false);
    expect(at(s, '5a')).toBe('e4');
  });

  it('drops a rune on the floor when it dies', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a2' }] });
    s = devRemoveEnemy(s, '5a', true);
    expect(s.room.drops).toHaveLength(1);
    expect(s.room.drops[0].cards[0].kind).toBe('rune');
    expect(s.runesFound).toHaveLength(1);
  });
});

describe('drops and CLEARED!', () => {
  it('a kill leaves a fragment on the floor; walking onto it puts it in the discard pile', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }, { kind: 'brute', at: 'f6' }] });
    s.enemies[0].hp = 1;
    s = cast(s, ['fire', 'beam'], 'up');
    expect(s.room.drops.map((d) => coordLabel(d.pos))).toEqual(['a2']);
    expect(s.cards.discard).toHaveLength(2);
    s = playerMove(s, 'up');
    expect(s.room.drops).toEqual([]);
    expect(s.cards.discard).toHaveLength(3);
    expect(s.cards.discard[2].loot).toBe('rat');
  });

  it('never drops the same card three times in a row; the theme card is twice as likely', () => {
    const s = board({ player: 'a1' });
    s.lastDrops = ['wall', 'wall'];
    expect(dropWeights(s, 'rat').wall).toBe(0);
    s.lastDrops = [];
    expect(dropWeights(s, 'rat').fire).toBeCloseTo(dropWeights(s, 'leech').fire * 2);
  });
});

describe('boss room', () => {
  const wardRoom = (status: Partial<{ burn: number; root: number; stun: number }>, turn: number) => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'redactor', at: 'h1' }] });
    Object.assign(s.enemies[0].status, status);
    s.turn = turn;
    return s;
  };
  const scrapCount = (s: GameState) => s.enemies.filter((e) => e.kind === 'scrap').length;

  it('a ward the Burn tick kills summons nothing', () => {
    const s = wardRoom({ burn: 2 }, 2);
    s.enemies[0].hp = 1;
    const after = runEnemyTurn(s);
    expect(after.enemies.some((e) => e.kind === 'ward')).toBe(false);
    expect(scrapCount(after)).toBe(0);
  });

  it('Burn ticks on a ward’s rest turn too', () => {
    const after = runEnemyTurn(wardRoom({ burn: 3 }, 1));
    expect(hp(after, '6a')).toBe(3);
    expect(after.enemies[0].status.burn).toBe(2);
  });

  it('stun doesn’t stop a summon (it isn’t an attack)', () => {
    expect(scrapCount(runEnemyTurn(wardRoom({ stun: 1 }, 2)))).toBe(1);
  });

  it('a scrap steals, carries the fragment to the redactor for a mark, then keeps away', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'scrap', at: 'a2' }, { kind: 'redactor', at: 'c3' }] });
    const plan = planEnemyTurn(toEnemyTurn(s));
    const scrap = plan.final.enemies.find((e) => e.kind === 'scrap')!;
    expect(scrap.carried).toHaveLength(1);
    expect(scrap.delivered).toBe(true);
    expect(plan.final.enemies.find((e) => e.kind === 'redactor')!.marks).toBe(1);
    expect(plan.intents['7a'].map((i) => i.kind).slice(0, 3)).toEqual(['steal', 'move', 'deliver']);
  });

  it('a dead scrap drops what it stole on the floor; picking it up puts it back in your hand', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'scrap', at: 'a2' }, { kind: 'rat', at: 'h8' }] });
    const stolen = s.cards.hand.splice(0, 2);
    s.enemies[0].carried = stolen;
    s = devRemoveEnemy(s, '7a', true);
    expect(s.room.drops[0]).toMatchObject({ toHand: true, cards: stolen });
    s = playerMove(s, 'up');
    expect(s.cards.hand.slice(-2)).toEqual(stolen);
  });

  it('once the wards fall, scraps block you, preferring tiles outside Erasure Zones', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'scrap', at: 'c1' }, { kind: 'redactor', at: 'h8' }] });
    // Zones fade at the end of your turn, so set one up mid-enemy-turn (as if left earlier this turn).
    const mid = toEnemyTurn(s);
    mid.erasureZone = [parseCoord('b1')];
    const plan = planEnemyTurn(mid);
    expect(at(plan.final, '7a')).toBe('a2');
    expect(plan.intents['7a'].map((i) => i.kind)).toEqual(['move', 'move', 'move', 'block']);
  });

  it('at most 2 explosions a turn, in every mode', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'b2' }] });
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.final.enemies[0].mode).toBe('spent');
    expect(plan.intents['8a'].map((i) => i.kind)).toEqual(['explode', 'explode']);
    expect(plan.final.player.hp).toBe(14);
  });

  it('chaos mode: 4 actions, and the action after each explosion is a cooldown', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'b2' }] });
    s.enemies[0].marks = 2;
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['8a'].map((i) => i.kind)).toEqual(['explode', 'cooldown', 'explode', 'cooldown']);
    s = plan.final;
    expect(s.enemies[0].marks).toBe(1);
    expect(s.player.hp).toBe(14);
    expect(labels(s.erasureZone)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
  });

  it('guarded: 2 explosions and no Erasure Zone', () => {
    const s = runEnemyTurn(board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'redactor', at: 'b2' }] }));
    expect(s.player.hp).toBe(14);
    expect(s.erasureZone).toEqual([]);
  });

  it('ending your turn in the Erasure Zone costs a fragment, then the zone fades', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.erasureZone = [parseCoord('a1')];
    s = endPlayerTurn(s);
    expect(s.erasureZone).toHaveLength(0);
    expect(s.cards.erased).toHaveLength(1);
  });
});

describe('runes', () => {
  const brute = () => board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a2' }] });

  it('the rune alphabet: a different symbol per letter; each rune shows its first letter, clashes get their own', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const c = makeCipher(rand);
    const own = ALPHABET.map((l) => c.letters[l][0]);
    expect(new Set(own).size).toBe(26);
    const all = ALPHABET.flatMap((l) => c.letters[l]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((s) => CIPHER_SYMBOLS.includes(s))).toBe(true);
    for (const e of RUNE_EFFECTS) expect(c.letters[e[0].toUpperCase()]).toContain(c.runes[e]);
    expect(new Set(RUNE_EFFECTS.map((e) => c.runes[e])).size).toBe(RUNE_EFFECTS.length);
    // Free and Fizzle: F's own symbol for Free (first in RUNE_EFFECTS), a second F symbol for Fizzle.
    expect(c.letters.F).toEqual([c.runes.free, c.runes.fizzle]);
    expect(c.letters.A).toEqual([c.runes.amplify]);
    // Saved once, never changes; a broken save is repaired, keeping what's still good.
    expect(makeCipher(Math.random, JSON.parse(JSON.stringify(c)))).toEqual(c);
    const broken = JSON.parse(JSON.stringify(c));
    delete broken.runes.fizzle;
    broken.letters.F = [c.runes.free];
    const fixed = makeCipher(Math.random, broken);
    expect(fixed.letters.A).toEqual(c.letters.A);
    expect(fixed.letters.F[0]).toBe(c.runes.free);
    expect(fixed.letters.F).toHaveLength(2);
    expect(fixed.runes.fizzle).toBe(fixed.letters.F[1]);
    // Messages: letters become symbols, the rest stays; reading back gives the letters.
    const L = (l: string) => c.letters[l][0];
    const secret = encryptRunes(c, 'Fizz, buzz!');
    expect(secret).toBe(`${L('F')}${L('I')}${L('Z')}${L('Z')}, ${L('B')}${L('U')}${L('Z')}${L('Z')}!`);
    expect(decryptRunes(c, secret)).toBe('FIZZ, BUZZ!');
    expect(decryptRunes(c, c.runes.fizzle)).toBe('F');
  });

  it('a rune cast can be shown in two parts: the spell alone first, then the real result', () => {
    const s = brute();
    const rune = giveRune(s, 'amplify');
    const ids = [...idsFor(s, ['fire', 'beam']), rune.id];
    const alone = playerCast(s, ids, 'up', { ignoreRune: true });
    const real = playerCast(s, ids, 'up');
    // The spell part: plain Fire + Beam (1 dmg), the rune card spent and its mana paid all the same.
    expect(hp(alone, '3a')).toBe(5);
    expect(hp(real, '3a')).toBe(3);
    expect(alone.player.mana).toBe(real.player.mana);
    expect(alone.cards.discard.map((c) => c.id).sort()).toEqual(real.cards.discard.map((c) => c.id).sort());
    expect(castFx(s, ids, 'up')).toMatchObject({ rune: 'amplify', runeSymbol: rune.rune });
    expect(castFx(s, ids, 'up', { ignoreRune: true })).toMatchObject({ rune: null, runeSymbol: rune.rune });
  });

  it('Free: the spell part pays the mana, the real result gives it back', () => {
    const s = brute();
    const rune = giveRune(s, 'free');
    const ids = [...idsFor(s, ['fire', 'beam']), rune.id];
    expect(playerCast(s, ids, 'up', { ignoreRune: true }).player.mana).toBe(3);
    expect(playerCast(s, ids, 'up').player.mana).toBe(6);
  });

  it('Echo casts the spell twice', () => {
    const s = brute();
    giveRune(s, 'echo');
    const after = cast(s, ['fire', 'beam', 'rune'], 'up');
    expect(hp(after, '3a')).toBe(4);
    expect(after.player.mana).toBe(3);
  });

  it('Amplify adds 2 damage, even to Wind', () => {
    const s = brute();
    giveRune(s, 'amplify');
    const after = cast(s, ['wind', 'beam', 'rune'], 'up');
    expect(hp(after, '3a')).toBe(4);
    expect(at(after, '3a')).toBe('a4');
  });

  it('Siphon heals 1 per enemy hit', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a2' }, { kind: 'brute', at: 'b1' }] });
    s.player.hp = 10;
    giveRune(s, 'siphon');
    expect(cast(s, ['fire', 'cross', 'rune']).player.hp).toBe(12);
  });

  it('Volatile doubles the damage and hurts you for 2', () => {
    const s = brute();
    giveRune(s, 'volatile');
    const after = cast(s, ['water', 'beam', 'rune'], 'up');
    expect(hp(after, '3a')).toBe(2);
    expect(after.player.hp).toBe(18);
  });

  it('Free costs no mana but 2 HP', () => {
    const s = brute();
    giveRune(s, 'free');
    const after = cast(s, ['fire', 'beam', 'rune'], 'up');
    expect(after.player.mana).toBe(6);
    expect(after.player.hp).toBe(18);
  });

  it('Backfire hits you too', () => {
    const s = brute();
    giveRune(s, 'backfire');
    const after = cast(s, ['water', 'beam', 'rune'], 'up');
    expect(hp(after, '3a')).toBe(4);
    expect(after.player.hp).toBe(18);
    expect(after.player.status.root).toBe(2);
  });

  it('Fizzle: nothing happens, mana and cards are spent', () => {
    const s = brute();
    giveRune(s, 'fizzle');
    const handBefore = s.cards.hand.length;
    const after = cast(s, ['fire', 'beam', 'rune'], 'up');
    expect(hp(after, '3a')).toBe(6);
    expect(after.player.mana).toBe(3);
    expect(after.cards.hand).toHaveLength(handBefore - 3);
    expect(after.grimoire).not.toContain('fire-beam');
  });

  it('a rune on a table that makes no spell fizzles, but its own drawback still happens', () => {
    const s = brute();
    expect(castErr(s, ['fire', 'water'])).toMatch(/shape/);
    giveRune(s, 'volatile');
    const after = cast(s, ['fire', 'water', 'rune']);
    expect(hp(after, '3a')).toBe(6);
    expect(after.player.mana).toBe(3);
    expect(after.player.hp).toBe(18);
  });
});

describe('the grimoire', () => {
  it('records each new combo once (doubling doesn’t matter) and keeps earlier runs’ pages', () => {
    let s = board({ player: 'a1', enemies: [dummy()] });
    s = cast(s, ['fire', 'beam'], 'up');
    s = cast(s, ['fire', 'fire', 'beam'], 'up');
    expect(s.grimoire).toEqual(['fire-beam']);
    expect(createGame(1, { grimoire: ['magma-wall'] }).grimoire).toEqual(['magma-wall']);
  });
});

describe('the run', () => {
  it('CLEARED!: walk freely to pick things up, then Continue to the event', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }] });
    s.enemies[0].hp = 1;
    s = cast(s, ['fire', 'beam'], 'up');
    expect(s.phase).toBe('cleared');
    const discard = s.cards.discard.length;
    s = freeStep(s, parseCoord('a2'));
    expect(s.cards.discard).toHaveLength(discard + 1);
    s = continueRun(s);
    expect(s.phase).toBe('event');
  });

  describe('room 0, the prologue', () => {
    const wake = () => createGame(7, { prologue: true });
    const walkTo = (s: GameState, coord: string) => (freeWalkPath(s, parseCoord(coord)) ?? []).reduce((st, p) => freeStep(st, p), s);

    it('is a 3\u00d74 room with a campfire, a rock, a collapsed corner and the big door; no enemies, never cleared', () => {
      const s = wake();
      expect([s.room.width, s.room.height, s.stage, s.phase]).toEqual([3, 4, -1, 'player']);
      expect(isPrologue(s)).toBe(true);
      expect(coordLabel(s.player.pos)).toBe('a1');
      expect(s.room.feature).toMatchObject({ kind: 'campfire' });
      expect(labels(s.room.seats)).toEqual(['a2']);
      expect(labels(s.room.moonlight ?? [])).toEqual(['a3', 'a4']);
      expect(coordLabel(s.room.exit!)).toBe('c4');
      expect(s.enemies).toEqual([]);
      expect(s.cards.hand).toHaveLength(5);
    });

    it('the mage wakes up on the sleeping mat (two tiles), which can be walked off and back onto', () => {
      const s = wake();
      expect(labels(s.room.mat!)).toEqual(['a1', 'b1']);
      expect(coordLabel(s.player.pos)).toBe('a1');
      const away = walkTo(s, 'c1');
      expect(coordLabel(away.player.pos)).toBe('c1');
      expect(coordLabel(walkTo(away, 'a1').player.pos)).toBe('a1');
    });

    it('actions and mana never run out, and the hand refills after a cast', () => {
      let s = wake();
      s.cards.hand = [...s.cards.hand.filter((c) => c.kind !== 'fire' && c.kind !== 'cross'), { id: 900, kind: 'fire' }, { id: 901, kind: 'cross' }];
      for (let i = 0; i < 5; i++) s = playerMeditate(s);
      s = playerCast(s, [900, 901], null);
      expect(s.phase).toBe('player');
      expect(s.actionsLeft).toBe(3);
      expect(s.player.mana).toBe(s.player.maxMana);
      expect(s.cards.hand).toHaveLength(5);
      expect(s.combos).toContain('fire+cross');
    });

    it('the campfire: Water or Earth puts it out, Fire lights it again, Wind does nothing', () => {
      let s = walkTo(wake(), 'b1');
      const castUp = (st: GameState, kinds: FragmentKind[]) => {
        const ids = kinds.map((_, i) => 950 + i);
        st.cards.hand = [...st.cards.hand, ...kinds.map((kind, i) => ({ id: ids[i], kind }))];
        return playerCast(st, ids, 'up');
      };
      expect(s.room.fireLit).not.toBe(false);
      s = castUp(s, ['wind', 'beam']);
      expect(s.room.fireLit).not.toBe(false);
      s = castUp(s, ['water', 'beam']);
      expect(s.room.fireLit).toBe(false);
      s = castUp(s, ['earth', 'beam']);
      expect(s.room.fireLit).toBe(false);
      s = castUp(s, ['fire', 'beam']);
      expect(s.room.fireLit).toBe(true);
      s = castUp(s, ['earth', 'beam']);
      expect(s.room.fireLit).toBe(false);
    });

    it('walk anywhere, and the door leads into the Cistern', () => {
      const s = walkTo(wake(), 'c4');
      expect(coordLabel(s.player.pos)).toBe('c4');
      const run = continueRun(s);
      expect(run.room.name).toBe('The Cistern');
      expect(run.stage).toBe(0);
      expect(restartStage(wake()).room.id).toBe('prologue');
    });
  });

  describe('the Whispering Lectern', () => {
    /** The event room, as if just arrived from the Cistern. */
    const arrive = () => restartStage({ ...board({ player: 'a1' }), stage: 1 });
    const walkTo = (s: GameState, coord: string) => (freeWalkPath(s, parseCoord(coord)) ?? []).reduce((st, p) => freeStep(st, p), s);
    const runes = (s: GameState) => [...s.cards.hand, ...s.cards.deck, ...s.cards.discard].filter((c) => c.kind === 'rune');

    it('is a 5×5 room with the lectern in the middle; the door stays locked until you reach it', () => {
      const s = arrive();
      expect(s.phase).toBe('event');
      expect([s.room.width, s.room.height]).toEqual([5, 5]);
      expect(coordLabel(s.player.pos)).toBe('a1');
      expect(coordLabel(s.room.feature!.pos)).toBe('c3');
      expect(exitOpen(s)).toBe(false);
      expect(freeWalkPath(s, parseCoord('e5'))).toBeNull();
      expect(eventError(s, 'take')).toMatch(/lectern first/);
      const there = walkTo(s, 'c2');
      expect(there.event).toEqual({ step: 'offer', said: null });
      expect(exitOpen(there)).toBe(true);
      expect(isWalkable(there, parseCoord('c3'))).toBe(false);
    });

    it('take a rune, then give it blood: a second, different rune for 2 HP', () => {
      const s = walkTo(arrive(), 'c2');
      const took = eventChoice(s, 'take');
      expect(runes(took)).toHaveLength(1);
      expect(took.event).toMatchObject({ step: 'blood', said: expect.stringMatching(/taste your blood/) });
      const fed = eventChoice(took, 'blood');
      expect(fed.player.hp).toBe(18);
      expect(new Set(runes(fed).map((c) => c.rune)).size).toBe(2);
      expect(fed.event).toMatchObject({ step: 'done', said: expect.stringMatching(/my favorite/) });
      // Out through the door to the Scriptorium.
      const out = continueRun(walkTo(fed, 'e5'));
      expect(out.room.name).toBe('The Scriptorium');
      expect(out.event).toBeNull();
    });

    it('take one and walk away, or leave it alone: no blood', () => {
      const s = walkTo(arrive(), 'c2');
      const away = eventChoice(eventChoice(s, 'take'), 'walk');
      expect([runes(away).length, away.player.hp, away.event?.step]).toEqual([1, 20, 'done']);
      const left = eventChoice(s, 'leave');
      expect([runes(left).length, left.event?.step]).toEqual([0, 'done']);
      expect(() => eventChoice(left, 'blood')).toThrow(/passed/);
    });

    it('the blood can kill', () => {
      const s = eventChoice(walkTo(arrive(), 'c2'), 'take');
      s.player.hp = 2;
      const dead = eventChoice(s, 'blood');
      expect(dead.phase).toBe('lost');
    });
  });

  describe('the camp', () => {
    const arrive = (setup: Parameters<typeof board>[0] = { player: 'a1' }) => restartStage({ ...board(setup), stage: 3 });
    const walkTo = (s: GameState, coord: string) => (freeWalkPath(s, parseCoord(coord)) ?? []).reduce((st, p) => freeStep(st, p), s);

    it('is a 5×5 room with a campfire and logs; the door opens once you reach the fire', () => {
      const s = arrive();
      expect(s.phase).toBe('camp');
      expect(s.room.feature).toMatchObject({ kind: 'campfire' });
      expect(labels(s.room.seats)).toEqual(['b3', 'c4', 'd3']);
      expect(exitOpen(s)).toBe(false);
      expect(campError(s, { kind: 'rest' })).toMatch(/fire first/);
      const there = walkTo(s, 'c2');
      expect(there.event?.step).toBe('offer');
      expect(exitOpen(there)).toBe(true);
      expect(isWalkable(there, parseCoord('b3'))).toBe(false);
    });

    it('rest heals to full, then out through the door to the Redactor', () => {
      const s = walkTo(arrive(), 'c2');
      s.player.hp = 5;
      const rested = campChoice(s, { kind: 'rest' });
      expect(rested.player.hp).toBe(20);
      expect(rested.event?.step).toBe('done');
      expect(() => campChoice(rested, { kind: 'rest' })).toThrow(/already/);
      expect(continueRun(walkTo(rested, 'e5')).room.name).toBe('The Redactor');
    });

    it('tear out a page, never one that breaks the grimoire', () => {
      const s = walkTo(arrive({ player: 'a1', hand: ['fire', 'beam', 'water'] }), 'c2');
      s.cards.deck = [];
      s.cards.discard = [];
      expect(campError(s, { kind: 'tear', cardId: s.cards.hand[1].id })).toMatch(/break/);
      const torn = campChoice(s, { kind: 'tear', cardId: s.cards.hand[2].id });
      expect(torn.cards.hand.map((c) => c.kind)).toEqual(['fire', 'beam']);
      expect(torn.event?.said).toMatch(/Water/);
    });
  });

  it('room data follows the design (holes, Earth ward)', () => {
    expect(ROOMS.map((r) => r.holes)).toEqual([['b4', 'e5'], ['c2', 'd5'], ['a5', 'h4']]);
    expect(ROOMS[2].enemies.find((e) => e.at === 'd4')?.element).toBe('earth');
    expect(createGame(1).cards.deck.length + createGame(1).cards.hand.length).toBe(14);
  });
});

describe('previews and determinism', () => {
  it('redactor next-turn actions follow wards and marks', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'redactor', at: 'e5' }] });
    const boss = () => s.enemies.find((e) => e.kind === 'redactor')!;
    expect(actionsNextTurn(s, boss())).toBe(2);
    s.enemies = s.enemies.filter((e) => e.kind !== 'ward');
    boss().marks = 1;
    expect(actionsNextTurn(s, boss())).toBe(4);
  });

  it('warden charge preview matches the turn it charges', () => {
    let s = board({ player: 'a1', pillars: ['b2'], enemies: [{ kind: 'warden', at: 'e3' }] });
    expect(wardenChargedNextTurn(s.enemies[0])).toBe(false);
    s = runEnemyTurn(s);
    expect(wardenChargedNextTurn(s.enemies[0])).toBe(true);
  });

  it('the intent preview matches what the enemies actually do', () => {
    const s = createGame(7);
    expect(previewIntents(s)).toEqual(planEnemyTurn(endPlayerTurn(s)).intents);
  });

  it('an archer that needs one step shows move, then shoot for 2', () => {
    expect(previewIntents(board({ player: 'a1', enemies: [{ kind: 'archer', at: 'b5' }] }))['2a']).toEqual([{ kind: 'move' }, { kind: 'shoot', value: 2 }]);
  });

  it('same state gives the same enemy turn (safe for undo/redo)', () => {
    const s = toEnemyTurn(createGame(7));
    const a = planEnemyTurn(s).final;
    const b = planEnemyTurn(s).final;
    expect(a.enemies).toEqual(b.enemies);
    expect(a.rng).toBe(b.rng);
  });
});

describe('spell effects (castFx)', () => {
  it('reports the real area: runes included, and which enemies can be touched', async () => {
    const s = board({ player: 'c1', enemies: [{ kind: 'brute', at: 'b2' }, { kind: 'ward', at: 'c2', element: 'fire' }] });
    giveRune(s, 'widen');
    const fx = castFx(s, idsFor(s, ['water', 'beam', 'rune']), 'up')!;
    expect(fx.kind).toBe('spell');
    expect(fx.area!.tiles).toHaveLength(6); // Widen's side lanes are part of the effect
    expect(fx.hits.map((h) => `${h.id}:${h.immune}`).sort()).toEqual(['3a:false', '6a:true']);
  });

  it('Backfire includes your own tile; Echo plays twice; a rune on a bad table only fizzles', async () => {
    const s = board({ player: 'a1', enemies: [dummy()] });
    giveRune(s, 'backfire');
    expect(castFx(s, idsFor(s, ['fire', 'beam', 'rune']), 'up')!.area!.self).not.toBeNull();
    const e = board({ player: 'a1', enemies: [dummy()] });
    giveRune(e, 'echo');
    expect(castFx(e, idsFor(e, ['fire', 'beam', 'rune']), 'up')!.passes).toBe(2);
    const f = board({ player: 'a1', enemies: [dummy()] });
    giveRune(f, 'echo');
    expect(castFx(f, idsFor(f, ['fire', 'water', 'rune']), null)).toMatchObject({ kind: 'fizzle', area: null });
    expect(castFx(f, idsFor(f, ['fire', 'water']), null)).toBeNull();
  });
});

describe('the door', () => {
  it('is locked until the room is cleared: the mage can’t step on it, monsters can', () => {
    const s = board({ player: 'e6', exit: 'f6', enemies: [{ kind: 'rat', at: 'a1' }] });
    expect(() => playerMove(s, 'right')).toThrow(/locked/);
    const r = board({ player: 'a1', exit: 'a3', enemies: [{ kind: 'rat', at: 'a4' }] });
    expect(at(runEnemyTurn(r), '1a')).toBe('a2'); // walked over the door to reach you
  });

  it('a push into the locked door stops the mage like the wall', () => {
    const s = board({ player: 'a2', exit: 'a1', enemies: [{ kind: 'archer', at: 'a6' }] });
    const after = runEnemyTurn(s);
    expect(coordLabel(after.player.pos)).toBe('a2');
    expect(after.player.hp).toBe(17);
  });

  it('once cleared it opens, and Continue needs you standing on it', () => {
    let s = board({ player: 'e5', exit: 'f6', enemies: [{ kind: 'rat', at: 'e4' }] });
    s.enemies[0].hp = 1;
    s = cast(s, ['fire', 'beam'], 'down');
    expect(s.phase).toBe('cleared');
    expect(() => continueRun(s)).toThrow(/door/);
    const path = freeWalkPath(s, parseCoord('f6'))!;
    for (const p of path) s = freeStep(s, p);
    expect(continueRun(s).phase).toBe('event');
  });

  it('every room but the boss room has a door; the Cistern’s is open from the start', () => {
    expect(ROOMS.map((r) => r.exit)).toEqual(['f6', 'f6', null]);
    expect(ROOMS.map((r) => !!r.exitAlwaysOpen)).toEqual([true, false, false]);
    expect(createGame(1).room.exitAlwaysOpen).toBe(true);
  });

  it('through an always-open door you may leave mid-fight; the survivors’ drops are lost', () => {
    let s = board({ player: 'e6', exit: 'f6', exitAlwaysOpen: true, enemies: [{ kind: 'rat', at: 'a1' }] });
    s = playerMove(s, 'right');
    const after = continueRun(s);
    expect(after.phase).toBe('event');
    expect(after.log.some((l) => /Left behind alive: Rat 1a/.test(l.text))).toBe(true);
    // A locked door never lets you out early.
    const locked = board({ player: 'f5', exit: 'f6', enemies: [{ kind: 'rat', at: 'a1' }] });
    expect(() => continueRun(locked)).toThrow(/cleared/);
  });
});
