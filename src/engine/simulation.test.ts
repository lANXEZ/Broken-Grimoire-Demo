import { describe, expect, it } from 'vitest';
import {
  continueRun,
  coordLabel,
  createGame,
  devRemoveEnemy,
  endPlayerTurn,
  parseCoord,
  planEnemyTurn,
  playerCast,
  playerReroll,
  previewIntents,
  type CardState,
  type GameState,
} from './index';
import { board, cast, castErr, dummy, kinds, runEnemyTurn } from './testkit';

const total = (c: CardState) => c.hand.length + c.deck.length + c.discard.length;

describe('cards', () => {
  it('shuffles the 14-card starting deck and deals a hand of 5', () => {
    const s = createGame(3);
    expect(s.cards.hand).toHaveLength(5);
    expect(kinds([...s.cards.hand, ...s.cards.deck])).toEqual(
      ['beam', 'beam', 'cross', 'cross', 'earth', 'earth', 'fire', 'fire', 'fire', 'wall', 'water', 'water', 'wind', 'wind'].sort(),
    );
  });

  it('the same seed deals the same hand and the same rune mapping', () => {
    expect(createGame(9).cards.hand).toEqual(createGame(9).cards.hand);
    expect(createGame(9).runeMap).toEqual(createGame(9).runeMap);
    expect(new Set(createGame(9).runeMap).size).toBe(8);
  });

  it('casting moves the cards used from the hand to the discard pile', () => {
    let s = board({ player: 'a1', hand: ['fire', 'beam', 'water', 'earth', 'cross'], enemies: [{ kind: 'brute', at: 'a3' }] });
    s = cast(s, ['fire', 'beam'], 'up');
    expect(kinds(s.cards.hand)).toEqual(['cross', 'earth', 'water']);
    expect(kinds(s.cards.discard)).toEqual(['beam', 'fire']);
    expect(s.enemies[0].hp).toBe(5);
  });

  it('casts only cards in hand, and only tables that make something', () => {
    const s = board({ player: 'a1', hand: ['fire', 'water', 'earth', 'cross', 'cross'] });
    expect(() => playerCast(s, [999], null)).toThrow(/not in your hand/);
    expect(castErr(s, ['fire', 'earth'])).toMatch(/shape/);
    expect(castErr(s, ['fire', 'water', 'earth'])).toMatch(/shape/);
  });

  it('needs the mana and a direction for Beam and Wall', () => {
    const s = board({ player: 'a1', mana: 1, hand: ['fire', 'beam', 'wall'] });
    expect(castErr(s, ['fire', 'beam'], 'up')).toMatch(/Needs 2 mana/);
    s.player.mana = 6;
    expect(castErr(s, ['fire', 'wall'])).toMatch(/direction/);
  });
});

describe('drawing', () => {
  it('reroll swaps only the picked cards: discard them, draw that many', () => {
    const s = board({ player: 'a1', hand: ['fire', 'beam', 'water', 'earth', 'cross'], enemies: [dummy()] });
    const [f, b, w, r, c] = s.cards.hand;
    const deckBefore = s.cards.deck.length;
    const after = playerReroll(s, [f.id, b.id]);
    expect(kinds(after.cards.discard)).toEqual(['beam', 'fire']);
    expect(after.cards.hand.slice(0, 3).map((x) => x.id)).toEqual([w.id, r.id, c.id]);
    expect(after.cards.deck).toHaveLength(deckBefore - 2);
    expect(after.actionsLeft).toBe(2);
  });

  it('reroll needs at least one card from your hand', () => {
    const s = board({ player: 'a1', hand: ['fire', 'beam'] });
    expect(() => playerReroll(s)).toThrow(/Pick the cards/);
    expect(() => playerReroll(s, [999])).toThrow(/not in your hand/);
  });

  it('the start of your turn draws back up to 5', () => {
    let s = board({ player: 'a1', hand: ['fire', 'beam', 'water', 'earth', 'cross'], enemies: [{ kind: 'brute', at: 'f6' }] });
    s = cast(s, ['fire', 'beam'], 'up');
    s = runEnemyTurn(s);
    expect(s.cards.hand).toHaveLength(5);
    expect(total(s.cards)).toBe(14);
  });

  it('shuffles the discard pile into a new deck when the deck runs out', () => {
    const s = board({ player: 'a1', hand: ['fire', 'beam', 'water'] });
    s.cards.discard = s.cards.deck.splice(0, s.cards.deck.length - 1);
    const after = playerReroll(s, s.cards.hand.map((c) => c.id));
    expect(after.cards.hand).toHaveLength(3);
    expect(total(after.cards)).toBe(14);
    expect(after.log.some((l) => l.text.includes('discard pile is shuffled into a new deck'))).toBe(true);
  });
});

describe('rooms', () => {
  it('a new room shuffles hand, deck and discard back together and deals 5', () => {
    let s: GameState = { ...board({ player: 'a1', hand: ['fire', 'beam', 'water'] }), phase: 'cleared', stage: 2 };
    s.cards.discard.push({ id: 99, kind: 'earth', loot: 'brute' });
    s = continueRun(s); // stage 3 is the camp
    expect(s.phase).toBe('camp');
    s = { ...s, phase: 'cleared', stage: 1, player: { ...s.player, pos: s.room.exit! } };
    s = continueRun(s);
    expect(s.room.name).toBe('The Scriptorium');
    expect(s.cards.hand).toHaveLength(5);
    expect(s.cards.discard).toHaveLength(0);
    expect(total(s.cards)).toBe(15);
  });
});

describe('page scraps and erasure', () => {
  const bossRoom = (hand: Parameters<typeof board>[0]['hand']) =>
    board({
      size: 8,
      player: 'a1',
      hand,
      enemies: [
        { kind: 'ward', at: 'h8', element: 'fire' },
        { kind: 'scrap', at: 'a2' },
        { kind: 'redactor', at: 'c3' },
      ],
    });

  it('a scrap steals a real card from the hand, and killing it leaves the card on the floor', () => {
    const s = bossRoom(['fire', 'beam', 'water', 'earth', 'cross']);
    const plan = planEnemyTurn(endPlayerTurn(s));
    const stealStep = plan.steps.find((st) => st.entries.some((l) => l.text.includes('steals your')))!;
    expect(stealStep.state.cards.hand).toHaveLength(4);
    const scrap = plan.final.enemies.find((e) => e.kind === 'scrap')!;
    expect(scrap.carried).toHaveLength(1);
    const after = devRemoveEnemy(plan.final, scrap.id, true);
    expect(after.room.drops[0].cards).toEqual(scrap.carried);
  });

  it('with an empty hand there is nothing to steal', () => {
    const s = bossRoom([]);
    s.cards.deck = [];
    const plan = planEnemyTurn(endPlayerTurn(s));
    expect(plan.intents['7a']).toEqual([{ kind: 'wait', note: 'finds your hand empty: nothing to steal.' }]);
  });

  it('ending your turn in the Erasure Zone erases a hand card for good (or the top of the deck)', () => {
    const s = board({ size: 8, player: 'a1', hand: ['fire', 'beam', 'water'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.erasureZone = [parseCoord('a1')];
    const after = endPlayerTurn(s);
    expect(after.cards.hand).toHaveLength(2);
    expect(after.cards.erased).toHaveLength(1);

    const empty = board({ size: 8, player: 'a1', hand: [], enemies: [{ kind: 'redactor', at: 'h8' }] });
    empty.erasureZone = [parseCoord('a1')];
    const top = empty.cards.deck[empty.cards.deck.length - 1];
    expect(endPlayerTurn(empty).cards.erased).toEqual([top]);
  });

  it('you lose when hand, deck and discard no longer hold an element and a shape; runes don’t count', () => {
    const s = board({ size: 8, player: 'a1', hand: ['fire', 'beam'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.cards.deck = [{ id: 500, kind: 'rune', rune: 0 }];
    s.cards.discard = [];
    s.cards.hand = [s.cards.hand[0]];
    s.erasureZone = [parseCoord('a1')];
    const after = endPlayerTurn(s);
    expect(after.phase).toBe('lost');
    expect(after.lostReason).toBe('grimoire');
  });

  it('three Fire cards are still a usable grimoire', () => {
    const s = board({ size: 8, player: 'a1', hand: ['fire', 'fire', 'fire', 'beam'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.cards.deck = [];
    s.erasureZone = [parseCoord('a1')];
    expect(endPlayerTurn(s).phase).not.toBe('lost');
  });
});

describe('determinism', () => {
  it('the intent preview matches the real enemy turn, cards included', () => {
    const s = createGame(11);
    expect(previewIntents(s)).toEqual(planEnemyTurn(endPlayerTurn(s)).intents);
    const a = runEnemyTurn(s);
    const b = runEnemyTurn(s);
    expect(a.cards).toEqual(b.cards);
    expect(a.enemies.map((e) => coordLabel(e.pos))).toEqual(b.enemies.map((e) => coordLabel(e.pos)));
  });
});
