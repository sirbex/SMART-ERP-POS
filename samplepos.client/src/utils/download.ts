/**
 * Shared File Download Utility
 *
 * Centralized download handler with auth token support.
 * Uses the shared API client — no hardcoded URLs.
 *
 * USAGE:
 *   import { downloadFile } from '../utils/download';
 *   await downloadFile('/customers/123/statement/export.pdf', 'statement.pdf');
 */

import { api } from '../services/api';

/**
 * Download a file from the API with authentication.
 *
 * @param apiPath - Path relative to API base (e.g. '/customers/123/statement/export.csv')
 * @param filename - Suggested filename for the downloaded file
 * @throws Error if download fails or content type mismatch for PDFs
 */
export async function downloadFile(apiPath: string, filename: string): Promise<void> {
    const response = await api.get(apiPath, { responseType: 'blob' });
    const blob: Blob = response.data;

    // Validate content type for PDF downloads
    const contentType = response.headers['content-type'] || '';
    if (filename.endsWith('.pdf') && !contentType.includes('pdf')) {
        const text = await blob.text();
        throw new Error(
            `Server did not return a PDF file. Content-Type: ${contentType || 'unknown'}. Response: ${text}`
        );
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}
