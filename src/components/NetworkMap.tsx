import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, ChevronRight, Gauge, HardHat, Package, Users, Zap, CircleDot } from 'lucide-react';
import type { TrainState, Obstruction, Overlay } from '../lib/types';
import { EDGES, NODES, findRoute, etaMinutes, fmtClock, nodeById } from '../lib/engine';
import type { RailNode } from '../lib/types';
import { Bar } from './ui';

const TYPE_META: Record<TrainState['type'], { icon: typeof Users; color: string; label: string }> = {
  express: { icon: Zap, color: '#06B6D4', label: 'Express' },
  intercity: { icon: Users, color: '#22D3EE', label: 'Intercity' },
  regional: { icon: Users, color: '#67E8F9', label: 'Regional' },
  intermodal: { icon: Package, color: '#10B981', label: 'Intermodal' },
  bulk: { icon: Package, color: '#059669', label: 'Bulk' },
  manifest: { icon: Package, color: '#34D399', label: 'Manifest' },
};

function corridorColor(congestion: number, overlay: Overlay, wear: number, blocked: boolean): string {
  if (blocked) return '#EF4444';
  if (overlay === 'congestion') return congestion > 70 ? '#EF4444' : congestion > 50 ? '#F59E0B' : '#10B981';
  if (overlay === 'wear') return wear > 60 ? '#EF4444' : wear > 45 ? '#F59E0B' : '#10B981';
  return congestion > 75 ? '#F59E0B' : '#06B6D4';
}

export function NetworkMap({
  trains,
  obstructions,
  congestion,
  overlay,
  selectedTrain,
  onSelectTrain,
  onSelectNode,
  simMinute,
}: {
  trains: TrainState[];
  obstructions: Obstruction[];
  congestion: Map<string, number>;
  overlay: Overlay;
  selectedTrain: string | null;
  onSelectTrain: (id: string | null) => void;
  onSelectNode: (nodeId: string) => void;
  simMinute: number;
}) {
  const blocked = useMemo(() => new Set(obstructions.map((o) => o.corridorId)), [obstructions]);
  const [altRoute, setAltRoute] = useState<string[]>([]);

  // When a train is selected and its next edge is blocked, show planned detour
  useEffect(() => {
    const t = trains.find((x) => x.id === selectedTrain);
    if (!t || t.status === 'arrival') { setAltRoute([]); return; }
    const curEdge = t._edges[Math.min(t.edgeIdx, t._edges.length - 1)];
    if (curEdge && blocked.has(curEdge.id)) {
      const from = t.route[t.edgeIdx] ?? t.route[0];
      const goal = t.route[t.route.length - 1];
      const alt = findRoute(from, goal, blocked, congestion);
      setAltRoute(alt ? alt.path : []);
    } else {
      setAltRoute([]);
    }
  }, [selectedTrain, blocked, congestion, trains]);

  const pos = (t: TrainState) => {
    const edge = t._edges[Math.min(t.edgeIdx, t._edges.length - 1)];
    if (!edge) return null;
    const a = nodeById.get(edge.from)!;
    const b = nodeById.get(edge.to)!;
    const frac = Math.min(1, t.progressKm / edge.distanceKm);
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };

  return (
    <div className="relative w-full h-full grid-bg rounded-xl overflow-hidden">
      <svg viewBox="0 0 1000 640" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Corridors */}
        {EDGES.map((e) => {
          const a = nodeById.get(e.from)!;
          const b = nodeById.get(e.to)!;
          const cong = congestion.get(e.id) ?? e.baseCongestion;
          const isBlocked = blocked.has(e.id);
          const color = corridorColor(cong, overlay, e.wear, isBlocked);
          const width = e.tracks === 2 ? 3.4 : 2.2;
          const dashed = e.tracks === 1 ? '6 4' : undefined;
          return (
            <g key={e.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width + 3} strokeOpacity={isBlocked ? 0.25 : 0.08} strokeLinecap="round" />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color}
                strokeWidth={width}
                strokeDasharray={dashed}
                strokeLinecap="round"
                opacity={isBlocked ? 0.9 : 0.62}
                filter={isBlocked || cong > 75 ? 'url(#glow)' : undefined}
              />
              {/* clickable hit area */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }} onClick={() => onSelectNode(e.from)} />
              {isBlocked && (
                <g transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
                  <circle r={11} fill="#EF4444" opacity={0.2} />
                  <circle r={7} fill="#EF4444" className="flash-alert" />
                  <text textAnchor="middle" y={-16} fill="#FCA5A5" fontSize={10} fontFamily="monospace">BLOCKED</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Planned detour for selected train */}
        {altRoute.length > 1 && altRoute.slice(0, -1).map((n: string, i: number) => {
          const a = nodeById.get(n)!;
          const b = nodeById.get(altRoute[i + 1])!;
          return <line key={`alt-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#10B981" strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" opacity={0.85} />;
        })}

        {/* Nodes */}
        {NODES.map((n) => {
          const isYard = n.type === 'yard';
          const isHub = n.type === 'freight-hub';
          const fill = isYard ? '#0F172A' : isHub ? '#06304300' : '#0F172A';
          const stroke = isYard ? '#06B6D4' : isHub ? '#10B981' : '#38BDF8';
          const size = isYard ? 9 : isHub ? 8 : 6;
          return (
            <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => onSelectNode(n.id)}>
              <circle cx={n.x} cy={n.y} r={size + 8} fill="transparent" />
              {isYard ? (
                <rect x={n.x - size} y={n.y - size} width={size * 2} height={size * 2} rx={2} fill={fill} stroke={stroke} strokeWidth={2} />
              ) : (
                <circle cx={n.x} cy={n.y} r={size} fill={isHub ? 'rgba(16,185,129,0.15)' : fill} stroke={stroke} strokeWidth={2} />
              )}
              <text x={n.x} y={n.y - size - 7} textAnchor="middle" fill="#94A3B8" fontSize={11} fontWeight={600}>{n.code}</text>
            </g>
          );
        })}

        {/* Trains */}
        {trains.map((t) => {
          const p = pos(t);
          if (!p) return null;
          const meta = TYPE_META[t.type];
          const isSelected = selectedTrain === t.id;
          const alert = t.status === 'held' || t.rerouted;
          return (
            <g key={t.id} transform={`translate(${p.x}, ${p.y})`} style={{ cursor: 'pointer' }} onClick={() => onSelectTrain(isSelected ? null : t.id)}>
              {alert && <circle r={9} fill="none" stroke={t.status === 'held' ? '#F59E0B' : '#10B981'} strokeWidth={1.2} className="pulse-ring" />}
              {isSelected && <circle r={13} fill="none" stroke="#06B6D4" strokeWidth={1.4} strokeDasharray="2 3" />}
              <circle r={6.5} fill={meta.color} stroke="#070B14" strokeWidth={1.6} />
              <text y={-11} textAnchor="middle" fill={alert ? (t.status === 'held' ? '#FCD34D' : '#6EE7B7') : '#CBD5E1'} fontSize={9.5} fontFamily="monospace" fontWeight={700}>{t.id}</text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(14, 596)">
          <rect x={0} y={0} width={470} height={34} rx={6} fill="rgba(15,23,42,0.85)" stroke="#1E293B" />
          <circle cx={16} cy={17} r={4} fill="#06B6D4" /><text x={25} y={20} fill="#94A3B8" fontSize={10}>Passenger</text>
          <circle cx={95} cy={17} r={4} fill="#10B981" /><text x={104} y={20} fill="#94A3B8" fontSize={10}>Freight</text>
          <rect x={168} y={13} width={8} height={8} fill="#0F172A" stroke="#06B6D4" strokeWidth={1.5} /><text x={182} y={20} fill="#94A3B8" fontSize={10}>Marshalling yard</text>
          <line x1={286} y1={17} x2={312} y2={17} stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 4" /><text x={318} y={20} fill="#94A3B8" fontSize={10}>Single track</text>
        </g>
      </svg>

      {/* Overlay badge */}
      <div className="absolute top-3 right-3 panel px-3 py-1.5 text-[11px] text-slate-400 flex items-center gap-2">
        <CircleDot size={12} className="text-cyan-400" />
        Overlay: <span className="text-slate-200 font-medium">{overlay === 'congestion' ? 'Track Congestion Heatmap' : overlay === 'freight' ? 'Freight Capacity Load' : 'Infrastructure Wear & Sensor Status'}</span>
      </div>

      {/* Sim clock */}
      <div className="absolute top-3 left-3 panel px-3 py-1.5 text-[11px] text-slate-400 flex items-center gap-2 font-mono-num">
        <Gauge size={12} className="text-cyan-400" />
        Sim time <span className="text-slate-200 font-semibold">{fmtClock(simMinute)}</span>
      </div>
    </div>
  );
}

export function TrainInspectorDrawer({
  train,
  onClose,
  simMinute,
}: {
  train: TrainState;
  onClose: () => void;
  simMinute: number;
}) {
  const meta = TYPE_META[train.type];
  const Icon = meta.icon;
  const eta = etaMinutes(train);
  const etaClock = fmtClock(simMinute + eta);
  const arrived = train.status === 'arrival';
  const riskTone = train.riskPct > 60 ? 'text-red-400' : train.riskPct > 30 ? 'text-amber-400' : 'text-emerald-400';
  const maxTrackSpeed = train._edges[Math.min(train.edgeIdx, train._edges.length - 1)]?.maxSpeed ?? train.maxSpeed;
  const trackLimit = Math.min(train.maxSpeed, maxTrackSpeed);

  return (
    <div className="w-[360px] shrink-0 panel panel-glow slide-in flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B] sticky top-0 bg-[#0F172A]/95 z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg" style={{ background: `${meta.color}18` }}>
            <Icon size={18} style={{ color: meta.color }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100 font-mono-num">{train.id}</div>
            <div className="text-[11px] text-slate-500">{meta.label} — {train.cargo}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Speed" value={arrived ? '—' : `${Math.round(train.speed)}`} unit="kph" />
          <MiniStat label="Delay" value={train.delayMin <= 0 ? 'On time' : `+${Math.round(train.delayMin)}`} unit={train.delayMin > 0 ? 'min' : ''} tone={train.delayMin > 10 ? 'text-red-400' : train.delayMin > 3 ? 'text-amber-400' : 'text-emerald-400'} />
          <MiniStat label="Status" value={train.status === 'held' ? 'HELD' : train.rerouted ? 'DIVERTED' : arrived ? 'ARRIVED' : 'RUNNING'} tone={train.status === 'held' ? 'text-amber-400' : train.rerouted ? 'text-emerald-400' : arrived ? 'text-slate-400' : 'text-cyan-400'} />
        </div>

        {/* AI prediction */}
        <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">AI Delay Probability</span>
            <span className={`font-mono-num text-sm font-bold ${riskTone}`}>{train.riskPct}%</span>
          </div>
          <Bar pct={train.riskPct} tone={train.riskPct > 60 ? 'crimson' : train.riskPct > 30 ? 'amber' : 'emerald'} />
          <div className="mt-2 text-[11px] text-slate-500">
            {train.riskPct > 60
              ? 'High risk: cascading conflict predicted on route within 45 min.'
              : train.riskPct > 30
                ? 'Moderate risk: watch single-track sections ahead.'
                : 'Low risk: route clear of predicted conflicts.'}
          </div>
        </div>

        {/* Route */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Route — {train.rerouted ? 'dynamic (AI rerouted)' : 'book path'}</div>
          <div className="space-y-1">
            {train.route.map((nid, i) => {
              const n = nodeById.get(nid)!;
              const done = i < train.edgeIdx;
              const current = i === train.edgeIdx;
              return (
                <div key={nid} className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${current ? 'bg-cyan-500/10 text-cyan-300' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-slate-600' : current ? 'bg-cyan-400 flash-alert' : 'bg-slate-700'}`} />
                  <span className="font-mono-num">{n.code}</span>
                  <span className="truncate">{n.name}</span>
                  {current && !arrived && <span className="ml-auto font-mono-num text-[10px] text-slate-500">{Math.round(train.progressKm)} / {train._edges[Math.min(train.edgeIdx, train._edges.length - 1)]?.distanceKm ?? 0} km</span>}
                  {i === 0 && <Ban size={11} className="ml-auto text-slate-700" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Locomotive telemetry */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Locomotive Telemetry</div>
          <div className="rounded-lg border border-[#1E293B] divide-y divide-[#1E293B]">
            <TelemetryRow icon={<Zap size={13} className="text-cyan-400" />} label="Unit" value={train.locoModel} />
            <TelemetryRow icon={<Gauge size={13} className="text-cyan-400" />} label="Power / Track limit" value={`${train.locoHp.toLocaleString()} hp / ${trackLimit} kph`} />
            <TelemetryRow icon={<HardHat size={13} className="text-cyan-400" />} label="Consist" value={`${train.cars} ${train.tonnage > 0 ? `wagons · ${train.tonnage.toLocaleString()} t` : 'coaches'}`} />
          </div>
        </div>

        {/* Load + ETA */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>{train.tonnage > 0 ? 'Wagon utilisation' : 'Passenger load'}</span>
            <span className="font-mono-num text-slate-300">{train.loadPct}%</span>
          </div>
          <Bar pct={train.loadPct} tone={train.loadPct > 85 ? 'amber' : 'cyan'} />
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">ETA at {nodeById.get(train.route[train.route.length - 1])?.code}</span>
            <span className={`font-mono-num font-semibold ${arrived ? 'text-slate-500' : 'text-cyan-300'}`}>{arrived ? 'Arrived' : etaClock}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit, tone = 'text-slate-200' }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1120] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono-num text-sm font-semibold ${tone}`}>
        {value}{unit && <span className="text-[10px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function TelemetryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs">
      {icon}
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto font-mono-num text-slate-300 text-right">{value}</span>
    </div>
  );
}

export { TYPE_META };

export function ObstructionBanner({ obstructions }: { obstructions: Obstruction[] }) {
  if (obstructions.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 mb-3">
      <AlertTriangle size={15} className="text-red-400 shrink-0 flash-alert" />
      <div className="text-xs text-red-300">
        {obstructions.map((o) => (
          <div key={o.corridorId}>
            <span className="font-semibold">{o.label}</span> — traffic halted on {o.corridorId.toUpperCase()}, AI rerouting in progress
          </div>
        ))}
      </div>
    </div>
  );
}
