import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { getPublicLatency } from '../../api/client';
import type { LatencyWindow } from '../../api/types';
import { CHECKER_ORDER, checkerLabel } from '../../lib/checker-labels';
import { bucketedLatencyToUplot } from '../../lib/latency-series';

const POLL_MS = 12_000;

const SERIES_COLORS = ['#34d399', '#38bdf8', '#fbbf24'] as const;

interface LatencyChartProps {
  monitorId: string;
  className?: string;
}

export function LatencyChart({ monitorId, className = '' }: LatencyChartProps) {
  const [window, setWindow] = useState<LatencyWindow>('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<uPlot.AlignedData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const rows = await getPublicLatency(monitorId, window);
        if (cancelled) return;
        setData(bucketedLatencyToUplot(rows));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load latency');
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
  }, [monitorId, window]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data || data[0].length === 0) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const width = el.clientWidth || 600;

    chartRef.current?.destroy();
    chartRef.current = new uPlot(
      {
        width,
        height: 220,
        series: [
          {},
          ...SERIES_COLORS.map((stroke, i) => ({
            label: checkerLabel(CHECKER_ORDER[i] ?? ''),
            stroke,
            width: 2,
            spanGaps: false,
          })),
        ],
        scales: { x: { time: true } },
        axes: [
          {
            stroke: '#64748b',
            grid: { stroke: '#1e293b' },
            ticks: { stroke: '#334155' },
          },
          {
            stroke: '#64748b',
            grid: { stroke: '#1e293b' },
            ticks: { stroke: '#334155' },
            values: (_u, vals) => vals.map((v) => `${Math.round(v)} ms`),
          },
        ],
        legend: { show: true },
        cursor: { drag: { x: false, y: false } },
      },
      data,
      el,
    );

    const ro = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: 220 });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <section
      className={`flex h-full flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Per-region latency</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Average response time per checker · updates every 12s
          </p>
        </div>
        <div className="flex gap-0.5 rounded-md bg-slate-950/80 p-0.5">
          {(['1h', '24h'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                window === w ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3 min-h-[220px] flex-1">
        {loading && !data && (
          <div className="absolute inset-0 animate-pulse rounded bg-slate-800/60" />
        )}
        {error && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-red-400">
            {error}
          </p>
        )}
        {!loading && !error && data && data[0].length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
            No checks in this window — the chart needs rows in{' '}
            <code className="text-slate-400">check_results</code>. Local dev: seed data or run
            checkers against this API.
          </p>
        )}
        <div ref={containerRef} className="uplot-dark w-full" />
      </div>
    </section>
  );
}
