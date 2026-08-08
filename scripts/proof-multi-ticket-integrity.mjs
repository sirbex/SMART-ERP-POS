#!/usr/bin/env node
/**
 * Writes PROOF_MULTI_TICKET_INTEGRITY.json after running the integrity vitest suite
 * and the server structural multi-ticket evidence (jest).
 *
 * Usage (repo root):
 *   node scripts/proof-multi-ticket-integrity.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runAt = new Date().toISOString();

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function parseVitestCounts(text) {
  // "Tests  55 passed (55)" or "Tests  2 failed | 53 passed (55)"
  const failedPass = text.match(
    /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\s+\((\d+)\)/,
  );
  if (failedPass) {
    return {
      fail: Number(failedPass[1]),
      pass: Number(failedPass[2]),
      total: Number(failedPass[3]),
    };
  }
  const only = text.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (only) {
    return { fail: 0, pass: Number(only[1]), total: Number(only[2]) };
  }
  return { fail: 1, pass: 0, total: 0 };
}

function parseJestCounts(text) {
  // Tests:       6 passed, 6 total
  // Tests:       31 skipped, 7 passed, 38 total
  // Tests:       1 failed, 2 skipped, 5 passed, 8 total
  const full = text.match(
    /Tests:\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+skipped,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/,
  );
  if (full) {
    return {
      fail: Number(full[1] || 0),
      pass: Number(full[3]),
      total: Number(full[4]),
      skipped: Number(full[2] || 0),
    };
  }
  return { fail: 1, pass: 0, total: 0, skipped: 0 };
}

const clientHuman = run(
  process.execPath,
  [
    resolve(root, 'samplepos.client/node_modules/vitest/vitest.mjs'),
    'run',
    'src/lib/restaurantMultiTicketIntegrity.proof.test.ts',
    'src/lib/restaurantOfflineOps.proof.test.ts',
    'src/lib/restaurantOfflineSelectors.test.ts',
    'src/__tests__/adaptive-chrome.ssot.evidence.test.ts',
  ],
  resolve(root, 'samplepos.client'),
);

const serverHuman = run(
  process.execPath,
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/restaurant/restaurantMultiTicketEmpty.evidence.test.ts',
    'src/modules/restaurant/restaurantArchitectureProof.test.ts',
    '-t',
    'empty open|party-list menu|Phase 4 split',
    '--no-coverage',
  ],
  resolve(root, 'SamplePOS.Server'),
);

const c = parseVitestCounts(`${clientHuman.stdout}\n${clientHuman.stderr}`);
const s = parseJestCounts(`${serverHuman.stdout}\n${serverHuman.stderr}`);

const overallOk =
  clientHuman.ok &&
  serverHuman.ok &&
  c.fail === 0 &&
  s.fail === 0 &&
  c.pass > 0 &&
  s.pass > 0;

const proof = {
  proof: 'MULTI_TICKET_INTEGRITY',
  objective:
    'Consistency, integrity, and monetary accuracy for Samba multi-ticket FOH (party list force-new, preferred isolation, bill/pay/KOT per order number, adaptive menu sheet)',
  runAt,
  result: overallOk ? 'PASS' : 'FAIL',
  summary: {
    client: c,
    server: s,
    pass: c.pass + s.pass,
    fail: c.fail + s.fail,
    total: c.pass + s.pass + c.fail + s.fail,
  },
  gates: [
    {
      id: 'C01-forceNew-distinct-orderIds-money',
      layer: 'behavioral',
      claim: 'Party-list forceNew yields distinct orderIds with exact 2dp money',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'C02-forceNew-ignores-orderId',
      layer: 'behavioral',
      claim: 'forceNewTicket never appends to caller-supplied sibling orderId',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'C03-detail-append-sticky',
      layer: 'behavioral',
      claim: 'orderId append stays on selected ticket after newer sibling updates',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'C04-preferred-missing-null',
      layer: 'behavioral',
      claim: 'Unknown preferred orderId returns null (no silent sibling substitute)',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'I01-bill-isolation',
      layer: 'behavioral',
      claim: 'Bill flags only selected order number',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'I02-pay-isolation',
      layer: 'behavioral',
      claim: 'Pay settles one ticket; remaining sibling open; paid preferred → null',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'I03-kot-isolation',
      layer: 'behavioral',
      claim: 'KOT sets kitchenSentAt only on fired ticket',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'I04-split-money-accuracy',
      layer: 'behavioral',
      claim: 'Partial qty move: remainder + destination totals exact',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'I05-floor-open-count',
      layer: 'behavioral',
      claim: 'Open floor lists exactly N distinct open tickets',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'S01-foh-forceNew-wiring',
      layer: 'structural',
      claim: 'FOH forceNewTicket = showSambaTicketList; no samba-open-ticket-first toast',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts',
    },
    {
      id: 'S04-server-forceNew-short-circuit-order',
      layer: 'structural',
      claim: 'Server forceNew nulls target before orderId/currentOrderId resolve',
      source: 'restaurantMultiTicketIntegrity.proof.test.ts + restaurantMultiTicketEmpty.evidence',
    },
    {
      id: 'S03-adaptive-sheet-column',
      layer: 'structural',
      claim: 'fohTicketPane sheet on dense/ultra; column on comfortable',
      source: 'adaptive-chrome.ssot.evidence + integrity S03',
    },
  ].map((g) => ({ ...g, pass: overallOk })),
  commands: {
    client:
      'cd samplepos.client && npx vitest run src/lib/restaurantMultiTicketIntegrity.proof.test.ts src/lib/restaurantOfflineOps.proof.test.ts src/lib/restaurantOfflineSelectors.test.ts src/__tests__/adaptive-chrome.ssot.evidence.test.ts',
    server:
      'cd SamplePOS.Server && node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/modules/restaurant/restaurantMultiTicketEmpty.evidence.test.ts src/modules/restaurant/restaurantArchitectureProof.test.ts -t "empty open|party-list menu|Phase 4 split" --no-coverage',
  },
  clientExit: clientHuman.status,
  serverExit: serverHuman.status,
};

writeFileSync(
  resolve(root, 'PROOF_MULTI_TICKET_INTEGRITY.json'),
  JSON.stringify(proof, null, 2) + '\n',
  'utf8',
);

const md = `# Proof — Multi-ticket consistency, integrity & accuracy

**Result: ${proof.result}** · runAt \`${runAt}\`

| Suite | Pass | Fail |
| --- | ---: | ---: |
| Client (vitest integrity + offline + selectors + adaptive) | ${c.pass} | ${c.fail} |
| Server (jest multi-ticket evidence + Phase 4 seals) | ${s.pass} | ${s.fail} |
| **Combined** | **${proof.summary.pass}** | **${proof.summary.fail}** |

## Gates

| ID | Layer | Claim |
| --- | --- | --- |
${proof.gates.map((g) => `| \`${g.id}\` | ${g.layer} | ${g.claim} |`).join('\n')}

## Re-run

\`\`\`bash
node scripts/proof-multi-ticket-integrity.mjs
\`\`\`

## Precision notes

- Money seals use \`Math.round(n * 100) / 100\` (2 decimal half-up).
- Party total for sample Soup 2×5.50 + Steak 19.99 + Wine 3×12.25 = **67.74**.
- \`forceNewTicket\` **ignores** a supplied sibling \`orderId\` (C02) — required for list-mode menu safety.
- Preferred unknown order id → **null** (C04); never paints another ticket's lines.
- Server \`forceNewCheck\` short-circuits **before** \`orderId\` / \`current_order_id\` append resolve (S04).
`;

writeFileSync(resolve(root, 'PROOF_MULTI_TICKET_INTEGRITY.md'), md, 'utf8');

console.log(JSON.stringify({ result: proof.result, summary: proof.summary }, null, 2));
process.exit(overallOk ? 0 : 1);
