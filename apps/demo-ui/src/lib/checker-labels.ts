const CHECKER_LABELS: Record<string, string> = {
  'checker-eu': 'EU',
  'checker-ap': 'AP',
  'checker-us': 'US',
};

export const CHECKER_ORDER = ['checker-eu', 'checker-ap', 'checker-us'] as const;

export function checkerLabel(checkerId: string): string {
  return CHECKER_LABELS[checkerId] ?? checkerId;
}
