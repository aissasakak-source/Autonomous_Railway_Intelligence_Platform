import { useMemo, useState } from 'react';
import {
  BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Activity, CalendarClock, CheckCircle2, Cpu, HardHat, Radio, Waves } from 'lucide-react';
import type { SensorLog, WorkOrder } from '../lib/types';
import { SENSOR_LOGS, WORK_ORDERS } from '../lib/network';
import { EDGES, nodeById } from '../lib/engine';
import { PriorityTag, SeverityDot, Panel } from './ui';
import { scheduleWindows } from '../lib/optimizer';

const tooltipStyle = {
  backgroundColor: '#0F172A',
  border: '1px solid #1E293B',
  borderRadius: 8,
  fontSize: 12,
  color: '#E2E8F0',
};

// Deterministic pseudo-live sensor waveform
function wave(seed: number, base: number, amp: number, n = 40): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = base + amp * Math.sin(i * 0.55 + seed) + amp * 0.5 * Math.sin(i * 0.21 + seed * 2) + amp * 0.3 * Math.sin(i * 1.7 + seed * 3);
    out.push({ t: i, v: Math.round(v * 100) / 100 });
  }
  return out;
}

export function MaintenanceView({ onSchedule }: { onSchedule: (summary: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'advisory' | 'critical'>('all');
  const [scheduled, setScheduled] = useState<Record<string, string>>({});
  const [selectedSensor, setSelectedSensor] = useState<SensorLog>(SENSOR_LOGS[3]);

  const visibleLogs = useMemo(
    () => SENSOR_LOGS.filter((s) => filter === 'all' || s.severity === filter),
    [filter],
  );

  const corridorTraffic = (id: string) => EDGES.find((e) => e.id === id)?.baseCongestion ?? 50;

  const plan = useMemo(() => scheduleWindows(corridorTraffic), []);

  const scheduleAll = () => {
    const next: Record<string, string> = {};
    for (const wo of plan) next[wo.id] = wo.window ?? '';
    setScheduled(next);
    const p1 = plan.filter((p) => p.priority === 'P1').length;
    onSchedule(`Maintenance scheduler booked ${plan.length} work orders into low-traffic night windows (${p1} × P1 first) — freight paths protected`);
  };

  const sensorWave = useMemo(() => {
    const seed = selectedSensor.id.charCodeAt(1);
    if (selectedSensor.sensor === 'Wheel-Impact (WILD)') return wave(seed, 98, 32); // kN peak force
    if (selectedSensor.sensor === 'Acoustic Array') return wave(seed, 42, 14); // dB
    if (selectedSensor.sensor === 'Track Geometry') return wave(seed, 6, 3.4); // mm
    if (selectedSensor.sensor === 'Axle Bearing') return wave(seed, 68, 9); // °C
    return wave(seed, 1.2, 0.5); // stall current ratio
  }, [selectedSensor]);

  const sensorUnit = selectedSensor.sensor === 'Wheel-Impact (WILD)' ? 'kN' : selectedSensor.sensor === 'Acoustic Array' ? 'dB' : selectedSensor.sensor === 'Track Geometry' ? 'mm' : selectedSensor.sensor === 'Axle Bearing' ? '°C' : '×I₀';

  const wearData = useMemo(() => SENSOR_LOGS.filter((s) => s.severity !== 'nominal').map((s) => {
    const e = s.corridorId;
    return { name: e.toUpperCase(), conf: Math.round(s.confidence * 100) };
  }), []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 xl:h-full min-h-0 overflow-y-auto xl:overflow-hidden pr-1">
      <div className="xl:col-span-5 flex flex-col gap-4">
        <Panel
          title="Track & Rolling Stock Sensor Grid"
          subtitle="Acoustic arrays, WILD, track geometry, switch motors and axle-bearing telemetry"
          actions={
            <div className="flex gap-1">
              {(['all', 'advisory', 'critical'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors ${filter === f ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300 border border-[#1E293B]'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        >
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {visibleLogs.map((s) => {
              const edge = EDGES.find((e) => e.id === s.corridorId);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSensor(s)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selectedSensor.id === s.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-[#1E293B] bg-[#0B1120] hover:border-slate-600'}`}
                >
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <SeverityDot severity={s.severity} />
                    <span className="font-mono-num font-semibold text-slate-200">{s.corridorId.toUpperCase()}</span>
                    <span className="text-slate-500">km {s.chainageKm}</span>
                    <span className="ml-auto text-[10px] text-slate-500 truncate max-w-[45%]">{s.sensor}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">{s.reading}</div>
                  <div className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap">
                    <Cpu size={10} className="text-cyan-400 shrink-0" />
                    <span className={s.severity === 'critical' ? 'text-red-400' : s.severity === 'advisory' ? 'text-amber-400' : 'text-slate-500'}>{s.predictedFailure}</span>
                    <span className="ml-auto font-mono-num text-slate-600">{Math.round(s.confidence * 100)}%</span>
                  </div>
                  {edge && <div className="text-[9px] text-slate-600 mt-0.5">{edge.from.toUpperCase()} ↔ {edge.to.toUpperCase()} · {edge.maxSpeed} kph · {edge.tracks === 1 ? 'single' : 'double'} track</div>}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Predicted Failure Confidence" subtitle="ML model output per defect (non-nominal sensors)">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={wearData} layout="vertical" margin={{ top: 0, right: 12, left: 30, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Confidence']} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
              <RBar dataKey="conf" fill="#06B6D4" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="xl:col-span-4 flex flex-col gap-4">
        <Panel
          title={`Sensor Waveform — ${selectedSensor.sensor}`}
          subtitle={`${selectedSensor.corridorId.toUpperCase()} · km ${selectedSensor.chainageKm} · last 40 scans`}
        >
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sensorWave} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="t" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${sensorUnit}`, 'Reading']} labelFormatter={() => ''} />
                <Area dataKey="v" stroke="#06B6D4" strokeWidth={2} fill="url(#waveFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <WaveStat label="Peak" value={`${Math.max(...sensorWave.map((w) => w.v))} ${sensorUnit}`} />
            <WaveStat label="Mean" value={`${Math.round((sensorWave.reduce((s, w) => s + w.v, 0) / sensorWave.length) * 100) / 100} ${sensorUnit}`} />
            <WaveStat label="Trend" value={selectedSensor.severity === 'critical' ? 'Degrading' : selectedSensor.severity === 'advisory' ? 'Watch' : 'Stable'} tone={selectedSensor.severity === 'critical' ? 'text-red-400' : selectedSensor.severity === 'advisory' ? 'text-amber-400' : 'text-emerald-400'} />
          </div>
        </Panel>

        <Panel
          title="Maintenance Window Scheduler"
          subtitle="Slots crews into low-traffic night intervals; freight paths untouched"
          actions={
            <button
              onClick={scheduleAll}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              <CalendarClock size={13} /> Auto-schedule all
            </button>
          }
        >
          <div className="space-y-2">
            {WORK_ORDERS.map((wo) => {
              const win = scheduled[wo.id];
              return (
                <div key={wo.id} className={`rounded-lg border px-3 py-2 ${win ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-[#1E293B] bg-[#0B1120]'}`}>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <PriorityTag p={wo.priority} />
                    <span className="font-mono-num font-semibold text-slate-200">{wo.id}</span>
                    <span className="text-slate-500">{wo.corridorId.toUpperCase()}</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 text-right">
                      <HardHat size={10} className="shrink-0" /> {wo.crew}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">{wo.task}</div>
                  <div className="text-[10px] mt-1 flex items-center gap-2">
                    {win ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={11} /> Window {win} · {wo.durationH}h
                      </span>
                    ) : (
                      <span className="text-amber-400/80 flex items-center gap-1">
                        <Radio size={10} /> {wo.durationH}h job · unscheduled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="xl:col-span-3 flex flex-col gap-4">
        <Panel title="Fleet Health Scorecard" subtitle="Rolling-stock defect exposure by train">
          <div className="space-y-2.5">
            {[
              { id: 'IM-5501', item: 'Axle bearing (WILD 2.41×)', pct: 88 },
              { id: 'BK-7702', item: 'Wheel flat 48 mm', pct: 72 },
              { id: 'IM-5503', item: 'Bearing temp trend', pct: 69 },
              { id: 'RG-3308', item: 'Brake pad wear 61%', pct: 41 },
              { id: 'IC-2201', item: 'Pantograph arcing', pct: 18 },
            ].map((f) => (
              <div key={f.id}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-mono-num text-slate-300">{f.id}</span>
                  <span className="text-slate-500 truncate ml-2">{f.item}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${f.pct > 80 ? 'bg-red-400' : f.pct > 55 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${f.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Condition Monitoring Pipeline">
          <div className="space-y-2 text-[11px] text-slate-400">
            {[
              { icon: <Waves size={13} className="text-cyan-400" />, t: 'Acoustic arrays', d: '48 wayside stations · 2.1 kHz crack band' },
              { icon: <Activity size={13} className="text-cyan-400" />, t: 'WILD pits', d: '22 scales · peak wheel force 2.4× alert' },
              { icon: <Cpu size={13} className="text-cyan-400" />, t: 'Geometry runs', d: 'Unattended vehicle, 2 passes/week, Class C alarm' },
              { icon: <Radio size={13} className="text-cyan-400" />, t: 'Switch motors', d: '312 machines · stall-current trending' },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-2.5 rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2">
                <div className="mt-0.5">{r.icon}</div>
                <div>
                  <div className="text-xs text-slate-200 font-medium">{r.t}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function WaveStat({ label, value, tone = 'text-slate-200' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono-num text-xs font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

