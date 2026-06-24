import type { MonitorStatus } from '../api/types';

const styles: Record<MonitorStatus, string> = {
  up: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  degraded: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  down: 'bg-red-500/15 text-red-400 ring-red-500/30',
  recovering: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  pending: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
};

const labels: Record<MonitorStatus, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  recovering: 'Recovering',
  pending: 'Pending',
};

interface StatusBadgeProps {
  status: MonitorStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
