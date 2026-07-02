import type { MonitorDataScope } from '../../api/monitor-api';
import type { MonitorView, PublicMonitor } from '../../api/types';
import { MONITOR_DETAIL_EYEBROW, shortUrl } from '../../lib/monitor-label';
import { StatusBadge } from '../status-badge';
import { ActivityLog } from './activity-log';
import { ConsensusPanel } from './consensus-panel';
import { LatencyChart } from './latency-chart';
import { SlaPanel } from './sla-panel';

interface MonitorDetailProps {
  monitor: MonitorView | PublicMonitor;
  scope?: MonitorDataScope;
}

export function MonitorDetail({ monitor, scope = 'public' }: MonitorDetailProps) {
  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{MONITOR_DETAIL_EYEBROW}</p>
            <h2 className="truncate text-lg font-semibold text-slate-50">
              {shortUrl(monitor.url)}
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <StatusBadge status={monitor.status} />
            <p className="text-xs text-slate-400 sm:text-sm">
              Periodically checks:{' '}
              <span className="font-medium text-slate-200">{monitor.intervalSeconds} seconds</span>
            </p>
            <a
              href={monitor.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500/90 hover:text-emerald-400 sm:text-sm"
            >
              Open Website
              <span aria-hidden>↗</span>
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <LatencyChart
          monitorId={monitor.id}
          scope={scope}
          intervalSeconds={monitor.intervalSeconds}
          className="lg:col-span-2"
        />
        <ConsensusPanel
          monitorId={monitor.id}
          scope={scope}
          intervalSeconds={monitor.intervalSeconds}
          verdict={monitor.lastConsensus}
          verdictAt={monitor.lastConsensusAt}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ActivityLog
          monitorId={monitor.id}
          scope={scope}
          intervalSeconds={monitor.intervalSeconds}
          className="lg:col-span-3"
        />
        <SlaPanel
          monitorId={monitor.id}
          scope={scope}
          intervalSeconds={monitor.intervalSeconds}
          className="lg:col-span-2"
        />
      </div>
    </div>
  );
}
