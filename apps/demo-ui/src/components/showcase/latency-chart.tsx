import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { MonitorDataScope } from '../../api/monitor-api';
import { getMonitorLatency } from '../../api/monitor-api';
import type { LatencyWindow } from '../../api/types';
import { CHECKER_ORDER, checkerLabel } from '../../lib/checker-labels';
import { latencyEmptyHint } from '../../lib/empty-state-copy';
import { bucketedLatencyToUplot } from '../../lib/latency-series';

import { POLL_MS } from '../../lib/poll-interval';

const SERIES_COLORS = ['#34d399', '#38bdf8', '#fbbf24'] as const;
const EMPTY_DATA: uPlot.AlignedData = [[], [], [], []];

function buildChartOptions(width: number): uPlot.Options {
  return {
    width,
    height: 220,
    series: [
      {},
      ...SERIES_COLORS.map((stroke, i) => ({
        label: checkerLabel(CHECKER_ORDER[i] ?? ''),
        stroke,
        width: 2,
        spanGaps: true,
        points: { show: true, size: 5 },
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
  };
}

interface LatencyChartProps {
  monitorId: string;
  scope?: MonitorDataScope;
  intervalSeconds?: number;
  className?: string;
}

export function LatencyChart({
  monitorId,
  scope = 'public',
  intervalSeconds = 60,
  className = '',
}: LatencyChartProps) {
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
        const rows = await getMonitorLatency(scope, monitorId, window);
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

    setData(null);
    setLoading(true);
    setError(null);
    void load();
    timer = setInterval(() => void load(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [monitorId, scope, window]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth > 0 ? el.clientWidth : 600;
    const chart = new uPlot(buildChartOptions(width), EMPTY_DATA, el);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        chart.setSize({ width: el.clientWidth, height: 220 });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!data || data[0].length === 0) {
      chart.setData(EMPTY_DATA);
      return;
    }
    chart.setData(data);
  }, [data]);

  const showEmptyHint = !loading && !error && (!data || data[0].length === 0);

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
        {showEmptyHint && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs leading-relaxed text-slate-500">
            {latencyEmptyHint(intervalSeconds)}
          </p>
        )}
        <div ref={containerRef} className="uplot-dark w-full" />
      </div>
    </section>
  );
}
