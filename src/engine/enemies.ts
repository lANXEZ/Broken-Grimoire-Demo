import { cardsLabel } from './cards';
import { ENEMY_DEFS, RULES, coordLabel } from './data';
import {
  RuleError,
  checkCleared,
  checkGrimoire,
  cloneState,
  damageEnemy,
  damagePillar,
  damagePlayer,
  enemyName,
  enterTile,
  immunityReason,
  log,
  pushUnit,
  removeHazardAt,
  unitSize,
  wardsStanding,
} from './core';
import { endPlayerTurn, spawnEnemy, startPlayerTurn } from './game';
import {
  addPos,
  canSee,
  chebyshev,
  enemyAt,
  hasHazard,
  inBounds,
  isPillar,
  isWalkable,
  lineDirection,
  manhattan,
  neighbors4,
  neighbors8,
  posKey,
  ray,
  samePos,
  sightTiles,
  stepAway,
  stepToward,
} from './grid';
import { pick, random } from './rng';
import type { Enemy, GameState, Intent, IntentKind, LogEntry, Pos } from './types';

export interface EnemyStep {
  /** Enemy that acted, or null for turn-level events (spawns, start of the player's turn). */
  actorId: string | null;
  entries: LogEntry[];
  /** Tiles to highlight on the board for this step (movement, attack area, marked line…). */
  focus: Pos[];
  /** Full game state right after this step (omitted when planning without snapshots). */
  state: GameState;
}

export interface EnemyTurnPlan {
  steps: EnemyStep[];
  final: GameState;
  /** What each enemy does this turn, in order, keyed by enemy id. */
  intents: Record<string, Intent[]>;
}

/** Enemies act by type number (Rat 1 … Redactor 8), then by deploy order. */
export function turnOrder(state: GameState): Enemy[] {
  return [...state.enemies].sort((a, b) => a.typeNum - b.typeNum || a.deployId - b.deployId);
}

/**
 * Resolve the whole enemy turn, recording every action as a step the game can play back.
 * With `snapshots: false` the per-step states are skipped (used for cheap intent previews).
 */
export function planEnemyTurn(state: GameState, opts: { snapshots?: boolean } = {}): EnemyTurnPlan {
  if (state.phase !== 'enemy') throw new RuleError('It is not the enemy turn.');
  const snapshots = opts.snapshots ?? true;
  const s = cloneState(state);
  const steps: EnemyStep[] = [];
  const intents: Record<string, Intent[]> = {};
  let mark = s.log.length;
  const emit = (actorId: string | null, focus: Pos[] = []) => {
    const entries = s.log.slice(mark);
    mark = s.log.length;
    if (entries.length === 0) return;
    steps.push({ actorId, entries, focus, state: snapshots ? cloneState(s) : s });
  };
  const recorder = (id: string) => (intent: Intent) => (intents[id] ??= []).push(intent);

  for (const { id } of turnOrder(s)) {
    if (s.phase !== 'enemy') break;
    const e = s.enemies.find((x) => x.id === id);
    if (e) runUnitTurn(s, e, emit, recorder(id));
    checkCleared(s);
  }

  if (s.phase === 'enemy') {
    if (!wardsSpawnOn(s.turn) && s.enemies.some((e) => e.kind === 'ward')) {
      log(s, 'enemy', 'The Page Wards rest and gather ink: no Page Scrap this turn.');
    }
    emit(null);
    startPlayerTurn(s);
  }
  emit(null);
  return { steps, final: s, intents };
}

/**
 * What every enemy will do on its coming turn, assuming the player ends their turn now.
 * Enemy randomness is seeded in the state, so this matches the real enemy turn exactly
 * until the player does something else.
 */
export function previewIntents(state: GameState): Record<string, Intent[]> {
  if (state.phase === 'enemy') return planEnemyTurn(state, { snapshots: false }).intents;
  if (state.phase !== 'player') return {};
  return planEnemyTurn(endPlayerTurn(state), { snapshots: false }).intents;
}

// ---------------------------------------------------------------------------

interface TurnCtx {
  acted: boolean;
  attacked: boolean;
  /** Archer: direction to back off in this turn (player was adjacent at turn start). */
  backoffDir: Pos | null;
  /** Set by an action that ends the unit's turn early (Warden marking its line). */
  endTurn: boolean;
  /** Warden: marked a line this turn (so it isn't treated as a stale line at the end of the turn). */
  marked: boolean;
  /** Redactor in Chaos mode: the next action is a cooldown. Resets every turn. */
  cooldown: boolean;
  /** Redactor: explosions so far this turn (at most 2 in every mode). */
  explosions: number;
  /** Record an intent for this unit (also used by actions that trigger extra effects). */
  record: (intent: Intent) => void;
}

type Decision =
  | { kind: 'act'; intent: Intent; focus: Pos[]; run: () => void }
  /** `intent` is shown when the unit ends its turn this way (e.g. Warden watching, Scrap blocking). */
  | { kind: 'stop'; reason?: string; intent?: IntentKind };

const act = (intent: Intent, focus: Pos[], run: () => void): Decision => ({ kind: 'act', intent, focus, run });
const stop = (reason?: string, intent?: IntentKind): Decision => ({ kind: 'stop', reason, intent });

function orthAdjacent(a: Pos, b: Pos): boolean {
  return manhattan(a, b) === 1;
}

const alive = (s: GameState, e: Enemy) => s.enemies.includes(e);

/** Does fog get to this unit? The Redactor's head stays above it, and Page Wards float. */
function fogAffects(e: Enemy): boolean {
  return e.kind !== 'redactor' && e.kind !== 'ward';
}

function runUnitTurn(
  s: GameState,
  e: Enemy,
  emit: (actorId: string | null, focus?: Pos[]) => void,
  record: (intent: Intent) => void,
): void {
  // Burn: 1 damage at the start of each of the unit's turns, whether or not it acts.
  if (e.status.burn > 0) {
    e.status.burn -= 1;
    damageEnemy(s, e, 1, 'Burn', 'enemy');
    emit(e.id, [e.pos]);
    if (!alive(s, e)) return;
  }
  const actions = startUnitTurn(s, e);
  const ctx: TurnCtx = { acted: false, attacked: false, backoffDir: null, endTurn: false, marked: false, cooldown: false, explosions: 0, record };
  let recorded = 0;
  const rec = (intent: Intent) => {
    recorded++;
    record(intent);
  };
  ctx.record = rec;

  if (e.kind === 'archer' && orthAdjacent(e.pos, s.player.pos)) {
    ctx.backoffDir = { x: Math.sign(e.pos.x - s.player.pos.x), y: Math.sign(e.pos.y - s.player.pos.y) };
    log(s, 'enemy', `${enemyName(e)}: you're adjacent, so it backs off.`);
  }

  for (let i = 0; i < actions; i++) {
    if (e.kind === 'scrap') tryDeliver(s, e, ctx);
    if (ctx.cooldown) {
      ctx.cooldown = false;
      rec({ kind: 'cooldown' });
      log(s, 'enemy', `${enemyName(e)} cools down after the explosion.`);
      emit(e.id, [e.pos]);
      continue;
    }
    const decision = decide(s, e, ctx);
    if (decision.kind === 'stop') {
      if (decision.reason) log(s, 'enemy', `${enemyName(e)} ${decision.reason}`);
      if (decision.intent) rec({ kind: decision.intent, note: decision.reason });
      else if (recorded === 0 && actions > 0) rec({ kind: 'wait', note: decision.reason });
      break;
    }
    rec(decision.intent);
    decision.run();
    ctx.acted = true;
    if (alive(s, e) && e.kind === 'scrap') tryDeliver(s, e, ctx);
    emit(e.id, decision.focus);
    if (s.phase !== 'enemy' || !alive(s, e)) return;
    if (ctx.endTurn) break;
  }
  endUnitTurn(s, e, ctx);
  emit(e.id);
}

/** Actions the unit will get on its next turn. Pure: mirrors startUnitTurn without spending marks. */
export function actionsNextTurn(s: GameState, e: Enemy): number {
  if (e.kind === 'ward') return wardsSpawnOn(s.turn) ? ENEMY_DEFS.ward.actions : 0;
  if (e.kind !== 'redactor') return ENEMY_DEFS[e.kind].actions;
  if (wardsStanding(s)) return RULES.redactorActions.guarded;
  return (e.marks ?? 0) > 0 ? RULES.redactorActions.chaos : RULES.redactorActions.spent;
}

/** Whether the Warden's next turn is a charged turn. */
export function wardenChargedNextTurn(e: Enemy): boolean {
  return ((e.turnCount ?? 0) + 1) % RULES.wardenChargeEvery === 0;
}

/** Start-of-turn bookkeeping. Returns the number of actions the unit gets this turn. */
function startUnitTurn(s: GameState, e: Enemy): number {
  // A Page Ward's one action is its summon, on enemy turns 2, 4, 6…; it rests (no action) in between.
  if (e.kind === 'ward') return wardsSpawnOn(s.turn) ? ENEMY_DEFS.ward.actions : 0;
  if (e.kind === 'warden') {
    const charged = wardenChargedNextTurn(e);
    e.turnCount = (e.turnCount ?? 0) + 1;
    if (charged) {
      e.charge = true;
      log(s, 'enemy', `${enemyName(e)} gains a charge (its turn ${e.turnCount}).`);
    }
  }
  if (e.kind === 'redactor') {
    if (wardsStanding(s)) {
      e.mode = 'guarded';
      return RULES.redactorActions.guarded;
    }
    if ((e.marks ?? 0) > 0) {
      e.marks = (e.marks ?? 0) - 1;
      const entering = e.mode !== 'chaos';
      e.mode = 'chaos';
      log(s, 'enemy', `${enemyName(e)} ${entering ? 'enters' : 'stays in'} CHAOS MODE: spends 1 mark (${e.marks} left), ${RULES.redactorActions.chaos} actions.`);
      return RULES.redactorActions.chaos;
    }
    if (e.mode === 'chaos') log(s, 'enemy', `${enemyName(e)} is out of marks: Chaos mode ends.`);
    e.mode = 'spent';
    return RULES.redactorActions.spent;
  }
  return ENEMY_DEFS[e.kind].actions;
}

function endUnitTurn(s: GameState, e: Enemy, ctx: TurnCtx): void {
  if (e.status.root > 0 && --e.status.root === 0) log(s, 'enemy', `${enemyName(e)} is no longer rooted.`);
  if (e.status.stun > 0 && --e.status.stun === 0) log(s, 'enemy', `${enemyName(e)} is no longer stunned.`);
  if (e.kind === 'warden') {
    if (e.charge) {
      e.charge = false;
      log(s, 'enemy', `${enemyName(e)} never got a line on you, so its charge is lost.`);
    }
    // A line it couldn't fire this turn (lost in the fog, stuck in quicksand) fades.
    if (e.markedLine && !ctx.marked) {
      e.markedLine = null;
      e.markedPillar = null;
      log(s, 'enemy', `${enemyName(e)} couldn't fire, so its marked line fades.`);
    }
  }
}

function moveTo(s: GameState, e: Enemy, to: Pos, kind: 'move' | 'retreat' | 'wander' = 'move'): Decision {
  const from = e.pos;
  return act({ kind }, [from, to], () => {
    e.pos = to;
    const verb = kind === 'retreat' ? 'retreats' : kind === 'wander' ? 'wanders in the fog' : 'moves';
    log(s, 'enemy', `${enemyName(e)} ${verb} ${coordLabel(from)} → ${coordLabel(to)}.`);
    enterTile(s, e.id, 'enemy');
  });
}

/** An immune unit has nothing to fear from Magma or Quicksand, so it doesn't path around them. */
const fearless = (s: GameState, e: Enemy) => !!immunityReason(s, e, null);

function approach(s: GameState, e: Enemy, goals: Pos[]): Decision {
  if (e.status.root > 0) return stop('is rooted and can’t move.');
  const step = stepToward(s, e, goals, fearless(s, e));
  if (!step) return stop('has no open path, so it waits.');
  return moveTo(s, e, step);
}

function flee(s: GameState, e: Enemy): Decision {
  if (e.status.root > 0) return stop('is rooted and can’t run.');
  const step = stepAway(s, e, s.player.pos, fearless(s, e));
  if (!step) return stop('is cornered and holds position.');
  return moveTo(s, e, step, 'retreat');
}

function decide(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  // Quicksand first: a stuck unit spends its actions climbing out (progress carries over).
  if (e.status.stuck > 0 && unitSize(e) !== 'float') {
    return act({ kind: 'escape' }, [e.pos], () => {
      e.status.stuck -= 1;
      if (e.status.stuck > 0) log(s, 'enemy', `${enemyName(e)} struggles in the quicksand.`);
      else {
        removeHazardAt(s, e.pos);
        log(s, 'enemy', `${enemyName(e)} climbs out of the quicksand. The puddle is gone.`);
      }
    });
  }
  // Fog: a monster inside wanders at random and doesn't attack (checked every action).
  if (fogAffects(e) && hasHazard(s, e.pos, 'fog')) {
    if (e.status.root > 0) return stop('is lost in the fog and rooted.');
    const open = neighbors4(s, e.pos).filter((q) => isWalkable(s, q, e.id));
    if (open.length === 0) return stop('is lost in the fog.');
    return moveTo(s, e, pick(s, open), 'wander');
  }
  switch (e.kind) {
    case 'rat':
    case 'brute':
    case 'leech':
      return decideMelee(s, e, ctx);
    case 'archer':
      return decideArcher(s, e, ctx);
    case 'warden':
      return decideWarden(s, e, ctx);
    case 'scrap':
      return decideScrap(s, e, ctx);
    case 'redactor':
      return decideRedactor(s, e, ctx);
    case 'ward':
      return decideWard(s, e, ctx);
  }
}

function decideMelee(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.attacked) return stop();
  const p = s.player.pos;
  if (orthAdjacent(e.pos, p)) {
    if (e.status.stun > 0) return stop('is stunned and can’t attack.');
    const leech = e.kind === 'leech';
    const intent: Intent = leech ? { kind: 'drain', value: ENEMY_DEFS.leech.damage } : { kind: 'attack', value: ENEMY_DEFS[e.kind].damage };
    return act(intent, [p], () => {
      ctx.attacked = true;
      if (leech) {
        const before = s.player.mana;
        s.player.mana = Math.max(0, before - ENEMY_DEFS.leech.damage);
        log(s, 'enemy', `${enemyName(e)} drains YOUR mana (${before} → ${s.player.mana}).`);
      } else {
        damagePlayer(s, ENEMY_DEFS[e.kind].damage, enemyName(e));
      }
    });
  }
  return approach(s, e, neighbors4(s, p));
}

/** Tiles from which an archer can shoot the player: any tile on the 8 lines with no pillar or fog in between. */
export function archerFiringTiles(s: GameState): Pos[] {
  return sightTiles(s, s.player.pos);
}

export function archerCanShoot(s: GameState, e: Enemy): boolean {
  return canSee(s, e.pos, s.player.pos);
}

/**
 * Friendly fire: the first other monster standing between the Archer and you on the line of the shot.
 * The arrow hits it and stops there instead of reaching you.
 */
export function arrowBlocker(s: GameState, e: Enemy): Enemy | null {
  const d = lineDirection(e.pos, s.player.pos);
  if (!d) return null;
  for (let p = addPos(e.pos, d); !samePos(p, s.player.pos); p = addPos(p, d)) {
    const hit = enemyAt(s, p);
    if (hit) return hit;
  }
  return null;
}

function decideArcher(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.backoffDir) {
    if (e.status.root > 0) return stop('is rooted and can’t back off.');
    const straight = addPos(e.pos, ctx.backoffDir);
    const to = isWalkable(s, straight, e.id) ? straight : stepAway(s, e, s.player.pos);
    if (!to) return stop('is cornered and can’t back off.');
    return moveTo(s, e, to, 'retreat');
  }
  if (ctx.attacked) return stop();
  if (archerCanShoot(s, e)) {
    if (e.status.stun > 0) return stop('is stunned and can’t shoot.');
    const dmg = ENEMY_DEFS.archer.damage;
    const d = lineDirection(e.pos, s.player.pos)!;
    // It shoots whenever it has a line to you; a monster in the way takes the arrow (and the push) instead.
    const blocker = arrowBlocker(s, e);
    if (blocker) {
      return act({ kind: 'shoot', value: dmg, note: `${enemyName(blocker)} is in the way` }, [blocker.pos], () => {
        ctx.attacked = true;
        const immune = immunityReason(s, blocker, null);
        if (immune) {
          log(s, 'enemy', `${enemyName(e)} shoots at YOU, but ${enemyName(blocker)} is in the way and takes nothing (${immune}). The arrow stops there.`);
          return;
        }
        log(s, 'enemy', `${enemyName(e)} shoots at YOU, but ${enemyName(blocker)} is in the way: friendly fire!`);
        if (!damageEnemy(s, blocker, dmg, `${enemyName(e)}'s arrow`, 'enemy')) pushUnit(s, blocker.id, d, RULES.archerPush, 'enemy', 'arrow');
      });
    }
    return act({ kind: 'shoot', value: dmg }, [s.player.pos], () => {
      ctx.attacked = true;
      damagePlayer(s, dmg, `${enemyName(e)} (arrow)`);
      if (s.phase === 'enemy') pushUnit(s, 'player', d, RULES.archerPush, 'enemy', 'arrow');
    });
  }
  return approach(s, e, archerFiringTiles(s));
}

/** Direction from the Warden to the player if it can see them. */
export function wardenSightLine(s: GameState, e: Enemy): Pos | null {
  return canSee(s, e.pos, s.player.pos) ? lineDirection(e.pos, s.player.pos) : null;
}

/** The Warden's line in direction d: from itself to the wall or the first pillar (which it reports). */
export function wardenLine(s: GameState, e: Enemy, d: Pos): { line: Pos[]; pillar: Pos | null } {
  const line = ray(s, e.pos, d);
  const next = addPos(line.length ? line[line.length - 1] : e.pos, d);
  return { line, pillar: inBounds(s, next) && isPillar(s, next) ? next : null };
}

function decideWarden(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (e.markedLine) {
    if (e.status.stun > 0) {
      e.markedLine = null;
      e.markedPillar = null;
      log(s, 'enemy', `${enemyName(e)} is stunned: its marked line fizzles out.`);
    } else {
      const line = e.markedLine;
      const pillar = e.markedPillar ?? null;
      return act({ kind: 'fire', value: RULES.wardenShotDamage }, line, () => {
        e.markedLine = null;
        e.markedPillar = null;
        ctx.attacked = true;
        log(s, 'enemy', `${enemyName(e)} fires its halberd wave down the marked line.`);
        let hitSomeone = false;
        // Every unit on the line takes the blast, monsters included.
        for (const t of line) {
          if (samePos(t, s.player.pos)) {
            hitSomeone = true;
            damagePlayer(s, RULES.wardenShotDamage, `${enemyName(e)}'s wave`);
            if (s.phase !== 'enemy') return;
          }
          const victim = enemyAt(s, t);
          if (victim && victim !== e) {
            hitSomeone = true;
            const immune = immunityReason(s, victim, null);
            if (immune) log(s, 'enemy', `${enemyName(victim)} is unharmed (${immune}).`);
            else damageEnemy(s, victim, RULES.wardenShotDamage, `${enemyName(e)}'s wave`, 'enemy');
          }
        }
        if (pillar) damagePillar(s, pillar, 1, `${enemyName(e)}'s wave`, 'enemy');
        if (!hitSomeone) log(s, 'enemy', 'The wave hits no one.');
      });
    }
  }
  const d = wardenSightLine(s, e);
  if (d) {
    if (e.charge) {
      const { line, pillar } = wardenLine(s, e, d);
      return act({ kind: 'mark', value: RULES.wardenShotDamage }, line, () => {
        e.charge = false;
        e.markedLine = line;
        e.markedPillar = pillar;
        ctx.endTurn = true;
        ctx.marked = true;
        log(
          s,
          'enemy',
          `${enemyName(e)} spots YOU and marks a line ${coordLabel(line[0])}–${coordLabel(line[line.length - 1])}. Its turn ends; it fires for ${RULES.wardenShotDamage} dmg at the start of its next turn.`,
        );
      });
    }
    return stop('has a clear line to you and holds position.', 'watch');
  }
  return approach(s, e, sightTiles(s, s.player.pos));
}

export function redactorOf(s: GameState): Enemy | undefined {
  return s.enemies.find((x) => x.kind === 'redactor');
}

export function redactorMarksFull(s: GameState): boolean {
  const boss = redactorOf(s);
  return !!boss && (boss.marks ?? 0) >= RULES.redactorMaxMarks;
}

/**
 * A Scrap carrying a stolen fragment that reaches any of the 8 tiles around the Redactor
 * gives it one mark (capped). This is free: it doesn't use an action. The fragment stays on the Scrap.
 */
function tryDeliver(s: GameState, e: Enemy, ctx: TurnCtx): void {
  const boss = redactorOf(s);
  if (!boss || e.delivered || !e.carried?.length || !wardsStanding(s) || chebyshev(e.pos, boss.pos) !== 1) return;
  e.delivered = true;
  if ((boss.marks ?? 0) >= RULES.redactorMaxMarks) {
    log(s, 'enemy', `${enemyName(e)} reaches ${enemyName(boss)}, but its marks are already full (${RULES.redactorMaxMarks}/${RULES.redactorMaxMarks}).`);
    return;
  }
  boss.marks = (boss.marks ?? 0) + 1;
  ctx.record({ kind: 'deliver' });
  log(s, 'enemy', `${enemyName(e)} brings its stolen fragment to ${enemyName(boss)}: it gains a mark (${boss.marks}/${RULES.redactorMaxMarks}). The fragment stays on the Scrap.`);
}

function decideScrap(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  const p = s.player.pos;
  if (!wardsStanding(s)) {
    // Endgame: every Scrap crowds the player to block movement, preferring tiles outside Erasure Zones.
    const around = neighbors4(s, p);
    const inZone = (t: Pos) => s.erasureZone.some((z) => samePos(z, t));
    const outside = around.filter((t) => !inZone(t) && isWalkable(s, t, e.id));
    if (orthAdjacent(e.pos, p) && (!inZone(e.pos) || outside.length === 0)) return stop('blocks your path.', 'block');
    return approach(s, e, outside.length ? outside : around);
  }
  if (e.delivered) return flee(s, e);
  const boss = redactorOf(s);
  if (e.carried?.length) return boss ? approach(s, e, neighbors8(s, boss.pos)) : flee(s, e);
  if (redactorMarksFull(s)) return flee(s, e);
  if (orthAdjacent(e.pos, p)) {
    if (e.status.stun > 0) return stop('is stunned and can’t steal.');
    if (s.cards.hand.length === 0) return stop('finds your hand empty: nothing to steal.');
    return act({ kind: 'steal' }, [p], () => {
      ctx.attacked = true;
      const card = s.cards.hand.splice(Math.floor(random(s) * s.cards.hand.length), 1)[0];
      e.carried = [...(e.carried ?? []), card];
      log(s, 'enemy', `${enemyName(e)} touches YOU and steals your ${cardsLabel([card])} fragment.`);
      checkGrimoire(s);
    });
  }
  return approach(s, e, neighbors4(s, p));
}

/** Tiles the explosion damages: the 8 around the Redactor. */
export function explosionTiles(s: GameState, e: Enemy): Pos[] {
  return neighbors8(s, e.pos).filter((t) => !isPillar(s, t));
}

/** Tiles a Chaos-mode explosion turns into Erasure Zone: the 3×3 block, including the Redactor's own tile. */
export function erasureTiles(s: GameState, e: Enemy): Pos[] {
  return [e.pos, ...explosionTiles(s, e)];
}

function decideRedactor(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  const p = s.player.pos;
  if (chebyshev(e.pos, p) === 1) {
    if (e.status.stun > 0) return stop('is stunned and can’t explode.');
    if (ctx.explosions >= RULES.redactorMaxExplosions) return stop(`has already exploded ${RULES.redactorMaxExplosions} times this turn.`);
    const chaos = e.mode === 'chaos';
    const focus = chaos ? erasureTiles(s, e) : explosionTiles(s, e);
    return act({ kind: 'explode', value: RULES.redactorExplodeDamage }, focus, () => {
      ctx.explosions++;
      log(s, 'enemy', `${enemyName(e)} EXPLODES around ${coordLabel(e.pos)}.`);
      damagePlayer(s, RULES.redactorExplodeDamage, enemyName(e));
      // Only Chaos-mode explosions leave an Erasure Zone.
      if (chaos) {
        const keys = new Set(s.erasureZone.map(posKey));
        for (const t of erasureTiles(s, e)) if (!keys.has(posKey(t))) s.erasureZone.push(t);
        log(s, 'enemy', `The blast leaves an Erasure Zone on the 9 tiles around ${coordLabel(e.pos)}. End your next turn there and you lose a fragment for good.`);
        ctx.cooldown = true;
      }
    });
  }
  return approach(s, e, neighbors8(s, p));
}

/** Whether Page Wards summon Scraps on enemy turn `turn` (every other turn: 2, 4, 6…). */
export function wardsSpawnOn(turn: number): boolean {
  return turn % RULES.wardSpawnEvery === 0;
}

/**
 * Page Ward: its one action (on summon turns) is a Page Scrap on a random free tile next to it.
 * It isn't an attack, so Stun doesn't stop it. The new Scrap acts from the next enemy turn
 * (turn order is fixed when the enemy turn starts).
 */
function decideWard(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.acted) return stop();
  const open = neighbors4(s, e.pos).filter((t) => isWalkable(s, t));
  if (open.length === 0) return stop('has no room to summon a Page Scrap.');
  const at = pick(s, open);
  return act({ kind: 'spawn' }, [at], () => {
    const scrap = spawnEnemy(s, 'scrap', at);
    log(s, 'enemy', `${enemyName(e)} summons ${enemyName(scrap)} on ${coordLabel(scrap.pos)}.`);
    enterTile(s, scrap.id, 'enemy');
  });
}
