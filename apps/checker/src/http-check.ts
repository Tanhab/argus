export type ErrorType =
  | 'timeout'
  | 'dns_failure'
  | 'connection_refused'
  | 'tls_error'
  | 'http_error'
  | 'network_error';

export function classifyError(err: unknown): ErrorType {
  if (!(err instanceof Error)) return 'network_error';

  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';

  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ECONNREFUSED') return 'connection_refused';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failure';
    if (
      code?.startsWith('CERT_') ||
      code?.startsWith('ERR_TLS_') ||
      code?.startsWith('UNABLE_TO_VERIFY')
    )
      return 'tls_error';
  }

  if (
    err.message.includes('SSL') ||
    err.message.includes('TLS') ||
    err.message.includes('certificate')
  ) {
    return 'tls_error';
  }

  return 'network_error';
}

export async function checkUrl(url: string): Promise<{
  statusCode: number | null;
  durationMs: number;
  isUp: boolean;
  errorType: ErrorType | null;
}> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    const durationMs = Date.now() - start;
    const isUp = res.status >= 200 && res.status < 400;
    return {
      statusCode: res.status,
      durationMs,
      isUp,
      errorType: isUp ? null : 'http_error',
    };
  } catch (err) {
    return {
      statusCode: null,
      durationMs: Date.now() - start,
      isUp: false,
      errorType: classifyError(err),
    };
  }
}
