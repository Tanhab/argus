import type {
  ActivityEntry,
  AnomalyEvent,
  CheckResult,
  DeliveredAlert,
  StatusEvent,
} from '../api/types';
import { checkerLabel } from './checker-labels';

function checkEntries(results: CheckResult[]): ActivityEntry[] {
  return results.map((r) => {
    const region = checkerLabel(r.checkerId);
    const vote = r.isUp ? 'up' : 'down';
    const latency = r.durationMs !== null ? `${r.durationMs} ms` : '—';
    const code = r.statusCode !== null ? String(r.statusCode) : '—';
    return {
      key: `check-${r.id}`,
      kind: 'CHECK',
      occurredAt: r.checkedAt,
      title: `${region} · ${vote}`,
      detail: `${latency} · HTTP ${code}${r.errorType ? ` · ${r.errorType}` : ''}`,
    };
  });
}

function stateEntries(events: StatusEvent[]): ActivityEntry[] {
  return events.map((e) => ({
    key: `state-${e.id}`,
    kind: 'STATE',
    occurredAt: e.occurredAt,
    title: `${e.fromStatus} → ${e.toStatus}`,
    detail: 'Overall health state changed',
  }));
}

function anomalyEntries(events: AnomalyEvent[]): ActivityEntry[] {
  return events.map((e) => {
    const scopeLabel =
      e.scope === 'regional' && e.checkerId ? `regional (${checkerLabel(e.checkerId)})` : e.scope;
    return {
      key: `anomaly-${e.id}`,
      kind: 'ANOMALY',
      occurredAt: e.occurredAt,
      title: `${e.direction} · z=${e.zScore.toFixed(1)}`,
      detail: `${scopeLabel} · ${e.durationMs} ms vs baseline ${Math.round(e.baselineEwma)} ms`,
    };
  });
}

function alertEntries(alerts: DeliveredAlert[]): ActivityEntry[] {
  return alerts.map((a) => ({
    key: `alert-${a.id}`,
    kind: 'ALERT',
    occurredAt: a.sentAt,
    title: `${a.kind} alert delivered`,
    detail: 'Notification sent via outbox',
  }));
}

export function mergeActivityFeed(
  results: CheckResult[],
  transitions: StatusEvent[],
  anomalies: AnomalyEvent[],
  alerts: DeliveredAlert[],
  options?: { maxChecks?: number },
): ActivityEntry[] {
  const maxChecks = options?.maxChecks ?? 12;
  const checks = checkEntries(results.slice(0, maxChecks));

  return [
    ...checks,
    ...stateEntries(transitions),
    ...anomalyEntries(anomalies),
    ...alertEntries(alerts),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
