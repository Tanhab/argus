import { useState } from 'react';
import { BenchmarksTab } from './components/benchmarks/benchmarks-tab';
import { ShowcaseTab } from './components/showcase/showcase-tab';
import { TryTab } from './components/try/try-tab';

type Tab = 'showcase' | 'try' | 'benchmarks';

const tabs: { id: Tab; label: string }[] = [
  { id: 'showcase', label: 'Showcase' },
  { id: 'try', label: 'Try it yourself' },
  { id: 'benchmarks', label: 'Benchmarks' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('showcase');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">Argus</h1>
            <p className="text-xs text-slate-500 sm:text-sm">Distributed service monitor</p>
          </div>
          <nav className="flex gap-0.5 rounded-md bg-slate-900/60 p-0.5">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === id ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {tab === 'showcase' && <ShowcaseTab onCreateMonitor={() => setTab('try')} />}
        {tab === 'try' && <TryTab />}
        {tab === 'benchmarks' && <BenchmarksTab />}
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Live demo only.</p>
          <div className="flex gap-4">
            <a
              href="https://github.com/Tanhab/argus"
              className="hover:text-slate-200"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a href="/docs" className="hover:text-slate-200">
              API docs →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
