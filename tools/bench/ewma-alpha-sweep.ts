import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateEwma } from '../../apps/api/src/ewma/update.js';

const ALPHAS = [0.05, 0.1, 0.15, 0.2, 0.3] as const;
const SWEEP_PARAMS = { minSamples: 30, zThreshold: 3 } as const;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS_DIR = join(REPO_ROOT, 'docs');

interface SweepRow {
  alpha: number;
  cyclesToDetection: number | null;
  firstZScore: number | null;
  falsePositivesPreInject: number;
}

interface SeriesSpec {
  name: string;
  series: number[];
  injectIndex: number;
  description: string;
}

function buildSyntheticSeries(): SeriesSpec {
  const warmCycles = 60;
  const postInjectCycles = 40;
  const warm = Array.from({ length: warmCycles }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
  const post = Array.from({ length: postInjectCycles }, () => 400);
  return {
    name: 'synthetic',
    description: 'Clean step: ~100ms warm (±5 jitter) → 400ms sustained',
    series: [...warm, ...post],
    injectIndex: warmCycles,
  };
}

function buildDriftSeries(): SeriesSpec {
  const warmCycles = 60;
  const driftCycles = 50;
  const warm = Array.from({ length: warmCycles }, () => 100);
  const drift = Array.from({ length: driftCycles }, (_, i) => 100 + (i + 1) * 3);
  return {
    name: 'drift',
    description:
      'Linear drift (+3ms/cycle from 103ms after flat 100ms warm-up): lower alpha lags the baseline, so first-detection z-score is higher',
    series: [...warm, ...drift],
    injectIndex: warmCycles,
  };
}

function buildPhase5StyleSeries(): SeriesSpec {
  const warm = [
    ...Array.from({ length: 38 }, () => 168),
    173,
    168,
    165,
    177,
    168,
    163,
    ...Array.from({ length: 6 }, () => 168),
  ];
  const post = [322, 380, 430, 480, 520, 550, 571, 540, 510, 490, 460, 440, 420, 410, 400];
  return {
    name: 'phase5-style',
    description:
      'Messy consensus-median replay (Phase 5 shape): tight ~168ms baseline with pre-inject jitter spikes, then /control/slow/400-style medians',
    series: [...warm, ...post],
    injectIndex: warm.length,
  };
}

function sweepAlpha(series: number[], injectIndex: number, alpha: number): SweepRow {
  const params = { alpha, ...SWEEP_PARAMS };
  let ewma: number | null = null;
  let variance: number | null = null;
  let count = 0;
  let falsePositivesPreInject = 0;
  let cyclesToDetection: number | null = null;
  let firstZScore: number | null = null;

  for (const [i, reading] of series.entries()) {
    const result = updateEwma(reading, ewma, variance, count, params);

    if (i < injectIndex && result.isAnomaly) {
      falsePositivesPreInject++;
    }

    if (i >= injectIndex && result.isAnomaly && cyclesToDetection === null) {
      cyclesToDetection = i - injectIndex;
      firstZScore = result.zScore;
    }

    ewma = result.newEwma;
    variance = result.newVariance;
    count = result.newSampleCount;
  }

  return { alpha, cyclesToDetection, firstZScore, falsePositivesPreInject };
}

function formatTable(spec: SeriesSpec, rows: SweepRow[]): string {
  const header = [
    `Benchmark 2 — EWMA alpha sweep (${spec.name})`,
    spec.description,
    `inject index: ${spec.injectIndex}  minSamples: ${SWEEP_PARAMS.minSamples}  zThreshold: ${SWEEP_PARAMS.zThreshold}`,
    '',
    'alpha | cycles_to_detection | first_z_score | false_positives_pre_inject',
    '------+---------------------+---------------+---------------------------',
  ];
  for (const row of rows) {
    const z = row.firstZScore === null ? 'null' : row.firstZScore.toFixed(2);
    const detect = row.cyclesToDetection === null ? 'null' : String(row.cyclesToDetection);
    header.push(
      `${row.alpha.toFixed(2).padStart(5)} | ${detect.padStart(19)} | ${z.padStart(13)} | ${String(row.falsePositivesPreInject).padStart(27)}`,
    );
  }
  return header.join('\n');
}

function writeCsv(spec: SeriesSpec, rows: SweepRow[]): string {
  const path = join(DOCS_DIR, `bench-ewma-alpha-${spec.name}.csv`);
  const lines = [
    'series,alpha,cycles_to_detection,first_z_score,false_positives_pre_inject',
    ...rows.map((row) =>
      [
        spec.name,
        row.alpha,
        row.cyclesToDetection ?? '',
        row.firstZScore ?? '',
        row.falsePositivesPreInject,
      ].join(','),
    ),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  return path;
}

function main(): void {
  mkdirSync(DOCS_DIR, { recursive: true });

  const specs = [buildSyntheticSeries(), buildDriftSeries(), buildPhase5StyleSeries()];
  const combinedRows: string[] = [
    'series,alpha,cycles_to_detection,first_z_score,false_positives_pre_inject',
  ];

  for (const spec of specs) {
    const rows = ALPHAS.map((alpha) => sweepAlpha(spec.series, spec.injectIndex, alpha));
    console.log(`${formatTable(spec, rows)}\n`);
    const csvPath = writeCsv(spec, rows);
    console.log(`Wrote ${csvPath}\n`);
    for (const row of rows) {
      combinedRows.push(
        [
          spec.name,
          row.alpha,
          row.cyclesToDetection ?? '',
          row.firstZScore ?? '',
          row.falsePositivesPreInject,
        ].join(','),
      );
    }
  }

  const combinedPath = join(DOCS_DIR, 'bench-ewma-alpha-sweep.csv');
  writeFileSync(combinedPath, `${combinedRows.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${combinedPath}`);
}

main();
