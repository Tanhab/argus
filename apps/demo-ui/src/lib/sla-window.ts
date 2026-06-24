import type { SlaWindowPreset } from '../api/types';

const MS: Record<SlaWindowPreset, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function slaWindowRange(preset: SlaWindowPreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - MS[preset]);
  return { from: from.toISOString(), to: to.toISOString() };
}
