#!/usr/bin/env node
/**
 * Summarize AR_GOVERNANCE_WARN events from application logs.
 *
 * Usage:
 *   node scripts/summarize-ar-governance-warns.mjs [logfile...]
 *   node scripts/summarize-ar-governance-warns.mjs SamplePOS.Server/logs/combined.log
 *
 * Reads JSON log lines (winston combined format) or plain text containing
 * "AR_GOVERNANCE_WARN" / "[AR-GOV]".
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/summarize-ar-governance-warns.mjs <logfile> [logfile...]');
  process.exit(1);
}

/** @type {Array<Record<string, unknown>>} */
const warnings = [];

for (const file of files) {
  const path = resolve(file);
  if (!existsSync(path)) {
    console.error(`File not found: ${path}`);
    continue;
  }
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.includes('AR_GOVERNANCE_WARN') && !line.includes('[AR-GOV]')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.event === 'AR_GOVERNANCE_WARN' || String(parsed.message).includes('[AR-GOV]')) {
        warnings.push(parsed);
      }
    } catch {
      // Plain-text fallback
      if (line.includes('AR_GOVERNANCE_WARN') || line.includes('Entity attribution violation')) {
        warnings.push({ raw: line.trim() });
      }
    }
  }
}

const byWorkflow = new Map();
const byCode = new Map();

for (const w of warnings) {
  const workflow = String(w.workflow ?? 'unknown');
  byWorkflow.set(workflow, (byWorkflow.get(workflow) ?? 0) + 1);
  const code = String(w.code ?? 'unknown');
  byCode.set(code, (byCode.get(code) ?? 0) + 1);
}

console.log('=== AR Governance Warn Summary ===\n');
console.log(`Total warnings: ${warnings.length}\n`);

if (warnings.length === 0) {
  console.log('No AR_GOVERNANCE_WARN events found. Observation window looks clean.');
  process.exit(0);
}

console.log('By workflow:');
for (const [workflow, count] of [...byWorkflow.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${workflow.padEnd(28)} ${count}`);
}

console.log('\nBy governance code:');
for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(36)} ${count}`);
}

console.log('\nRecent events (last 20):');
const recent = warnings.slice(-20);
for (const w of recent) {
  const ts = w.timestamp ?? w.time ?? '?';
  const workflow = w.workflow ?? '?';
  const ref = w.referenceNumber ?? w.referenceId ?? '?';
  const code = w.code ?? '?';
  console.log(`  ${ts}  ${String(workflow).padEnd(22)}  ${String(ref).padEnd(16)}  ${code}`);
}

console.log('\nClassify each warning before enabling enforce — see docs/PHASE_2_5_WARN_VALIDATION.md §4');
process.exit(warnings.length > 0 ? 1 : 0);
