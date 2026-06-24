import { useEffect, useState } from 'react';
import { getPublicMonitors } from '../../api/client';
import type { PublicMonitor } from '../../api/types';
import { DEFAULT_SHOWCASE_MONITOR_ID } from '../../lib/monitor-label';
import { MonitorCard } from './monitor-card';
import { MonitorDetail } from './monitor-detail';

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

export function ShowcaseTab() {
  const [monitors, setMonitors] = useState<PublicMonitor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getPublicMonitors();
        if (cancelled) return;
        setMonitors(rows);
        const defaultMonitor =
          rows.find((m) => m.id === DEFAULT_SHOWCASE_MONITOR_ID) ?? rows[0] ?? null;
        setSelectedId(defaultMonitor?.id ?? null);
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
  }, []);

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
        <p className="font-medium">No showcase monitors in the database.</p>
        <p className="mt-2 text-xs text-amber-200/70">
          The API allowlist is set, but those monitor ids are not in your local Postgres yet. Seed
          the rows (same ids as PUBLIC_SHOWCASE_MONITOR_IDS) or point at a DB that has them — then
          refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      {/* Mobile: horizontal strip */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
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

      {/* Desktop: left rail */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Monitors
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
      </aside>

      {/* Main detail — bento inside MonitorDetail */}
      <div className="min-w-0 flex-1">{selected && <MonitorDetail monitor={selected} />}</div>
    </div>
  );
}
