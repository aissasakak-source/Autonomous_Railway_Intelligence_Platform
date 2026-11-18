import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatCard({ label, value, unit, tone = 'cyan', delta, icon }: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'cyan' | 'emerald' | 'amber' | 'crimson';
  delta?: number;
  icon?: ReactNode;
}) {
  const toneCls = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    crimson: 'text-red-400',
  }[tone];
  return (
    <div className="panel panel-glow px-4 py-3 flex items-center gap-3 min-w-[150px]">
      {icon && <div className={`${toneCls} opacity-80`}>{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
        <div className={`font-mono-num text-lg font-semibold ${toneCls} leading-tight`}>
          {value}
          {unit && <span className="text-[11px] font-normal text-slate-500 ml-1">{unit}</span>}
        </div>
      </div>
      {delta !== undefined && (
        <div className={`text-[10px] font-mono-num flex items-center ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? <TrendingUp size={11} className="mr-0.5" /> : <TrendingDown size={11} className="mr-0.5" />}
          {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, className = '' }: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel panel-glow flex flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#1E293B]">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex-1 min-h-0 p-4">{children}</div>
    </div>
  );
}

export function SeverityDot({ severity }: { severity: 'nominal' | 'advisory' | 'critical' | 'info' | 'warning' }) {
  const cls = {
    nominal: 'bg-emerald-400',
    advisory: 'bg-amber-400',
    critical: 'bg-red-400',
    info: 'bg-cyan-400',
    warning: 'bg-amber-400',
  }[severity];
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

export function PriorityTag({ p }: { p: 'P1' | 'P2' | 'P3' }) {
  const cls = { P1: 'bg-red-500/15 text-red-400 border-red-500/30', P2: 'bg-amber-500/15 text-amber-400 border-amber-500/30', P3: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }[p];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${cls}`}>{p}</span>;
}

export function Bar({ pct, tone = 'cyan', height = 6 }: { pct: number; tone?: 'cyan' | 'emerald' | 'amber' | 'crimson'; height?: number }) {
  const cls = { cyan: 'bg-cyan-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', crimson: 'bg-red-400' }[tone];
  return (
    <div className="w-full bg-slate-800 rounded-full overflow-hidden" style={{ height }}>
      <div className={`h-full rounded-full ${cls} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
