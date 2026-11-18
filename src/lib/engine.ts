import { CORRIDORS, NODES, TRAINS } from './network';
import type { Corridor, Obstruction, TrainDef, TrainState, TrainEdge } from './types';

export type Edge = Corridor;

export const EDGES: Corridor[] = CORRIDORS;

const edgeByPair = new Map<string, Edge>();
for (const e of EDGES) {
  edgeByPair.set(`${e.from}|${e.to}`, e);
  edgeByPair.set(`${e.to}|${e.from}`, e);
}
export const edgeBetween = (a: string, b: string): Edge | undefined => edgeByPair.get(`${a}|${b}`);

export const nodeById = new Map(NODES.map((n) => [n.id, n]));
export { NODES };

/** Congestion (0..100) reduces achievable speed. */
export function effectiveSpeed(train: TrainState | TrainDef, edge: Edge, congestion: number): number {
  const cap = Math.min(train.maxSpeed, edge.maxSpeed);
  const singleTrackFactor = edge.tracks === 1 ? 0.85 : 1;
  const nonElectricPenalty = !edge.electrified && train.locoHp < 4000 ? 0.9 : 1;
  return Math.max(15, cap * (1 - 0.55 * (congestion / 100)) * singleTrackFactor * nonElectricPenalty);
}

export interface DijkstraResult {
  path: string[]; // node ids from start to goal
  edges: Edge[]; // edges taken
  distanceKm: number;
}

/** Classic Dijkstra over the corridor graph. `blocked` edges are excluded (weight = inf). */
export function findRoute(
  start: string,
  goal: string,
  blocked: Set<string> = new Set(),
  congestion: Map<string, number> = new Map(),
): DijkstraResult | null {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { node: string; edge: Edge }>();
  const visited = new Set<string>();

  while (true) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) { cur = id; best = d; }
    }
    if (cur === null) break;
    if (cur === goal) break;
    visited.add(cur);

    for (const edge of EDGES) {
      if (blocked.has(edge.id)) continue;
      const next = edge.from === cur ? edge.to : edge.to === cur ? edge.from : null;
      if (!next || visited.has(next)) continue;
      const cong = congestion.get(edge.id) ?? edge.baseCongestion;
      // Prefer faster, less congested corridors: hours + congestion penalty.
      const w = edge.distanceKm / Math.max(10, edge.maxSpeed * (1 - 0.55 * (cong / 100))) + (edge.tracks === 1 ? 0.35 : 0);
      const nd = best + w;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { node: cur, edge });
      }
    }
  }

  if (!dist.has(goal) || goal === start) return null;
  const path: string[] = [goal];
  const edges: Edge[] = [];
  let walk = goal;
  while (walk !== start) {
    const p = prev.get(walk);
    if (!p) return null;
    edges.unshift(p.edge);
    path.unshift(p.node);
    walk = p.node;
  }
  return { path, edges, distanceKm: edges.reduce((s, e) => s + e.distanceKm, 0) };
}

export interface World {
  clockMin: number; // minutes since 00:00 sim time
  trains: TrainState[];
  obstructions: Obstruction[];
  congestion: Map<string, number>;
  tick: number;
  seq: number;
}

function congestionMap(): Map<string, number> {
  return new Map(EDGES.map((e) => [e.id, e.baseCongestion]));
}

export function createWorld(): World {
  const trains: TrainState[] = TRAINS.flatMap((t) => {
    const edges: TrainEdge[] = [];
    const keptNodes: string[] = [t.route[0]];
    let km = 0;
    for (let i = 0; i < t.route.length - 1; i++) {
      const e = edgeBetween(t.route[i], t.route[i + 1]);
      if (!e) {
        // Route leg with no physical corridor: skip the leg and bridge the
        // route over the missing node so the train keeps a valid path.
        console.warn(`createWorld: no corridor ${t.route[i]} -> ${t.route[i + 1]}, trimming leg from ${t.id}`);
        keptNodes.push(t.route[i + 1]);
        continue;
      }
      edges.push(e);
      keptNodes.push(t.route[i + 1]);
      km += e.distanceKm;
    }
    const firstEdge = edges[0];
    if (!firstEdge) return [];
    const spawnKm = (t.scheduledDeparture / 60) * effectiveSpeed(t, firstEdge, firstEdge.baseCongestion);
    const startDelay = Math.round(((t.scheduledDeparture * 7) % 23) - 6) * (t.type === 'bulk' || t.type === 'manifest' ? 1 : 0.4);
    const state: TrainState = {
      ...t,
      route: keptNodes,
      _edges: edges,
      edgeIdx: 0,
      progressKm: Math.min(Math.max(0, spawnKm), firstEdge.distanceKm * 0.9),
      speed: 0,
      delayMin: Math.round(startDelay),
      riskPct: 0,
      status: 'running',
      loadPct: 55 + ((t.id.charCodeAt(3) * 13 + t.cars * 7) % 40),
      rerouted: false,
      totalRouteKm: km,
      distanceCoveredKm: 0,
    };
    return [state];
  });
  // Convert spawn progress on first edge into distance covered
  for (const t of trains) t.distanceCoveredKm = t.progressKm;
  return { clockMin: 6 * 60, trains, obstructions: [], congestion: congestionMap(), tick: 0, seq: 0 };
}

export interface TickResult {
  world: World;
  reroutedTrainIds: string[];
  newObstruction?: Obstruction;
}

function advanceTrain(w: World, t: TrainState, occupancy: Map<string, number>, punctualityWeight: number): void {
  if (t.edgeIdx >= t.route.length - 1 && t.progressKm >= 0) {
    // at terminus
    t.speed = 0;
    t.status = 'arrival';
    return;
  }
  const edge = t._edges[t.edgeIdx];
  const cong = w.congestion.get(edge.id) ?? edge.baseCongestion;
  const v = effectiveSpeed(t, edge, cong);

  // Single-track conflict: if edge over capacity, hold lowest-priority trains.
  const cap = edge.tracks === 1 ? 1 : 3;
  const occ = occupancy.get(edge.id) ?? 0;
  const priority = t.type === 'express' ? 4 : t.type === 'intercity' ? 3 : t.type === 'regional' ? 3 : t.type === 'intermodal' ? 2 : 1;
  const effectivePriority = priority + punctualityWeight * (t.tonnage === 0 ? 1 : 0);

  if (occ > cap && edge.tracks === 1) {
    // Held at a siding: trains further along keep moving; we approximate by
    // holding trains with lower priority when the section is saturated.
    t.status = 'held';
    t.speed = 0;
    t.delayMin += 1;
    return;
  }
  void effectivePriority;

  // Slow orders on badly worn track
  const wearFactor = edge.wear > 60 ? 0.75 : edge.wear > 45 ? 0.9 : 1;
  const vEff = v * wearFactor * (0.92 + 0.08 * Math.min(1, t.loadPct / 100 + 0.1));
  t.speed = vEff;
  t.status = t.rerouted ? 'diverted' : 'running';
  const step = vEff / 60; // 1 tick = 1 sim-minute
  t.progressKm += step;
  t.distanceCoveredKm += step;

  // Delay accrues in congestion
  if (cong > 70) t.delayMin += 0.35;
  else if (cong > 55 && edge.tracks === 1) t.delayMin += 0.2;

  if (t.progressKm >= edge.distanceKm) {
    t.progressKm = 0;
    t.edgeIdx += 1;
    if (t.edgeIdx >= t.route.length - 1) {
      t.status = 'arrival';
      t.speed = 0;
    }
  }
}

export function tickWorld(w: World, punctualityWeight = 0): TickResult {
  const next: World = { ...w, clockMin: w.clockMin + 1, tick: w.tick + 1, seq: w.seq + 1 };
  next.trains = w.trains.map((t) => ({ ...t }));
  next.congestion = new Map(w.congestion);

  // Recompute congestion from live occupancy + base
  const occupancy = new Map<string, number>();
  for (const t of next.trains) {
    if (t.status === 'arrival') continue;
    const edge = t._edges[Math.min(t.edgeIdx, t._edges.length - 1)];
    occupancy.set(edge.id, (occupancy.get(edge.id) ?? 0) + 1);
  }
  for (const e of EDGES) {
    const occ = occupancy.get(e.id) ?? 0;
    const cap = e.tracks === 1 ? 1.2 : 3.5;
    const live = e.baseCongestion * 0.7 + Math.min(40, (occ / cap) * 45);
    next.congestion.set(e.id, Math.min(98, live));
  }

  for (const t of next.trains) {
    if (t.status === 'arrival') continue;
    // Obstruction ahead on current edge? Reroute remainder of journey.
    const curEdge = t._edges[t.edgeIdx];
    if (curEdge && next.obstructions.some((o) => o.corridorId === curEdge.id)) {
      const fromNode = t.edgeIdx === 0 ? t.route[0] : t.route[t.edgeIdx];
      const remainingNodes = t.route.slice(t.edgeIdx + 1);
      const goal = remainingNodes[remainingNodes.length - 1] ?? fromNode;
      const blocked = new Set(next.obstructions.map((o) => o.corridorId));
      const alt = findRoute(fromNode, goal, blocked, next.congestion);
      if (alt) {
        // Splice: keep route up to current node, then alternate path
        const head = t.route.slice(0, t.edgeIdx + 1);
        const newRoute = [...head, ...alt.path.slice(1)];
        const newEdges: Edge[] = [];
        let km = 0;
        for (let i = 0; i < newRoute.length - 1; i++) {
          const e = edgeBetween(newRoute[i], newRoute[i + 1]);
          if (!e) continue;
          newEdges.push(e);
          km += e.distanceKm;
        }
        if (newEdges.length === 0) {
          t.status = 'held';
          t.speed = 0;
          t.delayMin += 1.5;
          continue;
        }
        const coveredBefore = t._edges.slice(0, t.edgeIdx).reduce((s, e) => s + e.distanceKm, 0);
        t.route = newRoute;
        t._edges = newEdges;
        t.totalRouteKm = km + coveredBefore;
        t.edgeIdx = 0;
        t.progressKm = 0;
        t.rerouted = true;
        t.delayMin += 8; // diversion setup penalty
        next.seq += 1;
        t.status = 'diverted';
      } else {
        t.status = 'held';
        t.speed = 0;
        t.delayMin += 1.5;
        continue;
      }
    }
    advanceTrain(next, t, occupancy, punctualityWeight);
  }

  // Risk model: delay + congestion + critical sensors on remaining corridors
  for (const t of next.trains) {
    const remaining = t._edges.slice(t.edgeIdx);
    const congAvg = remaining.length
      ? remaining.reduce((s, e) => s + (next.congestion.get(e.id) ?? e.baseCongestion), 0) / remaining.length
      : 0;
    const criticalSensors = remaining.filter((e) => e.wear > 60).length;
    const base = Math.min(97, t.delayMin * 1.8 + congAvg * 0.55 + criticalSensors * 9);
    t.riskPct = t.status === 'arrival' ? 0 : Math.round(base);
  }

  return { world: next, reroutedTrainIds: next.trains.filter((t) => t.rerouted).map((t) => t.id) };
}

export function injectObstruction(w: World, corridorId: string, kind: Obstruction['kind'], label: string): World {
  return { ...w, obstructions: [...w.obstructions, { corridorId, kind, label, sinceTick: w.tick }] };
}

export function clearObstructions(w: World): World {
  return { ...w, obstructions: [] };
}

export const fmtClock = (min: number): string => {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function etaMinutes(t: TrainState): number {
  const remaining = t._edges.slice(t.edgeIdx).reduce((s, e, i) => s + (i === 0 ? e.distanceKm - t.progressKm : e.distanceKm), 0);
  const avg = t.speed > 5 ? t.speed : effectiveSpeed(t, t._edges[Math.min(t.edgeIdx, t._edges.length - 1)] ?? EDGES[0], 50);
  return remaining / Math.max(15, avg);
}

export function worldKpis(w: World) {
  const running = w.trains.filter((t) => t.status !== 'arrival');
  const onTime = running.filter((t) => t.delayMin <= 5).length;
  const otp = running.length ? Math.round((onTime / running.length) * 100) : 100;
  const tonnage = running.reduce((s, t) => s + (t.tonnage / 1000), 0);
  const avgWear = EDGES.reduce((s, e) => s + e.wear, 0) / EDGES.length;
  const obstructionPenalty = w.obstructions.length * 6;
  const health = Math.max(0, Math.round(100 - avgWear * 0.6 - obstructionPenalty));
  const diverted = w.trains.filter((t) => t.rerouted).length;
  const totalDelay = running.reduce((s, t) => s + t.delayMin, 0);
  return {
    activeTrains: running.length,
    otp,
    tonnageKt: Math.round(tonnage * 10) / 10,
    health,
    diverted,
    totalDelayMin: Math.round(totalDelay),
    avgDelay: running.length ? Math.round(totalDelay / running.length) : 0,
  };
}
