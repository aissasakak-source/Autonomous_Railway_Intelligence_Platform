import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Brain, Boxes, ChevronLeft, ChevronRight, Gauge, LayoutGrid, Menu, Network, Play, Pause, Wrench, TrainFront, Package, HeartPulse, Timer, AlertTriangle, Radio, Trash2, X,
} from 'lucide-react';
import type { Obstruction, Overlay, TrainState, ViewKey } from './lib/types';
import { createWorld, injectObstruction, tickWorld, worldKpis, fmtClock, nodeById, clearObstructions, type World } from './lib/engine';
import { NetworkMap, TrainInspectorDrawer, ObstructionBanner, TYPE_META } from './components/NetworkMap';
import { PredictionView } from './components/PredictionView';
import { FleetOptimizer } from './components/FleetOptimizer';
import { MaintenanceView } from './components/MaintenanceView';
import { YardView } from './components/YardView';
import { StatCard, Panel, SeverityDot } from './components/ui';
import { logDispatchEvent, fetchDispatchEvents } from './lib/supabase';
import { CORRIDORS } from './lib/network';

const SPEEDS = [1, 10, 30] as const;

const NAV: { key: ViewKey; label: string; icon: typeof Network; desc: string }[] = [
  { key: 'map', label: 'Network Digital Twin', icon: Network, desc: 'Live corridor map & train telemetry' },
  { key: 'prediction', label: 'Delay Prediction & Routing', icon: Brain, desc: 'Stringline forecast & dynamic re-routing' },
  { key: 'fleet', label: 'Fleet Allocation Optimizer', icon: Boxes, desc: 'Wagon & locomotive OR planner' },
  { key: 'maintenance', label: 'Predictive Maintenance', icon: Wrench, desc: 'Sensor grid & repair scheduling' },
  { key: 'yard', label: 'Yard Ops & Surge Simulator', icon: LayoutGrid, desc: 'Marshalling turnaround & what-if' },
];

export default function App() {
  const [world, setWorld] = useState<World>(() => createWorld());
  const [view, setView] = useState<ViewKey>('map');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('congestion');
  const [events, setEvents] = useState<{ id: string; kind: string; severity: string; message: string; created_at: string }[]>([]);

  const refreshEvents = useCallback(() => {
    fetchDispatchEvents(30).then(setEvents);
  }, []);

  useEffect(() => { refreshEvents(); }, [refreshEvents]);

  // Simulation loop: 1 sim-minute per tick, speed multiplies tick rate
  useEffect(() => {
    if (paused) return;
    const ms = 1000 / SPEEDS[speedIdx];
    const id = setInterval(() => {
      setWorld((w) => tickWorld(w, 0).world);
    }, Math.max(33, ms));
    return () => clearInterval(id);
  }, [paused, speedIdx]);

  // Periodically refresh persisted ops log
  useEffect(() => {
    const id = setInterval(refreshEvents, 15000);
    return () => clearInterval(id);
  }, [refreshEvents]);

  const kpis = useMemo(() => worldKpis(world), [world]);
  const selectedTrain = world.trains.find((t) => t.id === selectedTrainId) ?? null;

  const primaryObstructed = world.obstructions.length > 0;

  const injectFailure = async (kind: Obstruction['kind']) => {
    // Choose the highest-congestion unblocked corridor for drama
    const candidate = [...CORRIDORS]
      .filter((c) => !world.obstructions.some((o) => o.corridorId === c.id))
      .sort((a, b) => b.baseCongestion - a.baseCongestion)[0];
    if (!candidate) return;
    const label = kind === 'track-blockage' ? 'Track obstruction — derailed wagon' : kind === 'switch-fault' ? 'Switch failure — points locked' : 'Signal fault — block section failed';
    const next = injectObstruction(world, candidate.id, kind, label);
    setWorld(tickWorld(next, 0).world);
    await logDispatchEvent('obstruction', 'critical', `${label} on ${candidate.id.toUpperCase()} (${nodeById.get(candidate.from)?.code}–${nodeById.get(candidate.to)?.code}) — AI rerouting engaged`, { corridorId: candidate.id, kind });
    refreshEvents();
  };

  const clearAll = async () => {
    setWorld((w) => {
      const cleared = clearObstructions(w);
      return { ...cleared, trains: cleared.trains.map((t) => ({ ...t, rerouted: false, status: t.status === 'held' ? 'running' : t.status })) };
    });
    await logDispatchEvent('obstruction', 'info', 'All obstructions cleared — book routes restored', {});
    refreshEvents();
  };

  const recordEvent = useCallback(async (kind: string, severity: 'info' | 'warning' | 'critical', message: string) => {
    await logDispatchEvent(kind, severity, message, {});
    refreshEvents();
  }, [refreshEvents]);

  const selectView = (k: ViewKey) => {
    setView(k);
    setMobileNav(false);
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-obsidian text-slate-200 overflow-hidden">
      {/* Top telemetry bar */}
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-14 border-b border-[#1E293B] bg-panel/80 backdrop-blur shrink-0 z-30">
        <button
          onClick={() => setMobileNav(true)}
          className="lg:hidden p-2 -ml-1 rounded-lg border border-[#1E293B] text-slate-300 hover:text-cyan-300 transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2 sm:gap-2.5 pr-2 sm:pr-3 border-r border-[#1E293B] min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 shrink-0">
            <TrainFront size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-wide text-slate-100 truncate">RAILSENTINEL</div>
            <div className="hidden md:block text-[9px] uppercase tracking-[0.2em] text-cyan-400/80">Autonomous Railway Intelligence</div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2.5 flex-1 overflow-x-auto">
          <TelemStat icon={<TrainFront size={14} />} label="Active trains" value={kpis.activeTrains} tone="text-cyan-400" />
          <TelemStat icon={<HeartPulse size={14} />} label="On-time perf." value={`${kpis.otp}%`} tone={kpis.otp > 80 ? 'text-emerald-400' : kpis.otp > 60 ? 'text-amber-400' : 'text-red-400'} />
          <TelemStat icon={<Package size={14} />} label="Freight in transit" value={`${kpis.tonnageKt} kt`} tone="text-emerald-400" />
          <TelemStat icon={<Gauge size={14} />} label="Track health" value={`${kpis.health}%`} tone={kpis.health > 75 ? 'text-emerald-400' : kpis.health > 55 ? 'text-amber-400' : 'text-red-400'} />
          <TelemStat icon={<Timer size={14} />} label="Mean delay" value={`${kpis.avgDelay} min`} tone={kpis.avgDelay > 10 ? 'text-red-400' : 'text-slate-300'} />
        </div>

        <div className="flex items-center gap-1 ml-auto lg:ml-0 lg:pl-3 lg:border-l border-[#1E293B]">
          <span className="hidden xl:inline text-[10px] uppercase tracking-wider text-slate-500 mr-1">Sim speed</span>
          {SPEEDS.map((s, i) => (
            <button
              key={s}
              onClick={() => setSpeedIdx(i)}
              className={`px-2 sm:px-2.5 py-1.5 rounded text-[11px] font-mono-num font-semibold transition-colors ${speedIdx === i ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 border border-[#1E293B] hover:text-slate-300'}`}
            >
              {s}×
            </button>
          ))}
          <button
            onClick={() => setPaused((p) => !p)}
            className="ml-1 p-2 rounded-lg border border-[#1E293B] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
            title={paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile nav overlay */}
        {mobileNav && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
            <aside className="relative w-64 max-w-[80vw] h-full flex flex-col border-r border-[#1E293B] bg-panel shadow-2xl slide-in">
              <div className="flex items-center justify-between px-3 h-14 border-b border-[#1E293B]">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Navigation</span>
                <button onClick={() => setMobileNav(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-200" aria-label="Close navigation">
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
                {NAV.map((n) => {
                  const active = view === n.key;
                  return (
                    <button
                      key={n.key}
                      onClick={() => selectView(n.key)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${active ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/25' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'}`}
                    >
                      <n.icon size={17} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{n.label}</div>
                        <div className="text-[9px] text-slate-600 truncate">{n.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </nav>
              <div className="px-3 pb-4">
                <div className="panel px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                    <Radio size={11} className="text-cyan-400" /> Network status
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <StatusRow label="Corridors blocked" value={`${world.obstructions.length}`} tone={world.obstructions.length ? 'text-red-400' : 'text-emerald-400'} />
                    <StatusRow label="Trains diverted" value={`${kpis.diverted}`} tone={kpis.diverted ? 'text-amber-400' : 'text-slate-400'} />
                    <StatusRow label="Trains held" value={`${world.trains.filter((t) => t.status === 'held').length}`} tone={world.trains.some((t) => t.status === 'held') ? 'text-amber-400' : 'text-slate-400'} />
                    <StatusRow label="Sim clock" value={fmtClock(world.clockMin)} tone="text-slate-300" />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className={`hidden lg:flex flex-col border-r border-[#1E293B] bg-panel/60 transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'} shrink-0`}>
          <nav className="flex-1 py-3 px-2 space-y-1">
            {NAV.map((n) => {
              const active = view === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  title={n.label}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/25' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'}`}
                >
                  <n.icon size={17} className="shrink-0" />
                  {!collapsed && (
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{n.label}</div>
                      <div className="text-[9px] text-slate-600 truncate">{n.desc}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {!collapsed && (
            <div className="px-3 pb-3">
              <div className="panel px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                  <Radio size={11} className="text-cyan-400" /> Network status
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <StatusRow label="Corridors blocked" value={`${world.obstructions.length}`} tone={world.obstructions.length ? 'text-red-400' : 'text-emerald-400'} />
                  <StatusRow label="Trains diverted" value={`${kpis.diverted}`} tone={kpis.diverted ? 'text-amber-400' : 'text-slate-400'} />
                  <StatusRow label="Trains held" value={`${world.trains.filter((t) => t.status === 'held').length}`} tone={world.trains.some((t) => t.status === 'held') ? 'text-amber-400' : 'text-slate-400'} />
                  <StatusRow label="Sim clock" value={fmtClock(world.clockMin)} tone="text-slate-300" />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="h-10 border-t border-[#1E293B] text-slate-500 hover:text-cyan-300 flex items-center justify-center transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <span className="flex items-center gap-1.5 text-xs"><ChevronLeft size={14} /> Collapse</span>}
          </button>
        </aside>

        {/* Workspace */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden flex flex-col">
          {view === 'map' && (
            <MapView
              world={world}
              kpis={kpis}
              overlay={overlay}
              setOverlay={setOverlay}
              selectedTrain={selectedTrain}
              selectedTrainId={selectedTrainId}
              setSelectedTrainId={setSelectedTrainId}
              injectFailure={injectFailure}
              clearAll={clearAll}
              primaryObstructed={primaryObstructed}
              onEvent={recordEvent}
            />
          )}
          {view === 'prediction' && (
            <PredictionView trains={world.trains} congestion={world.congestion} obstructions={world.obstructions} selectedTrain={selectedTrainId} onSelectTrain={setSelectedTrainId} simMinute={world.clockMin} />
          )}
          {view === 'fleet' && <FleetOptimizer world={world} onOptimizerRun={(s) => recordEvent('optimizer', 'info', s)} />}
          {view === 'maintenance' && <MaintenanceView onSchedule={(s) => recordEvent('maintenance', 'info', s)} />}
          {view === 'yard' && <YardView onSurge={(s) => recordEvent('surge', 'warning', s)} />}
        </main>
      </div>

      {/* Ops log drawer */}
      <OpsLog events={events} />
    </div>
  );
}

function MapView({
  world, kpis, overlay, setOverlay, selectedTrain, selectedTrainId, setSelectedTrainId, injectFailure, clearAll, primaryObstructed, onEvent,
}: {
  world: World;
  kpis: ReturnType<typeof worldKpis>;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  selectedTrain: TrainState | null;
  selectedTrainId: string | null;
  setSelectedTrainId: (id: string | null) => void;
  injectFailure: (k: Obstruction['kind']) => void;
  clearAll: () => void;
  primaryObstructed: boolean;
  onEvent: (kind: string, severity: 'info' | 'warning' | 'critical', message: string) => void;
}) {
  return (
    <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 flex-1 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
          <div className="flex gap-1 panel px-1 py-1 w-full sm:w-auto overflow-x-auto">
            {([
              { k: 'congestion', label: 'Congestion' },
              { k: 'freight', label: 'Freight Load' },
              { k: 'wear', label: 'Wear & Sensors' },
            ] as const).map((o) => (
              <button
                key={o.k}
                onClick={() => setOverlay(o.k)}
                className={`flex-1 sm:flex-none px-3 py-2 sm:py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${overlay === o.k ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="sm:ml-auto flex gap-2 flex-wrap">
            <button
              onClick={() => injectFailure('track-blockage')}
              className="flex-1 sm:flex-none items-center justify-center flex gap-1.5 rounded-lg bg-red-500/90 hover:bg-red-400 text-slate-950 text-xs font-semibold px-3 py-2.5 sm:py-2 transition-colors"
            >
              <AlertTriangle size={13} /> <span className="whitespace-nowrap">Simulate Obstruction</span>
            </button>
            <button
              onClick={() => injectFailure('switch-fault')}
              className="flex-1 sm:flex-none items-center justify-center flex gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2.5 sm:py-2 transition-colors"
            >
              <Activity size={13} /> <span className="whitespace-nowrap">Switch Failure</span>
            </button>
            {primaryObstructed && (
              <button
                onClick={clearAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-2.5 sm:py-2 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        <ObstructionBanner obstructions={world.obstructions} />

        <div className="flex-1 min-h-[320px] sm:min-h-[380px] lg:min-h-0 panel panel-glow p-2">
          <NetworkMap
            trains={world.trains}
            obstructions={world.obstructions}
            congestion={world.congestion}
            overlay={overlay}
            selectedTrain={selectedTrainId}
            onSelectTrain={setSelectedTrainId}
            onSelectNode={(nid) => {
              const n = nodeById.get(nid);
              onEvent('inspect', 'info', `Junction ${n?.code} — ${n?.name} inspected (${n?.type.replace('-', ' ')})`);
            }}
            simMinute={world.clockMin}
          />
        </div>

        {/* Bottom KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 shrink-0">
          <StatCard label="Trains running" value={kpis.activeTrains} icon={<TrainFront size={17} />} />
          <StatCard label="On-time" value={`${kpis.otp}%`} tone={kpis.otp > 80 ? 'emerald' : 'amber'} icon={<HeartPulse size={17} />} />
          <StatCard label="Freight in transit" value={kpis.tonnageKt} unit="kt" tone="emerald" icon={<Package size={17} />} />
          <StatCard label="Diverted by AI" value={kpis.diverted} tone={kpis.diverted ? 'amber' : 'cyan'} icon={<Brain size={17} />} />
          <StatCard label="Total delay" value={kpis.totalDelayMin} unit="min" tone={kpis.totalDelayMin > 60 ? 'crimson' : 'cyan'} icon={<Timer size={17} />} />
          <StatCard label="Track health" value={`${kpis.health}%`} tone={kpis.health > 75 ? 'emerald' : 'amber'} icon={<Gauge size={17} />} />
        </div>
      </div>

      {/* Inspector */}
      {selectedTrain && (
        <TrainInspectorDrawer train={selectedTrain} onClose={() => setSelectedTrainId(null)} simMinute={world.clockMin} />
      )}
      {!selectedTrain && (
        <div className="w-full xl:w-[360px] xl:shrink-0 panel panel-glow flex flex-col items-center justify-center text-center p-5 sm:p-6">
          <div className="p-3 rounded-full bg-cyan-500/10 mb-3">
            <TrainFront size={22} className="text-cyan-400" />
          </div>
          <div className="text-sm font-medium text-slate-300">No train selected</div>
          <div className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Click any moving train marker or junction on the twin to open live telemetry: consist, locomotive data, speed, ETA and AI delay probability.
          </div>
          <div className="mt-4 w-full space-y-1.5 text-left">
            {world.trains.filter((t) => t.status !== 'arrival').slice(0, 5).map((t) => {
              const meta = TYPE_META[t.type];
              const Icon = meta.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTrainId(t.id)}
                  className="w-full flex items-center gap-2.5 rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2 hover:border-cyan-500/40 transition-colors text-xs"
                >
                  <Icon size={13} style={{ color: meta.color }} />
                  <span className="font-mono-num font-semibold text-slate-200">{t.id}</span>
                  <span className="text-slate-500 truncate">{t.cargo}</span>
                  <span className={`ml-auto font-mono-num ${t.delayMin > 10 ? 'text-red-400' : t.delayMin > 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {t.delayMin > 0 ? `+${Math.round(t.delayMin)}m` : 'on time'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TelemStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={tone}>{icon}</span>
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`font-mono-num text-xs font-bold ${tone}`}>{value}</div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono-num font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function OpsLog({ events }: { events: { id: string; kind: string; severity: string; message: string; created_at: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fixed z-30 transition-all bottom-3 right-3 left-3 sm:left-auto ${open ? 'sm:w-[420px]' : 'sm:w-auto'}`}>
      {open ? (
        <Panel
          title="Operations Log"
          subtitle="Persisted dispatch events (database-backed)"
          className="max-h-[40vh]"
          actions={
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
              <Trash2 size={14} />
            </button>
          }
        >
          <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
            {events.length === 0 && <div className="text-xs text-slate-500">No dispatch events recorded yet — inject a failure or run an optimiser plan.</div>}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-lg border border-[#1E293B] bg-[#0B1120] px-3 py-2">
                <div className="mt-1"><SeverityDot severity={e.severity as 'info' | 'warning' | 'critical'} /></div>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-300 leading-snug">{e.message}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5 font-mono-num">
                    {new Date(e.created_at).toLocaleTimeString()} · {e.kind}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="panel panel-glow flex items-center gap-2 px-3.5 py-2.5 text-xs text-slate-300 hover:text-cyan-300 transition-colors"
        >
          <Radio size={14} className="text-cyan-400" />
          Operations Log
          <span className="font-mono-num text-[10px] text-slate-500">({events.length})</span>
        </button>
      )}
    </div>
  );
}
