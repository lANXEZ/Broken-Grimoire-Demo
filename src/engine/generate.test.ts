import { describe, expect, it } from 'vitest';
import { ENDLESS, ROOMS, parseCoord } from './data';
import { endlessSize, floorConnected, generateRoom, holeCap, roomHardness, wardenMax } from './generate';

/** Every hardness a run will plausibly see (and a bit past it), each with many seeds. */
const HARDNESS = Array.from({ length: 17 }, (_, i) => ENDLESS.startHardness + i * ENDLESS.hardnessStep); // 12 … 60
const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 13);
const reach = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('endless room generator', () => {
  it('prices the hand-made rooms sensibly (Cistern < Scriptorium < Redactor)', () => {
    const [cistern, scriptorium, redactor] = ROOMS.map(roomHardness);
    expect(cistern).toBe(12);
    expect(scriptorium).toBe(19);
    expect(redactor).toBe(22);
  });

  it('gives the same room for the same seed and hardness', () => {
    expect(generateRoom(1234, 21)).toEqual(generateRoom(1234, 21));
    expect(generateRoom(1234, 21)).not.toEqual(generateRoom(1235, 21));
  });

  it('follows every rule over thousands of rooms', () => {
    for (const h of HARDNESS) {
      const size = endlessSize(h);
      for (const seed of SEEDS) {
        const r = generateRoom(seed, h);
        const at = `seed ${seed}, hardness ${h}`;
        // The budget is spent exactly.
        expect(roomHardness(r), at).toBe(h);
        // Size and monster limit follow the hardness.
        expect(r.width, at).toBe(size.size);
        expect(r.height, at).toBe(size.size);
        expect(r.enemies.length, at).toBeLessThanOrEqual(size.monsters);
        expect(r.exit, at).toBeNull();
        // Holes: about a fifth of the budget (a leftover point or two may add to it), never cutting the floor in two.
        expect(r.holes.length, at).toBeGreaterThanOrEqual(ENDLESS.holesMin);
        expect(r.holes.length, at).toBeLessThanOrEqual(holeCap(h) + 2);
        expect(floorConnected(r.width, r.height, r.holes.map(parseCoord)), at).toBe(true);
        // Unlocks and caps.
        for (const e of r.enemies) {
          if (e.kind === 'ward' || e.kind === 'redactor') expect(h, at).toBeGreaterThanOrEqual(ENDLESS.redactorUnlock);
          else expect(h, at).toBeGreaterThanOrEqual(ENDLESS.unlock[e.kind] ?? 0);
        }
        expect(r.enemies.filter((e) => e.kind === 'warden').length, at).toBeLessThanOrEqual(wardenMax(h));
        expect(r.enemies.filter((e) => e.kind === 'redactor').length, at).toBeLessThanOrEqual(1);
        const wards = r.enemies.filter((e) => e.kind === 'ward');
        expect(wards.length, at).toBe(r.enemies.some((e) => e.kind === 'redactor') ? 3 : 0);
        expect(new Set(wards.map((w) => w.element)).size, at).toBe(wards.length);
        // A fair start: no monster close, no hole or pillar right next to the mage, and nothing on top of anything.
        const start = parseCoord(r.start);
        for (const e of r.enemies) expect(reach(parseCoord(e.at), start), at).toBeGreaterThan(ENDLESS.safeRadius);
        for (const c of [...r.holes, ...r.pillars]) expect(reach(parseCoord(c), start), at).toBeGreaterThan(1);
        const tiles = [r.start, ...r.holes, ...r.pillars, ...r.enemies.map((e) => e.at)];
        expect(new Set(tiles).size, at).toBe(tiles.length);
        for (const c of tiles) {
          const p = parseCoord(c);
          expect(p.x >= 0 && p.y >= 0 && p.x < r.width && p.y < r.height, at).toBe(true);
        }
      }
    }
  });

  it('gets harder: bigger rooms, more monsters, tougher kinds', () => {
    const avg = (h: number, f: (r: ReturnType<typeof generateRoom>) => number) =>
      SEEDS.reduce((sum, s) => sum + f(generateRoom(s, h)), 0) / SEEDS.length;
    expect(avg(12, (r) => r.width)).toBe(6);
    expect(avg(21, (r) => r.width)).toBe(7);
    expect(avg(30, (r) => r.width)).toBe(8);
    expect(avg(21, (r) => r.enemies.length)).toBeGreaterThan(avg(12, (r) => r.enemies.length));
    // Wardens never before 15; the Redactor's team only from 24, and it does show up sometimes.
    expect(SEEDS.some((s) => generateRoom(s, 12).enemies.some((e) => e.kind === 'warden'))).toBe(false);
    expect(SEEDS.some((s) => generateRoom(s, 15).enemies.some((e) => e.kind === 'warden'))).toBe(true);
    expect(SEEDS.some((s) => generateRoom(s, 21).enemies.some((e) => e.kind === 'redactor'))).toBe(false);
    expect(SEEDS.some((s) => generateRoom(s, 27).enemies.some((e) => e.kind === 'redactor'))).toBe(true);
  });
});
