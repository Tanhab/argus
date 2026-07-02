import { useCallback, useEffect, useState } from 'react';
import { getPublicMonitors } from '../../api/client';
import type { PublicMonitor } from '../../api/types';
import { DEFAULT_SHOWCASE_MONITOR_ID } from '../../lib/monitor-label';
import { POLL_MS } from '../../lib/poll-interval';
import { MonitorCard } from './monitor-card';
import { MonitorDetail } from './monitor-detail';

interface ShowcaseTabProps {
  onCreateMonitor?: () => void;
}

function ShowcaseSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="hidden w-52 shrink-0 space-y-2 lg:block">
        <div className="h-20 animate-pulse rounded-lg bg-slate-800/60" />
        <div className="h-20 animate-pulse rounded-lg bg-slate-800/60" />
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="h-14 animate-pulse rounded-lg bg-slate-800/60" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-56 animate-pulse rounded-lg bg-slate-800/60 lg:col-span-2" />
          <div className="h-56 animate-pulse rounded-lg bg-slate-800/60" />
        </div>
      </div>
    </div>
  );
}

export function ShowcaseTab({ onCreateMonitor }: ShowcaseTabProps) {
  const [monitors, setMonitors] = useState<PublicMonitor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMonitors = useCallback(async () => {
    const rows = await getPublicMonitors();
    setMonitors(rows);
    setSelectedId((prev) => {
      if (prev && rows.some((m) => m.id === prev)) return prev;
      const defaultMonitor =
        rows.find((m) => m.id === DEFAULT_SHOWCASE_MONITOR_ID) ?? rows[0] ?? null;
      return defaultMonitor?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        await refreshMonitors();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load showcase monitors');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshMonitors]);

  useEffect(() => {
    if (loading || monitors.length === 0) return;

    const timer = setInterval(() => {
      void refreshMonitors().catch(() => {
        // keep last good snapshot on transient poll failures
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [loading, monitors.length, refreshMonitors]);

  const selected = monitors.find((m) => m.id === selectedId) ?? null;

  if (loading) return <ShowcaseSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
        <p className="mt-2 text-xs text-red-400/80">Is the API running on :3000?</p>
      </div>
    );
  }

  if (monitors.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200/90">
        <p className="font-medium">Showcase monitor not available.</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
          The live demo expects a configured showcase monitor on this VPS. If you just deployed,
          confirm PUBLIC_SHOWCASE_MONITOR_IDS matches a row in Postgres and that EU, AP, and US
          checkers are running — first charts usually appear within about 90 seconds of a healthy
          deploy.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      {/* Mobile: horizontal strip */}
      <div className="-mx-1 flex flex-col gap-3 px-1 pb-1 lg:hidden">
        <div className="flex gap-2 overflow-x-auto">
          {monitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              selected={monitor.id === selectedId}
              onSelect={() => setSelectedId(monitor.id)}
              variant="strip"
            />
          ))}
        </div>
        {onCreateMonitor && (
          <button
            type="button"
            onClick={onCreateMonitor}
            className="w-full rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/50 hover:text-slate-100"
          >
            Create your own monitor
          </button>
        )}
      </div>

      {/* Desktop: left rail */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Live monitor
        </p>
        <div className="space-y-1">
          {monitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              selected={monitor.id === selectedId}
              onSelect={() => setSelectedId(monitor.id)}
              variant="sidebar"
            />
          ))}
        </div>
        {onCreateMonitor && (
          <button
            type="button"
            onClick={onCreateMonitor}
            className="mt-3 w-full rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/50 hover:text-slate-100"
          >
            Create your own monitor
          </button>
        )}
      </aside>

      {/* Main detail — bento inside MonitorDetail */}
      <div className="min-w-0 flex-1">{selected && <MonitorDetail monitor={selected} />}</div>
    </div>
  );
}
