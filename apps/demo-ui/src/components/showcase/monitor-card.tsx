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

  if (isStrip) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`w-48 shrink-0 rounded-lg border p-3 text-left transition-colors ${
          selected
            ? 'border-emerald-500/40 bg-slate-900/80'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-100">{monitorLabel(monitor.url)}</p>
          <StatusBadge status={monitor.status} />
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{shortUrl(monitor.url)}</p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-r-lg border-y border-r border-l-2 p-3.5 text-left transition-colors ${
        selected
          ? 'border-l-emerald-500 border-y-slate-800 border-r-slate-800 bg-slate-900/70'
          : 'border-l-transparent border-slate-800/80 bg-slate-900/30 hover:border-l-slate-600 hover:bg-slate-900/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{monitorLabel(monitor.url)}</p>
        <StatusBadge status={monitor.status} />
      </div>

      <p className="mt-1 truncate text-xs text-slate-500">{shortUrl(monitor.url)}</p>

      <p className="mt-3 text-xs text-slate-400">
        Periodically checks:{' '}
        <span className="font-medium text-slate-300">{monitor.intervalSeconds} seconds</span>
      </p>

      <a
        href={monitor.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-500/90 hover:text-emerald-400"
      >
        Open Website
        <span aria-hidden>↗</span>
      </a>
    </button>
  );
}
