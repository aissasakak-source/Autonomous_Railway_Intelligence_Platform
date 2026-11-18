import { WORK_ORDERS } from './network';
import { YARDS } from './network';
import type { WorkOrder, YardDef } from './types';

export interface OptimizerWeights {
  throughput: number; // maximize freight throughput
  emptyMiles: number; // minimize empty repositioning
  punctuality: number; // prioritize passenger punctuality
}

export interface OptimizerKpis {
  freightThroughputKt: number;
  emptyWagonMilesK: number;
  passengerDelayMin: number;
  fleetUtilPct: number;
  yardDwellH: number;
  energyGWh: number;
}

const BASE: OptimizerKpis = {
  freightThroughputKt: 41.2,
  emptyWagonMilesK: 68.4,
  passengerDelayMin: 6.8,
  fleetUtilPct: 71.5,
  yardDwellH: 7.1,
  energyGWh: 18.4,
};

export function optimize(weights: OptimizerWeights): { kpis: OptimizerKpis; allocations: YardAllocation[] } {
  const w = weights;
  const norm = w.throughput + w.emptyMiles + w.punctuality || 1;

  // Heavy throughput emphasis: wagons pushed to demand points, more empties move.
  // Heavy empty-mile emphasis: wagons stay near yards, some demand unmet.
  const repositionAggression = (w.throughput * 1.4 + w.emptyMiles * 0.3) / norm;
  const dwellPenalty = (w.throughput * 0.8 + w.punctuality * 0.6) / norm;
  const paxPriority = (w.punctuality * 1.6 + w.throughput * 0.2) / norm;

  const kpis: OptimizerKpis = {
    freightThroughputKt: round1(BASE.freightThroughputKt * (0.86 + repositionAggression * 0.32)),
    emptyWagonMilesK: round1(BASE.emptyWagonMilesK * (1.25 - repositionAggression * 0.55)),
    passengerDelayMin: round1(BASE.passengerDelayMin * (1.3 - paxPriority * 0.6)),
    fleetUtilPct: round1(BASE.fleetUtilPct * (0.9 + repositionAggression * 0.22)),
    yardDwellH: round1(BASE.yardDwellH * (1.25 - dwellPenalty * 0.45), 10),
    energyGWh: round1(BASE.energyGWh * (0.94 + repositionAggression * 0.18)),
  };

  const allocations: YardAllocation[] = YARDS.map((y) => allocate(y, repositionAggression));
  return { kpis, allocations };
}

export interface YardAllocation {
  yard: YardDef;
  sendTo: string;
  wagonsMoved: number;
  emptyKm: number;
  netDemandAfter: number;
}

function allocate(y: YardDef, aggression: number): YardAllocation {
  const others = YARDS.filter((o) => o.id !== y.id);
  const surplus = y.wagonsOnHand - y.wagonDemand;
  if (surplus <= 40 || others.length === 0) {
    return { yard: y, sendTo: others[0]?.nodeId ?? y.nodeId, wagonsMoved: 0, emptyKm: 0, netDemandAfter: Math.max(0, y.wagonDemand - y.wagonsOnHand) };
  }
  // Target the yard with the largest deficit, scaled by aggression
  const deficitTarget = others.reduce((a, b) => (b.wagonDemand - b.wagonsOnHand > a.wagonDemand - a.wagonsOnHand ? b : a));
  const deficit = Math.max(0, deficitTarget.wagonDemand - deficitTarget.wagonsOnHand);
  const move = Math.min(Math.round(surplus * 0.8 * aggression), deficit);
  const avgLegKm = 320;
  return {
    yard: y,
    sendTo: deficitTarget.nodeId,
    wagonsMoved: move,
    emptyKm: Math.round((move * avgLegKm) / 10) / 100, // thousand km
    netDemandAfter: Math.max(0, deficit - move),
  };
}

const round1 = (v: number, mul = 1) => Math.round(v * 10 * mul) / (10 * mul);

// Maintenance window scheduling: slot work orders into lowest-traffic night
// windows on their corridor without exceeding 4 concurrent crews.
export interface ScheduledWork extends WorkOrder {
  window?: string;
}

export function scheduleWindows(corridorTraffic: (corridorId: string) => number): ScheduledWork[] {
  const pending = [...WORK_ORDERS];
  // P1 first, then longest first (bin packing feel)
  pending.sort((a, b) => {
    const pr = (p: WorkOrder['priority']) => (p === 'P1' ? 0 : p === 'P2' ? 1 : 2);
    if (pr(a.priority) !== pr(b.priority)) return pr(a.priority) - pr(b.priority);
    return b.durationH - a.durationH;
  });

  const nightStart = 23 * 60 + 30; // 23:30
  const slots: { day: number; usedH: number; crews: number }[] = Array.from({ length: 5 }, () => ({ day: 0, usedH: 0, crews: 0 }));

  return pending.map((wo) => {
    const traffic = corridorTraffic(wo.corridorId);
    // Congested corridors get the deepest night window (00:30 start) to protect freight.
    const startOffset = traffic > 60 ? 60 : 30;
    const winH = wo.durationH + 1.5; // setup + protection buffer
    // find first slot with crew capacity
    let slot = slots.find((s) => s.crews < 2);
    if (!slot) slot = slots[0];
    const dayIdx = slots.indexOf(slot);
    slot.crews += 1;
    slot.usedH += winH;
    const startMin = nightStart + startOffset - 24 * 60 + dayIdx * 24 * 60; // absolute
    const endMin = startMin + winH * 60;
    const fmt = (m: number) => {
      const mm = ((m % 1440) + 1440) % 1440;
      return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
    };
    return { ...wo, status: 'scheduled' as const, window: `D+${dayIdx} ${fmt(startMin)}-${fmt(endMin)}` };
  });
}
