import { useEffect, useState } from 'react';
import { getPublicResults } from '../../api/client';
import type { ConsensusVerdict } from '../../api/types';
import { checkerLabel } from '../../lib/checker-labels';
import { countUpVotes, latestResultPerChecker } from '../../lib/checker-votes';
import { POLL_MS } from '../../lib/poll-interval';

interface ConsensusPanelProps {
  monitorId: string;
  verdict: ConsensusVerdict | null;
  verdictAt: string | null;
  className?: string;
}

function voteLabel(isUp: boolean): string {
  return isUp ? 'up' : 'down';
}

export function ConsensusPanel({
  monitorId,
  verdict,
  verdictAt,
  className = '',
}: ConsensusPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<ReturnType<typeof latestResultPerChecker>>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const rows = await getPublicResults(monitorId, 30);
        if (cancelled) return;
        setVotes(latestResultPerChecker(rows));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load checker votes');
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
  }, [monitorId]);

  const upCount = countUpVotes(votes);
  const total = votes.length;

  return (
    <section
      className={`flex h-full flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}
    >
      <div>
        <h3 className="text-sm font-medium text-slate-200">Consensus vs votes</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Each region&apos;s latest check · 2-of-3 wins
        </p>
      </div>

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
        <p className="text-xs text-slate-500">Window verdict</p>
        <p className="text-lg font-semibold capitalize text-slate-100">
          {verdict?.replace('_', ' ') ?? '—'}
        </p>
        {verdictAt && (
          <p className="mt-0.5 text-xs text-slate-600">{new Date(verdictAt).toLocaleString()}</p>
        )}
        {total > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            {upCount} of {total} regions up →{' '}
            <span className="text-slate-200">
              {upCount >= 2
                ? 'consensus can be up'
                : upCount === 0
                  ? 'consensus down'
                  : 'split / degraded'}
            </span>
          </p>
        )}
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {loading && votes.length === 0 && (
          <li className="h-12 animate-pulse rounded bg-slate-800/60" />
        )}
        {error && <li className="text-xs text-red-400">{error}</li>}
        {!loading && !error && votes.length === 0 && (
          <li className="text-xs text-slate-500">No checker results yet</li>
        )}
        {votes.map((row) => (
          <li
            key={row.checkerId}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-300">{checkerLabel(row.checkerId)}</span>
            <div className="flex items-center gap-3 text-xs">
              <span
                className={row.isUp ? 'font-medium text-emerald-400' : 'font-medium text-red-400'}
              >
                {voteLabel(row.isUp)}
              </span>
              {row.durationMs !== null && (
                <span className="tabular-nums text-slate-400">{row.durationMs} ms</span>
              )}
              {row.statusCode !== null && <span className="text-slate-600">{row.statusCode}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
