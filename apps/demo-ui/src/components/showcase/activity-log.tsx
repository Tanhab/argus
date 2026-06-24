import { useEffect, useMemo, useRef, useState } from 'react';
import type { MonitorDataScope } from '../../api/monitor-api';
import {
  getMonitorAlerts,
  getMonitorAnomalies,
  getMonitorResults,
  getMonitorTransitions,
} from '../../api/monitor-api';
import type { ActivityEntry, ActivityKind } from '../../api/types';
import { mergeActivityFeed } from '../../lib/activity-feed';
import { activityEmptyHint, activityFilteredEmptyHint } from '../../lib/empty-state-copy';
import { POLL_MS } from '../../lib/poll-interval';

const KINDS: ActivityKind[] = ['CHECK', 'STATE', 'ANOMALY', 'ALERT'];

/** Recruiter-friendly default — heartbeats are opt-in (high volume). */
const HIGHLIGHT_KINDS: ActivityKind[] = ['STATE', 'ANOMALY', 'ALERT'];

const PAGE_SIZE = 10;

const KIND_LABELS: Record<ActivityKind, { chip: string; badge: string; title: string }> = {
  CHECK: {
    chip: 'Checks',
    badge: 'Check',
    title: 'Per-region heartbeat (up/down, latency)',
  },
  STATE: {
    chip: 'Status',
    badge: 'Status',
    title: 'Overall health changed — up, degraded, down, or recovering',
  },
  ANOMALY: {
    chip: 'Anomaly',
    badge: 'Anomaly',
    title: 'Latency spike vs EWMA baseline (regional or service-wide)',
  },
  ALERT: {
    chip: 'Alert',
    badge: 'Alert',
    title: 'Notification delivered via alert outbox',
  },
};

const FETCH = {
  checks: 24,
  transitions: 15,
  anomalies: 15,
  alerts: 15,
  maxChecksInFeed: 12,
} as const;

const KIND_STYLES: Record<ActivityKind, string> = {
  CHECK: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  STATE: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  ANOMALY: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  ALERT: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

interface ActivityLogProps {
  monitorId: string;
  scope?: MonitorDataScope;
  intervalSeconds?: number;
  className?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function kindsEqual(a: Set<ActivityKind>, list: ActivityKind[]): boolean {
  return list.length === a.size && list.every((k) => a.has(k));
}

export function ActivityLog({
  monitorId,
  scope = 'public',
  intervalSeconds = 60,
  className = '',
}: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<ActivityKind>>(() => new Set(HIGHLIGHT_KINDS));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const [results, transitions, anomalies, alerts] = await Promise.all([
          getMonitorResults(scope, monitorId, FETCH.checks),
          getMonitorTransitions(scope, monitorId, FETCH.transitions),
          getMonitorAnomalies(scope, monitorId, FETCH.anomalies),
          getMonitorAlerts(scope, monitorId, FETCH.alerts),
        ]);
        if (cancelled) return;
        setEntries(
          mergeActivityFeed(results, transitions, anomalies, alerts, {
            maxChecks: FETCH.maxChecksInFeed,
          }),
        );
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load activity');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    void load();
    timer = setInterval(() => void load(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [monitorId, scope]);

  const filtered = useMemo(() => entries.filter((e) => enabled.has(e.kind)), [entries, enabled]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const remaining = filtered.length - visible.length;

  function loadMore() {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
  }

  function showLess() {
    setVisibleCount(PAGE_SIZE);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleKind(kind: ActivityKind) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function showHighlights() {
    setEnabled(new Set(HIGHLIGHT_KINDS));
    setVisibleCount(PAGE_SIZE);
  }

  function showAll() {
    setEnabled(new Set(KINDS));
    setVisibleCount(PAGE_SIZE);
  }

  const isHighlights = kindsEqual(enabled, HIGHLIGHT_KINDS);
  const isAll = kindsEqual(enabled, KINDS);

  return (
    <section
      className={`flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Activity log</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Check = periodic check · Status = health changes · Anomaly = slow spike · Alert = alerts
            fired
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-md bg-slate-950/80 p-0.5">
            <button
              type="button"
              onClick={showHighlights}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                isHighlights ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Highlights
            </button>
            <button
              type="button"
              onClick={showAll}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                isAll ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All types
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                title={KIND_LABELS[kind].title}
                onClick={() => toggleKind(kind)}
                className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-opacity ${
                  enabled.has(kind) ? KIND_STYLES[kind] : 'text-slate-600 ring-slate-800 opacity-40'
                }`}
              >
                {KIND_LABELS[kind].chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-600">
        {visible.length} of {filtered.length} matching
        {!enabled.has('CHECK') && entries.some((e) => e.kind === 'CHECK')
          ? ' · check heartbeats hidden'
          : ''}
      </p>

      <div
        ref={scrollRef}
        className="scroll-pane mt-2 h-64 overflow-y-auto rounded-md border border-slate-800/80 bg-slate-950/20 p-1"
      >
        {loading && entries.length === 0 && (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-slate-800/60" />
            <div className="h-10 animate-pulse rounded bg-slate-800/60" />
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
            {entries.length === 0
              ? activityEmptyHint(intervalSeconds)
              : activityFilteredEmptyHint()}
          </p>
        )}
        <ul className="space-y-1.5">
          {visible.map((entry) => (
            <li
              key={entry.key}
              className="flex gap-3 rounded-md border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-xs"
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-medium ring-1 ring-inset ${KIND_STYLES[entry.kind]}`}
                title={KIND_LABELS[entry.kind].title}
              >
                {KIND_LABELS[entry.kind].badge}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-200">{entry.title}</p>
                <p className="mt-0.5 text-slate-500">{entry.detail}</p>
              </div>
              <time className="shrink-0 tabular-nums text-slate-600">
                {formatTime(entry.occurredAt)}
              </time>
            </li>
          ))}
        </ul>
      </div>

      {remaining > 0 && (
        <button
          type="button"
          onClick={loadMore}
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
        >
          Load {Math.min(PAGE_SIZE, remaining)} older ({remaining} left)
        </button>
      )}
      {visibleCount > PAGE_SIZE && remaining === 0 && (
        <button
          type="button"
          onClick={showLess}
          className="mt-2 text-center text-xs text-slate-500 hover:text-slate-300"
        >
          Show less
        </button>
      )}
    </section>
  );
}
