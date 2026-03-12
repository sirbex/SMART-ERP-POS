/**
 * Import API Client
 * API methods for CSV bulk import operations
 */

import apiClient from '../utils/api';

// ── Types ─────────────────────────────────────────────────

export type ImportEntityType = 'PRODUCT' | 'CUSTOMER' | 'SUPPLIER';
export type DuplicateStrategy = 'SKIP' | 'UPDATE' | 'FAIL';
export type ImportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ImportErrorType = 'VALIDATION' | 'DUPLICATE' | 'DATABASE';

export interface ImportJob {
  id: string;
  jobNumber: string;
  entityType: ImportEntityType;
  fileName: string;
  fileSizeBytes: number;
  duplicateStrategy: DuplicateStrategy;
  status: ImportJobStatus;
  rowsTotal: number;
  rowsProcessed: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  errorSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  userId: string;
  createdAt: string;
}

export interface ImportJobError {
  id: string;
  importJobId: string;
  rowNumber: number;
  rawData: Record<string, string> | null;
  errorMessage: string;
  errorType: ImportErrorType;
  createdAt: string;
}

export interface ImportJobListResponse {
  rows: ImportJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportJobErrorsResponse {
  rows: ImportJobError[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UploadResult {
  jobId: string;
  jobNumber: string;
  status: string;
  message: string;
}

// ── API Methods ───────────────────────────────────────────

const importApi = {
  /**
   * Upload a CSV file and start an import job.
   * Uses FormData — axios will auto-set Content-Type to multipart/form-data.
   */
  async uploadCsv(
    file: File,
    entityType: ImportEntityType,
    duplicateStrategy: DuplicateStrategy
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('duplicateStrategy', duplicateStrategy);

    const response = await apiClient.post('/import/upload', formData, {
      timeout: 120000, // 2 min for large files
      headers: { 'Content-Type': undefined }, // Let axios set multipart boundary
    });
    return response.data.data;
  },

  /**
   * List import jobs (paginated, with optional filters).
   */
  async listJobs(params?: {
    page?: number;
    limit?: number;
    entityType?: ImportEntityType;
    status?: ImportJobStatus;
  }): Promise<ImportJobListResponse> {
    const response = await apiClient.get('/import/jobs', { params });
    return response.data.data;
  },

  /**
   * Get a single import job by ID or job number.
   */
  async getJob(id: string): Promise<ImportJob> {
    const response = await apiClient.get(`/import/jobs/${encodeURIComponent(id)}`);
    return response.data.data;
  },

  /**
   * Get errors for an import job (paginated).
   */
  async getJobErrors(
    jobId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ImportJobErrorsResponse> {
    const response = await apiClient.get(
      `/import/jobs/${encodeURIComponent(jobId)}/errors`,
      { params }
    );
    return response.data.data;
  },

  /**
   * Download all errors for a job as CSV.
   * Returns a Blob that can be downloaded.
   */
  async downloadErrorsCsv(jobId: string): Promise<Blob> {
    const response = await apiClient.get(
      `/import/jobs/${encodeURIComponent(jobId)}/errors/csv`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  /**
   * Cancel a PENDING import job.
   */
  async cancelJob(id: string): Promise<ImportJob> {
    const response = await apiClient.post(`/import/jobs/${encodeURIComponent(id)}/cancel`);
    return response.data.data;
  },

  /**
   * Retry a FAILED import job.
   */
  async retryJob(id: string): Promise<ImportJob> {
    const response = await apiClient.post(`/import/jobs/${encodeURIComponent(id)}/retry`);
    return response.data.data;
  },

  /**
   * Download a CSV template for a given entity type.
   * Returns a Blob for file download.
   */
  async downloadTemplate(entityType: ImportEntityType): Promise<Blob> {
    try {
      const response = await apiClient.get(
        `/import/template/${encodeURIComponent(entityType)}`,
        { responseType: 'blob' }
      );
      return response.data;
    } catch (err: unknown) {
      // Axios blob responses wrap error bodies as Blob — extract the text
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: Blob | { error?: string } } };
        const data = axiosErr.response?.data;
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const json = JSON.parse(text) as { error?: string };
            if (json.error) throw new Error(json.error);
          } catch { /* not JSON, fall through */ }
        } else if (data && typeof data === 'object' && 'error' in data) {
          throw new Error(String(data.error));
        }
      }
      throw err;
    }
  },
};

export default importApi;
