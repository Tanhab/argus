import { describe, expect, test } from 'vitest';

describe('sanity', () => {
  test('vitest runs in @argus/db', () => {
    expect(1 + 1).toBe(2);
  });
});
