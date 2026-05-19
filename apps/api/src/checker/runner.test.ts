import { describe, expect, test } from 'vitest';
import { classifyError } from './http-client.js';

describe('classifyError', () => {
  test('ECONNREFUSED in cause returns connection_refused', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error(), { code: 'ECONNREFUSED' }),
    });
    expect(classifyError(err)).toBe('connection_refused');
  });

  test('ENOTFOUND in cause returns dns_failure', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error(), { code: 'ENOTFOUND' }),
    });
    expect(classifyError(err)).toBe('dns_failure');
  });

  test('TimeoutError name returns timeout', () => {
    const err = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    expect(classifyError(err)).toBe('timeout');
  });

  test('unknown error returns network_error', () => {
    const err = new TypeError('something went wrong');
    expect(classifyError(err)).toBe('network_error');
  });
});
