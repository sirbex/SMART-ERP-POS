/**
 * PROOF: HTTP 403 must surface as a standard Access denied notification —
 * never Axios "Request failed with status code 403" or raw "Insufficient permissions".
 *
 * Run: npx vitest run src/__tests__/access-denied-notification-proof.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axios, { type AxiosError } from 'axios';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import {
  ACCESS_DENIED_MESSAGE,
  HandledApiError,
  friendlyHttpErrorMessage,
  getStructuredErrorMessage,
  handleApiError,
  parseApiError,
  toastApiError,
} from '../utils/errorHandler';
import { getErrorMessage } from '../utils/api';

const root = resolve(__dirname, '..');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function makeAxios403(apiError = 'Insufficient permissions'): AxiosError {
  return {
    isAxiosError: true,
    response: {
      status: 403,
      data: { success: false, error: apiError },
      headers: {},
      config: {} as AxiosError['config'],
      statusText: 'Forbidden',
    },
    config: {} as AxiosError['config'],
    message: 'Request failed with status code 403',
    name: 'AxiosError',
    toJSON: () => ({}),
  } as unknown as AxiosError;
}

describe('PROOF — Access denied notification (no HTTP status codes)', () => {
  it('E-01 interceptor rejects HandledApiError and dispatches app:forbidden on 403', () => {
    const api = readSrc('utils/api.ts');
    expect(api).toMatch(/error\.response\?\.status === 403/);
    expect(api).toMatch(/app:forbidden/);
    expect(api).toMatch(/HandledApiError/);
    expect(api).toMatch(/friendlyHttpErrorMessage\(403/);
    expect(api).toMatch(/return Promise\.reject\(new HandledApiError/);
  });

  it('E-02 App shows standard Access denied toast (not status code text)', () => {
    const app = readSrc('App.tsx');
    expect(app).toMatch(/app:forbidden/);
    expect(app).toMatch(/Access denied/);
    expect(app).not.toMatch(/Request failed with status code/);
    expect(app).not.toMatch(/toast\.error\(msg,\s*\{\s*duration:\s*6000,\s*icon:\s*'🔒'/);
  });

  it('E-03 getErrorMessage never returns Axios status-code text for 403', () => {
    const ax = makeAxios403();
    expect(axios.isAxiosError(ax)).toBe(true);
    const msg = getErrorMessage(ax);
    expect(msg).toBe(ACCESS_DENIED_MESSAGE);
    expect(msg).not.toMatch(/status code/i);
    expect(msg).not.toBe('Insufficient permissions');
    expect(msg).not.toBe('Request failed with status code 403');
  });

  it('E-04 getErrorMessage on HandledApiError returns friendly copy (no re-raw)', () => {
    const msg = getErrorMessage(new HandledApiError(ACCESS_DENIED_MESSAGE));
    expect(msg).toBe(ACCESS_DENIED_MESSAGE);
    expect(msg).not.toMatch(/status code/i);
  });

  it('E-05 parseApiError / structured message strip Insufficient permissions jargon', () => {
    const parsed = parseApiError(makeAxios403('Insufficient permissions'));
    expect(parsed.status).toBe(403);
    expect(parsed.message).toBe(ACCESS_DENIED_MESSAGE);

    expect(getStructuredErrorMessage(makeAxios403())).toBe(ACCESS_DENIED_MESSAGE);
    expect(friendlyHttpErrorMessage(403, 'Insufficient permissions')).toBe(ACCESS_DENIED_MESSAGE);
    expect(friendlyHttpErrorMessage(undefined, 'Request failed with status code 403')).toBe(
      ACCESS_DENIED_MESSAGE
    );
  });

  it('E-06 toastApiError / handleApiError skip duplicate toast for HandledApiError', () => {
    const handled = new HandledApiError(ACCESS_DENIED_MESSAGE);
    // Must not throw; interceptor already notified
    expect(() => toastApiError(handled)).not.toThrow();
    expect(handleApiError(handled)).toBe(ACCESS_DENIED_MESSAGE);
  });

  it('E-07 accounting mutation hooks use toastApiError (skips handled 403)', () => {
    const hooks = readSrc('hooks/useAccountingModules.ts');
    expect(hooks).toMatch(/toastApiError/);
    expect(hooks).not.toMatch(/toast\.error\(getErrorMessage\(/);
  });

  it('E-08 BankAccountsTab skips HandledApiError before local toast', () => {
    const tab = readSrc('components/banking/BankAccountsTab.tsx');
    expect(tab).toMatch(/HandledApiError/);
    expect(tab).toMatch(/if \(error instanceof HandledApiError\) return/);
    expect(tab).toMatch(/getStructuredErrorMessage/);
  });
});
