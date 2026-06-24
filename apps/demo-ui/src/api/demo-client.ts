import type { DemoTokenResponse, Monitor } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ProblemDetails {
  detail?: string;
  title?: string;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ProblemDetails;
    return body.detail ?? body.title ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...init });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function mintDemoToken(): Promise<DemoTokenResponse> {
  return apiJson('/v1/demo/token', { method: 'POST' });
}

export function listMyMonitors(): Promise<Monitor[]> {
  return apiJson('/v1/monitors');
}

export function createMonitor(url: string, intervalSeconds = 60): Promise<Monitor> {
  return apiJson('/v1/monitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, intervalSeconds }),
  });
}

export function deleteMonitor(id: string): Promise<void> {
  return apiJson(`/v1/monitors/${id}`, { method: 'DELETE' });
}

/** Mint if needed; returns expiry when a new token is created. */
export async function ensureDemoSession(): Promise<{ expiresAt: string | null; created: boolean }> {
  try {
    const token = await mintDemoToken();
    return { expiresAt: token.expiresAt, created: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { expiresAt: null, created: false };
    }
    throw err;
  }
}

export async function hasDemoSession(): Promise<boolean> {
  try {
    await listMyMonitors();
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return false;
    throw err;
  }
}
