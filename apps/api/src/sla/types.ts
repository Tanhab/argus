export interface SlaIncident {
  from: string;
  to: string;
  minutes: number;
}

export interface SlaSli {
  totalMinutes: number;
  maintenanceMinutes: number;
  coverageGapMinutes: number;
  monitoredMinutes: number;
  downtimeMinutes: number;
  /** null when no monitored time exists in the window, so no percentage is meaningful. */
  uptimePercent: number | null;
  lowConfidence: boolean;
}

export interface SlaErrorBudget {
  totalMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  remainingPercent: number;
}

export interface SlaSlo {
  target: number;
  met: boolean;
  errorBudget: SlaErrorBudget;
}

export interface SlaResponse {
  monitorId: string;
  window: {
    from: string;
    to: string;
    effectiveFrom: string;
    effectiveTo: string;
  };
  sli: SlaSli;
  incidents: SlaIncident[];
  slo?: SlaSlo;
}
