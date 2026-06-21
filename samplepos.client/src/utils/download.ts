/**
 * Shared File Download Utility
 *
 * Centralized download handler with auth token support.
 * Uses native fetch() — NOT axios — so that response headers (Content-Type,
 * Content-Disposition) are reliably readable on binary responses. Axios v1.x
 * with responseType:'blob' does not reliably expose headers via XHR in all
 * browsers. This mirrors the pattern already proven in DocumentPreviewModal.
 *
 * USAGE:
 *   import { downloadFile } from '../utils/download';
 *   await downloadFile('/customers/123/statement/export.pdf', 'statement.pdf');
 */

import { getAccessToken } from '../hooks/useTokenRefresh';
import { resolveApiUrl } from '../lib/apiBase';

async function assertPdfResponse(response: Response, filename: string): Promise<void> {
    if (!filename.toLowerCase().endsWith('.pdf')) return;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('pdf')) return;

    const peek = await response.clone().arrayBuffer();
    const header = new TextDecoder().decode(peek.slice(0, 5));
    if (header.startsWith('%PDF')) return;

    const preview = new TextDecoder().decode(peek.slice(0, 240));
    throw new Error(
        `Server did not return a PDF file. Content-Type: ${contentType || 'unknown'}. Response: ${preview}`,
    );
}

/**
 * Download a file from the API with authentication.
 *
 * @param apiPath - Path relative to API base (e.g. '/customers/123/statement/export.csv')
 * @param filename - Suggested filename for the downloaded file
 * @throws Error if download fails or content type mismatch for PDFs
 */
export async function downloadFile(apiPath: string, filename: string): Promise<void> {
    const token = getAccessToken();
    const url = resolveApiUrl(apiPath);

    const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Download failed (${response.status}): ${text || response.statusText}`);
    }

    await assertPdfResponse(response, filename);

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(a);
}

