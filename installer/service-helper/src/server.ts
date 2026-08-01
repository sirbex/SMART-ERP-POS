import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyUpdate,
  checkForUpdate,
  printServiceStatus,
  readLocalVersion,
  readUpdateChannel,
  resolvePaths,
  restartPrintService,
  startPrintService,
  stopPrintService,
  writeUpdateChannel,
  type UpdateManifest,
} from './serviceControl.js';

const HELPER_NAME = 'SMART Service Helper';
const HELPER_VERSION = '1.0.0';
const DEFAULT_PORT = 1812;
const DEFAULT_HOST = '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

function erpUrlFile(): string {
  return path.join(resolvePaths().productRoot, 'config', 'erp-url.txt');
}

function readErpUrl(): string | null {
  try {
    const f = erpUrlFile();
    if (!existsSync(f)) return null;
    const line = readFileSync(f, 'utf8').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return line || null;
  } catch {
    return null;
  }
}

function writeErpUrl(url: string): void {
  const f = erpUrlFile();
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${url.trim()}\n`, 'utf8');
}

export function createHelperApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.use('/erp-setup', express.static(path.join(PUBLIC_DIR, 'erp-setup'), { index: 'index.html' }));

  app.get('/erp-setup/url', (_req, res) => {
    res.json({ success: true, data: { url: readErpUrl() } });
  });

  app.post(
    '/erp-setup/url',
    asyncRoute(async (req, res) => {
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) {
        res.status(400).json({ success: false, error: 'URL must start with http:// or https://' });
        return;
      }
      writeErpUrl(url);
      res.json({ success: true, data: { url } });
    }),
  );

  app.get('/health', asyncRoute(async (_req, res) => {
    const svc = await printServiceStatus();
    const version = readLocalVersion();
    const channel = readUpdateChannel();
    res.json({
      status: 'online',
      name: HELPER_NAME,
      version: HELPER_VERSION,
      productVersion: version.productVersion,
      printServiceVersion: version.printServiceVersion,
      printService: svc,
      updateChannel: channel,
      heartbeatAt: new Date().toISOString(),
    });
  }));

  app.get('/print-service/status', asyncRoute(async (_req, res) => {
    res.json({ success: true, data: await printServiceStatus() });
  }));

  app.post('/print-service/start', asyncRoute(async (_req, res) => {
    const result = await startPrintService();
    if (!result.ok) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, started: true });
  }));

  app.post('/print-service/stop', asyncRoute(async (_req, res) => {
    const result = await stopPrintService();
    if (!result.ok) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, stopped: true });
  }));

  app.post('/print-service/restart', asyncRoute(async (_req, res) => {
    const result = await restartPrintService();
    if (!result.ok) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, restarted: true });
  }));

  app.get('/update/check', asyncRoute(async (req, res) => {
    const manifestUrl =
      typeof req.query.manifestUrl === 'string' ? req.query.manifestUrl : undefined;
    const result = await checkForUpdate(manifestUrl);
    res.json({ success: true, data: result });
  }));

  app.get('/update/channel', (_req, res) => {
    res.json({ success: true, data: readUpdateChannel() });
  });

  app.post(
    '/update/channel',
    asyncRoute(async (req, res) => {
      const data = writeUpdateChannel({
        manifestUrl: typeof req.body?.manifestUrl === 'string' ? req.body.manifestUrl : undefined,
        channel: typeof req.body?.channel === 'string' ? req.body.channel : undefined,
        checkIntervalMinutes:
          typeof req.body?.checkIntervalMinutes === 'number'
            ? req.body.checkIntervalMinutes
            : undefined,
      });
      res.json({ success: true, data });
    }),
  );

  app.post(
    '/update/apply',
    asyncRoute(async (req, res) => {
      const check = await checkForUpdate(
        typeof req.body?.manifestUrl === 'string' ? req.body.manifestUrl : undefined,
      );
      const manifest = (req.body?.manifest as UpdateManifest | undefined) || check.latest;
      if (!manifest) {
        res.status(400).json({ success: false, error: 'No update manifest available' });
        return;
      }
      if (!check.updateAvailable && !req.body?.force) {
        res.status(409).json({
          success: false,
          error: 'Already up to date',
          data: check,
        });
        return;
      }
      const result = await applyUpdate(manifest);
      if (!result.ok) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }
      res.json({
        success: true,
        updated: true,
        version: readLocalVersion(),
      });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  });

  return app;
}

export function resolveHelperPort(): number {
  const n = Number(process.env.SMART_HELPER_PORT || DEFAULT_PORT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

export function resolveHelperHost(): string {
  return process.env.SMART_HELPER_HOST || DEFAULT_HOST;
}
