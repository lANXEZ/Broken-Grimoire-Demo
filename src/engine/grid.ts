import { pick } from './rng';
import type { Dir, Enemy, GameState, Hazard, HazardKind, Pillar, Pos } from './types';

export const DIR_VECTORS: Record<Dir, Pos> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DIRS4: Pos[] = Object.values(DIR_VECTORS);

export const DIRS8: Pos[] = [
  ...DIRS4,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export const posKey = (p: Pos) => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const addPos = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y });
export const scalePos = (a: Pos, k: number): Pos => ({ x: a.x * k, y: a.y * k });
export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** The vector a quarter-turn from d (left of it). */
export const perpendicular = (d: Pos): Pos => ({ x: -d.y, y: d.x });

export function inBounds(state: GameState, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < state.room.width && p.y < state.room.height;
}

export function pillarAt(state: GameState, p: Pos): Pillar | undefined {
  return state.room.pillars.find((q) => samePos(q.pos, p));
}

export function isPillar(state: GameState, p: Pos): boolean {
  return !!pillarAt(state, p);
}

export function isHole(state: GameState, p: Pos): boolean {
  return state.room.holes.some((q) => samePos(q, p));
}

export function hazardAt(state: GameState, p: Pos): Hazard | undefined {
  return state.room.hazards.find((h) => samePos(h.pos, p));
}

export function hasHazard(state: GameState, p: Pos, kind: HazardKind): boolean {
  return hazardAt(state, p)?.kind === kind;
}

export function enemyAt(state: GameState, p: Pos): Enemy | undefined {
  return state.enemies.find((e) => samePos(e.pos, p));
}

export function isOccupied(state: GameState, p: Pos, ignoreEnemyId?: string): boolean {
  if (samePos(state.player.pos, p)) return true;
  return state.enemies.some((e) => e.id !== ignoreEnemyId && samePos(e.pos, p));
}

/** Is the room's door open: always (the Cistern), or once the room is cleared? */
export function exitOpen(state: GameState): boolean {
  return !!state.room.exit && (state.room.exitAlwaysOpen || state.phase === 'cleared');
}

/** Is this the room's door, still locked? Only the wizard is kept off it. */
export function isLockedExit(state: GameState, p: Pos): boolean {
  return !!state.room.exit && !exitOpen(state) && samePos(state.room.exit, p);
}

/** Is the wizard standing in the open door? */
export function onOpenExit(state: GameState): boolean {
  return exitOpen(state) && samePos(state.room.exit!, state.player.pos);
}

/** Can a unit step onto this tile? Pillars, holes and other units block. */
export function isWalkable(state: GameState, p: Pos, selfEnemyId?: string): boolean {
  return inBounds(state, p) && !isPillar(state, p) && !isHole(state, p) && !isOccupied(state, p, selfEnemyId);
}

/** Tiles orthogonally adjacent to p that are on the board. */
export function neighbors4(state: GameState, p: Pos): Pos[] {
  return DIRS4.map((d) => addPos(p, d)).filter((q) => inBounds(state, q));
}

/** Tiles in the 3×3 ring around p that are on the board (not p itself). */
export function neighbors8(state: GameState, p: Pos): Pos[] {
  return DIRS8.map((d) => addPos(p, d)).filter((q) => inBounds(state, q));
}

/** Straight or diagonal direction from a to b, or null if b isn't on one of the 8 lines. */
export function lineDirection(a: Pos, b: Pos): Pos | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

/**
 * Can a unit at `a` see a target at `b`? They must share a straight or diagonal line with no pillar or fog in
 * between. Fog on `b` itself hides the target too. Units don't block sight.
 */
export function canSee(state: GameState, a: Pos, b: Pos): boolean {
  const d = lineDirection(a, b);
  if (!d || hasHazard(state, b, 'fog')) return false;
  for (let p = addPos(a, d); !samePos(p, b); p = addPos(p, d)) {
    if (isPillar(state, p) || hasHazard(state, p, 'fog')) return false;
  }
  return true;
}

/** Every tile that can see `target` (any distance, 8 lines): the goals for Archers and the Warden. */
export function sightTiles(state: GameState, target: Pos): Pos[] {
  if (hasHazard(state, target, 'fog')) return [];
  const out: Pos[] = [];
  for (const d of DIRS8) {
    for (let p = addPos(target, d); inBounds(state, p); p = addPos(p, d)) {
      if (isPillar(state, p) || hasHazard(state, p, 'fog')) break;
      out.push(p);
    }
  }
  return out;
}

/** Tiles travelled from `from` (exclusive) in direction d, stopping before pillars or the board edge. */
export function ray(state: GameState, from: Pos, d: Pos, maxLen = Infinity): Pos[] {
  const out: Pos[] = [];
  let p = addPos(from, d);
  while (out.length < maxLen && inBounds(state, p) && !isPillar(state, p)) {
    out.push(p);
    p = addPos(p, d);
  }
  return out;
}

/** Monsters avoid Magma and Quicksand: stepping onto one costs this much extra, so they only do it if there's no other way. */
const HAZARD_PENALTY = 50;

function stepCost(state: GameState, p: Pos): number {
  const h = hazardAt(state, p);
  return 1 + (h && h.kind !== 'fog' ? HAZARD_PENALTY : 0);
}

/**
 * Walking cost from every reachable tile to the nearest goal tile (Dijkstra; a step costs 1, more onto a hazard).
 * Other units, pillars and holes are walls; `selfId`'s own tile counts as walkable.
 */
export function distanceField(state: GameState, goals: Pos[], selfId: string): Map<string, number> {
  const dist = new Map<string, number>();
  const open: Pos[] = [];
  for (const g of goals) {
    if (!isWalkable(state, g, selfId) || dist.has(posKey(g))) continue;
    dist.set(posKey(g), 0);
    open.push(g);
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(posKey(open[i]))! < dist.get(posKey(open[bi]))!) bi = i;
    const q = open.splice(bi, 1)[0];
    const dq = dist.get(posKey(q))!;
    const cost = dq + stepCost(state, q);
    for (const p of neighbors4(state, q)) {
      if (!isWalkable(state, p, selfId)) continue;
      const known = dist.get(posKey(p));
      if (known !== undefined && known <= cost) continue;
      if (known === undefined) open.push(p);
      dist.set(posKey(p), cost);
    }
  }
  return dist;
}

/**
 * Next step along a cheapest path toward any goal tile. Equally good steps are chosen at random.
 * Returns null if already on a goal or no path exists.
 */
export function stepToward(state: GameState, enemy: Enemy, goals: Pos[]): Pos | null {
  const dist = distanceField(state, goals, enemy.id);
  const here = dist.get(posKey(enemy.pos));
  if (here === 0) return null;
  const total = (q: Pos) => dist.get(posKey(q))! + stepCost(state, q);
  const options = neighbors4(state, enemy.pos).filter((q) => dist.has(posKey(q)) && isWalkable(state, q, enemy.id) && (here === undefined || total(q) <= here));
  if (options.length === 0) return null;
  const best = Math.min(...options.map(total));
  return pick(state, options.filter((q) => total(q) === best));
}

/**
 * One step that increases the distance from `threat` as much as possible (hazards only if nothing else works).
 * Returns null when every open step would bring the unit closer.
 */
export function stepAway(state: GameState, enemy: Enemy, threat: Pos): Pos | null {
  const current = manhattan(enemy.pos, threat);
  const all = neighbors4(state, enemy.pos).filter((q) => isWalkable(state, q, enemy.id));
  const safe = all.filter((q) => stepCost(state, q) === 1);
  const options = safe.length ? safe : all;
  if (options.length === 0) return null;
  const score = (q: Pos) => manhattan(q, threat) * 10 + chebyshev(q, threat);
  const bestScore = Math.max(...options.map(score));
  const best = options.filter((q) => score(q) === bestScore);
  if (manhattan(best[0], threat) < current) return null;
  return pick(state, best);
}

/** Shortest walk for the wizard (after a room is cleared), avoiding pillars, holes and units. Excludes `from`. */
export function walkPath(state: GameState, from: Pos, to: Pos): Pos[] | null {
  if (samePos(from, to)) return [];
  if (!inBounds(state, to) || isPillar(state, to) || isHole(state, to) || state.enemies.some((e) => samePos(e.pos, to))) return null;
  const prev = new Map<string, Pos | null>([[posKey(from), null]]);
  const queue: Pos[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (samePos(p, to)) break;
    for (const q of neighbors4(state, p)) {
      if (prev.has(posKey(q)) || isPillar(state, q) || isHole(state, q) || state.enemies.some((e) => samePos(e.pos, q))) continue;
      prev.set(posKey(q), p);
      queue.push(q);
    }
  }
  if (!prev.has(posKey(to))) return null;
  const path: Pos[] = [];
  for (let p: Pos | null = to; p && !samePos(p, from); p = prev.get(posKey(p)) ?? null) path.unshift(p);
  return path;
}
