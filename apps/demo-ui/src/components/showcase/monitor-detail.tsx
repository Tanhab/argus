import type { PublicMonitor } from '../../api/types';
import { monitorLabel, shortUrl } from '../../lib/monitor-label';
import { StatusBadge } from '../status-badge';
import { ActivityLog } from './activity-log';
import { ConsensusPanel } from './consensus-panel';
import { LatencyChart } from './latency-chart';

interface MonitorDetailProps {
  monitor: PublicMonitor;
}

function PlaceholderSection({
  title,
  hint,
  tall,
  className = '',
}: {
  title: string;
  hint: string;
  tall?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}
    >
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      <div
        className={`mt-3 flex-1 animate-pulse rounded bg-slate-800/60 ${tall ? 'min-h-48' : 'min-h-28'}`}
      />
    </section>
  );
}

export function MonitorDetail({ monitor }: MonitorDetailProps) {
  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{monitorLabel(monitor.url)}</p>
            <h2 className="truncate text-lg font-semibold text-slate-50">
              {shortUrl(monitor.url)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={monitor.status} />
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              consensus{' '}
              <span className="text-slate-200">
                {monitor.lastConsensus?.replace('_', ' ') ?? '—'}
              </span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              every <span className="text-slate-200">{monitor.intervalSeconds}s</span>
            </span>
            <a
              href={monitor.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-500/80 hover:text-emerald-400"
            >
              Open ↗
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <LatencyChart monitorId={monitor.id} className="lg:col-span-2" />
        <ConsensusPanel
          monitorId={monitor.id}
          verdict={monitor.lastConsensus}
          verdictAt={monitor.lastConsensusAt}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ActivityLog monitorId={monitor.id} className="lg:col-span-3" />
        <PlaceholderSection
          className="lg:col-span-2"
          title="SLA & incidents"
          hint="24h / 7d / 30d uptime"
        />
      </div>
    </div>
  );
}
