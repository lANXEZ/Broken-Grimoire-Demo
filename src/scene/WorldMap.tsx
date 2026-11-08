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
 * `stage` is the player's position in the run (GameState.stage). Lower layers (nearer the bottom) are travelled, the
 * layer at `stage` is live, higher layers are still ahead.
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

export function WorldMap({ stage, onEnter }: { stage: number; onEnter: () => void }) {
  const { placed, nodes, edges, rows, rowY } = useMapModel();
  // Which node the player picked on each layer they've reached, so the lit "road" follows real edges.
  const [picked, setPicked] = useState<Record<number, number>>({});

  const current = Math.min(Math.max(stage, 0), rows - 1);

  // The start node nearest the centre, used until the player taps a different entry.
  const defaultStart = useMemo(() => {
    const layer0 = nodes[0] ?? [];
    const mid = (Math.min(...layer0) + Math.max(...layer0)) / 2;
    let best = 0;
    layer0.forEach((c, i) => {
      if (Math.abs(c - mid) < Math.abs(layer0[best] - mid)) best = i;
    });
    return best;
  }, [nodes]);

  const firstChild = (layer: number, nodeIndex: number) => edges[layer]?.[nodeIndex]?.[0] ?? 0;

  // The route the player is on: their picks where made, otherwise following the first edge up from the last node.
  const route = useMemo(() => {
    const r: number[] = [];
    r[0] = picked[0] ?? defaultStart;
    for (let l = 1; l < rows; l++) {
      const parent = r[l - 1];
      const children = edges[l - 1]?.[parent] ?? [];
      r[l] = picked[l] != null && children.includes(picked[l]) ? picked[l] : (children[0] ?? firstChild(l - 1, parent));
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, defaultStart, rows]);

  // On the live layer you may step only to a node the path connects to from where you stand (Slay-the-Spire rule).
  const tappableSet = useMemo(() => {
    if (current === 0) return new Set((nodes[0] ?? []).map((_, i) => i));
    return new Set(edges[current - 1]?.[route[current - 1]] ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, route]);

  const nodeXY = (layer: number, index: number) => {
    const p = placed.find((q) => q.layer === layer && q.index === index);
    return p ? { x: p.x, y: p.y } : { x: 0.5, y: rowY(layer) };
  };

  // The lit road already walked: route[0] → route[1] → … → route[current], all along real edges.
  const roadSegments = useMemo(() => {
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let l = 0; l < current; l++) {
      const a = nodeXY(l, route[l]);
      const b = nodeXY(l + 1, route[l + 1]);
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, current]);

  const enter = () => onEnter();
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="map-screen" role="dialog" aria-modal="true" aria-label="Run map">
      <div className="map-vignette" />
      <div className="map-head">
        <div className="map-title">The Broken Grimoire</div>
        <div className="map-sub">Choose your path — {stageName(current)}</div>
      </div>

      <div className="map-board">
        {/* Dashed paths behind the nodes. The whole set is faint; the road already walked is lit gold. */}
        <svg className="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {placed.flatMap((p) =>
            p.links.map((l, i) => (
              <line key={`l-${p.layer}-${p.index}-${i}`} className="map-line" x1={p.x * 100} y1={p.y * 100} x2={l.x * 100} y2={l.y * 100} />
            )),
          )}
          {roadSegments.map((s, i) => (
            <line key={`road-${i}`} className="map-line taken" x1={s.x1 * 100} y1={s.y1 * 100} x2={s.x2 * 100} y2={s.y2 * 100} />
          ))}
        </svg>

        {/* Nodes. */}
        {placed.map((p) => {
          const onRoute = route[p.layer] === p.index;
          const tappable = p.layer === current && tappableSet.has(p.index);
          const base = p.layer < current ? 'done' : p.layer === current ? (tappable ? 'current' : 'locked') : 'locked';
          return (
            <button
              key={`n-${p.layer}-${p.index}`}
              className={`map-node ${p.kind} ${base}${onRoute && base !== 'locked' ? ' chosen' : ''}`}
              style={{ left: pct(p.x), top: pct(p.y) }}
              disabled={!tappable}
              onClick={() => {
                if (!tappable) return;
                setPicked((prev) => ({ ...prev, [current]: p.index }));
                enter();
              }}
              title={stageName(p.layer)}
            >
              <span className="map-node-ring" />
              <NodeGlyph kind={p.kind} />
              {onRoute && p.layer === current && <span className="map-here">You are here</span>}
            </button>
          );
        })}
      </div>

      <div className="map-foot">
        <button
          className="hud-button primary"
          onClick={() => {
            setPicked((prev) => (prev[current] != null ? prev : { ...prev, [current]: route[current] }));
            enter();
          }}
        >
          Enter {stageName(current)}
        </button>
      </div>
    </div>
  );
}
