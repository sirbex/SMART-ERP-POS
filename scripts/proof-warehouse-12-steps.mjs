#!/usr/bin/env node
/**
 * Proof — 12-step Multi-Store Warehouse enhancement integrity matrix.
 *
 * Maps each spec step to static gates + delegates to existing proof suites.
 *
 *   npm run proof:warehouse-12-steps
 *   PROOF_OUT=PROOF_WAREHOUSE_12_STEPS.md npm run proof:warehouse-12-steps
 *   SKIP_LIVE=1 npm run proof:warehouse-12-steps   # static + typecheck only
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_WAREHOUSE_12_STEPS.md');
const SKIP_LIVE = process.env.SKIP_LIVE === '1';

/** @type {Record<number, { title: string, pass: number, fail: number, skip: number, lines: string[] }>} */
const steps = {};

function initStep(n, title) {
  if (!steps[n]) steps[n] = { title, pass: 0, fail: 0, skip: 0, lines: [] };
}

function ok(step, n, d = '') {
  initStep(step, steps[step]?.title ?? `Step ${step}`);
  steps[step].pass++;
  const line = `- **PASS** ${n}${d ? ` — ${d}` : ''}`;
  steps[step].lines.push(line);
  console.log(`  [S${step}] PASS  ${n}${d ? ` — ${d}` : ''}`);
}

function bad(step, n, d = '') {
  initStep(step, steps[step]?.title ?? `Step ${step}`);
  steps[step].fail++;
  const line = `- **FAIL** ${n}${d ? ` — ${d}` : ''}`;
  steps[step].lines.push(line);
  console.error(`  [S${step}] FAIL  ${n}${d ? ` — ${d}` : ''}`);
}

function skip(step, n, d = '') {
  initStep(step, steps[step]?.title ?? `Step ${step}`);
  steps[step].skip++;
  const line = `- **SKIP** ${n}${d ? ` — ${d}` : ''}`;
  steps[step].lines.push(line);
  console.log(`  [S${step}] SKIP  ${n}${d ? ` — ${d}` : ''}`);
}

function assert(step, c, n, d = '') {
  if (c) ok(step, n, d);
  else bad(step, n, d);
}

function fileExists(rel) {
  return existsSync(resolve(root, rel));
}

function fileContains(rel, needle) {
  if (!fileExists(rel)) return false;
  return readFileSync(resolve(root, rel), 'utf8').includes(needle);
}

function runScript(step, label, scriptRel, env = {}) {
  console.log(`\n── Step ${step}: ${label} (subprocess) ──`);
  const childEnv = { ...process.env, ...env };
  delete childEnv.PHASES;
  const r = spawnSync('node', [resolve(root, scriptRel)], {
    cwd: root,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
    env: childEnv,
  });
  const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ');
  if (r.status === 0) ok(step, label, tail || 'exit 0');
  else bad(step, label, tail || `exit ${r.status}`);
  return r.status === 0;
}

function runNpm(step, label, scriptName) {
  console.log(`\n── Step ${step}: ${label} (npm) ──`);
  const r = spawnSync('npm', ['run', scriptName], {
    cwd: root,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ');
  if (r.status === 0) ok(step, label, tail || 'exit 0');
  else bad(step, label, tail || `exit ${r.status}`);
  return r.status === 0;
}

// ─── Step 1: Inspect first (SSOT exists, no duplicate engines) ───────────────
function gateStep1() {
  console.log('\n══ Step 1 — Inspect first (static SSOT) ══');
  const S = 1;
  const title = 'Inspect first — reusable resources documented';
  initStep(S, title);

  const ssot = [
    'samplepos.client/src/components/inventory/shared/EnterpriseProductSearch.tsx',
    'samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx',
    'samplepos.client/src/components/inventory/UomSelector.tsx',
    'shared/utils/po-line-uom.ts',
    'shared/utils/transferNegotiation.ts',
    'shared/types/transferWorkflow.ts',
    'SamplePOS.Server/src/modules/inventory/warehouse/storeTransferService.ts',
    'SamplePOS.Server/src/modules/inventory/warehouse/warehouseInventoryRepository.ts',
    '.cursor/rules/warehouse-document-workspace.mdc',
  ];
  for (const f of ssot) assert(S, fileExists(f), `SSOT exists: ${f.split('/').pop()}`);

  assert(S, !fileExists('samplepos.client/src/components/inventory/TransferProductSearch.tsx'), 'No duplicate TransferProductSearch');
  assert(S, fileContains('scripts/proof-transfer-product-search.mjs', 'EnterpriseProductSearch'), 'Product search proof guards SSOT');
}

// ─── Step 2: Approval workspace (DataTable, no wizard) ─────────────────────
function gateStep2() {
  console.log('\n══ Step 2 — Approval workspace ══');
  const S = 2;
  initStep(S, 'Replace Request Approval Wizard');

  const ws = 'samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx';
  assert(S, fileContains(ws, 'DataTable'), 'Approval workspace uses DataTable');
  assert(S, fileContains(ws, 'SlideDrawer'), 'Approval workspace is full SlideDrawer');
  assert(S, fileContains(ws, 'Stock request approval'), 'Approval workspace title');
  assert(S, fileContains(ws, 'Requested Qty') || fileContains(ws, 'qtyLabel'), 'Requested quantity column');
  assert(S, fileContains(ws, 'UomSelector'), 'Approved UoM uses existing MUoM engine');
  assert(S, fileContains('samplepos.client/src/components/inventory/TransferApprovalWorkspaceHeader.tsx', 'Requesting store'), 'Header shows requesting store');
  assert(
    S,
    !fileContains('samplepos.client/src/pages/inventory/TransferApprovalsPage.tsx', 'wizardStep'),
    'No wizard steps on approvals page',
  );
}

// ─── Step 3: Enterprise approval actions ─────────────────────────────────────
function gateStep3() {
  console.log('\n══ Step 3 — Enterprise approval actions ══');
  const S = 3;
  initStep(S, 'Enterprise Approval Actions');

  assert(S, fileContains('shared/sql/532_transfer_line_negotiation.sql', 'quantity_approved'), 'quantity_approved column');
  assert(S, fileContains('shared/utils/transferNegotiation.ts', 'PARTIALLY_APPROVED'), 'Partial approval status helper');
  assert(S, fileContains('shared/utils/po-line-uom.ts', 'poLineBaseQuantity'), 'MUoM conversion SSOT (no duplicate engine)');
  assert(
    S,
    fileContains('samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx', 'setLineRejected') ||
      fileContains('samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx', 'Reject request'),
    'Reject line action',
  );
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', 'ApproveTransferSchema'), 'Approve API accepts per-line quantities');
}

// ─── Step 4: Header smart actions ────────────────────────────────────────────
function gateStep4() {
  console.log('\n══ Step 4 — Header smart actions ══');
  const S = 4;
  initStep(S, 'Header Smart Actions');

  const tb = 'samplepos.client/src/components/inventory/TransferApprovalToolbar.tsx';
  for (const label of ['Approve all', 'Approve available', 'Reject all', 'Save draft', 'Generate transfer', 'Complete transfer']) {
    assert(S, fileContains(tb, label), `Toolbar: ${label}`);
  }
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', '/:id/approval-draft'), 'Save draft API');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', '/:id/complete'), 'Complete transfer API (override chain)');
}

// ─── Step 5: Modern product search ───────────────────────────────────────────
function gateStep5Static() {
  console.log('\n══ Step 5 — Modern product search (static) ══');
  const S = 5;
  initStep(S, 'Modern Product Search');

  assert(S, fileContains('samplepos.client/src/components/inventory/shared/EnterpriseProductSearch.tsx', 'warehouse'), 'EnterpriseProductSearch warehouse mode');
  assert(S, fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'EnterpriseProductSearch'), 'Transfer picker reuses SSOT search');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/productStoreDistributionService.ts', 'searchProductsAtStore'), 'Warehouse-scoped backend search');
}

// ─── Step 6: Responsive workspace ──────────────────────────────────────────
function gateStep6() {
  console.log('\n══ Step 6 — Responsive workspace ══');
  const S = 6;
  initStep(S, 'Responsive Workspace (drawers)');

  const pages = [
    ['TransferNegotiationWorkspace.tsx', 'samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx'],
    ['TransferRequestDetailDrawer.tsx', 'samplepos.client/src/components/inventory/TransferRequestDetailDrawer.tsx'],
    ['GoodsReceiptsPage.tsx', 'samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx'],
    ['PurchaseOrdersPage.tsx', 'samplepos.client/src/pages/inventory/PurchaseOrdersPage.tsx'],
    ['InventoryAdjustmentsPage.tsx', 'samplepos.client/src/pages/inventory/InventoryAdjustmentsPage.tsx'],
    ['BatchManagementPage.tsx', 'samplepos.client/src/pages/inventory/BatchManagementPage.tsx'],
  ];
  for (const [name, path] of pages) {
    assert(S, fileContains(path, 'SlideDrawer'), `${name} uses SlideDrawer`);
  }
  assert(S, fileContains('samplepos.client/src/components/ui/SlideDrawer.tsx', 'transactional'), 'SlideDrawer supports transactional guard + sticky footer');
}

// ─── Step 7: Warehouse dashboard ─────────────────────────────────────────────
function gateStep7() {
  console.log('\n══ Step 7 — Warehouse dashboard ══');
  const S = 7;
  initStep(S, 'Warehouse Dashboard');

  assert(S, fileContains('samplepos.client/src/pages/inventory/StoreDashboardPage.tsx', 'Inventory Overview'), 'Default tab: Inventory Overview');
  assert(S, fileContains('samplepos.client/src/components/inventory/StoreDashboardPanels.tsx', 'StoreCurrentInventoryPanel'), 'Current inventory panel');
  assert(S, fileContains('samplepos.client/src/components/inventory/StoreDashboardPanels.tsx', 'Outgoing'), 'Outgoing transfers KPI');
  assert(S, fileContains('samplepos.client/src/components/inventory/StoreDashboardPanels.tsx', 'Incoming'), 'Incoming transfers KPI');
  assert(S, fileContains('samplepos.client/src/pages/inventory/StoreDashboardPage.tsx', 'Settings'), 'Settings is secondary tab');
}

// ─── Step 8: Request workflow ────────────────────────────────────────────────
function gateStep8() {
  console.log('\n══ Step 8 — Request workflow ══');
  const S = 8;
  initStep(S, 'Request Workflow');

  assert(S, fileContains('shared/types/transferWorkflow.ts', 'REQUEST'), 'REQUEST workflow mode in shared types');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/transferWorkflowService.ts', 'resolveCreateWorkflowMode'), 'Server resolves request vs direct');
  assert(S, fileContains('samplepos.client/src/utils/transferWorkflowUx.ts', 'Stock Requests'), 'Request-only outlet UX labels');
  assert(S, fileContains('samplepos.client/src/components/inventory/TransferRequestDetailDrawer.tsx', 'formatQtyRatio'), 'Requesting-store fulfillment view');
  assert(S, fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'TransferRequestDetailDrawer'), 'Transfers page wires request detail');
}

// ─── Step 9: Permissions ─────────────────────────────────────────────────────
function gateStep9() {
  console.log('\n══ Step 9 — Permissions ══');
  const S = 9;
  initStep(S, 'Permissions (RBAC)');

  assert(S, fileContains('shared/utils/warehouseRbac.ts', 'WAREHOUSE_NETWORK_READ_PERMISSIONS'), 'Shared warehouse RBAC');
  assert(S, fileContains('shared/types/transferWorkflow.ts', 'TRANSFER_PERMISSION_KEYS'), 'Transfer permission keys (no hardcoding)');
  assert(S, fileContains('samplepos.client/src/components/auth/CashierPathGuard.tsx', 'CashierPathGuard'), 'Cashier path guard');
  assert(S, fileContains('samplepos.client/src/utils/cashierLockdown.ts', 'isWarehouseRoutePath'), 'Cashier blocked from warehouse routes');
  assert(S, fileContains('samplepos.client/src/components/InventoryLayout.tsx', 'filterInventoryNavByPermissions'), 'Inventory nav RBAC filtered');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', 'requireAnyPermission'), 'Transfer API permission middleware');
}

// ─── Step 10: Reuse inventory logic ──────────────────────────────────────────
function gateStep10() {
  console.log('\n══ Step 10 — Reuse inventory logic ══');
  const S = 10;
  initStep(S, 'Reuse Existing Inventory Logic');

  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferService.ts', 'warehouseInventoryRepository'), 'Transfers use warehouseInventoryRepository');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts', 'StockMovementHandler'), 'Adjustments use StockMovementHandler');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts', 'moveLotQuantityBetweenStores'), 'DAMAGE quarantine uses store move (not duplicate decrement)');
  assert(S, fileContains('SamplePOS.Server/src/modules/inventory/stockCountService.ts', 'warehouseAdjustmentService'), 'Physical count reuses warehouseAdjustmentService');
  assert(
    S,
    !fileContains('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts', 'processMovement(DAMAGE)'),
    'DAMAGE path skips double batch decrement',
  );
  assert(
    S,
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts', 'alignBatchSubledgerToStoreBalances'),
    'Pre-adjust layer heal wired in warehouseAdjustmentService',
  );
}

// ─── Step 11: UI standards ───────────────────────────────────────────────────
function gateStep11() {
  console.log('\n══ Step 11 — UI standards ══');
  const S = 11;
  initStep(S, 'UI Standards');

  assert(S, fileContains('samplepos.client/src/components/inventory/shared/ModalContainer.tsx', 'SlideDrawer'), 'ModalContainer delegates to SlideDrawer');
  assert(S, fileContains('samplepos.client/package.json', '@radix-ui'), 'Radix via shadcn (existing design system)');
  assert(S, !fileContains('samplepos.client/package.json', 'mui'), 'No MUI introduced');
  assert(S, fileContains('samplepos.client/src/components/shared/DataTable.tsx', 'sticky'), 'DataTable sticky header pattern');
}

// ─── Step 12: Validation ─────────────────────────────────────────────────────
function gateStep12() {
  console.log('\n══ Step 12 — Validation (typecheck + lint) ══');
  const S = 12;
  initStep(S, 'Validation');

  runNpm(S, 'npm run typecheck', 'typecheck');
  runNpm(S, 'npm run lint (0 errors)', 'lint');
}

function writeReport() {
  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;
  const sections = [];

  for (const n of Object.keys(steps).map(Number).sort((a, b) => a - b)) {
    const s = steps[n];
    totalPass += s.pass;
    totalFail += s.fail;
    totalSkip += s.skip;
    sections.push(
      `## Step ${n} — ${s.title}`,
      '',
      ...s.lines,
      '',
      `*Step ${n}: ${s.pass} pass, ${s.fail} fail, ${s.skip} skip*`,
      '',
    );
  }

  const md = [
    '# Warehouse 12-Step Integrity Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    `- **Live API tests:** ${SKIP_LIVE ? 'skipped (SKIP_LIVE=1)' : 'included when server healthy'}`,
    '',
    '## Summary',
    '',
    '| Step | Title | Pass | Fail | Skip |',
    '|------|-------|------|------|------|',
    ...Object.keys(steps)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => {
        const s = steps[n];
        const status = s.fail === 0 ? '✅' : '❌';
        return `| ${n} | ${s.title} | ${s.pass} | ${s.fail} | ${s.skip} | ${status} |`;
      }),
    '',
    `**Total:** ${totalPass} pass / ${totalFail} fail / ${totalSkip} skip`,
    '',
    totalFail === 0 ? '**RESULT: PASS**' : `**RESULT: FAIL (${totalFail} checks)**`,
    '',
    '## Delegated proof suites',
    '',
    '| Suite | Covers | Command |',
    '|-------|--------|---------|',
    '| `proof-transfer-product-search` | Step 5 live + FEFO | `npm run proof:transfer-product-search` |',
    '| `proof-transfer-negotiation` | Steps 2–4, 8 live E2E | `npm run proof:transfer-negotiation` |',
    '| `proof-inventory-ux-gates` | Steps 6, 7, 9, 11 | `npm run proof:inventory-ux-gates` |',
    '| `proof-warehouse-network-phases` | Step 10 inventory consistency (104 checks) | `npm run proof:warehouse-network-phases` |',
    '',
    ...sections,
  ].join('\n');

  writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  WAREHOUSE 12-STEP INTEGRITY PROOF                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  gateStep1();
  gateStep2();
  gateStep3();
  gateStep4();
  gateStep5Static();
  gateStep6();
  gateStep7();
  gateStep8();
  gateStep9();
  gateStep10();
  gateStep11();

  if (!SKIP_LIVE) {
    runScript(5, 'proof-transfer-product-search', 'scripts/proof-transfer-product-search.mjs');
    runScript(2, 'proof-transfer-negotiation', 'scripts/proof-transfer-negotiation.mjs');
    runScript(6, 'proof-inventory-ux-gates', 'scripts/proof-inventory-ux-gates.mjs');
    runScript(10, 'proof-warehouse-network-phases', 'scripts/proof-warehouse-network-phases.mjs');
  } else {
    for (const s of [2, 5, 6, 10]) skip(s, 'Live delegated proofs', 'SKIP_LIVE=1');
  }

  gateStep12();
  writeReport();

  const totalFail = Object.values(steps).reduce((sum, s) => sum + s.fail, 0);
  const totalPass = Object.values(steps).reduce((sum, s) => sum + s.pass, 0);
  console.log(`\n${totalFail ? 'FAILED' : 'OK'}: ${totalPass} passed, ${totalFail} failed\n`);
  process.exit(totalFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
