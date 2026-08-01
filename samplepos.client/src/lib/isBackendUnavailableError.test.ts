import { describe, expect, it } from 'vitest';
import axios, { AxiosError } from 'axios';
import { isBackendUnavailableError } from './isBackendUnavailableError';

function axiosErr(partial: {
  status?: number;
  data?: unknown;
  code?: string;
}): AxiosError {
  const err = new AxiosError('boom');
  err.code = partial.code;
  if (partial.status != null) {
    err.response = {
      status: partial.status,
      data: partial.data,
      statusText: '',
      headers: {},
      config: err.config!,
    };
  }
  return err;
}

describe('isBackendUnavailableError', () => {
  it('detects structured 503 from resilient Vite proxy', () => {
    expect(
      isBackendUnavailableError(
        axiosErr({
          status: 503,
          data: { error_code: 'ERR_BACKEND_UNAVAILABLE', success: false },
        }),
      ),
    ).toBe(true);
  });

  it('detects legacy empty-body Vite proxy 500', () => {
    expect(isBackendUnavailableError(axiosErr({ status: 500, data: '' }))).toBe(true);
    expect(isBackendUnavailableError(axiosErr({ status: 500, data: null }))).toBe(true);
  });

  it('does not treat real application 500 as unavailable', () => {
    expect(
      isBackendUnavailableError(
        axiosErr({ status: 500, data: { success: false, error: 'column missing' } }),
      ),
    ).toBe(false);
  });

  it('detects transport failures', () => {
    expect(isBackendUnavailableError(axiosErr({ code: 'ERR_NETWORK' }))).toBe(true);
    expect(isBackendUnavailableError(axiosErr({ code: 'ECONNREFUSED' }))).toBe(true);
  });

  it('ignores non-axios errors', () => {
    expect(isBackendUnavailableError(new Error('x'))).toBe(false);
    expect(isBackendUnavailableError(null)).toBe(false);
  });

  it('works with AxiosError transport shape', () => {
    const err = new axios.AxiosError('fail');
    err.code = 'ERR_NETWORK';
    expect(isBackendUnavailableError(err)).toBe(true);
  });
});
