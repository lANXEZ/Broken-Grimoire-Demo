import { describe, expect, it } from 'vitest';
import {
  CAMP_ROOM,
  ENDLESS,
  campChoice,
  campError,
  campRestHeal,
  continueRun,
  createGame,
  devEdit,
  devEndlessRoom,
  enterEndless,
  killEnemy,
  ownedCards,
  parseCoord,
  restartStage,
  roomHardness,
  spawnEnemy,
  type GameState,
} from './index';

/** Kill every monster (as the dev Clear room does), which clears the room. */
const clear = (s: GameState) => devEdit(s, 'clear', (d) => [...d.enemies].forEach((e) => killEnemy(d, e)));
/** At the camp, skip the walk to the fire. */
const atFire = (s: GameState): GameState => ({ ...s, event: { step: 'offer', said: null } });
/** The current room as the generator saw it (for its hardness). */
const def = (s: GameState) => ({
  holes: s.room.holes.map(() => 'a1'),
  enemies: s.enemies.map((e) => ({ kind: e.kind, at: 'a1' })),
});

describe('endless mode', () => {
  it('starts with full HP, keeps the deck and the Grimoire, and builds a hardness-12 room', () => {
    const s = createGame(5);
    s.player.hp = 4;
    s.grimoire = ['fire-beam'];
    const deck = ownedCards(s.cards).length;
    const e = enterEndless(s);
    expect(e.player.hp).toBe(e.player.maxHp);
    expect(ownedCards(e.cards).length).toBe(deck);
    expect(e.grimoire).toEqual(['fire-beam']);
    expect(e.endless).toMatchObject({ hardness: ENDLESS.startHardness, cleared: 0 });
    expect(e.phase).toBe('player');
    expect(e.room.exit).toBeNull();
    expect(e.room.name).toBe('Endless room 1');
    expect(roomHardness({ ...def(e), id: '', name: '', blurb: '', width: 0, height: 0, pillars: [], exit: null, start: 'a1' })).toBe(12);
  });

  it('is the same room for the same run', () => {
    expect(enterEndless(createGame(9)).room).toEqual(enterEndless(createGame(9)).room);
  });

  it('goes fight -> camp -> a harder fight, and only once the room is cleared', () => {
    const s = enterEndless(createGame(5));
    expect(() => continueRun(s)).toThrow(/Kill every monster/);
    const camp = continueRun(clear(s));
    expect(camp.phase).toBe('camp');
    expect(camp.room.name).toBe(CAMP_ROOM.name);
    expect(camp.roomIndex).not.toBe(s.roomIndex);
    expect(() => continueRun(camp)).toThrow(/fire/);
    const next = continueRun(campChoice(atFire(camp), { kind: 'rest' }));
    expect(next.phase).toBe('player');
    expect(next.endless).toMatchObject({ cleared: 1, hardness: ENDLESS.startHardness + ENDLESS.hardnessStep });
    expect(next.endless!.roomSeed).not.toBe(s.endless!.roomSeed);
    expect(next.room.name).toBe('Endless room 2');
    expect(next.roomIndex).toBeGreaterThan(camp.roomIndex);
    // And again: 12, 15, 18.
    const third = continueRun(campChoice(atFire(continueRun(clear(next))), { kind: 'rest' }));
    expect(third.endless!.hardness).toBe(18);
  });

  it('the endless camp heals 70% of the missing HP, rounded up', () => {
    const camp = atFire(continueRun(clear(enterEndless(createGame(5)))));
    camp.player.hp = 10;
    expect(campRestHeal(camp)).toBe(7);
    expect(campChoice(camp, { kind: 'rest' }).player.hp).toBe(17);
    camp.player.hp = 19;
    expect(campChoice(camp, { kind: 'rest' }).player.hp).toBe(20);
  });

  it('the endless camp tears out up to 4 pages', () => {
    const camp = atFire(continueRun(clear(enterEndless(createGame(5)))));
    const owned = ownedCards(camp.cards);
    const ids = owned.slice(0, 5).map((c) => c.id);
    expect(campError(camp, { kind: 'tear', cardIds: ids })).toMatch(/at most 4/);
    expect(campError(camp, { kind: 'tear', cardIds: [] })).toMatch(/Pick/);
    const torn = campChoice(camp, { kind: 'tear', cardIds: ids.slice(0, 4) });
    expect(ownedCards(torn.cards).length).toBe(owned.length - 4);
    expect(torn.event?.said).toMatch(/4 pages/);
    const one = campChoice(camp, { kind: 'tear', cardIds: ids.slice(0, 1) });
    expect(ownedCards(one.cards).length).toBe(owned.length - 1);
  });

  it('killing the Redactor in endless mode is a normal kill, not a win', () => {
    const s = devEdit(enterEndless(createGame(5)), 'boss', (d) => {
      d.enemies = [];
      spawnEnemy(d, 'redactor', parseCoord('d4'));
    });
    const after = clear(s);
    expect(after.phase).toBe('cleared');
  });

  it('saves and reloads: an old save has no endless; restarting an endless room keeps endless', () => {
    const old = JSON.parse(JSON.stringify(createGame(5)));
    delete old.endless;
    expect(old.endless ?? null).toBeNull();
    const s = enterEndless(createGame(5));
    const again = restartStage(JSON.parse(JSON.stringify(s)));
    expect(again.endless).toEqual(s.endless);
    expect(again.room).toEqual(s.room);
  });

  it('dev: reroll keeps the hardness with a new room; hardness +3 regenerates', () => {
    const s = enterEndless(createGame(5));
    const rerolled = devEdit(s, 'reroll', (d) => devEndlessRoom(d, 0, true));
    expect(rerolled.endless!.hardness).toBe(12);
    expect(rerolled.endless!.roomSeed).not.toBe(s.endless!.roomSeed);
    const harder = devEdit(s, 'harder', (d) => devEndlessRoom(d, 3, false));
    expect(harder.endless).toMatchObject({ hardness: 15, roomSeed: s.endless!.roomSeed });
  });
});
