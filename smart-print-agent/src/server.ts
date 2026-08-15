import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_NAME, AGENT_VERSION } from './config.js';
import { openCashDrawer } from './cashdrawer.js';
import { printTestPage } from './printHtml.js';
import { listInstalledPrinters, warmPrinterCache } from './printers.js';
import { warmRawPrintWorker } from './rawPrint.js';
import {
  agentUptimeSeconds,
  appendAgentLog,
  getLogFilePath,
  readAgentLogTail,
  scheduleSelfRestart,
} from './lifecycle.js';
import {
  enqueueAndWait,
  enqueuePrintJob,
  getJobRecord,
  getQueueDepth,
  getQueueSnapshot,
  isPrinting,
} from './printQueue.js';
import {
  isSetupComplete,
  markSetupComplete,
  readInstallMeta,
  readPrinterRoles,
  writePrinterRoles,
} from './printerRoles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

function isEscPosRequest(req: Request): boolean {
  const fmt = String(req.headers['x-print-format'] || '').toLowerCase();
  if (fmt === 'escpos' || fmt === 'raw') return true;
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  return ct.includes('application/octet-stream') || ct.includes('application/vnd.escpos');
}

export function createAgentApp(): Express {
  warmPrinterCache();
  warmRawPrintWorker();

  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Printer-Name', 'X-Print-Format', 'X-Print-Wait'],
    }),
  );

  let cachedPrinterCount: number | null = null;
  let printerCountRefreshing = false;

  function refreshPrinterCountBackground(): void {
    if (printerCountRefreshing) return;
    printerCountRefreshing = true;
    void listInstalledPrinters()
      .then((rows) => {
        cachedPrinterCount = rows.length;
      })
      .catch(() => {
        /* keep last known */
      })
      .finally(() => {
        printerCountRefreshing = false;
      });
  }

  // Fast /health — never block on Windows Get-Printer (that made Stations look Offline).
  app.get('/health', (_req, res) => {
    refreshPrinterCountBackground();
    const meta = readInstallMeta();
    const channel =
      process.env.SMART_PRINT_CHANNEL ||
      (typeof meta?.channel === 'string' ? meta.channel : 'dev');
    res.json({
      status: 'online',
      version: AGENT_VERSION,
      name: AGENT_NAME,
      uptime: agentUptimeSeconds(),
      printers: cachedPrinterCount,
      queueDepth: getQueueDepth(),
      printing: isPrinting(),
      queue: getQueueSnapshot(),
      formats: ['html', 'escpos'],
      channel,
      bundledRuntime: channel === 'commercial' || meta?.bundledNode === true,
      autoStart: channel === 'commercial',
      windowsService: channel === 'commercial' ? 'installed' : 'not_applicable',
      setupComplete: isSetupComplete(),
      printerRoles: readPrinterRoles(),
      heartbeatAt: new Date().toISOString(),
    });
  });

  app.use('/setup', express.static(path.join(PUBLIC_DIR, 'setup'), { index: 'index.html' }));

  app.get('/setup/roles', (_req, res) => {
    res.json({ success: true, data: readPrinterRoles() });
  });

  app.post(
    '/setup/roles',
    express.json({ limit: '32kb' }),
    asyncRoute(async (req, res) => {
      const data = writePrinterRoles({
        receipt: typeof req.body?.receipt === 'string' ? req.body.receipt : null,
        kitchen: typeof req.body?.kitchen === 'string' ? req.body.kitchen : null,
        bar: typeof req.body?.bar === 'string' ? req.body.bar : null,
      });
      appendAgentLog(
        `[setup] roles receipt=${data.receipt || '-'} kitchen=${data.kitchen || '-'} bar=${data.bar || '-'}`,
      );
      res.json({ success: true, data });
    }),
  );

  app.post(
    '/setup/test',
    express.json({ limit: '32kb' }),
    asyncRoute(async (req, res) => {
      const role = String(req.body?.role || '').toLowerCase();
      const roles = readPrinterRoles();
      const map: Record<string, string | null> = {
        receipt: roles.receipt,
        kitchen: roles.kitchen,
        bar: roles.bar,
      };
      const printer = map[role] || null;
      if (!printer) {
        res.status(400).json({ success: false, error: `No ${role || 'role'} printer selected` });
        return;
      }
      await printTestPage(printer);
      res.json({ success: true, role, printer });
    }),
  );

  app.post('/setup/complete', (_req, res) => {
    markSetupComplete();
    appendAgentLog('[setup] wizard complete');
    res.json({ success: true, setupComplete: true });
  });

  const listPrintersHandler = asyncRoute(async (_req, res) => {
    const printers = await listInstalledPrinters({ force: true });
    res.json({
      printers: printers.map((p) => p.name),
      details: printers,
    });
  });

  app.get('/printers', listPrintersHandler);
  app.get('/api/printers', listPrintersHandler);
  app.get('/list-printers', listPrintersHandler);

  /**
   * POST /print
   * - Named printer required (header or wizard role) — never Windows default / PDF ghost.
   * - X-Print-Wait: spool → await WritePrinter/HTML spool, then 200 { spooled:true }.
   * - Without wait header → 202 accepted (legacy); clients should poll GET /print/jobs/:id.
   */
  app.post(
    '/print',
    (req, res, next) => {
      if (isEscPosRequest(req)) {
        return express.raw({ type: () => true, limit: '512kb' })(req, res, next);
      }
      return express.text({ type: () => true, limit: '2mb' })(req, res, next);
    },
    asyncRoute(async (req, res) => {
      const t0 = Date.now();
      const printerName =
        (typeof req.headers['x-printer-name'] === 'string'
          ? req.headers['x-printer-name']
          : '') || null;
      const trimmed = printerName?.trim() || null;
      const roles = readPrinterRoles();
      const waitHeader = String(req.headers['x-print-wait'] || '')
        .trim()
        .toLowerCase();
      const waitSpool = waitHeader === 'spool' || waitHeader === '1' || waitHeader === 'true';
      const isEscPos = isEscPosRequest(req);
      // Prefer explicit name; else wizard role for the document class (never OS default).
      const resolvedPrinter =
        trimmed ||
        (isEscPos
          ? roles.kitchen?.trim() || roles.bar?.trim() || roles.receipt?.trim() || null
          : roles.receipt?.trim() || null) ||
        null;
      if (!resolvedPrinter) {
        res.status(400).json({
          success: false,
          error:
            'Named printer required. Set X-Printer-Name or complete Print Agent setup roles (no Windows default).',
        });
        return;
      }
      const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      if (isEscPos) {
        const buf = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : '');
        if (buf.length === 0) {
          res.status(400).json({ success: false, error: 'Empty ESC/POS body' });
          return;
        }
        const job = {
          id,
          format: 'escpos' as const,
          payload: buf.toString('base64'),
          printerName: resolvedPrinter,
        };
        if (waitSpool) {
          try {
            const rec = await enqueueAndWait(job, 12_000);
            const acceptMs = Date.now() - t0;
            if (rec.status !== 'SPOOL_OK') {
              appendAgentLog(
                `[print] spool-fail id=${id} format=escpos status=${rec.status} err=${rec.lastError || ''}`,
              );
              res.status(502).json({
                success: false,
                id,
                spooled: false,
                status: rec.status,
                error: rec.lastError || 'Spool failed',
                printerName: resolvedPrinter,
                acceptMs,
              });
              return;
            }
            appendAgentLog(
              `[print] spooled id=${id} format=escpos bytes=${buf.length} printer=${resolvedPrinter} acceptMs=${acceptMs}`,
            );
            res.status(200).json({
              success: true,
              id,
              accepted: true,
              spooled: true,
              status: 'SPOOL_OK',
              format: 'escpos',
              printerName: resolvedPrinter,
              queueDepth: getQueueDepth(),
              acceptMs,
            });
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            appendAgentLog(`[print] spool-timeout id=${id} format=escpos: ${message}`);
            res.status(504).json({
              success: false,
              id,
              spooled: false,
              error: message,
              printerName: resolvedPrinter,
            });
            return;
          }
        }
        enqueuePrintJob(job);
        const acceptMs = Date.now() - t0;
        appendAgentLog(
          `[print] accepted id=${id} format=escpos bytes=${buf.length} printer=${resolvedPrinter} acceptMs=${acceptMs}`,
        );
        res.status(202).json({
          success: true,
          id,
          accepted: true,
          spooled: false,
          format: 'escpos',
          printerName: resolvedPrinter,
          queueDepth: getQueueDepth(),
          acceptMs,
        });
        return;
      }

      const html = typeof req.body === 'string' ? req.body : String(req.body || '');
      if (!html.trim()) {
        res.status(400).json({ success: false, error: 'Empty print body' });
        return;
      }
      const htmlJob = {
        id,
        format: 'html' as const,
        payload: html,
        printerName: resolvedPrinter,
      };
      if (waitSpool) {
        try {
          const rec = await enqueueAndWait(htmlJob, 45_000);
          const acceptMs = Date.now() - t0;
          if (rec.status !== 'SPOOL_OK') {
            appendAgentLog(
              `[print] spool-fail id=${id} format=html status=${rec.status} err=${rec.lastError || ''}`,
            );
            res.status(502).json({
              success: false,
              id,
              spooled: false,
              status: rec.status,
              error: rec.lastError || 'Spool failed',
              printerName: resolvedPrinter,
              acceptMs,
            });
            return;
          }
          appendAgentLog(
            `[print] spooled id=${id} format=html printer=${resolvedPrinter} acceptMs=${acceptMs}`,
          );
          res.status(200).json({
            success: true,
            id,
            accepted: true,
            spooled: true,
            status: 'SPOOL_OK',
            format: 'html',
            printerName: resolvedPrinter,
            queueDepth: getQueueDepth(),
            acceptMs,
          });
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          appendAgentLog(`[print] spool-timeout id=${id} format=html: ${message}`);
          res.status(504).json({
            success: false,
            id,
            spooled: false,
            error: message,
            printerName: resolvedPrinter,
          });
          return;
        }
      }
      enqueuePrintJob(htmlJob);
      const acceptMs = Date.now() - t0;
      appendAgentLog(
        `[print] accepted id=${id} format=html printer=${resolvedPrinter} acceptMs=${acceptMs}`,
      );
      res.status(202).json({
        success: true,
        id,
        accepted: true,
        spooled: false,
        format: 'html',
        printerName: resolvedPrinter,
        queueDepth: getQueueDepth(),
        acceptMs,
      });
    }),
  );

  app.get('/print/jobs/:id', (req, res) => {
    const rec = getJobRecord(String(req.params.id || ''));
    if (!rec) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, job: rec });
  });

  app.post(
    '/test-print',
    express.json({ limit: '64kb' }),
    asyncRoute(async (req, res) => {
      const printerName =
        (typeof req.body?.printer === 'string' && req.body.printer) ||
        (typeof req.body?.printerName === 'string' && req.body.printerName) ||
        (typeof req.headers['x-printer-name'] === 'string' && req.headers['x-printer-name']) ||
        null;
      await printTestPage(printerName);
      res.json({ success: true, printer: printerName });
    }),
  );

  app.post(
    '/cashdrawer',
    express.json({ limit: '64kb' }),
    asyncRoute(async (req, res) => {
      const printerName =
        (typeof req.body?.printer === 'string' && req.body.printer) ||
        (typeof req.body?.printerName === 'string' && req.body.printerName) ||
        null;
      await openCashDrawer(printerName);
      res.json({ success: true, printer: printerName });
    }),
  );

  /** Soft restart — PWA never launches executables; agent respawns itself. */
  app.post('/restart', (_req, res) => {
    appendAgentLog('[restart] requested via API');
    res.json({ success: true, restarting: true, version: AGENT_VERSION });
    scheduleSelfRestart(500);
  });

  app.post('/shutdown', (_req, res) => {
    appendAgentLog('[shutdown] requested via API');
    res.json({ success: true, shuttingDown: true });
    setTimeout(() => process.exit(0), 300);
  });

  app.get('/logs', (req, res) => {
    const lines = Math.min(500, Math.max(20, Number(req.query.lines) || 120));
    res.type('text/plain').send(readAgentLogTail(lines) || '(no log lines yet)');
  });

  app.get('/logs/path', (_req, res) => {
    res.json({ path: getLogFilePath() });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    appendAgentLog(`[error] ${message}`);
    console.error('[agent]', message);
    res.status(500).json({ success: false, error: message });
  });

  return app;
}
