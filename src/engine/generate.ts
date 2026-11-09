/**
 * Endless mode's room generator (PCG). `generateRoom(seed, hardness)` builds a room in the same shape as the
 * hand-made ones (`RoomDef`, data.ts), so the game loads it the same way. The same seed and hardness always give
 * the same room.
 *
 * HARDNESS is a budget: holes and monsters each cost points (ENDLESS in data.ts), and the generator adds them until
 * the total equals the hardness exactly. Pillars are free cover. Rules (tested in generate.test.ts):
 * - the room's size, its monster limit and which monsters may show up all follow the hardness;
 * - holes take about a fifth of the budget, never cut the floor in two (loot must always be reachable), and never
 *   sit next to the mage's start (an Archer could push the mage in on turn 1);
 * - no monster starts within ENDLESS.safeRadius tiles of the mage;
 * - monsters need NOT be reachable on foot: spells reach over holes, and pillars can be broken.
 */
import { ENDLESS, ENEMY_DEFS, coordLabel, type RoomDef } from './data';
import type { Element, EnemyKind, Pos } from './types';

/** A monster in the budget: one kind, or the Redactor's whole team (the Redactor and its 3 Page Wards). */
export type EndlessPick = EnemyKind | 'redactorTeam';

/** What a room is made of before it's laid out: how many holes, and the monsters in deploy order. */
export interface EndlessContents {
  holes: number;
  monsters: EndlessPick[];
}

/** Seeded PRNG (mulberry32): the same seed gives the same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The room size row (size, monster limit, pillar range) for a hardness. */
export function endlessSize(hardness: number) {
  return ENDLESS.sizes.find((s) => hardness <= s.upTo) ?? ENDLESS.sizes[ENDLESS.sizes.length - 1];
}

/** Most Wardens allowed in one room at this hardness. */
export function wardenMax(hardness: number): number {
  let max = 0;
  for (const w of ENDLESS.wardenMax) if (hardness >= w.from) max = w.max;
  return max;
}

/** Most holes in a room at this hardness (before any leftover point). */
export function holeCap(hardness: number): number {
  return Math.max(ENDLESS.holesMin, Math.min(ENDLESS.holesMax, Math.round(hardness * ENDLESS.holeShare)));
}

/** What a monster pick costs. */
export function pickCost(p: EndlessPick): number {
  return p === 'redactorTeam' ? ENDLESS.redactorTeam : (ENDLESS.cost[p] ?? 0);
}

/** How many units a pick puts on the board. */
const pickUnits = (p: EndlessPick) => (p === 'redactorTeam' ? 4 : 1);

/** The hardness a room adds up to: its holes and monsters (the Wards come with the Redactor; Scraps are free). */
export function roomHardness(def: RoomDef): number {
  let total = def.holes.length * ENDLESS.holeCost;
  for (const e of def.enemies) {
    if (e.kind === 'redactor') total += ENDLESS.redactorTeam;
    else total += ENDLESS.cost[e.kind] ?? 0;
  }
  return total;
}

/** The most points `slots` more monster places could still hold (Wardens and the Redactor's team are the dearest). */
function capacity(slots: number, wardensLeft: number, redactorOk: boolean): number {
  const plain = (n: number) => {
    const w = Math.min(wardensLeft, n);
    return w * (ENDLESS.cost.warden ?? 0) + (n - w) * Math.max(ENDLESS.cost.brute ?? 0, ENDLESS.cost.archer ?? 0);
  };
  const team = pickUnits('redactorTeam');
  return Math.max(plain(slots), redactorOk && slots >= team ? ENDLESS.redactorTeam + plain(slots - team) : 0);
}

/** Choose a room's contents for a hardness: holes first, then monsters, then any leftover point as a hole. */
export function rollContents(rand: () => number, hardness: number): EndlessContents {
  const size = endlessSize(hardness);
  const cap = Math.min(holeCap(hardness), Math.max(0, hardness));
  let holes = Math.min(cap, ENDLESS.holesMin + Math.floor(rand() * (cap - ENDLESS.holesMin + 1)));
  let left = hardness - holes * ENDLESS.holeCost;
  const monsters: EndlessPick[] = [];
  let units = 0;

  while (left > 0) {
    const slots = size.monsters - units;
    const options: { pick: EndlessPick; w: number }[] = [];
    for (const [kind, cost] of Object.entries(ENDLESS.cost) as [EnemyKind, number][]) {
      if (cost > left || slots < 1) continue;
      if (hardness < (ENDLESS.unlock[kind] ?? -Infinity)) continue;
      if (kind === 'warden' && monsters.filter((m) => m === 'warden').length >= wardenMax(hardness)) continue;
      options.push({ pick: kind, w: ENDLESS.weight[kind] ?? 1 });
    }
    if (
      hardness >= ENDLESS.redactorUnlock &&
      ENDLESS.redactorTeam <= left &&
      slots >= pickUnits('redactorTeam') &&
      !monsters.includes('redactorTeam')
    ) {
      options.push({ pick: 'redactorTeam', w: ENDLESS.redactorWeight });
    }
    if (!options.length) break;
    // Keep only picks that leave a budget the remaining places can still hold, so the room doesn't fill up with
    // cheap monsters and strand the rest of the budget.
    const wardens = monsters.filter((m) => m === 'warden').length;
    const holeSlack = ENDLESS.holesMax + 2 - holes; // leftover points can still become a couple of extra holes
    const fits = options.filter((o) => {
      const after = slots - pickUnits(o.pick);
      const redactorOk = hardness >= ENDLESS.redactorUnlock && o.pick !== 'redactorTeam' && !monsters.includes('redactorTeam');
      const wardensLeft = wardenMax(hardness) - wardens - (o.pick === 'warden' ? 1 : 0);
      return left - pickCost(o.pick) <= capacity(after, wardensLeft, redactorOk) + holeSlack;
    });
    if (fits.length) options.splice(0, options.length, ...fits);
    // Running out of room for monsters: lean on the expensive ones so the budget still gets spent.
    const perSlot = left / Math.max(1, slots);
    const weights = options.map((o) => {
      const c = pickCost(o.pick);
      return o.w * (monsters.includes(o.pick) ? 1 : ENDLESS.newKindBonus) * (perSlot > 3 ? (c * c) / 4 : 1);
    });
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < options.length - 1 && r >= weights[i]) r -= weights[i++];
    const pick = options[i].pick;
    monsters.push(pick);
    left -= pickCost(pick);
    units += pickUnits(pick);
  }

  // A leftover point (nothing costs 1 but a hole), or a full room: the rest as holes, within reason.
  const extra = Math.min(left, ENDLESS.holesMax + 2 - holes);
  if (extra > 0) holes += extra;
  return { holes, monsters };
}

const key = (p: Pos) => `${p.x},${p.y}`;
const reach = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Are all tiles that aren't holes joined up (walking up, down, left, right; pillars count as floor: they break)? */
export function floorConnected(width: number, height: number, holes: Pos[]): boolean {
  const hole = new Set(holes.map(key));
  const floor: Pos[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!hole.has(key({ x, y }))) floor.push({ x, y });
  if (!floor.length) return false;
  const seen = new Set([key(floor[0])]);
  const queue = [floor[0]];
  while (queue.length) {
    const p = queue.pop()!;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const q = { x: p.x + d.x, y: p.y + d.y };
      if (q.x < 0 || q.y < 0 || q.x >= width || q.y >= height || hole.has(key(q)) || seen.has(key(q))) continue;
      seen.add(key(q));
      queue.push(q);
    }
  }
  return seen.size === floor.length;
}

/** Lay the contents out on a board. Returns null if this attempt painted itself into a corner (the caller retries). */
function layOut(rand: () => number, hardness: number, contents: EndlessContents) {
  const n = endlessSize(hardness).size;
  const [pMin, pMax] = endlessSize(hardness).pillars;
  const corners = [
    { x: 0, y: 0 },
    { x: n - 1, y: 0 },
    { x: 0, y: n - 1 },
    { x: n - 1, y: n - 1 },
  ];
  const start = corners[Math.floor(rand() * 4)];
  const taken = new Set([key(start)]);
  const all: Pos[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) all.push({ x, y });
  const free = (filter: (p: Pos) => boolean) => all.filter((p) => !taken.has(key(p)) && filter(p));
  const draw = (pool: Pos[]): Pos | null => (pool.length ? pool[Math.floor(rand() * pool.length)] : null);

  // Holes: never next to the start, and never cutting the floor in two.
  const holes: Pos[] = [];
  for (let i = 0; i < contents.holes; i++) {
    const options = free((p) => reach(p, start) > 1);
    let p: Pos | null = null;
    while (options.length) {
      const j = Math.floor(rand() * options.length);
      if (floorConnected(n, n, [...holes, options[j]])) {
        p = options[j];
        break;
      }
      options.splice(j, 1);
    }
    if (!p) return null;
    holes.push(p);
    taken.add(key(p));
  }
  // Pillars: cover, never right next to the start (so the mage can always step out).
  const pillars: Pos[] = [];
  const pillarCount = pMin + Math.floor(rand() * (pMax - pMin + 1));
  for (let i = 0; i < pillarCount; i++) {
    const p = draw(free((q) => reach(q, start) > 1));
    if (!p) return null;
    pillars.push(p);
    taken.add(key(p));
  }
  // Monsters: outside the safe radius. The Redactor's team first (it needs the most space).
  const safe = (p: Pos) => reach(p, start) > ENDLESS.safeRadius;
  const enemies: { kind: EnemyKind; at: string; element?: Element }[] = [];
  const openAround = (p: Pos) => all.filter((q) => reach(p, q) === 1 && !taken.has(key(q))).length;
  const order = [...contents.monsters].sort((a, b) => (a === 'redactorTeam' ? -1 : b === 'redactorTeam' ? 1 : 0));
  for (const m of order) {
    if (m === 'redactorTeam') {
      const boss = draw(free((p) => safe(p) && openAround(p) >= 3));
      if (!boss) return null;
      taken.add(key(boss));
      const wards: Pos[] = [];
      for (const element of ENDLESS.wardElements) {
        // Spread out, each with free tiles around it to summon its Scraps onto.
        const w = draw(free((p) => safe(p) && reach(p, boss) >= 2 && wards.every((o) => reach(p, o) >= 2) && openAround(p) >= 3));
        if (!w) return null;
        wards.push(w);
        taken.add(key(w));
        enemies.push({ kind: 'ward', at: coordLabel(w), element });
      }
      enemies.push({ kind: 'redactor', at: coordLabel(boss) });
      continue;
    }
    const p = draw(free(safe));
    if (!p) return null;
    taken.add(key(p));
    enemies.push({ kind: m, at: coordLabel(p) });
  }
  return { n, start, holes, pillars, enemies };
}

/** What an endless room is called. */
export function endlessRoomName(room: number): string {
  return `Endless room ${room}`;
}

/**
 * Generate an endless room. `room` (1, 2, 3…) only names it. Tries a few layouts if one gets stuck; the contents
 * (and so the hardness) never change between tries.
 */
export function generateRoom(seed: number, hardness: number, room = 1): RoomDef {
  const rand = seededRandom(seed);
  const contents = rollContents(rand, hardness);
  for (let attempt = 0; attempt < 200; attempt++) {
    const laid = layOut(rand, hardness, contents);
    if (!laid) continue;
    const kinds = [...new Set(laid.enemies.map((e) => ENEMY_DEFS[e.kind].name))];
    return {
      id: 'endless',
      name: endlessRoomName(room),
      blurb: `The curse made this room. Hardness ${hardness}: ${kinds.join(', ')}. Kill them all to go on.`,
      width: laid.n,
      height: laid.n,
      pillars: laid.pillars.map(coordLabel),
      holes: laid.holes.map(coordLabel),
      exit: null,
      start: coordLabel(laid.start),
      enemies: laid.enemies,
    };
  }
  throw new Error(`Could not lay out an endless room (seed ${seed}, hardness ${hardness}).`);
}
