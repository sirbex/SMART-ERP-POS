#!/usr/bin/env node
/**
 * SMART Print Agent — official SMART-ERP-POS local delivery component.
 * Runs as a background Windows service-like process (auto-start + watchdog).
 * Cashiers never interact with this process directly.
 */
import { createAgentApp } from './server.js';
import { AGENT_NAME, AGENT_VERSION, resolveHost, resolvePort } from './config.js';
import { appendAgentLog, ensureLogDir } from './lifecycle.js';

ensureLogDir();
appendAgentLog(`[boot] ${AGENT_NAME} v${AGENT_VERSION} starting`);

const host = resolveHost();
const port = resolvePort();
const app = createAgentApp();

const server = app.listen(port, host, () => {
  const msg = `${AGENT_NAME} v${AGENT_VERSION} listening on http://${host}:${port}`;
  console.log(msg);
  appendAgentLog(`[boot] ${msg}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    const msg = `Port ${port} already in use — another Print Service instance is running.`;
    console.error(msg);
    appendAgentLog(`[boot] ${msg}`);
  } else {
    console.error(err);
    appendAgentLog(`[boot] error ${err.message}`);
  }
  process.exit(1);
});

function shutdown(signal: string) {
  appendAgentLog(`[shutdown] ${signal}`);
  console.log(`\n${signal} — shutting down ${AGENT_NAME}`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
