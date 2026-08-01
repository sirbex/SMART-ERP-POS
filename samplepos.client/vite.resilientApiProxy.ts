import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import type { Plugin } from 'vite';

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 3001;
const MAX_ATTEMPTS = 12;
const RETRY_MS = 250;

const UNAVAILABLE_BODY = JSON.stringify({
  success: false,
  error: 'API server temporarily unavailable. It may be restarting — retry shortly.',
  error_code: 'ERR_BACKEND_UNAVAILABLE',
});

function sendUnavailable(res: ServerResponse): void {
  if (res.writableEnded || res.headersSent) return;
  res.writeHead(503, {
    'Content-Type': 'application/json',
    'Retry-After': '1',
    'Cache-Control': 'no-store',
  });
  res.end(UNAVAILABLE_BODY);
}

function isRetriable(err: NodeJS.ErrnoException | undefined): boolean {
  const code = err?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH'
  );
}

function isIdempotent(method: string | undefined): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

/**
 * Dev-only: proxy /api → Node with short reconnect retries.
 *
 * Why: `tsx watch` restarts drop the listen socket for ~0.5–3s. Vite's default
 * http-proxy maps ECONNREFUSED to an empty HTTP 500, which the FOH tables poll
 * surfaces as a permanent-looking API failure (`status: 500, data: ''`).
 *
 * This plugin bridges that window and always returns structured JSON on failure.
 * Only idempotent methods are retried (safe; body not re-streamed).
 */
export function resilientApiProxyPlugin(): Plugin {
  function forward(req: IncomingMessage, res: ServerResponse, attempt: number): void {
    const headers = { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` };
    delete headers['accept-encoding'];

    const upstream = http.request(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers,
        timeout: 60_000,
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      },
    );

    upstream.on('timeout', () => {
      upstream.destroy(Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' }));
    });

    upstream.on('error', (err: NodeJS.ErrnoException) => {
      if (
        isIdempotent(req.method) &&
        isRetriable(err) &&
        attempt < MAX_ATTEMPTS &&
        !res.headersSent
      ) {
        setTimeout(() => forward(req, res, attempt + 1), RETRY_MS);
        return;
      }
      console.warn(
        `[vite] API proxy unavailable after ${attempt} attempt(s): ${req.url} (${err.code || err.message})`,
      );
      sendUnavailable(res);
    });

    if (isIdempotent(req.method)) {
      // No body to stream — safe to retry with a fresh upstream request.
      upstream.end();
    } else {
      req.pipe(upstream);
    }
  }

  return {
    name: 'resilient-api-proxy',
    configureServer(server) {
      // Run before Vite's built-in proxy so we own /api entirely.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          next();
          return;
        }
        forward(req, res, 1);
      });
    },
  };
}
