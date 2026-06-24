import { describe, expect, test } from 'vitest';
import { demoOwnerFromIp } from './demo-owner.js';

describe('demoOwnerFromIp', () => {
  test('returns stable demo-prefixed owner id', () => {
    const a = demoOwnerFromIp('203.0.113.10');
    const b = demoOwnerFromIp('203.0.113.10');
    expect(a).toBe(b);
    expect(a.startsWith('demo:')).toBe(true);
    expect(a.length).toBeGreaterThan('demo:'.length);
  });

  test('differs for different ips', () => {
    expect(demoOwnerFromIp('203.0.113.10')).not.toBe(demoOwnerFromIp('203.0.113.11'));
  });
});
