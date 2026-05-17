import { describe, expect, test } from 'vitest';

describe('sanity', () => {
  test('vitest runs in @argus/api', () => {
    expect(1 + 1).toBe(2);
  });
});
