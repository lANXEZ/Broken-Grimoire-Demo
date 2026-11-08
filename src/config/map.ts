/**
 * [MAP] The branching run map — a teammate's screen (scene/WorldMap.tsx).
 *
 * Drawn like Slay the Spire's route map, and generated the same way: a handful of PATHS climb from the bottom row
 * to the boss, each step moving only to an adjacent column (±1), and a node exists only where a path passes. So the
 * map comes out uneven — some columns empty, some nodes with one link and some with two or three, many nearby nodes
 * NOT joined — and the edges don't cross. It is never a full mesh.
 *
 * The choice is still an illusion ("the Wizard-of-Oz method", DESIGN.md's "illusion-of-choice map"): every node on a
 * layer leads to the SAME stop in `RUN` (engine/data.ts). One LAYER == one stop in `RUN` (index = layer index); the
 * run's first stop is the bottom row, the boss the top. All nodes on a layer share that stop's icon family.
 *
 * Tune the shape with the knobs below (COLS, PATHS, START_COLS, SEED). To change the real run, edit `RUN` in
 * engine/data.ts — the map reads RUN's length and names through the engine and grows a layer to match on its own.
 */

/** What a node looks like on the map. The engine decides what actually happens; this is only the icon + label. */
export type MapNodeKind = 'start' | 'room' | 'event' | 'camp' | 'boss';

// ---- shape knobs ---------------------------------------------------------------------------------------------
/** Column slots across the map (node columns are 0 … COLS-1). Wider = more room for paths to spread. */
export const COLS = 5;
/** The bottom-row column each path starts from. Length = number of paths. Repeats merge, so every path starting on
 *  the same column makes the first stop a SINGLE node that then branches out; the middle fans, the boss converges. */
const START_COLS = [2, 2, 2, 2, 2, 2] as const;
/** Fixed seed so the generated map is identical every render (it never reshuffles). Change it to roll a new shape. */
const SEED = 4;

/** The icon family per layer. Falls back to RUN's kind when a layer isn't listed. Index = run-stop index. */
export const MAP_LAYER_KINDS: readonly MapNodeKind[] = ['room', 'event', 'room', 'camp', 'boss'];

/** The generated graph. */
export interface MapGraph {
  /** nodes[layer] = the columns (0…COLS-1), sorted left→right, that have a node on this layer. Index = node index. */
  readonly nodes: readonly (readonly number[])[];
  /** edges[layer][nodeIndex] = indices (into nodes[layer+1]) this node links to. 1–3 each, sparse, non-crossing. */
  readonly edges: readonly (readonly (readonly number[])[])[];
}

/** Tiny deterministic PRNG (mulberry32), seeded so the map is stable across renders. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Would an edge col `from`→`to` (this row to the next) cross one already placed? Only the opposite diagonal does. */
function crosses(rowEdges: Set<string>, from: number, to: number): boolean {
  if (to === from) return false; // straight up never crosses
  return rowEdges.has(`${to}->${from}`); // the mirror diagonal would make an X
}

/**
 * Build the Slay-the-Spire-style route. Each path climbs row by row, stepping to col-1 / col / col+1 (never past
 * the edges, never across an edge already drawn), until the row below the boss, where it joins the single boss node.
 * Nodes and edges exist only where paths went, so the graph is sparse and uneven — not every neighbour is joined.
 */
export function buildMapGraph(rows: number): MapGraph {
  if (rows <= 0) return { nodes: [], edges: [] };
  const rand = rng(SEED);
  const bossCol = Math.floor(COLS / 2);

  const colSets: Set<number>[] = Array.from({ length: rows }, () => new Set<number>());
  const rowEdges: Set<string>[] = Array.from({ length: Math.max(0, rows - 1) }, () => new Set<string>());

  for (const start of START_COLS) {
    let col = Math.min(Math.max(start, 0), COLS - 1);
    for (let row = 0; row < rows; row++) {
      colSets[row].add(col);
      if (row >= rows - 1) break;
      let next: number;
      if (row === rows - 2) {
        next = bossCol; // the last step joins the single boss
      } else {
        const cands = [col - 1, col, col + 1].filter((c) => c >= 0 && c < COLS && !crosses(rowEdges[row], col, c));
        next = cands.length ? cands[Math.floor(rand() * cands.length)] : col;
      }
      rowEdges[row].add(`${col}->${next}`);
      col = next;
    }
  }

  // The boss row is always a single node.
  if (rows >= 1) colSets[rows - 1] = new Set([bossCol]);

  const nodes: number[][] = colSets.map((s) => [...s].sort((a, b) => a - b));
  const edges: number[][][] = nodes.map((layerCols, layer) => {
    if (layer >= rows - 1) return layerCols.map(() => []);
    const nextCols = nodes[layer + 1];
    return layerCols.map((col) => {
      const outs: number[] = [];
      rowEdges[layer].forEach((key) => {
        const [a, b] = key.split('->').map(Number);
        if (a !== col) return;
        const idx = nextCols.indexOf(b);
        if (idx >= 0 && !outs.includes(idx)) outs.push(idx);
      });
      return outs.sort((x, y) => x - y);
    });
  });

  return { nodes, edges };
}

/** Column index → x position across the board (0…1), with a margin so edge nodes aren't flush to the sides. */
export function colX(col: number): number {
  if (COLS <= 1) return 0.5;
  const margin = 0.12;
  return margin + (col / (COLS - 1)) * (1 - 2 * margin);
}
