import { useState } from 'react';
import { BENCHMARK_CHARTS } from '../../lib/benchmark-charts';
import { BENCHMARK_INTRO } from '../../lib/benchmark-intro';

export function BenchmarksTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-slate-100">Engineering benchmarks</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {BENCHMARK_INTRO.tagline}
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-sm font-medium text-slate-200">Architecture</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-400">
          {BENCHMARK_INTRO.architecture.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-slate-600">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {BENCHMARK_INTRO.chartsLeadIn}
        </p>
      </div>

      <div className="space-y-2">
        {BENCHMARK_CHARTS.map((chart) => {
          const expanded = expandedId === chart.id;
          return (
            <article
              key={chart.id}
              className={`overflow-hidden rounded-lg border bg-slate-900/40 transition-colors ${
                expanded ? 'border-emerald-500/30' : 'border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : chart.id)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left"
              >
                <span className="w-8 shrink-0 text-xs font-medium tabular-nums text-slate-600">
                  {chart.id.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-100">{chart.title}</h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500 sm:whitespace-normal">
                    {chart.summary}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{expanded ? '▲' : '▼'}</span>
              </button>

              {expanded && (
                <div className="border-t border-slate-800/80 bg-slate-950/30 px-4 py-3">
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
