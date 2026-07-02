import { useCallback, useEffect, useState } from 'react';
import {
  createMonitor,
  deleteMonitor,
  ensureDemoSession,
  hasDemoSession,
  listMyMonitors,
} from '../../api/demo-client';
import type { Monitor, MonitorView } from '../../api/types';
import { activityEmptyHint } from '../../lib/empty-state-copy';
import { shortUrl } from '../../lib/monitor-label';
import { POLL_MS } from '../../lib/poll-interval';
import { MonitorDetail } from '../showcase/monitor-detail';

const DEMO_MONITOR_QUOTA = 3;
const EXPIRES_KEY = 'argus_demo_expires_at';

function toMonitorView(m: Monitor): MonitorView {
  return {
    id: m.id,
    url: m.url,
    intervalSeconds: m.intervalSeconds,
    lastConsensus: m.lastConsensus,
    lastConsensusAt: m.lastConsensusAt,
    status: m.status,
  };
}

function loadStoredExpiry(): string | null {
  try {
    return sessionStorage.getItem(EXPIRES_KEY);
  } catch {
    return null;
  }
}

function storeExpiry(iso: string) {
  try {
    sessionStorage.setItem(EXPIRES_KEY, iso);
  } catch {
    // ignore quota / private mode
  }
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function TryTab() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(loadStoredExpiry);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshMonitors = useCallback(async () => {
    const rows = await listMyMonitors();
    const active = rows.filter((m) => m.isActive);
    setMonitors(active);
    setSelectedId((prev) => {
      if (prev && active.some((m) => m.id === prev)) return prev;
      return active[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const ok = await hasDemoSession();
        if (cancelled) return;
        if (ok) {
          await refreshMonitors();
          if (!cancelled) setAuthed(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load demo session');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshMonitors]);

  useEffect(() => {
    if (!authed) return;

    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const rows = await listMyMonitors();
          if (cancelled) return;
          const active = rows.filter((m) => m.isActive);
          setMonitors(active);
          setSelectedId((prev) => {
            if (prev && active.some((m) => m.id === prev)) return prev;
            return active[0]?.id ?? null;
          });
        } catch {
          // keep last good snapshot on transient poll failures
        }
      })();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authed]);

  async function handleStartSession() {
    setStarting(true);
    setError(null);
    try {
      const { expiresAt: expiry } = await ensureDemoSession();
      if (expiry) {
        setExpiresAt(expiry);
        storeExpiry(expiry);
      } else if (!expiresAt) {
        const stored = loadStoredExpiry();
        if (stored) setExpiresAt(stored);
      }
      await refreshMonitors();
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start demo session');
    } finally {
      setStarting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeUrlInput(url);
    if (!normalized) {
      setError('Enter a URL to monitor');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createMonitor(normalized);
      setUrl('');
      await refreshMonitors();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create monitor');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await deleteMonitor(id);
      await refreshMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove monitor');
    } finally {
      setDeletingId(null);
    }
  }

  const selected = monitors.find((m) => m.id === selectedId) ?? null;
  const atQuota = monitors.length >= DEMO_MONITOR_QUOTA;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-800/60" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-800/60" />
      </div>
    );
  }

  if (!authed) {
    return (
      <section className="mx-auto max-w-lg space-y-4">
        <div>
          <h2 className="text-lg font-medium text-slate-100">Try it yourself</h2>
          <p className="mt-1 text-sm text-slate-400">
            Start a short-lived sandbox session. Add up to {DEMO_MONITOR_QUOTA} public HTTP(S) URLs
            — same live dashboard as Showcase, private to your browser.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <ul className="space-y-2 text-sm text-slate-400">
            <li>· Session tied to this browser (httpOnly cookie)</li>
            <li>· Expires after a few hours; monitors cleaned up automatically</li>
            <li>· Private IPs and localhost are blocked (SSRF guard)</li>
          </ul>

          {error && (
            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleStartSession()}
            disabled={starting}
            className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            {starting ? 'Starting…' : 'Start demo session'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-100">Try it yourself</h2>
        {expiresAt && (
          <p className="text-xs text-slate-500">
            Session expires <span className="text-slate-400">{formatExpiry(expiresAt)}</span>
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <label htmlFor="demo-url" className="text-sm font-medium text-slate-200">
          Add a URL
        </label>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          https:// required · public hosts only · up to {DEMO_MONITOR_QUOTA} monitors per session (
          {monitors.length} added). Your URLs are private to this browser.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="demo-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={atQuota || submitting}
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={atQuota || submitting || !url.trim()}
            className="shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add monitor'}
          </button>
        </div>
        {atQuota && (
          <p className="mt-2 text-xs text-amber-400/90">
            Quota reached — remove a monitor to add another.
          </p>
        )}
      </form>

      {monitors.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
          <p>Add a URL above to start monitoring.</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600">
            {activityEmptyHint(60)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <aside className="w-full shrink-0 lg:w-56">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Your monitors
            </p>
            <ul className="space-y-1">
              {monitors.map((monitor) => (
                <li key={monitor.id}>
                  <div
                    className={`flex items-center gap-1 rounded-r-lg border-y border-r border-l-2 ${
                      monitor.id === selectedId
                        ? 'border-l-emerald-500 border-y-slate-800 border-r-slate-800 bg-slate-900/70'
                        : 'border-l-transparent border-slate-800/80 bg-slate-900/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(monitor.id)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <p className="truncate text-sm font-medium text-slate-100">
                        {shortUrl(monitor.url)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        every {monitor.intervalSeconds}s
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(monitor.id)}
                      disabled={deletingId === monitor.id}
                      className="shrink-0 px-2 py-2 text-xs text-slate-600 hover:text-red-400 disabled:opacity-50"
                      title="Remove monitor"
                    >
                      {deletingId === monitor.id ? '…' : '×'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0 flex-1">
            {selected && <MonitorDetail monitor={toMonitorView(selected)} scope="owned" />}
          </div>
        </div>
      )}
    </section>
  );
}
