/** User-facing copy when charts/logs are still empty on the live VPS demo. */

export function firstChecksWaitHint(intervalSeconds: number): string {
  const waitSec = Math.max(intervalSeconds * 2, 90);
  return `Regional checkers (EU, AP, US) poll every ${intervalSeconds}s. Allow about ${waitSec} seconds after the monitor is active for the first results. This panel refreshes every 12s.`;
}

export function latencyEmptyHint(intervalSeconds: number): string {
  return `${firstChecksWaitHint(intervalSeconds)} Once checks land, buckets fill for the selected 1h or 24h window.`;
}

export function consensusEmptyHint(intervalSeconds: number): string {
  return `Waiting for each region's latest vote. ${firstChecksWaitHint(intervalSeconds)}`;
}

export function activityEmptyHint(intervalSeconds: number): string {
  return `Nothing logged yet. Check heartbeats arrive first; status changes and anomalies need a few evaluation cycles — often ${intervalSeconds * 2}–${intervalSeconds * 5} seconds after the first checks.`;
}

export function activityFilteredEmptyHint(): string {
  return 'No events match the current filters. Switch to All types or enable Checks to see regional heartbeats.';
}

export function slaUptimePendingHint(intervalSeconds: number): string {
  return `Uptime is computed from health-state history. Until checkers have run, monitored time stays at zero — wait about ${Math.max(intervalSeconds * 2, 90)}s after the monitor goes active.`;
}

export function slaNoIncidentsHint(): string {
  return 'No declared downtime in this window. SLA counts only time in the down state (not degraded). Expected while the site stays healthy.';
}

export function slaLowConfidenceHint(): string {
  return 'Coverage is thin in this window — the monitor was created recently or checks are still ramping up. Uptime will stabilize after more history accumulates.';
}
