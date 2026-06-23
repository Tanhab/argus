import { describe, expect, test } from 'vitest';
import { ValidationError } from '../errors.js';
import { assertPublicHttpUrl, isBlockedIp } from './url-guard.js';

describe('isBlockedIp', () => {
  test('blocks loopback and RFC1918', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
  });

  test('allows public IPv4', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  test('accepts public https', () => {
    const url = assertPublicHttpUrl('https://example.com/path');
    expect(url.hostname).toBe('example.com');
  });

  test('rejects non-http schemes', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(ValidationError);
  });

  test('rejects loopback literal', () => {
    expect(() => assertPublicHttpUrl('http://127.0.0.1/')).toThrow(ValidationError);
  });

  test('rejects cloud metadata literal', () => {
    expect(() => assertPublicHttpUrl('http://169.254.169.254/')).toThrow(ValidationError);
  });

  test('rejects credentials in url', () => {
    expect(() => assertPublicHttpUrl('http://user:pass@example.com/')).toThrow(ValidationError);
  });
});
