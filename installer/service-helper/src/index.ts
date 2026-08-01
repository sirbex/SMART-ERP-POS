#!/usr/bin/env node
/**
 * SMART Service Helper — localhost control plane for Print Service + updates.
 * Bound to 127.0.0.1 only. Browser never elevates; this service already runs elevated/as service.
 */
import { createHelperApp, resolveHelperHost, resolveHelperPort } from './server.js';

const host = resolveHelperHost();
const port = resolveHelperPort();
const app = createHelperApp();

const server = app.listen(port, host, () => {
  console.log(`SMART Service Helper listening on http://${host}:${port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} in use` : err);
  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`${signal} — shutting down helper`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
