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
  uptimePercent: number;
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
