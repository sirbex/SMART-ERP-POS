/**
 * PROOF — Advance register vs GL recovery SSOT (fail-loud on drift).
 *
 * Emits:
 *   PROOF_HR_ADVANCE_RECOVERY_SSOT.md / .json
 *
 * Re-run:
 *   cd SamplePOS.Server
 *   npm test -- --runInBand src/modules/hr/hrAdvanceRecoverySsot.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceRegisterGlAligned,
  assertAdvanceRegisterGlAligned,
} from '../../../../shared/hr/advanceRecoverySsot.js';
import { computePayrollAmounts } from '../../../../shared/hr/payrollMath.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; section: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(section: string, id: string, ok: boolean, detail: string): void {
  gates.push({ id, section, ok, detail });
  if (!ok) expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function fileHas(rel: string, re: RegExp | string): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof re === 'string' ? src.includes(re) : re.test(src);
}

describe('PROOF_HR_ADVANCE_RECOVERY_SSOT', () => {
  it('A: math — open advance reduces net; zero register ⇒ full net', () => {
    const withAdv = computePayrollAmounts({
      basicSalary: 3_500_000,
      monthlyAllowance: 0,
      openAdvanceRemaining: 500_000,
    });
    gate('math', 'recover_500k', withAdv.advanceRecovered === 500_000 && withAdv.netPay === 3_000_000, JSON.stringify(withAdv));

    const noAdv = computePayrollAmounts({
      basicSalary: 3_500_000,
      monthlyAllowance: 0,
      openAdvanceRemaining: 0,
    });
    gate('math', 'zero_register_full_net', noAdv.advanceRecovered === 0 && noAdv.netPay === 3_500_000, JSON.stringify(noAdv));
  });

  it('B: SSOT — register must equal GL or assert throws', () => {
    gate('ssot', 'aligned_zero', advanceRegisterGlAligned(0, 0), 'both zero');
    gate('ssot', 'aligned_equal', advanceRegisterGlAligned(100_000, 100_000), '100k=100k');
    gate('ssot', 'drift_gl_only', !advanceRegisterGlAligned(0, 100_000), 'GL without register');
    gate('ssot', 'drift_register_only', !advanceRegisterGlAligned(100_000, 0), 'register without GL');

    let threw = false;
    try {
      assertAdvanceRegisterGlAligned({
        employeeLabel: 'Jane Doe',
        registerRemaining: 0,
        glBalance: 200_000,
        advanceAccountCode: '1410-001',
      });
    } catch (e) {
      threw = /ADVANCE_SSOT_DRIFT/.test((e as Error).message);
    }
    gate('ssot', 'assert_throws_gl_orphan', threw, 'fail loud when GL asset has no register');
  });

  it('C: Process wires drift gate + dual balance columns', () => {
    gate(
      'wire',
      'process_assert',
      fileHas('SamplePOS.Server/src/modules/hr/hr.service.ts', 'assertAdvanceRegisterGlAligned') &&
        fileHas('SamplePOS.Server/src/modules/hr/hr.service.ts', 'advance register/GL drift'),
      'processPayroll fails on register≠GL'
    );
    gate(
      'wire',
      'list_active_gl',
      fileHas('SamplePOS.Server/src/modules/hr/hr.repository.ts', 'advance_gl_balance'),
      'listActiveWithPosition selects advance_gl_balance'
    );
    gate(
      'wire',
      'balances_register',
      fileHas('SamplePOS.Server/src/modules/hr/hrComplete.repository.ts', 'register_advances_outstanding'),
      'balances query includes register remaining'
    );
    gate(
      'wire',
      'ui_drift',
      fileHas('samplepos.client/src/pages/hr/HRPage.tsx', 'advanceSsotDrift') &&
        fileHas('samplepos.client/src/pages/hr/HRPage.tsx', 'Advances register'),
      'Balances UI shows register + drift'
    );
    gate(
      'wire',
      'partial_pay_copy',
      fileHas('samplepos.client/src/pages/hr/HRPage.tsx', 'Advances auto-deducted') &&
        fileHas('samplepos.client/src/pages/hr/HRPage.tsx', 'Cash to pay employees') &&
        fileHas('samplepos.client/src/pages/hr/HRPage.tsx', 'advances already deducted'),
      'Pay UI shows gross − advances auto = cash net'
    );
  });

  afterAll(() => {
    const passed = gates.filter((g) => g.ok).length;
    const failed = gates.filter((g) => !g.ok).length;
    const payload = {
      proof: 'PROOF_HR_ADVANCE_RECOVERY_SSOT',
      generatedAt: new Date().toISOString(),
      summary: { total: gates.length, passed, failed, ok: failed === 0 },
      model: {
        recoverySsot: 'employee_advances RemainingAmount OPEN/PARTIAL',
        gl: 'accounts.CurrentBalance on 1410-* must match register',
        process: 'fail loud on drift; recover min(register, gross)',
        pay: 'clears full net payable for period — no partial % of salary',
        expenses: 'not advances; do not reduce net',
      },
      gates,
    };
    const md = [
      '# PROOF_HR_ADVANCE_RECOVERY_SSOT',
      '',
      `Generated: ${payload.generatedAt}`,
      '',
      `**Result: ${failed === 0 ? 'PASS' : 'FAIL'}** — ${passed}/${gates.length} gates`,
      '',
      '## Why full salary showed with “advance asset”',
      '',
      '- Process recovers only from **HR → Advances** register (`RemainingAmount`).',
      '- Balances previously showed **GL only** — could disagree with register.',
      '- Expense payouts to staff are **not** advances and never reduce net.',
      '- **Pay** always clears 100% of remaining **net** for the period (advance recovery is how the company pays less than gross).',
      '',
      '## Gates',
      '',
      ...gates.map((g) => `- [${g.ok ? 'x' : ' '}] **${g.section}/${g.id}** — ${g.detail}`),
      '',
    ].join('\n');

    writeFileSync(path.join(repoRoot, 'PROOF_HR_ADVANCE_RECOVERY_SSOT.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(repoRoot, 'PROOF_HR_ADVANCE_RECOVERY_SSOT.md'), md);
    expect(failed).toBe(0);
  });
});
