import { describe, it, expect, vi, afterEach } from 'vitest';

describe('getApiBaseUrl / resolveApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to /api when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { getApiBaseUrl, resolveApiUrl } = await import('./apiBase');
    expect(getApiBaseUrl()).toBe('/api');
    expect(resolveApiUrl('/documents/QUOTATION/q-1')).toBe('/api/documents/QUOTATION/q-1');
  });

  it('appends /api to absolute backend URLs without it', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3001');
    const { getApiBaseUrl, resolveApiUrl } = await import('./apiBase');
    expect(getApiBaseUrl()).toBe('http://localhost:3001/api');
    expect(resolveApiUrl('/documents/QUOTATION/q-1')).toBe(
      'http://localhost:3001/api/documents/QUOTATION/q-1',
    );
  });

  it('does not double-append /api', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3001/api');
    const { getApiBaseUrl } = await import('./apiBase');
    expect(getApiBaseUrl()).toBe('http://localhost:3001/api');
  });

  it('uses relative /api when VITE_API_URL points at the Vite dev server', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5173');
    const { getApiBaseUrl, resolveApiUrl } = await import('./apiBase');
    expect(getApiBaseUrl()).toBe('/api');
    expect(resolveApiUrl('/documents/QUOTATION/q-1')).toBe('/api/documents/QUOTATION/q-1');
  });
});
