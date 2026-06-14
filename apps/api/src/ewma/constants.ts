export interface EwmaParams {
  alpha: number;
  minSamples: number;
  zThreshold: number;
}

export const DEFAULT_EWMA_PARAMS: EwmaParams = {
  alpha: 0.15,
  minSamples: 30,
  zThreshold: 3.0,
};
