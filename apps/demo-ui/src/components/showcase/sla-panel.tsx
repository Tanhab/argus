import { useEffect, useState } from 'react';
import type { MonitorDataScope } from '../../api/monitor-api';
import { getMonitorSla } from '../../api/monitor-api';
import type { SlaResponse, SlaWindowPreset } from '../../api/types';
import {
  slaLowConfidenceHint,
  slaNoIncidentsHint,
  slaUptimePendingHint,
} from '../../lib/empty-state-copy';
import { POLL_MS } from '../../lib/poll-interval';
import { slaWindowRange } from '../../lib/sla-window';

const PRESETS: SlaWindowPreset[] = ['24h', '7d', '30d'];

interface SlaPanelProps {
  monitorId: string;
  scope?: MonitorDataScope;
  intervalSeconds?: number;
  className?: string;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 99.995 ? 3 : 2)}%`;
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SlaPanel({
  monitorId,
  scope = 'public',
  intervalSeconds = 60,
  className = '',
}: SlaPanelProps) {
  const [preset, setPreset] = useState<SlaWindowPreset>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SlaResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const { from, to } = slaWindowRange(preset);
        const result = await getMonitorSla(scope, monitorId, from, to);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load SLA');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    void load();
    timer = setInterval(() => void load(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [monitorId, scope, preset]);

  const sli = data?.sli;
  const incidents = data?.incidents ?? [];

  return (
    <section
      className={`flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">SLA & incidents</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Uptime from health state · maintenance excluded
          </p>
        </div>
        <div className="flex gap-0.5 rounded-md bg-slate-950/80 p-0.5">
          {PRESETS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setPreset(w)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                preset === w ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-3">
        {loading && !data && <div className="h-14 animate-pulse rounded bg-slate-800/60" />}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && sli && (
          <>
            <p className="text-xs text-slate-500">Uptime</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-100">
              {formatPercent(sli.uptimePercent)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {sli.downtimeMinutes} min down · {sli.monitoredMinutes} min monitored
            </p>
            {sli.monitoredMinutes === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-amber-400/90">
                {slaUptimePendingHint(intervalSeconds)}
              </p>
            ) : (
              sli.lowConfidence && (
                <p className="mt-2 text-xs leading-relaxed text-amber-400/90">
                  {slaLowConfidenceHint()}
                </p>
              )
            )}
          </>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400">
          Downtime incidents ({incidents.length})
        </p>
        <div className="mt-2 h-36 overflow-y-auto rounded-md border border-slate-800/80 bg-slate-950/20 pr-1">
          {loading && incidents.length === 0 && (
            <div className="space-y-2 p-1">
              <div className="h-9 animate-pulse rounded bg-slate-800/60" />
              <div className="h-9 animate-pulse rounded bg-slate-800/60" />
            </div>
          )}
          {!loading && !error && incidents.length === 0 && (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-slate-500">
              {slaNoIncidentsHint()}
            </p>
          )}
          <ul className="space-y-1.5 p-1">
            {incidents.map((incident) => (
              <li
                key={`${incident.from}-${incident.to}`}
                className="rounded-md border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-xs"
              >
                <p className="font-medium text-slate-200">
                  {formatShort(incident.from)} → {formatShort(incident.to)}
                </p>
                <p className="mt-0.5 text-slate-500">{incident.minutes} min down</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
