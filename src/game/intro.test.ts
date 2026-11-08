import { describe, expect, it } from 'vitest';
import { coordLabel, createGame, playerCast, type GameState } from '../engine';
import { INTRO_PLACES } from '../config/introScript';
import { introCistern, introRoom0, tutorialCardIds, tutorialState, withInHand } from './intro';

const room0 = () => createGame(7, { prologue: true });
const kinds = (s: GameState) => s.cards.hand.map((c) => c.kind);
const allCards = (s: GameState) => [...s.cards.hand, ...s.cards.deck, ...s.cards.discard].map((c) => c.id).sort((a, b) => a - b);

describe('the opening cutscene', () => {
  it('room 0 starts empty (no fire, rock or mat), with the grimoire fragment on the floor', () => {
    const s = introRoom0(room0(), { camp: false });
    expect(s.room.feature).toBeNull();
    expect(s.room.seats).toEqual([]);
    expect(s.room.mat).toEqual([]);
    expect(s.room.drops.map((d) => coordLabel(d.pos))).toEqual([INTRO_PLACES.item]);
    expect(coordLabel(s.player.pos)).toBe(INTRO_PLACES.fall);
  });

  it('after the blackout the campfire (out) and the mat are there', () => {
    const s = introRoom0(room0(), { camp: true });
    expect(s.room.feature?.kind).toBe('campfire');
    expect(s.room.fireLit).toBe(false);
    expect(s.room.mat?.length).toBe(2);
    expect(introRoom0(room0(), { camp: true, itemTaken: true }).room.drops).toEqual([]);
  });

  it('the Cistern has just the one brute', () => {
    const s = introCistern(room0());
    expect(s.room.id).toBe('cistern');
    expect(s.enemies.map((e) => [e.kind, coordLabel(e.pos)])).toEqual([['brute', INTRO_PLACES.bruteFrom]]);
  });
});

describe('the tutorial', () => {
  it('puts Fire and Beam in hand without losing or copying any card', () => {
    const base = room0();
    const s = tutorialState(base);
    expect(kinds(s)).toContain('fire');
    expect(kinds(s)).toContain('beam');
    expect(s.cards.hand).toHaveLength(base.cards.hand.length);
    expect(allCards(s)).toEqual(allCards(base));
    expect(s.room.fireLit).toBe(false);
    expect(coordLabel(s.player.pos)).toBe(INTRO_PLACES.atFire);
    // The original isn't touched.
    expect(base.room.fireLit).not.toBe(false);
  });

  it('keeps a hand that already has them as it is', () => {
    const s = withInHand(room0(), ['fire', 'beam']);
    expect(withInHand(s, ['fire', 'beam']).cards.hand.map((c) => c.id)).toEqual(s.cards.hand.map((c) => c.id));
  });

  it('a Fire Beam aimed at the campfire lights it; aimed away it does not', () => {
    const s = tutorialState(room0());
    const ids = tutorialCardIds(s);
    expect(ids).toHaveLength(2);
    // The mage stands at b1 with the fire at b2: up the board.
    expect(playerCast(s, ids, 'up').room.fireLit).toBe(true);
    expect(playerCast(s, ids, 'right').room.fireLit).toBe(false);
  });
});
