/**
 * PROOF: Deposit application posting SSOT — permanent anti-regression for
 * GOV_RULE_E_RECEIPT_STRUCTURE on order complete with DEPOSIT payment.
 *
 * Failure mode (historical):
 *   recordDepositApplicationToGL posted DR Customer Deposits (2200) / CR AR (1200)
 *   but stamped source = PAYMENT_RECEIPT.
 *   Rule E requires PAYMENT_RECEIPT to DR Undeposited Funds → order complete 400
 *   ERR_SALE_004 / GOV_RULE_E_RECEIPT_STRUCTURE.
 *
 * SSOT (locked):
 *   1) Take deposit cash: PAYMENT_RECEIPT → DR UNDEPOSITED_FUNDS / CR 2200
 *   2) Apply deposit to sale: DEPOSIT_APPLICATION → DR 2200 / CR AR
 *      (no cash movement; never PAYMENT_RECEIPT)
 *
 * npm test -- --runInBand src/services/depositApplicationPostingSsot.evidence.test.ts
 */
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PostingGovernanceService,
  PostingGovernanceError,
  type GovernanceAccount,
  type GovernanceJournalLine,
  type GovernanceJournalRequest,
  type PostingSource,
} from './postingGovernanceService.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

const makeAccount = (overrides: Partial<GovernanceAccount> = {}): GovernanceAccount => ({
  id: 'test-id',
  accountCode: '9999',
  accountName: 'Test Account',
  accountType: 'ASSET',
  normalBalance: 'DEBIT',
  isPostingAccount: true,
  isActive: true,
  allowManualPosting: true,
  allowedSources: [],
  systemAccountTag: null,
  ...overrides,
});

const ar = makeAccount({
  accountCode: '1200',
  accountName: 'Accounts Receivable',
  accountType: 'ASSET',
  normalBalance: 'DEBIT',
  allowManualPosting: false,
  allowedSources: ['SALES_INVOICE', 'PAYMENT_RECEIPT', 'DEPOSIT_APPLICATION', 'SYSTEM_CORRECTION'],
  systemAccountTag: 'ACCOUNTS_RECEIVABLE',
});

const uf = makeAccount({
  accountCode: '1015',
  accountName: 'Undeposited Funds',
  accountType: 'ASSET',
  normalBalance: 'DEBIT',
  allowManualPosting: false,
  allowedSources: ['PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION'],
  systemAccountTag: 'UNDEPOSITED_FUNDS',
});

const dep = makeAccount({
  accountCode: '2200',
  accountName: 'Customer Deposits',
  accountType: 'LIABILITY',
  normalBalance: 'CREDIT',
  allowManualPosting: true,
  allowedSources: ['PAYMENT_RECEIPT', 'DEPOSIT_APPLICATION', 'SYSTEM_CORRECTION'],
  systemAccountTag: 'CUSTOMER_DEPOSITS',
});

const makeReq = (
  source: PostingSource,
  lines: GovernanceJournalLine[],
  accounts: GovernanceAccount[],
): GovernanceJournalRequest => ({ source, lines, accounts });

/** Exact JE shape used when applying deposits to a POS sale (amount 99120 reproduces field report). */
const APPLY_LINES: GovernanceJournalLine[] = [
  { accountCode: '2200', debitAmount: 99120, creditAmount: 0 },
  { accountCode: '1200', debitAmount: 0, creditAmount: 99120 },
];

const TAKE_DEPOSIT_LINES: GovernanceJournalLine[] = [
  { accountCode: '1015', debitAmount: 99120, creditAmount: 0 },
  { accountCode: '2200', debitAmount: 0, creditAmount: 99120 },
];

describe('PROOF: Deposit application posting SSOT (anti GOV_RULE_E_RECEIPT_STRUCTURE)', () => {
  it('shared SSOT module + migration exist', () => {
    // Migration optional for gate but must stay on disk for deploy
    const migration = path.join(repoRoot, 'shared/sql/597_deposit_application_posting_source.sql');
    let mig = '';
    try {
      mig = readFileSync(migration, 'utf8');
    } catch {
      mig = '';
    }
    gate('MIGRATION_597_PRESENT', mig.includes('DEPOSIT_APPLICATION'), '597_deposit_application_posting_source.sql');
    gate(
      'MIGRATION_AR_1200',
      /AccountCode.*=\s*'1200'/.test(mig) && mig.includes('DEPOSIT_APPLICATION'),
      'AR allowedSources append',
    );
  });

  it('PostingSource union includes DEPOSIT_APPLICATION', () => {
    const gov = readRepo('SamplePOS.Server/src/services/postingGovernanceService.ts');
    gate(
      'SOURCE_TYPE_DECL',
      /'\s*DEPOSIT_APPLICATION\s*'/.test(gov) || /DEPOSIT_APPLICATION/.test(gov),
      'PostingSource has DEPOSIT_APPLICATION',
    );
    gate(
      'RULE_E_DEPOSIT_APP_BLOCK',
      /source === 'DEPOSIT_APPLICATION'/.test(gov) &&
        gov.includes('GOV_RULE_E_DEPOSIT_APPLICATION_STRUCTURE'),
      'Rule E deposit-application structure',
    );
    gate(
      'SKIP_RULE_B_FOR_DEPOSIT_APP',
      /isPaymentSource[\s\S]{0,400}DEPOSIT_APPLICATION/.test(gov),
      'Rule B skipped for structural Rule E path',
    );
  });

  it('recordDepositApplicationToGL MUST stamp DEPOSIT_APPLICATION (never PAYMENT_RECEIPT)', () => {
    const gl = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    // Include JSDoc immediately above the export
    const start = gl.indexOf('Record a deposit application to the general ledger');
    gate('HAS_APPLY_FN', start >= 0 && gl.includes('export async function recordDepositApplicationToGL'), 'recordDepositApplicationToGL exists');
    const fnStart = gl.indexOf('export async function recordDepositApplicationToGL');
    const nextExport = gl.indexOf('export async function', fnStart + 10);
    const body = nextExport > fnStart ? gl.slice(start >= 0 ? start : fnStart, nextExport) : gl.slice(fnStart, fnStart + 2500);

    gate(
      'APPLY_SOURCE_DEPOSIT_APPLICATION',
      /source:\s*'DEPOSIT_APPLICATION'/.test(body),
      'source: DEPOSIT_APPLICATION',
    );
    gate(
      'APPLY_NOT_PAYMENT_RECEIPT',
      !/source:\s*'PAYMENT_RECEIPT'/.test(body),
      'apply body must not use PAYMENT_RECEIPT',
    );
    gate(
      'APPLY_DR_2200',
      body.includes('CUSTOMER_DEPOSITS') || body.includes('AccountCodes.CUSTOMER_DEPOSITS'),
      'debits customer deposits',
    );
    gate(
      'APPLY_CR_AR',
      body.includes('ACCOUNTS_RECEIVABLE') || body.includes('AccountCodes.ACCOUNTS_RECEIVABLE'),
      'credits AR',
    );
    gate(
      'APPLY_DOC_NEVER_RECEIPT',
      /never PAYMENT_RECEIPT/.test(body),
      'docs forbid PAYMENT_RECEIPT label',
    );

    // Take-deposit must remain cash hygiene PAYMENT_RECEIPT
    const takeStart = gl.indexOf('export async function recordCustomerDepositToGL');
    const takeNext = gl.indexOf('export async function', takeStart + 10);
    const takeBody = takeNext > takeStart ? gl.slice(takeStart, takeNext) : gl.slice(takeStart, takeStart + 2000);
    gate(
      'TAKE_IS_PAYMENT_RECEIPT',
      /source:\s*'PAYMENT_RECEIPT'/.test(takeBody),
      'taking deposit stays PAYMENT_RECEIPT',
    );
  });

  it('runtime: apply shape FAILS under PAYMENT_RECEIPT (reproduces production bug)', () => {
    let code = '';
    try {
      PostingGovernanceService.validate(makeReq('PAYMENT_RECEIPT', APPLY_LINES, [dep, ar]));
      gate('BUG_REPRO_FAILS', false, 'expected throw');
    } catch (e) {
      code = e instanceof PostingGovernanceError ? e.code : String(e);
      gate(
        'BUG_REPRO_FAILS',
        code === 'GOV_RULE_E_RECEIPT_STRUCTURE',
        `got ${code}`,
      );
    }
  });

  it('runtime: apply shape PASSES under DEPOSIT_APPLICATION (fixed path)', () => {
    let threw: unknown = null;
    try {
      PostingGovernanceService.validate(makeReq('DEPOSIT_APPLICATION', APPLY_LINES, [dep, ar]));
    } catch (e) {
      threw = e;
    }
    gate('APPLY_PASSES', threw === null, threw instanceof Error ? threw.message : String(threw));
  });

  it('runtime: take-deposit still requires Undeposited Funds (PAYMENT_RECEIPT)', () => {
    let tookOk = false;
    try {
      PostingGovernanceService.validate(makeReq('PAYMENT_RECEIPT', TAKE_DEPOSIT_LINES, [uf, dep]));
      tookOk = true;
    } catch {
      tookOk = false;
    }
    gate('TAKE_DEPOSIT_OK', tookOk, 'DR UF / CR 2200');

    let tookCashWrong = false;
    try {
      PostingGovernanceService.validate(
        makeReq(
          'PAYMENT_RECEIPT',
          [
            { accountCode: '2200', debitAmount: 0, creditAmount: 100 },
            { accountCode: '1200', debitAmount: 100, creditAmount: 0 },
          ],
          [dep, ar],
        ),
      );
      tookCashWrong = true;
    } catch (e) {
      tookCashWrong = !(e instanceof PostingGovernanceError && e.code === 'GOV_RULE_E_RECEIPT_STRUCTURE');
    }
    gate('TAKE_STILL_STRICT', !tookCashWrong, 'non-UF receipt blocked');
  });

  it('runtime: DEPOSIT_APPLICATION rejects wrong structure', () => {
    let code = '';
    try {
      PostingGovernanceService.validate(
        makeReq(
          'DEPOSIT_APPLICATION',
          [
            { accountCode: '2200', debitAmount: 99120, creditAmount: 0 },
            { accountCode: '1015', debitAmount: 0, creditAmount: 99120 },
          ],
          [dep, uf],
        ),
      );
    } catch (e) {
      code = e instanceof PostingGovernanceError ? e.code : String(e);
    }
    gate(
      'APPLY_WRONG_CR_BLOCKED',
      code === 'GOV_RULE_E_DEPOSIT_APPLICATION_STRUCTURE',
      `got ${code || 'no throw'}`,
    );
  });

  it('glEntryService JE contract is structural SSOT (source + accounts)', () => {
    const glSrc = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    const applyIdx = glSrc.indexOf('export async function recordDepositApplicationToGL');
    const slice = glSrc.slice(applyIdx, applyIdx + 1800);
    gate('JE_CONTRACT_SOURCE', /source:\s*'DEPOSIT_APPLICATION'\s*as const/.test(slice), "source: 'DEPOSIT_APPLICATION' as const");
    gate(
      'JE_CONTRACT_ACCOUNTS',
      /AccountCodes\.CUSTOMER_DEPOSITS[\s\S]{0,600}AccountCodes\.ACCOUNTS_RECEIVABLE/.test(slice),
      'lines: Customer Deposits then AR',
    );
  });

  it('sales complete path still calls recordDepositApplicationToGL (not a parallel JE)', () => {
    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    gate('SALES_CALLS_APPLY_GL', sales.includes('recordDepositApplicationToGL'), 'complete uses apply GL helper');
    gate('SALES_ERR_SALE_004', sales.includes('ERR_SALE_004'), 'deposit apply failures stay ERR_SALE_004');
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'DEPOSIT_APPLICATION_POSTING_SSOT',
    historicalBug: {
      error_code: 'ERR_SALE_004',
      governance: 'GOV_RULE_E_RECEIPT_STRUCTURE',
      symptom:
        'order complete with DEPOSIT payment failed: PAYMENT_RECEIPT must debit Undeposited Funds',
      cause: 'deposit application JE stamped PAYMENT_RECEIPT while structure was DR 2200 / CR AR',
    },
    ssot: {
      takeDeposit: { source: 'PAYMENT_RECEIPT', lines: 'DR 1015 UF / CR 2200' },
      applyDeposit: { source: 'DEPOSIT_APPLICATION', lines: 'DR 2200 / CR 1200 AR' },
    },
    summary: { pass, fail, total: gates.length, verdict },
    gates,
  };

  const md = `# PROOF — Deposit application posting SSOT

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)

## Why this proof exists

Completing a sale with **DEPOSIT** payment threw:

\`\`\`
[GOV_RULE_E_RECEIPT_STRUCTURE] PAYMENT_RECEIPT must debit Undeposited Funds …
error_code: ERR_SALE_004
\`\`\`

Root cause: liability clear journal (DR Customer Deposits / CR AR) was mis-tagged as **\`PAYMENT_RECEIPT\`**, which Rule E reserves for **cash→Undeposited Funds** hygiene.

## Permanent SSOT

| Step | Source | Debit | Credit |
|------|--------|-------|--------|
| Take customer deposit | \`PAYMENT_RECEIPT\` | Undeposited Funds (1015) | Customer Deposits (2200) |
| Apply deposit to sale/invoice | \`DEPOSIT_APPLICATION\` | Customer Deposits (2200) | Accounts Receivable (1200) |

Applying is **not** a cash receipt. Cash already hit Undeposited Funds when the deposit was taken.

## Guarantees locked by gates

1. **Bug reproduction stays red:** DR 2200 / CR AR under \`PAYMENT_RECEIPT\` → \`GOV_RULE_E_RECEIPT_STRUCTURE\`  
2. **Fixed path stays green:** same lines under \`DEPOSIT_APPLICATION\` → pass  
3. **Source code:** \`recordDepositApplicationToGL\` hard-codes \`source: 'DEPOSIT_APPLICATION'\` — never \`PAYMENT_RECEIPT\`  
4. **Take deposit** remains \`PAYMENT_RECEIPT\` + UF debit  
5. **Migration 597** appends \`DEPOSIT_APPLICATION\` to CoA AllowedSources  

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd SamplePOS.Server
npm test -- --runInBand src/services/depositApplicationPostingSsot.evidence.test.ts
\`\`\`

Deploy: apply \`shared/sql/597_deposit_application_posting_source.sql\` (tenant migrate).
`;

  writeFileSync(path.join(repoRoot, 'PROOF_DEPOSIT_APPLICATION_POSTING_SSOT.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_DEPOSIT_APPLICATION_POSTING_SSOT.md'), md);
});
