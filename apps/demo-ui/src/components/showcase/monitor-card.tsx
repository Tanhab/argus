import type { PublicMonitor } from '../../api/types';
import { monitorLabel, shortUrl } from '../../lib/monitor-label';
import { StatusBadge } from '../status-badge';

interface MonitorCardProps {
  monitor: PublicMonitor;
  selected: boolean;
  onSelect: () => void;
  /** sidebar = narrow rail; strip = horizontal scroll chip on mobile */
  variant?: 'sidebar' | 'strip';
}

export function MonitorCard({
  monitor,
  selected,
  onSelect,
  variant = 'sidebar',
}: MonitorCardProps) {
  const isStrip = variant === 'strip';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left transition-colors ${
        isStrip
          ? `w-44 shrink-0 rounded-lg border p-2.5 ${
              selected
                ? 'border-emerald-500/40 bg-slate-900/80'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`
          : `w-full rounded-r-lg border-y border-r border-l-2 p-3 ${
              selected
                ? 'border-l-emerald-500 border-y-slate-800 border-r-slate-800 bg-slate-900/70'
                : 'border-l-transparent border-slate-800/80 bg-slate-900/30 hover:border-l-slate-600 hover:bg-slate-900/50'
            }`
      }`}
    >
      <div className={`flex gap-2 ${isStrip ? 'flex-col' : 'items-start justify-between'}`}>
        <div className="min-w-0 flex-1">
          <p className={`font-medium text-slate-100 ${isStrip ? 'text-sm' : 'text-sm'}`}>
            {monitorLabel(monitor.url)}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{shortUrl(monitor.url)}</p>
        </div>
        <StatusBadge status={monitor.status} />
      </div>
      {!isStrip && monitor.lastConsensus && (
        <p className="mt-2 text-xs text-slate-500">{monitor.lastConsensus.replace('_', ' ')}</p>
      )}
    </button>
  );
}
