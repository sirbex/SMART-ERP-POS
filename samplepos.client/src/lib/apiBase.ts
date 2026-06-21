/**
 * Resolve the API base URL for fetch() and axios.
 *
 * VITE_API_URL may be:
 *   - unset        → `/api` (Vite dev proxy)
 *   - `/api`         → production nginx same-origin
 *   - `http://host:port` → docker-compose / docs (must append `/api`)
 *   - `http://host:port/api` → already correct
 *
 * In dev, absolute URLs that point at the Vite dev server (localhost/127.0.0.1
 * on port 5173/5174) are normalized to relative `/api` so fetch() stays
 * same-origin regardless of whether the tab uses localhost or 127.0.0.1.
 */
const VITE_DEV_PORTS = new Set(['5173', '5174', '4173', '3000']);

function isViteDevServerOrigin(origin: string): boolean {
    if (!import.meta.env.DEV) return false;
    try {
        const { hostname, port } = new URL(origin);
        return (
            (hostname === 'localhost' || hostname === '127.0.0.1') &&
            VITE_DEV_PORTS.has(port)
        );
    } catch {
        return false;
    }
}

export function getApiBaseUrl(): string {
    const raw = (import.meta.env.VITE_API_URL ?? '').trim();
    if (!raw || raw === '/') return '/api';

    const withoutTrailing = raw.replace(/\/+$/, '');

    if (withoutTrailing.endsWith('/api')) {
        const origin = withoutTrailing.slice(0, -'/api'.length);
        if (isViteDevServerOrigin(origin)) return '/api';
        return withoutTrailing;
    }

    if (withoutTrailing.startsWith('http://') || withoutTrailing.startsWith('https://')) {
        if (isViteDevServerOrigin(withoutTrailing)) return '/api';
        return `${withoutTrailing}/api`;
    }

    return withoutTrailing.startsWith('/') ? withoutTrailing : '/api';
}

/** Build a full API URL from a path relative to the API root (e.g. `/documents/INVOICE/id`). */
export function resolveApiUrl(apiPath: string): string {
    const base = getApiBaseUrl();
    const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    return `${base}${path}`;
}

/** URL for server-rendered PDF documents (download or inline preview). */
export function resolveDocumentUrl(
    type: string,
    id: string,
    opts?: { preview?: boolean; paperSize?: string; startDate?: string; endDate?: string },
): string {
    const params = new URLSearchParams();
    if (opts?.paperSize) params.set('paperSize', opts.paperSize);
    if (opts?.startDate) params.set('startDate', opts.startDate);
    if (opts?.endDate) params.set('endDate', opts.endDate);
    const qs = params.toString();
    const segment = opts?.preview ? 'preview' : '';
    const path = segment
        ? `/documents/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${segment}`
        : `/documents/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    return qs ? `${resolveApiUrl(path)}?${qs}` : resolveApiUrl(path);
}
