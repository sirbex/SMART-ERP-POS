import axios from 'axios';

/**
 * True when the API is unreachable or the Vite/dev proxy returned a transient
 * "backend restarting" response — not an application/SQL failure.
 */
export function isBackendUnavailableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  const data = error.response?.data as
    | { error_code?: string }
    | string
    | null
    | undefined;

  if (typeof data === 'object' && data?.error_code === 'ERR_BACKEND_UNAVAILABLE') {
    return true;
  }
  if (status === 503) return true;

  // Legacy Vite proxy failure: empty body 500 (pre-resilient proxy).
  if (status === 500 && (data === '' || data == null)) return true;

  if (!error.response) {
    const code = error.code;
    return (
      code === 'ECONNREFUSED' ||
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT'
    );
  }

  return false;
}
