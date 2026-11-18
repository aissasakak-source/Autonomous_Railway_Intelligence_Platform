import { useEffect, useMemo, useRef } from 'react';
import { Activity, Brain, Route, ShieldCheck, Siren } from 'lucide-react';
import type { Obstruction, TrainState } from '../lib/types';
import { EDGES, edgeBetween, effectiveSpeed, fmtClock, nodeById } from '../lib/engine';
import { Bar, Panel } from './ui';

// Stringline (time-distance) diagram: x = time window, y = nodes along a corridor chain.
export function PredictionView({
  trains,
  congestion,
  obstructions,
  selectedTrain,
  onSelectTrain,
  simMinute,
}: {
  trains: TrainState[];
  congestion: Map<string, number>;
  obstructions: Obstruction[];
  selectedTrain: string | null;
  onSelectTrain: (id: string | null) => void;
  simMinute: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Corridor chain for the stringline: Northgate -> Capstone trunk via Ironbridge
  const chain = useMemo(() => ['n-capstone', 'n-vale', 'c-ironbridge', 'c-central', 'c-riverside', 'n-steelcity'], []);
  const chainEdges = useMemo(() => {
    const es: (ReturnType<typeof edgeBetween>)[] = [];
    for (let i = 0; i < chain.length - 1; i++) es.push(edgeBetween(chain[i], chain[i + 1]));
    return es;
  }, [chain]);
  const chainKm = chainEdges.reduce((s, e) => s + (e?.distanceKm ?? 0), 0);

  const trainsOnChain = useMemo(
    () => trains.filter((t) => t.route.some((n) => chain.includes(n)) && t.status !== 'arrival'),
    [trains],
  );

  const startMin = simMinute - 60;
  const spanMin = 240;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padL = 90;
    const padR = 14;
    const padT = 24;
    const padB = 30;

    ctx.fillStyle = '#0B1120';
    ctx.fillRect(0, 0, W, H);

    const xOf = (min: number) => padL + ((min - startMin) / spanMin) * (W - padL - padR);
    const yOf = (km: number) => padT + (km / chainKm) * (H - padT - padB);

    // Node gridlines
    ctx.font = '10px ui-monospace, monospace';
    let kmAcc = 0;
    chain.forEach((nid, i) => {
      const n = nodeById.get(nid)!;
      const y = yOf(kmAcc);
      ctx.strokeStyle = 'rgba(30,41,59,0.9)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'right';
      ctx.fillText(`${n.code}  ${n.name}`, padL - 8, y + 3);
      kmAcc += chainEdges[i]?.distanceKm ?? 0;
    });

    // Time gridlines every 30 min
    ctx.textAlign = 'center';
    for (let m = Math.ceil(startMin / 30) * 30; m <= startMin + spanMin; m += 30) {
      const x = xOf(m);
      ctx.strokeStyle = 'rgba(30,41,59,0.7)';
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();
      ctx.fillStyle = '#64748B';
      ctx.fillText(fmtClock(m), x, H - padB + 14);
    }

    // Obstruction shading
    for (const o of obstructions) {
      const idx = chainEdges.findIndex((e) => e && e.id === o.corridorId);
      if (idx === -1) continue;
      const yStart = yOf(chainEdges.slice(0, idx).reduce((s, e) => s + (e?.distanceKm ?? 0), 0));
      const yEnd = yOf(chainEdges.slice(0, idx + 1).reduce((s, e) => s + (e?.distanceKm ?? 0), 0));
      ctx.fillStyle = 'rgba(239,68,68,0.16)';
      ctx.fillRect(padL, yStart, W - padL - padR, yEnd - yStart);
      ctx.strokeStyle = 'rgba(239,68,68,0.7)';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(padL, yStart, W - padL - padR, yEnd - yStart);
      ctx.setLineDash([]);
      ctx.fillStyle = '#FCA5A5';
      ctx.textAlign = 'left';
      ctx.fillText(`BLOCK: ${o.label}`, padL + 6, (yStart + yEnd) / 2 + 3);
    }

    // Train lines
    for (const t of trainsOnChain) {
      const color = t.status === 'held' ? '#F59E0B' : t.rerouted ? '#10B981' : t.type === 'express' || t.type === 'intercity' ? '#06B6D4' : '#38BDF8';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      let drawKm = 0;
      let started = false;
      let tMin = simMinute - (t.distanceCoveredKm / Math.max(20, t.speed || 60));
      // walk from current position backwards and forwards using avg speeds
      const pts: { x: number; y: number }[] = [];

      // Backward: already covered distance at avg speed
      const backMin = t.distanceCoveredKm / Math.max(20, t.speed || 60);
      // current point
      const curEdge = t._edges[Math.min(t.edgeIdx, t._edges.length - 1)];
      const coveredOnChain = kmOnChain(t) + t.progressKm;
      if (coveredOnChain > 0 && curEdge) {
        pts.push({ x: xOf(simMinute), y: yOf(coveredOnChain) });
        // Forward projection: remaining chain km at effective speeds
        let remKm = chainKm - coveredOnChain;
        let acc = coveredOnChain;
        let minute = simMinute;
        const stepMin = 5;
        while (remKm > 0 && minute < startMin + spanMin) {
          // find which chain edge acc is on
          let idx = 0;
          let accKm = 0;
          while (idx < chainEdges.length - 1 && accKm + (chainEdges[idx]?.distanceKm ?? 0) < acc) {
            accKm += chainEdges[idx]?.distanceKm ?? 0;
            idx += 1;
          }
          const e = chainEdges[idx];
          if (!e) break;
          const v = effectiveSpeed(t, e, congestion.get(e.id) ?? e.baseCongestion);
          const stepKm = (v / 60) * stepMin;
          acc = Math.min(chainKm, acc + stepKm);
          remKm -= stepKm;
          minute += stepMin;
          pts.push({ x: xOf(minute), y: yOf(acc) });
        }
      }

      // Backward tail
      if (t.distanceCoveredKm > 0) {
        const tail = { x: xOf(simMinute - backMin), y: yOf(Math.max(0, coveredOnChain - t.distanceCoveredKm)) };
        pts.unshift(tail);
      }

      void drawKm;
      void started;

      for (const p of pts) {
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      // Label + dot at current position
      const cur = pts[0];
      if (cur) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 9px ui-monospace, monospace';
        ctx.fillText(t.id, cur.x + 5, cur.y - 4);
        ctx.font = '10px ui-monospace, monospace';
      }
      void tMin;
    }

    // "now" line
    const nx = xOf(simMinute);
    ctx.strokeStyle = 'rgba(6,182,212,0.55)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nx, padT);
    ctx.lineTo(nx, H - padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [trains, congestion, obstructions, simMinute, chain, chainEdges, chainKm, startMin, trainsOnChain]);

  // Bottleneck forecast: corridors where projected occupancy exceeds capacity
  const forecasts = useMemo(() => {
    const list: { corridorId: string; route: string; peakMin: number; severity: 'warning' | 'critical'; trains: string[] }[] = [];
    for (const e of EDGES) {
      const cong = congestion.get(e.id) ?? e.baseCongestion;
      const tks = trains.filter((t) => {
        const rem = t._edges.slice(t.edgeIdx).some((x) => x.id === e.id);
        return rem && t.status !== 'arrival';
      });
      const cap = e.tracks === 1 ? 1.2 : 3.5;
      if (tks.length >= Math.ceil(cap) && cong > 55) {
        list.push({
          corridorId: e.id,
          route: `${nodeById.get(e.from)?.code} → ${nodeById.get(e.to)?.code}`,
          peakMin: Math.round(12 + cong * 0.4),
          severity: cong > 72 ? 'critical' : 'warning',
          trains: tks.map((t) => t.id),
        });
      }
    }
    return list.sort((a, b) => b.peakMin - a.peakMin).slice(0, 6);
  }, [trains, congestion]);

  const rerouteCandidates = useMemo(
    () => trains.filter((t) => t.riskPct > 45 && t.status !== 'arrival').slice(0, 6),
    [trains],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4 xl:h-full min-h-0">
      <div className="xl:col-span-2 flex flex-col gap-4 min-h-0">
        <Panel
          title="Live Stringline Diagram — Capstone–Steel City Trunk"
          subtitle="Time–distance chart with forward-projected running lines. Shaded band = injected obstruction."
          className="flex-1 min-h-0"
          actions={
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Passenger</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Diverted</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> Held</span>
            </div>
          }
        >
          <canvas ref={canvasRef} className="w-full rounded-lg" style={{ minHeight: 260 }} />
        </Panel>

        <Panel title="Predictive Timetable — Arrival Risk Board" subtitle="AI-predicted delay probability per service, updated every simulation minute">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left border-b border-[#1E293B]">
                  <th className="py-1.5 pr-3 font-medium">Train</th>
                  <th className="py-1.5 pr-3 font-medium">Destination</th>
                  <th className="py-1.5 pr-3 font-medium">ETA</th>
                  <th className="py-1.5 pr-3 font-medium">Delay</th>
                  <th className="py-1.5 pr-3 font-medium w-40">Delay Risk</th>
                  <th className="py-1.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {trains.slice(0, 10).map((t) => {
                  const tone = t.riskPct > 60 ? 'text-red-400' : t.riskPct > 30 ? 'text-amber-400' : 'text-emerald-400';
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-[#1E293B]/50 cursor-pointer transition-colors hover:bg-cyan-500/5 ${selectedTrain === t.id ? 'bg-cyan-500/10' : ''}`}
                      onClick={() => onSelectTrain(selectedTrain === t.id ? null : t.id)}
                    >
                      <td className="py-1.5 pr-3 font-mono-num font-semibold text-slate-200">{t.id}</td>
                      <td className="py-1.5 pr-3 text-slate-400">{nodeById.get(t.route[t.route.length - 1])?.code}</td>
                      <td className="py-1.5 pr-3 font-mono-num text-slate-300">{t.status === 'arrival' ? '—' : fmtClock(simMinute + (t._edges.slice(t.edgeIdx).reduce((s, e) => s + e.distanceKm, 0) / Math.max(20, t.speed || 60)))}</td>
                      <td className={`py-1.5 pr-3 font-mono-num ${t.delayMin > 10 ? 'text-red-400' : t.delayMin > 3 ? 'text-amber-400' : 'text-emerald-400'}`}>{t.delayMin <= 0 ? 'On time' : `+${Math.round(t.delayMin)}m`}</td>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <Bar pct={t.riskPct} tone={t.riskPct > 60 ? 'crimson' : t.riskPct > 30 ? 'amber' : 'emerald'} height={4} />
                          <span className={`font-mono-num text-[10px] ${tone} w-9 text-right`}>{t.riskPct}%</span>
                        </div>
                      </td>
                      <td className={`py-1.5 font-mono-num ${t.status === 'held' ? 'text-amber-400' : t.rerouted ? 'text-emerald-400' : t.status === 'arrival' ? 'text-slate-600' : 'text-cyan-400'}`}>
                        {t.status === 'held' ? 'HELD' : t.rerouted ? 'DIVERTED' : t.status === 'arrival' ? 'ARRIVED' : 'RUNNING'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4 min-h-0 xl:overflow-y-auto">
        <Panel title="Cascade Bottleneck Forecast" subtitle="Corridor sections predicted to saturate before the next hour">
          <div className="space-y-2.5">
            {forecasts.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2.5">
                <ShieldCheck size={14} /> No bottleneck formation predicted in horizon
              </div>
            )}
            {forecasts.map((f) => (
              <div key={f.corridorId} className={`rounded-lg border px-3 py-2 ${f.severity === 'critical' ? 'border-red-500/35 bg-red-500/8' : 'border-amber-500/35 bg-amber-500/8'}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-num font-semibold text-slate-200">{f.route}</span>
                  <span className={`font-mono-num ${f.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>T-{f.peakMin}m</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Siren size={10} /> {f.trains.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Dynamic Routing Engine" subtitle="Dijkstra over corridor graph — recommended interventions">
          <div className="space-y-2">
            {rerouteCandidates.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500 px-2 py-1.5">
                <Brain size={13} className="text-cyan-400" /> All routes optimal — no re-routing recommended
              </div>
            )}
            {rerouteCandidates.map((t) => {
              const goal = nodeById.get(t.route[t.route.length - 1])?.code;
              return (
                <div key={t.id} className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2 flex items-center gap-2.5">
                  <Route size={14} className="text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-mono-num font-semibold text-slate-200">{t.id} → {goal}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {t.rerouted ? 'Diverted via alternate path — sidings allocated for overtakes' : 'Recommend siding hold at next junction to protect path'}
                    </div>
                  </div>
                  <Activity size={13} className={`ml-auto shrink-0 ${t.riskPct > 60 ? 'text-red-400' : 'text-amber-400'}`} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function kmOnChain(t: TrainState): number {
  // km covered along the chain up to current edge (only counts chain edges)
  let km = 0;
  const chain = ['n-capstone', 'n-vale', 'c-ironbridge', 'c-central', 'c-riverside', 'n-steelcity'];
  for (let i = 0; i < t.edgeIdx; i++) {
    const e = t._edges[i];
    if (e && chain.includes(e.from) && chain.includes(e.to)) km += e.distanceKm;
  }
  return km;
}
