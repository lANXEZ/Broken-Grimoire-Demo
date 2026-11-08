import { useMemo, useState } from 'react';
import { RUN, stageName } from '../engine';
import { MAP_LAYER_KINDS, buildMapGraph, colX, type MapNodeKind } from '../config/map';

/**
 * [MAP] The branching run map (config/map.ts). A full-screen overlay over the game, drawn like Slay the Spire's
 * route map and generated the same way: a few paths climb from the bottom row to the boss at the top, so the web is
 * uneven and sparse — not every nearby node is joined, and nothing crosses. The run's first stop is at the BOTTOM;
 * the player climbs.
 *
 * The branching is the Wizard-of-Oz illusion — every node on a layer leads to the SAME stop in `RUN` (config/map.ts).
 * As in Slay the Spire, from where you stand you may step only to a node the path actually connects to; tapping one
 * calls `onEnter`, which just lifts the overlay to reveal the stop the engine already loaded. No engine logic here.
 *
 * `stage` is the stop the engine has just loaded (GameState.stage), which the player hasn't entered yet. So the map
 * opens with the player still standing on the node they picked on the layer below (none at the first stop), the road
 * lit only up to there, and the nodes on layer `stage` joined to it glowing to be picked. Picking one lights the
 * step to it, then the map lifts. The picks are saved (local storage) so the road stays the same between stops.
 */

/** One drawn node with its place on the board and the path segments leaving it (upward), in overlay fractions. */
interface Placed {
  layer: number;
  index: number;
  kind: MapNodeKind;
  x: number;
  y: number;
  links: { x: number; y: number }[];
}

/** The icon drawn inside a node. Kept abstract and dark-fantasy, in line with the game's existing art. */
function NodeGlyph({ kind }: { kind: MapNodeKind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'start':
      return (
        <svg viewBox="0 0 24 24" className="map-glyph" aria-hidden>
          <path {...common} d="M6 20V8a6 6 0 0 1 12 0v12" />
          <path {...common} d="M4 20h16M12 13v7" />
        </svg>
      );
    case 'room':
      // A horned skull — a combat room.
      return (
        <svg viewBox="0 0 24 24" className="map-glyph" aria-hidden>
          <path {...common} d="M5 9a7 7 0 0 1 14 0c0 3-1.5 4.5-3 5.5V18H8v-3.5C6.5 13.5 5 12 5 9Z" />
          <path {...common} d="M5 8C3.5 6.5 3 4.5 4 3M19 8c1.5-1.5 2-3.5 1-5" />
          <circle cx="9.3" cy="9.2" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="14.7" cy="9.2" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'event':
      // A question mark — an unknown stop (the Whispering Lectern).
      return (
        <svg viewBox="0 0 24 24" className="map-glyph" aria-hidden>
          <path {...common} d="M8.5 9a3.5 3.5 0 1 1 5.2 3c-1.2.8-1.7 1.5-1.7 2.8" />
          <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'camp':
      // A campfire — rest between rooms.
      return (
        <svg viewBox="0 0 24 24" className="map-glyph" aria-hidden>
          <path {...common} d="M12 4c2 2.5 3 4.5 3 6.5A3 3 0 0 1 9 11c0-1 .4-2 1-3 .2 1 .8 1.6 1.4 1.8C11 8.5 11 6 12 4Z" />
          <path {...common} d="M5 20l14-5M19 20L5 15" />
        </svg>
      );
    case 'boss':
      // A crown over a sigil — the Redactor.
      return (
        <svg viewBox="0 0 24 24" className="map-glyph" aria-hidden>
          <path {...common} d="M4 8l3 4 5-6 5 6 3-4-1.5 10H5.5L4 8Z" />
          <path {...common} d="M9 18h6" />
        </svg>
      );
  }
}

interface MapModel {
  placed: Placed[];
  nodes: readonly (readonly number[])[];
  edges: readonly (readonly (readonly number[])[])[];
  rows: number;
  rowY: (layer: number) => number;
}

/** Build the drawn model once: the generated graph laid out bottom (first stop) to top (boss). */
function useMapModel(): MapModel {
  return useMemo(() => {
    const rows = RUN.length;
    const { nodes, edges } = buildMapGraph(rows);

    // Climbing layout: layer 0 (first stop) near the bottom, the boss near the top.
    const top = 0.1;
    const bottom = 0.86;
    const rowY = (layer: number) => (rows <= 1 ? (top + bottom) / 2 : bottom - (bottom - top) * (layer / (rows - 1)));

    const kindOf = (layer: number): MapNodeKind => {
      const k = MAP_LAYER_KINDS[layer];
      if (k) return k;
      const st = RUN[layer];
      return st?.kind === 'event' ? 'event' : st?.kind === 'camp' ? 'camp' : st?.kind === 'room' ? 'room' : 'room';
    };

    const placed: Placed[] = [];
    nodes.forEach((layerCols, layer) => {
      const y = rowY(layer);
      layerCols.forEach((col, index) => {
        const links = (edges[layer]?.[index] ?? [])
          .map((j) => nodes[layer + 1]?.[j])
          .filter((c): c is number => c != null)
          .map((c) => ({ x: colX(c), y: rowY(layer + 1) }));
        placed.push({ layer, index, kind: kindOf(layer), x: colX(col), y, links });
      });
    });

    return { placed, nodes, edges, rows, rowY };
  }, []);
}

/** Where the player's picks are kept, so the road survives the map closing between stops and a reload. */
const ROUTE_KEY = 'broken-grimoire/map-route/v1';

function loadRoute(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ROUTE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function saveRoute(route: number[]): void {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
  } catch {
    // Storage blocked: the road just won't survive a reload.
  }
}

/** How long the newly lit step shows before the map lifts, so the player sees their pick land. */
const PICK_HOLD_MS = 550;

export function WorldMap({ stage, onEnter }: { stage: number; onEnter: () => void }) {
  const { placed, nodes, edges, rows, rowY } = useMapModel();

  /** The layer the player now chooses a node on: the stop the engine has just loaded. */
  const next = Math.min(Math.max(stage, 0), rows - 1);

  /**
   * The nodes picked so far, one per layer, always along real edges. A new run's map opens at stage 0 and starts
   * empty. Layers before `next` with no saved pick (an old save) fall back to the first edge up, so the road is
   * never broken.
   */
  const [route] = useState<number[]>(() => {
    const saved = next === 0 ? [] : loadRoute();
    const r: number[] = [];
    for (let l = 0; l < next; l++) {
      const options = l === 0 ? (nodes[0] ?? []).map((_, i) => i) : (edges[l - 1]?.[r[l - 1]] ?? []);
      r[l] = options.includes(saved[l]) ? saved[l] : (options[0] ?? 0);
    }
    return r;
  });
  /** The node just picked on `next`, while it lights up before the map lifts. */
  const [pick, setPick] = useState<number | null>(null);

  /** Where the player stands: the node they picked on the layer before, or nowhere yet at the first stop. */
  const here = next > 0 ? route[next - 1] : null;
  /** On `next` you may step only to a node joined to where you stand (Slay-the-Spire rule); at the start, any. */
  const options = useMemo(
    () => new Set(here == null ? (nodes[0] ?? []).map((_, i) => i) : (edges[next - 1]?.[here] ?? [])),
    [here, next, nodes, edges],
  );

  const nodeXY = (layer: number, index: number) => {
    const p = placed.find((q) => q.layer === layer && q.index === index);
    return p ? { x: p.x, y: p.y } : { x: 0.5, y: rowY(layer) };
  };

  // The lit road: the steps already taken, plus the step just picked once the player picks it. Nothing is lit
  // toward a node the player hasn't chosen.
  const walked = pick == null ? route.slice(0, next) : [...route.slice(0, next), pick];
  const road = walked.slice(1).map((index, i) => {
    const a = nodeXY(i, walked[i]);
    const b = nodeXY(i + 1, index);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });

  const choose = (index: number) => {
    if (pick != null || !options.has(index)) return;
    setPick(index);
    saveRoute([...route.slice(0, next), index]);
    window.setTimeout(onEnter, PICK_HOLD_MS);
  };

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="map-screen" role="dialog" aria-modal="true" aria-label="Run map">
      <div className="map-vignette" />
      <div className="map-head">
        <div className="map-title">The Broken Grimoire</div>
        <div className="map-sub">{pick == null ? 'Choose your path' : stageName(next)}</div>
      </div>

      <div className="map-board">
        {/* Dashed paths behind the nodes. The whole set is faint; the road taken is lit gold. */}
        <svg className="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {placed.flatMap((p) =>
            p.links.map((l, i) => (
              <line key={`l-${p.layer}-${p.index}-${i}`} className="map-line" x1={p.x * 100} y1={p.y * 100} x2={l.x * 100} y2={l.y * 100} />
            )),
          )}
          {road.map((s, i) => (
            <line key={`road-${i}`} className="map-line taken" x1={s.x1 * 100} y1={s.y1 * 100} x2={s.x2 * 100} y2={s.y2 * 100} />
          ))}
        </svg>

        {/* Nodes. */}
        {placed.map((p) => {
          const picked = p.layer === next && pick === p.index;
          const tappable = p.layer === next && pick == null && options.has(p.index);
          const state = p.layer < next ? 'done' : picked || tappable ? 'current' : 'locked';
          const chosen = (p.layer < next && route[p.layer] === p.index) || picked;
          const standing = pick == null ? p.layer === next - 1 && p.index === here : picked;
          return (
            <button
              key={`n-${p.layer}-${p.index}`}
              className={`map-node ${p.kind} ${state}${chosen ? ' chosen' : ''}`}
              style={{ left: pct(p.x), top: pct(p.y) }}
              disabled={!tappable}
              onClick={() => choose(p.index)}
              title={stageName(p.layer)}
            >
              <span className="map-node-ring" />
              <NodeGlyph kind={p.kind} />
              {standing && <span className="map-here">You are here</span>}
            </button>
          );
        })}
      </div>

      <div className="map-foot">
        <div className="map-hint">{pick == null ? 'Pick a glowing node to go on.' : `Entering ${stageName(next)}…`}</div>
      </div>
    </div>
  );
}
