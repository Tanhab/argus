import { useState } from 'react';
import { BENCHMARK_CHARTS } from '../../lib/benchmark-charts';

export function BenchmarksTab() {
  const [expandedId, setExpandedId] = useState<string | null>(BENCHMARK_CHARTS[0]?.id ?? null);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-slate-100">Engineering benchmarks</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Reproducible Phase 3–5 runs — consensus under loss, EWMA tuning, flap suppression, and
          regional vs service-wide anomaly classification. Charts are static exports from the bench
          harness in <code className="text-slate-500">tools/bench/</code>.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {BENCHMARK_CHARTS.map((chart) => {
          const expanded = expandedId === chart.id;
          return (
            <article
              key={chart.id}
              className={`rounded-lg border bg-slate-900/40 transition-colors ${
                expanded ? 'border-emerald-500/30 lg:col-span-2' : 'border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : chart.id)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-slate-100">{chart.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{chart.summary}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-600">
                  {expanded ? 'Hide' : 'View'}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-slate-800/80 px-3 pb-3 pt-2">
                  <img
                    src={chart.src}
                    alt={chart.title}
                    className="mx-auto w-full max-w-4xl rounded-md bg-white"
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
