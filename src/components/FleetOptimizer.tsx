import { useMemo, useState } from 'react';
import {
  BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, PolarRadiusAxis, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { ArrowRightLeft, Gauge, Package, Route, SlidersHorizontal, Timer, Zap } from 'lucide-react';
import type { World } from '../lib/engine';
import { optimize, type OptimizerWeights } from '../lib/optimizer';
import { nodeById } from '../lib/engine';
import { Bar as MiniBar, Panel } from './ui';
import { NODES, TRAINS } from '../lib/network';

const tooltipStyle = {
  backgroundColor: '#0F172A',
  border: '1px solid #1E293B',
  borderRadius: 8,
  fontSize: 12,
  color: '#E2E8F0',
};

function WeightSlider({ label, desc, value, onChange, tone }: { label: string; desc: string; value: number; onChange: (v: number) => void; tone: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3.5 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-200">{label}</span>
        <span className={`font-mono-num text-xs font-bold ${tone}`}>{value}</span>
      </div>
      <p className="text-[10px] text-slate-500 mb-2 leading-snug">{desc}</p>
      <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

export function FleetOptimizer({ world, onOptimizerRun }: { world: World; onOptimizerRun: (summary: string) => void }) {
  const [weights, setWeights] = useState<OptimizerWeights>({ throughput: 5, emptyMiles: 5, punctuality: 5 });
  const [runs, setRuns] = useState(0);
  const result = useMemo(() => optimize(weights), [weights]);

  const applyPlan = () => {
    setRuns((r) => r + 1);
    const moved = result.allocations.reduce((s, a) => s + a.wagonsMoved, 0);
    onOptimizerRun(`Optimizer plan #${runs + 1} committed — ${moved} empty wagons repositioned, projected throughput ${result.kpis.freightThroughputKt} kt/day`);
  };

  const allocationData = result.allocations.map((a) => ({
    name: nodeById.get(a.yard.nodeId)?.code ?? a.yard.nodeId,
    onHand: a.yard.wagonsOnHand,
    demand: a.yard.wagonDemand,
    moved: a.wagonsMoved,
  }));

  const radarData = [
    { k: 'Throughput', v: Math.min(100, (result.kpis.freightThroughputKt / 55) * 100) },
    { k: 'Empty-Mile Savings', v: Math.min(100, ((90 - result.kpis.emptyWagonMilesK) / 60) * 100) },
    { k: 'Punctuality', v: Math.min(100, ((15 - result.kpis.passengerDelayMin) / 12) * 100) },
    { k: 'Fleet Utilisation', v: result.kpis.fleetUtilPct },
    { k: 'Yard Velocity', v: Math.min(100, ((12 - result.kpis.yardDwellH) / 8) * 100) },
    { k: 'Energy Efficiency', v: Math.min(100, ((24 - result.kpis.energyGWh) / 10) * 100) },
  ];

  const wagonScatter = NODES.filter((n) => n.type === 'yard' || n.type === 'freight-hub').map((n) => ({
    x: n.x,
    y: n.y,
    z: (n.code === 'SCY' ? 412 : n.code === 'RVM' ? 265 : n.code === 'SMY' ? 348 : n.code === 'HVP' ? 220 : 180),
    name: n.code,
  }));

  const urgentTrains = world.trains
    .filter((t) => t.tonnage > 0 && t.status !== 'arrival')
    .slice(0, 5)
    .map((t) => ({ id: t.id, tonnage: t.tonnage, cars: t.cars, load: t.loadPct, delay: Math.round(t.delayMin) }));

  return (
    <div className="grid grid-cols-12 gap-4 h-full min-h-0 overflow-y-auto pr-1">
      {/* Sliders */}
      <div className="col-span-3 flex flex-col gap-3">
        <Panel title="Dispatch Priorities" subtitle="Move the sliders — the OR solver recomputes the fleet plan instantly">
          <div className="space-y-3">
            <WeightSlider label="Maximise Freight Throughput" desc="Push more wagon groups into active service; accepts extra empty running." value={weights.throughput} onChange={(v) => setWeights((w) => ({ ...w, throughput: v }))} tone="text-emerald-400" />
            <WeightSlider label="Minimise Empty Repositioning" desc="Keep wagons near base yards; trades off surge capacity." value={weights.emptyMiles} onChange={(v) => setWeights((w) => ({ ...w, emptyMiles: v }))} tone="text-cyan-400" />
            <WeightSlider label="Prioritise Express Punctuality" desc="Protect passenger paths; freight may wait at sidings." value={weights.punctuality} onChange={(v) => setWeights((w) => ({ ...w, punctuality: v }))} tone="text-amber-400" />
          </div>
          <button
            onClick={applyPlan}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 text-sm font-semibold py-2.5 transition-colors"
          >
            <SlidersHorizontal size={15} /> Commit Optimiser Plan
          </button>
          <div className="mt-2 text-[10px] text-slate-500 text-center">Solver: mixed-integer LP · 4 allocations · solved in 240 ms</div>
        </Panel>

        <Panel title="Projected KPIs">
          <div className="grid grid-cols-2 gap-2.5">
            <Kpi icon={<Package size={14} />} label="Throughput" value={`${result.kpis.freightThroughputKt} kt/d`} tone="text-emerald-400" />
            <Kpi icon={<Route size={14} />} label="Empty wagon-miles" value={`${result.kpis.emptyWagonMilesK}k`} tone="text-cyan-400" />
            <Kpi icon={<Timer size={14} />} label="Pax delay" value={`${result.kpis.passengerDelayMin} min`} tone="text-amber-400" />
            <Kpi icon={<Gauge size={14} />} label="Fleet utilisation" value={`${result.kpis.fleetUtilPct}%`} tone="text-cyan-400" />
            <Kpi icon={<Timer size={14} />} label="Yard dwell" value={`${result.kpis.yardDwellH} h`} tone="text-amber-400" />
            <Kpi icon={<Zap size={14} />} label="Traction energy" value={`${result.kpis.energyGWh} GWh`} tone="text-slate-300" />
          </div>
        </Panel>
      </div>

      {/* Allocation table + wagon map */}
      <div className="col-span-6 flex flex-col gap-4 min-h-0">
        <Panel title="Wagon Allocation Table — Yard Balance Plan" subtitle="Surplus wagons at each marshalling yard and the solver's repositioning move">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left border-b border-[#1E293B]">
                  <th className="py-1.5 pr-3 font-medium">Yard</th>
                  <th className="py-1.5 pr-3 font-medium">Wagons on hand</th>
                  <th className="py-1.5 pr-3 font-medium">Demand (7-day)</th>
                  <th className="py-1.5 pr-3 font-medium">Balance</th>
                  <th className="py-1.5 pr-3 font-medium">Solver move</th>
                  <th className="py-1.5 font-medium">Empty running</th>
                </tr>
              </thead>
              <tbody>
                {result.allocations.map((a) => {
                  const n = nodeById.get(a.yard.nodeId)!;
                  const surplus = a.yard.wagonsOnHand - a.yard.wagonDemand;
                  return (
                    <tr key={a.yard.id} className="border-b border-[#1E293B]/50">
                      <td className="py-2 pr-3">
                        <span className="font-mono-num font-semibold text-slate-200">{n.code}</span>
                        <span className="text-slate-500 ml-2">{n.name}</span>
                      </td>
                      <td className="py-2 pr-3 font-mono-num text-slate-300">{a.yard.wagonsOnHand}</td>
                      <td className="py-2 pr-3 font-mono-num text-slate-300">{a.yard.wagonDemand}</td>
                      <td className={`py-2 pr-3 font-mono-num ${surplus >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {surplus >= 0 ? `+${surplus}` : surplus}
                        <MiniBar pct={Math.min(100, Math.abs(surplus) / 5)} tone={surplus >= 0 ? 'emerald' : 'amber'} height={3} />
                      </td>
                      <td className="py-2 pr-3">
                        {a.wagonsMoved > 0 ? (
                          <span className="flex items-center gap-1.5 text-cyan-300 font-mono-num">
                            <ArrowRightLeft size={11} /> {a.wagonsMoved} → {nodeById.get(a.sendTo)?.code}
                          </span>
                        ) : (
                          <span className="text-slate-600">hold</span>
                        )}
                      </td>
                      <td className="py-2 font-mono-num text-slate-400">{a.emptyKm}k km</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4">
          <Panel title="Yard Wagon Balance" subtitle="On-hand vs 7-day demand">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={allocationData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
                <RBar dataKey="onHand" name="On hand" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                <RBar dataKey="demand" name="Demand" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Plan Balance Radar" subtitle="Weighted objective trade-space">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#1E293B" />
                <PolarAngleAxis dataKey="k" tick={{ fill: '#64748B', fontSize: 9 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.25} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(Number(v))}`} />
              </RadarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      {/* Live freight consists + distribution */}
      <div className="col-span-3 flex flex-col gap-4 min-h-0">
        <Panel title="Freight Consists In Transit" subtitle="Live gross tonnage under way">
          <div className="space-y-2">
            {urgentTrains.map((t) => (
              <div key={t.id} className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono-num font-semibold text-slate-200">{t.id}</span>
                  <span className="font-mono-num text-slate-400">{t.tonnage.toLocaleString()} t</span>
                </div>
                <MiniBar pct={t.load} tone={t.load > 85 ? 'amber' : 'cyan'} height={4} />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{t.cars} wagons</span>
                  <span>{t.delay > 5 ? <span className="text-amber-400">+{t.delay}m delay</span> : 'on path'}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Wagon Stock Distribution" subtitle="Bubble size = wagons stabled">
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 4, left: -20 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" domain={[0, 1000]} hide />
              <YAxis dataKey="y" type="number" domain={[0, 640]} hide />
              <ZAxis dataKey="z" range={[40, 340]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v, name === 'z' ? 'Wagons' : name]} labelFormatter={() => ''} />
              <Scatter data={wagonScatter} fill="#10B981" fillOpacity={0.55} stroke="#10B981" />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Solver Run Log">
          <div className="text-[11px] text-slate-500 space-y-1.5 font-mono-num">
            <div>objective = w1·throughput − w2·emptyKm − w3·paxDelay</div>
            <div>constraints: 3 yards · {TRAINS.length} consists · crew capacity 2/night</div>
            <div className="text-cyan-400">status: OPTIMAL · runs committed: {runs}</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className={`font-mono-num text-sm font-semibold ${tone} mt-0.5`}>{value}</div>
    </div>
  );
}
