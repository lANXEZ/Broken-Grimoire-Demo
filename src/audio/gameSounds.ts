import { useEffect, useRef } from 'react';
import { samePos, type GameState, type Pos } from '../engine';
import { FX } from '../config/fx';
import { lookOf, passTime, tileDelay, type CastEvent, type RuneEvent } from '../scene/SpellFx';
import { play, type SoundGroup } from './audio';
import { TICK } from './synth';

/**
 * [SOUND] What plays when, in the game:
 * - casts (castSounds / runeSounds): timed to the spell's effect on the board (scene/SpellFx.tsx), tile by tile:
 *   the spell going off, each tile it erupts on, then a hit, a kill or a dull tink (immune) on each monster, and
 *   pillars cracking or collapsing;
 * - everything else (useGameSounds): read off the board as it changes, so the enemy turn's steps sound as they
 *   show: the mage stepping and getting hurt, monsters moving, getting hurt (burn, hazards) and dying, loot picked
 *   up, cards drawn, room cleared, victory and defeat.
 * Turn banners, the title, waking up and the cards on the table play from App.tsx.
 */

/** `ms` from now, from seconds. */
const ms = (s: number) => s * 1000;

/**
 * The sounds of one cast (or the spell part of a rune cast) starting `at` ms from now. `after`: the game right after
 * it (who died). `alive`: only monsters still standing here count (Echo's second pass).
 */
export function castSounds(g: SoundGroup, e: CastEvent, after: GameState, at = 0, alive?: GameState): void {
  const fx = e.fx;
  if (fx.kind === 'fizzle' || !fx.spell || !fx.area) {
    g.play('fizzle', at);
    return;
  }
  const look = lookOf(fx);
  if (fx.spell.kind === 'unstable') g.play('unstable', at + ms(FX.lead));
  else g.play(look, at, { len: passTime(fx) });
  // Each tile as it erupts (a few at the same moment play as one).
  for (const tile of fx.area.tiles.slice(0, 16)) g.play(TICK[look], at + ms(tileDelay(fx, tile.pos)));
  for (const h of fx.hits) {
    if (alive && !alive.enemies.some((x) => x.id === h.id)) continue;
    const when = at + ms(tileDelay(fx, h.pos)) + 40;
    if (h.immune) g.play('immune', when);
    else if (!after.enemies.some((x) => x.id === h.id)) g.play('kill', when);
    else g.play('hit', when);
  }
  for (const p of fx.area.pillars) g.play(e.broken.some((b) => samePos(b, p)) ? 'pillarBreak' : 'pillarChip', at + ms(tileDelay(fx, p)));
  if (e.bumps.length) g.play('bump', at + ms(FX.lead + FX.stepDelay * 2 + 0.1));
}

/** The sounds of a rune's own part, starting `at` ms from now. `before`: the game after the spell part. */
export function runeSounds(g: SoundGroup, e: RuneEvent, before: GameState, after: GameState, at = 0): void {
  const strike = at + ms(FX.rune.strike);
  /** A hit or a kill on each monster the rune strikes. */
  const strikeTargets = (when: number) => {
    for (const p of e.targets) {
      const was = before.enemies.find((x) => samePos(x.pos, p));
      if (!was) continue;
      g.play(after.enemies.some((x) => x.id === was.id) ? 'hit' : 'kill', when);
    }
  };
  switch (e.effect) {
    case 'echo':
      if (e.base) castSounds(g, { type: 'cast', id: e.id, fx: e.base, broken: e.broken, bumps: [] }, after, at, before);
      return;
    case 'amplify':
      g.play('amplify', strike);
      strikeTargets(strike + 60);
      return;
    case 'volatile':
      g.play('volatile', strike);
      strikeTargets(strike + 60);
      return;
    case 'siphon':
      g.play('siphon', strike);
      return;
    case 'free':
      g.play('free', strike);
      return;
    case 'fizzle':
      g.play('runeFizzle', at);
      return;
  }
}

/** Every unit standing where it was, by id. */
function moved(a: { id: string; pos: Pos }[], b: { id: string; pos: Pos }[]): boolean {
  return b.some((n) => {
    const o = a.find((x) => x.id === n.id);
    return !!o && !samePos(o.pos, n.pos);
  });
}

/**
 * Sounds for what changes on the board. `view` is what the board shows (an enemy turn step by step). States made
 * by a cast are in `fromCast` (with how long, in ms, the cast's effect still plays): their hits and kills already
 * sound with the effect, so only what follows (room cleared, victory, loot, cards) plays, once the effect is over.
 */
export function useGameSounds(view: GameState, fromCast: WeakMap<GameState, number>): void {
  const prev = useRef(view);
  useEffect(() => {
    const a = prev.current;
    const b = view;
    prev.current = b;
    if (a === b) return;
    const castWait = fromCast.get(b);
    const cast = castWait !== undefined;
    const later = castWait ?? 0;

    // A different room: through a door onward (a new run starts with the eyes closed: no sound).
    if (a.room.id !== b.room.id || a.stage !== b.stage || a.roomIndex !== b.roomIndex) {
      if (b.stage > a.stage || (b.stage === a.stage && b.roomIndex !== a.roomIndex)) play('door');
      return;
    }

    // The mage.
    if (!cast) {
      if (b.player.hp < a.player.hp) play('hurt');
      if (!samePos(a.player.pos, b.player.pos)) play('step');
    }
    if (b.player.hp > a.player.hp) play('heal', later);
    if (b.player.status.stuck > 0 && a.player.status.stuck === 0) play('stuck', later);
    if (b.player.status.stuck === 0 && a.player.status.stuck > 0) play('escape');

    // The monsters and the pillars (the Warden's line).
    if (!cast) {
      for (const e of a.enemies) {
        const n = b.enemies.find((x) => x.id === e.id);
        if (!n) play('kill');
        else if (n.hp < e.hp) play('hit');
      }
      if (moved(a.enemies, b.enemies)) play('enemyStep');
      if (b.enemies.some((n) => !a.enemies.some((e) => e.id === n.id))) play('spawn');
      if (b.room.pillars.length < a.room.pillars.length) play('pillarBreak');
      else if (b.room.pillars.some((p) => (a.room.pillars.find((q) => samePos(q.pos, p.pos))?.hp ?? p.hp) > p.hp)) play('pillarChip');
    }

    // Loot picked up, new cards in the hand.
    if (b.room.drops.length < a.room.drops.length) play('loot', later);
    if (b.cards.hand.length > a.cards.hand.length) play('draw', later);

    if (a.phase !== b.phase) {
      if (b.phase === 'cleared') play('cleared', later);
      else if (b.phase === 'won') play('victory', later);
      else if (b.phase === 'lost') play('defeat', later);
    }
  }, [view, fromCast]);
}

/** A soft click on every button pressed anywhere in the game (menus, dialogs, the HUD). */
export function useButtonClicks(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest?.('button');
      if (button && !(button as HTMLButtonElement).disabled) play('click');
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);
}
