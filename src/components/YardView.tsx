import { useMemo, useState } from 'react';
import {
  BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ComposedChart, Area,
} from 'recharts';
import { ArrowRightLeft, Boxes, Container, Gauge, Timer, TrendingUp, Warehouse, Zap, Loader2 } from 'lucide-react';
import { YARDS } from '../lib/network';
import { nodeById } from '../lib/engine';
import { Bar as MiniBar, Panel } from './ui';

const tooltipStyle = {
  backgroundColor: '#0F172A',
  border: '1px solid #1E293B',
  borderRadius: 8,
  fontSize: 12,
  color: '#E2E8F0',
};

interface SurgeState {
  volumePct: number; // +0..50% freight volume
  running: boolean;
  elapsed: number; // seconds since start
}

export function YardView({ onSurge }: { onSurge: (summary: string) => void }) {
  const [volumePct, setVolumePct] = useState(25);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // dwell scales super-linearly past 85% berth utilisation (Kingman-ish)
  const util = (base: number) => Math.min(0.99, base * (1 + volumePct / 100 * 0.85));
  const dwell = (y: typeof YARDS[number]) => {
    const u = util(y.berthUtil);
    return Math.round(y.dwellH * (1 + Math.max(0, u - 0.8) * 6.5) * 10) / 10;
  };
  const energyPerTrain = 1 + volumePct / 100 * 0.78;

  const yardData = useMemo(() => YARDS.map((y) => {
    const n = nodeById.get(y.nodeId)!;
    return {
      name: n.code,
      inbound: Math.round(y.inbound * (1 + volumePct / 100)),
      outbound: Math.round(y.outbound * (1 + volumePct / 100)),
      dwell: dwell(y),
      util: Math.round(util(y.berthUtil) * 100),
      bays: y.bays,
    };
  }), [volumePct]);

  const networkSeries = useMemo(() => {
    // congestion vs volume curve
    return Array.from({ length: 11 }, (_, i) => {
      const v = i * 5;
      const cong = Math.min(98, 58 + Math.pow(v / 100, 1.6) * 55);
      return { v, congestion: Math.round(cong), energy: Math.round((18.4 * (1 + (v / 100) * 0.78)) * 10) / 10 };
    });
  }, []);

  const liveSeries = useMemo(() => {
    // simulation trace while surge runs
    const pts: { t: number; congestion: number; dwell: number }[] = [];
    const n = Math.max(2, Math.floor(elapsed / 2) + 1);
    for (let i = 0; i < n; i++) {
      const frac = i / (n - 1 || 1);
      pts.push({
        t: i * 2,
        congestion: Math.round(58 + (volumePct * 0.9) * frac + Math.sin(i * 1.3) * 2),
        dwell: Math.round((7.1 + Math.max(0, volumePct - 10) * 0.12) * frac * 10) / 10,
      });
    }
    return pts;
  }, [elapsed, volumePct]);

  const totalInbound = yardData.reduce((s, y) => s + y.inbound, 0);
  const avgDwell = Math.round((yardData.reduce((s, y) => s + y.dwell, 0) / yardData.length) * 10) / 10;
  const avgUtil = Math.round(yardData.reduce((s, y) => s + y.util, 0) / yardData.length);
  const energy = Math.round(18.4 * energyPerTrain * 10) / 10;

  const startSurge = () => {
    setRunning(true);
    setElapsed(0);
    onSurge(`What-if surge committed: +${volumePct}% freight volume — inbound rises to ${totalInbound} trains/day, mean yard dwell ${avgDwell} h, traction energy ${energy} GWh/day`);
  };

  const stopSurge = () => { setRunning(false); setElapsed(0); };

  return (
    <div className="grid grid-cols-12 gap-4 h-full min-h-0 overflow-y-auto pr-1">
      {/* Controls */}
      <div className="col-span-3 flex flex-col gap-3">
        <Panel title="What-If Traffic Surge" subtitle="Inject extra freight volume and watch congestion, dwell and energy respond">
          <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3.5 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-200">Added freight volume</span>
              <span className="font-mono-num text-xs font-bold text-emerald-400">+{volumePct}%</span>
            </div>
            <p className="text-[10px] text-500 mb-2 text-slate-500 leading-snug">Extra intermodal paths across all 3 marshalling yards.</p>
            <input type="range" min={0} max={50} step={5} value={volumePct} onChange={(e) => setVolumePct(Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>0%</span><span>+50%</span></div>
          </div>
          {running ? (
            <button onClick={stopSurge} className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-red-500/90 hover:bg-red-400 text-slate-950 text-sm font-semibold py-2.5 transition-colors">
              <Loader2 size={15} className="animate-spin" /> Stop surge simulation
            </button>
          ) : (
            <button onClick={startSurge} className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 text-sm font-semibold py-2.5 transition-colors">
              <TrendingUp size={15} /> Run +{volumePct}% surge
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SurgeKpi label="Inbound trains/day" value={`${totalInbound}`} baseline={`${YARDS.reduce((s, y) => s + y.inbound, 0)}`} />
            <SurgeKpi label="Mean dwell" value={`${avgDwell} h`} baseline={`${YARDS.reduce((s, y) => s + y.dwellH, 0) / 3} h`} />
            <SurgeKpi label="Berth utilisation" value={`${avgUtil}%`} baseline={`${Math.round(YARDS.reduce((s, y) => s + y.berthUtil, 0) / 3 * 100)}%`} />
            <SurgeKpi label="Energy" value={`${energy} GWh`} baseline="18.4 GWh" />
          </div>
        </Panel>

        <Panel title="Live Surge Trace" subtitle={running ? 'Streaming…' : 'Idle — run the surge to capture a trace'}>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={liveSeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#64748B" fontSize={10} tickLine={false} unit="s" />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line dataKey="congestion" name="Network congestion" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="dwell" name="Mean dwell (h)" stroke="#06B6D4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Yard tables */}
      <div className="col-span-6 flex flex-col gap-4">
        <Panel title="Marshalling Yard Turnaround Monitor" subtitle="Bay efficiency, dwell time and intermodal transfer throughput">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left border-b border-[#1E293B]">
                  <th className="py-1.5 pr-3 font-medium">Yard</th>
                  <th className="py-1.5 pr-3 font-medium">Bays</th>
                  <th className="py-1.5 pr-3 font-medium">Inbound</th>
                  <th className="py-1.5 pr-3 font-medium">Outbound</th>
                  <th className="py-1.5 pr-3 font-medium">Dwell</th>
                  <th className="py-1.5 pr-3 font-medium">Berth utilisation</th>
                  <th className="py-1.5 font-medium">Intermodal</th>
                </tr>
              </thead>
              <tbody>
                {YARDS.map((y, i) => {
                  const n = nodeById.get(y.nodeId)!;
                  const d = yardData[i];
                  return (
                    <tr key={y.id} className="border-b border-[#1E293B]/50">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <Warehouse size={13} className="text-cyan-400" />
                          <div>
                            <div className="font-mono-num font-semibold text-slate-200">{n.code}</div>
                            <div className="text-[10px] text-slate-500">{n.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono-num text-slate-300">{y.bays}</td>
                      <td className={`py-2 pr-3 font-mono-num ${d.inbound > y.inbound ? 'text-amber-400' : 'text-slate-300'}`}>{d.inbound}/day</td>
                      <td className="py-2 pr-3 font-mono-num text-slate-300">{d.outbound}/day</td>
                      <td className={`py-2 pr-3 font-mono-num ${d.dwell > y.dwellH + 1 ? 'text-red-400' : d.dwell > y.dwellH ? 'text-amber-400' : 'text-emerald-400'}`}>{d.dwell} h</td>
                      <td className="py-2 pr-3 w-36">
                        <div className="flex items-center gap-2">
                          <MiniBar pct={d.util} tone={d.util > 90 ? 'crimson' : d.util > 82 ? 'amber' : 'emerald'} height={4} />
                          <span className="font-mono-num text-[10px] text-slate-400">{d.util}%</span>
                        </div>
                      </td>
                      <td className="py-2">
                        {y.intermodal ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-[11px]"><Container size={12} /> {Math.round(y.inbound * 0.45)} lifts/day</span>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4">
          <Panel title="Dwell Time vs Yard" subtitle={`Hours — baseline vs +${volumePct}% surge`}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={YARDS.map((y, i) => ({ name: nodeById.get(y.nodeId)!.code, base: y.dwellH, surge: yardData[i].dwell }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <RBar dataKey="base" name="Baseline" fill="#10B981" radius={[3, 3, 0, 0]} />
                <RBar dataKey="surge" name="Surge" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Congestion & Energy Curve" subtitle="Network response to added volume">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={networkSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="congFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="v" stroke="#64748B" fontSize={10} tickLine={false} unit="%" tickFormatter={(v) => `+${v}`} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `+${v}% volume`} />
                <Area dataKey="congestion" name="Congestion" stroke="#F59E0B" fill="url(#congFill)" strokeWidth={2} />
                <Line dataKey="energy" name="Energy (GWh)" stroke="#06B6D4" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      {/* Ops feed */}
      <div className="col-span-3 flex flex-col gap-4">
        <Panel title="Bay Occupancy — Live Board">
          <div className="space-y-3">
            {YARDS.map((y, i) => {
              const n = nodeById.get(y.nodeId)!;
              const occupied = Math.round(y.bays * util(y.berthUtil));
              return (
                <div key={y.id}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-mono-num text-slate-300">{n.code}</span>
                    <span className="text-slate-500">{occupied}/{y.bays} bays</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: y.bays }, (_, b) => (
                      <div
                        key={b}
                        className={`h-5 flex-1 rounded-sm transition-colors duration-500 ${b < occupied ? (y.berthUtil > 0.9 ? 'bg-red-400/80' : 'bg-cyan-400/70') : 'bg-slate-800'}`}
                        title={`Bay ${b + 1}: ${b < occupied ? 'occupied' : 'free'}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Intermodal Transfer Monitor">
          <div className="space-y-2">
            {[
              { id: 'IM-5501', lifts: 62, of: 64, stage: 'Crane 2 — lift 62/64' },
              { id: 'IM-5502', lifts: 18, of: 28, stage: 'Tanktainer inspection' },
              { id: 'IM-5503', lifts: 0, of: 30, stage: 'Awaiting road handover' },
            ].map((x) => (
              <div key={x.id} className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono-num font-semibold text-slate-200">{x.id}</span>
                  <span className="font-mono-num text-slate-400">{x.lifts}/{x.of} lifts</span>
                </div>
                <MiniBar pct={(x.lifts / x.of) * 100} tone={x.lifts / x.of > 0.9 ? 'emerald' : 'cyan'} height={4} />
                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <Boxes size={10} /> {x.stage}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Yard Throughput KPIs">
          <div className="grid grid-cols-2 gap-2">
            <Kpi icon={<ArrowRightLeft size={13} />} label="Turnaround" value={`${Math.round(avgDwell * 60 / 3)} min/teu`} tone="text-cyan-400" />
            <Kpi icon={<Gauge size={13} />} label="Track util." value={`${Math.round(avgUtil * 1.04)}%`} tone="text-emerald-400" />
            <Kpi icon={<Timer size={13} />} label="Dwell overrun" value={avgDwell > 8 ? '+1.9 h' : 'within tol.'} tone={avgDwell > 8 ? 'text-amber-400' : 'text-emerald-400'} />
            <Kpi icon={<Zap size={13} />} label="Crane energy" value={`${Math.round(4.2 * energyPerTrain * 10) / 10} MWh`} tone="text-slate-300" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SurgeKpi({ label, value, baseline }: { label: string; value: string; baseline: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono-num text-xs font-semibold text-cyan-300">{value}</div>
      <div className="text-[9px] text-slate-600">base {baseline}</div>
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
