/**
 * Optionally serve the Vite SPA from the API process (on-prem / commercial install).
 * Enabled when CLIENT_DIST_PATH points at a directory containing index.html,
 * or SERVE_FRONTEND=1 and ../Frontend or ./client-dist exists.
 */
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveClientDist(): string | null {
  const fromEnv = process.env.CLIENT_DIST_PATH?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, 'index.html'))) return fromEnv;

  if (process.env.SERVE_FRONTEND === '1' || process.env.SERVE_FRONTEND === 'true') {
    const candidates = [
      path.resolve(process.cwd(), 'client-dist'),
      path.resolve(process.cwd(), '..', 'Frontend'),
      path.resolve(__dirname, '..', '..', '..', 'Frontend'),
    ];
    for (const c of candidates) {
      if (existsSync(path.join(c, 'index.html'))) return c;
    }
  }
  return null;
}

/**
 * Mount after all /api routes and before the API 404 handler.
 */
export function mountFrontendSpa(app: Express): boolean {
  const dist = resolveClientDist();
  if (!dist) return false;

  logger.info('Serving frontend SPA from API', { clientDist: dist });

  app.use(
    express.static(dist, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }),
  );

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
    // Avoid swallowing websocket upgrades etc.
    if (req.path.startsWith('/socket')) return next();
    res.sendFile(path.join(dist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  return true;
}
