import { describe, expect, it } from 'vitest';
import { createGame, parseCoord, type Card, type FragmentKind, type GameState } from '../engine';
import { aimDirection, cleanTable, placeOnTable, previewCast, removeFromTable, tableCards } from './casting';

let nextId = 1000;
const card = (kind: FragmentKind): Card => ({ id: nextId++, kind });

/** A fresh game with the mage in the middle of an empty 6×6 room. */
function open(mana = 6): GameState {
  const s = createGame(1);
  s.enemies = [];
  s.room.pillars = [];
  s.player.pos = parseCoord('c3');
  s.player.mana = mana;
  return s;
}

describe('crafting table', () => {
  it('guides the player until the cards make a spell', () => {
    const s = open();
    expect(previewCast(s, []).status).toBe('empty');
    expect(previewCast(s, [card('fire')]).message).toMatch(/shape/);
    expect(previewCast(s, [card('beam')]).message).toMatch(/element/);
    expect(previewCast(s, [card('fire'), card('water')]).status).toBe('invalid');
  });

  it('a valid Cross is ready, needs no aim, and previews its tiles', () => {
    const s = open();
    const cards = [card('earth'), card('cross')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.status).toBe('ready');
    expect(p.needsAim).toBe(false);
    expect(p.cost).toBe(2);
    expect(p.tiles).toHaveLength(4);
  });

  it('a Beam or a Wall needs aiming and previews all four directions', () => {
    const s = open();
    const cards = [card('water'), card('beam'), card('beam')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.status).toBe('ready');
    expect(p.needsAim).toBe(true);
    expect(p.cost).toBe(4);
    expect(p.aimTiles!.up).toHaveLength(3); // c4, c5, c6: the board edge stops a 4-tile beam
    const wall = [card('wind'), card('wall')];
    s.cards.hand = wall;
    expect(previewCast(s, wall).aimTiles!.up).toHaveLength(3);
  });

  it('the Cast button stays dark without enough mana', () => {
    const s = open(1);
    const cards = [card('fire'), card('beam')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.status).toBe('blocked');
    expect(p.message).toMatch(/mana/);
  });

  it('three Fires make Unstable Fire', () => {
    const s = open();
    const cards = [card('fire'), card('fire'), card('fire')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.title).toBe('Unstable Fire');
    expect(p.status).toBe('ready');
    expect(p.tiles).toHaveLength(8);
  });

  it('four or more fragments never light up Cast', () => {
    const s = open();
    const cards = [card('fire'), card('fire'), card('beam'), card('beam')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.status).toBe('invalid');
    expect(p.message).toMatch(/Too many/);
  });

  it('two elements + a shape preview a merge in the hazard colour', () => {
    const s = open();
    const cards = [card('fire'), card('earth'), card('cross')];
    s.cards.hand = cards;
    const p = previewCast(s, cards);
    expect(p.title).toBe('Magma Cross');
    expect(p.message).toMatch(/Magma/);
    expect(p.cost).toBe(3);
  });

  it('a rune keeps Cast lit even on a table that makes nothing, and never changes the preview', () => {
    const s = open();
    const rune: Card = { id: nextId++, kind: 'rune', rune: s.runeMap.indexOf('amplify') };
    const odd = [card('fire'), card('water'), rune];
    s.cards.hand = odd;
    expect(previewCast(s, odd).status).toBe('ready');
    const beam = [card('fire'), card('beam'), rune];
    s.cards.hand = beam;
    const p = previewCast(s, beam);
    expect(p.cost).toBe(3);
    expect(p.aimTiles!.up).toHaveLength(2); // the rune never changes the aim
  });

  it('the table forgets cards that left the hand and keeps the pile order', () => {
    const [a, b] = [card('fire'), card('beam')];
    const at = (id: number) => ({ id, x: 0.5, y: 0.5, tilt: 0 });
    const table = [at(a.id), at(b.id)];
    expect(cleanTable([a, b], table)).toBe(table);
    expect(cleanTable([a], table)).toEqual([at(a.id)]);
    expect(tableCards([a, b], [at(b.id), at(a.id)])).toEqual([b, a]);
  });

  it('cards stay where they are dropped, and a moved card goes on top', () => {
    let table = placeOnTable([], { id: 1, x: 0.2, y: 0.3, tilt: 4 });
    table = placeOnTable(table, { id: 2, x: 0.7, y: 0.6, tilt: -6 });
    table = placeOnTable(table, { id: 1, x: 0.9, y: 0.4, tilt: 4 });
    expect(table).toEqual([
      { id: 2, x: 0.7, y: 0.6, tilt: -6 },
      { id: 1, x: 0.9, y: 0.4, tilt: 4 },
    ]);
    expect(removeFromTable(table, 2)).toEqual([{ id: 1, x: 0.9, y: 0.4, tilt: 4 }]);
  });
});

describe('beam aiming', () => {
  const from = { x: 2, y: 2 };
  it('follows the stronger axis, and keeps the last direction on a diagonal', () => {
    expect(aimDirection(from, { x: 5, y: 3 }, null)).toBe('right');
    expect(aimDirection(from, { x: 2, y: 0 }, null)).toBe('down');
    expect(aimDirection(from, { x: 4, y: 4 }, 'up')).toBe('up');
    expect(aimDirection(from, null, 'left')).toBe('left');
  });
});
