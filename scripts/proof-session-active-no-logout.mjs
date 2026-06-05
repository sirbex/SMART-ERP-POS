#!/usr/bin/env node
/**
 * Proof: GLOBAL enterprise rule — no auto-logout while user is typing/working
 * in ANY module, ANY tab, ANY screen (SAP/Odoo aligned).
 *
 * Proves:
 *   1) session-reliability.spec.ts — core auth/session fixes (#1–#6)
 *   2) session-active-enterprise.spec.ts — cross-tab sync, 18-module matrix, 401 policy
 *   3) Client production build
 *
 * Run: npm run proof:session-active
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'samplepos.client');

let failed = 0;
function pass(msg) {
  console.log(`PASS ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}

function runVitest(pattern, label) {
  console.log('\n' + '═'.repeat(60));
  console.log(` ${label}`);
  console.log('═'.repeat(60));

  const result = spawnSync(
    'npm',
    ['test', '--', '--run', pattern],
    { cwd: clientDir, stdio: 'inherit', shell: true },
  );

  if (result.status !== 0) {
    fail(label);
    return false;
  }
  pass(label);
  return true;
}

runVitest('session-reliability', 'proof — session-reliability (Fix #1–#6)');
runVitest('session-active-enterprise', 'proof — session-active-enterprise (global all-module)');

console.log('\n' + '═'.repeat(60));
console.log(' proof — Client production build');
console.log('═'.repeat(60));

const build = spawnSync('npm', ['run', 'build'], {
  cwd: clientDir,
  stdio: 'inherit',
  shell: true,
});

if (build.status !== 0) {
  fail('TypeScript + Vite production build');
  process.exit(1);
}
pass('TypeScript + Vite production build');

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.error(`proof-session-active-no-logout: ${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('proof-session-active-no-logout: ALL CHECKS PASSED');
console.log('');
console.log('GLOBAL enterprise guarantees (all modules, all tabs):');
console.log('  • Typing/input in any screen resets session (18 ERP modules verified)');
console.log('  • Cross-tab activity sync — typing in tab B protects tab A');
console.log('  • No idle logout while active (60m window + global event listeners)');
console.log('  • No logout on network / 5xx refresh errors (any module)');
console.log('  • Definitive auth failure deferred until genuinely idle');
console.log('  • Cross-tab SESSION_EXPIRED ignored on working tabs');
console.log('  • 401 handler preserves tokens when active + server error');
console.log('  • resilientApiClient + apiClient share same auth policy');
console.log('');
console.log('Intentional logout still allowed:');
console.log('  • Manual Logout button');
console.log('  • Admin revoke-all-sessions');
console.log('  • 60 min zero input across ALL tabs (true idle)');
console.log('═'.repeat(60));

process.exit(0);
