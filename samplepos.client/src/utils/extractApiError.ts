/**
 * Extract a human-readable error message from API/axios errors.
 * Unwraps the backend { success: false, error: "..." } response shape.
 */
export function extractApiError(err: unknown, fallback = 'Operation failed'): string {
  if (err && typeof err === 'object') {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    if (axiosErr.response?.data?.error) return axiosErr.response.data.error;
    if (axiosErr.response?.data?.message) return axiosErr.response.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
