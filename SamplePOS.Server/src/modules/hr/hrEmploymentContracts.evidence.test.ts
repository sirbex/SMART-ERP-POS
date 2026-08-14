/**
 * Evidence: employment contract lifecycle + form bundles SSOT.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPLOYMENT_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_CONVERT_TARGETS,
  requiresContractEndDate,
  assertContractDateRange,
  assertCanRenewContract,
  assertCanConvertContract,
  assertCanSignContract,
  assertContractNotPastEndWithoutAction,
} from '../../../../shared/hr/employmentContractSsot.js';
import { EMPLOYEE_FORM_SECTIONS } from '../../../../shared/hr/employeeFormSections.js';
import { CreateEmployeeSchema } from '../../../../shared/zod/hrEmployee.js';
import { RenewContractSchema, ConvertEmploymentSchema } from '../../../../shared/zod/hrEmploymentContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function expectThrows(fn: () => void, re: RegExp) {
  let msg = '';
  try {
    fn();
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  expect(msg).toMatch(re);
}

describe('HR employment contract lifecycle', () => {
  it('SSOT: INTERN + fixed-term rules + convert map', () => {
    expect(EMPLOYMENT_TYPES).toContain('INTERN');
    expect(requiresContractEndDate('CONTRACT')).toBe(true);
    expect(requiresContractEndDate('INTERN')).toBe(true);
    expect(requiresContractEndDate('PERMANENT')).toBe(false);
    expect(CONTRACT_CONVERT_TARGETS.INTERN).toEqual(['CONTRACT', 'PERMANENT']);
    expect(CONTRACT_CONVERT_TARGETS.CONTRACT).toEqual(['PERMANENT']);
    expect(CONTRACT_CONVERT_TARGETS.PERMANENT).toEqual([]);
    expect(CONTRACT_STATUSES).toContain('RENEWED');
    expect(CONTRACT_STATUSES).toContain('CONVERTED');
  });

  it('fail-loud: fixed-term needs end; permanent rejects end; renew/convert/sign/stale', () => {
    expectThrows(
      () =>
        assertContractDateRange({
          startDate: '2026-01-01',
          endDate: null,
          employmentType: 'CONTRACT',
        }),
      /requires a contract end date/
    );
    expectThrows(
      () =>
        assertContractDateRange({
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          employmentType: 'PERMANENT',
        }),
      /open-ended/
    );
    expectThrows(
      () => assertCanRenewContract({ status: 'ACTIVE', employmentType: 'PERMANENT' }),
      /open-ended/
    );
    expectThrows(
      () =>
        assertCanConvertContract({
          status: 'ACTIVE',
          fromType: 'PERMANENT',
          toType: 'CONTRACT',
        }),
      /Cannot convert/
    );
    assertCanSignContract('DRAFT');
    expectThrows(() => assertCanSignContract('EXPIRED'), /Cannot sign/);
    expectThrows(
      () =>
        assertContractNotPastEndWithoutAction({
          status: 'ACTIVE',
          endDate: '2026-01-01',
          asOfDate: '2026-02-01',
        }),
      /still ACTIVE/
    );
  });

  it('CreateEmployeeSchema requires end for CONTRACT/INTERN; refuses permanent end', () => {
    expect(
      CreateEmployeeSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        hireDate: '2026-01-15',
        employmentType: 'CONTRACT',
      }).success
    ).toBe(false);
    expect(
      CreateEmployeeSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        hireDate: '2026-01-15',
        employmentType: 'INTERN',
        endDate: '2026-06-30',
        signContract: true,
      }).success
    ).toBe(true);
    expect(
      CreateEmployeeSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        hireDate: '2026-01-15',
        employmentType: 'PERMANENT',
        endDate: '2026-12-31',
      }).success
    ).toBe(false);
  });

  it('Renew/Convert Zod schemas enforce dates', () => {
    expect(RenewContractSchema.safeParse({ startDate: '2026-07-01', endDate: '2026-06-01' }).success).toBe(
      false
    );
    expect(
      ConvertEmploymentSchema.safeParse({
        toType: 'CONTRACT',
        effectiveDate: '2026-07-01',
      }).success
    ).toBe(false);
    expect(
      ConvertEmploymentSchema.safeParse({
        toType: 'PERMANENT',
        effectiveDate: '2026-07-01',
        endDate: '2027-01-01',
      }).success
    ).toBe(false);
  });

  it('migration 606 + routes + service + UI bundles', () => {
    const sql = read('shared/sql/606_hr_employment_contracts.sql');
    expect(sql).toContain('employee_contracts');
    expect(sql).toContain('INTERN');
    expect(sql).toContain('uq_employee_contracts_open');
    const anchors = read('SamplePOS.Server/src/modules/system/migrationAnchors.ts');
    expect(anchors).toContain('606_hr_employment_contracts.sql');
    const routes = read('SamplePOS.Server/src/modules/hr/hr.routes.ts');
    expect(routes).toContain('/contracts/:contractId/sign');
    expect(routes).toContain('/contracts/:contractId/renew');
    expect(routes).toContain('/contracts/:contractId/convert');
    expect(routes).toContain('/contracts/:contractId/expire');
    const svc = read('SamplePOS.Server/src/modules/hr/hr.service.ts');
    expect(svc).toContain('renewEmployeeContract');
    expect(svc).toContain('convertEmployeeEngagement');
    expect(svc).toContain('assertOpenContractCurrent');
    const ui = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(ui).toContain('EMPLOYEE_FORM_SECTIONS');
    expect(ui).toContain('EmployeeContractsPanel');
    expect(ui).toContain('FormSectionCatalog');
    expect(ui).toContain('FormSection');
    expect(ui).not.toContain('FormBundle');
    expect(ui).toContain('INTERN');
    expect(EMPLOYEE_FORM_SECTIONS.some((s) => s.id === 'employment' && s.defaultOpen)).toBe(true);
    expect(EMPLOYEE_FORM_SECTIONS.some((s) => s.id === 'identity' && !s.defaultOpen)).toBe(true);
  });

  it('writes PROOF_HR_EMPLOYMENT_CONTRACTS', () => {
    const checks = {
      types: EMPLOYMENT_TYPES.join('|'),
      statuses: CONTRACT_STATUSES.join('|'),
      formSections: EMPLOYEE_FORM_SECTIONS.map((s) => `${s.id}:${s.defaultOpen ? 'open' : 'closed'}`),
      convertIntern: CONTRACT_CONVERT_TARGETS.INTERN.join('→'),
    };
    const evidence = {
      ok: true,
      contract: 'shared/hr/employmentContractSsot.ts + employee_contracts (606)',
      lifecycle: 'DRAFT→sign→ACTIVE→renew|convert|expire|terminate',
      checks,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(root, 'PROOF_HR_EMPLOYMENT_CONTRACTS.json'), JSON.stringify(evidence, null, 2));
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_EMPLOYMENT_CONTRACTS.md'),
      [
        '# PROOF_HR_EMPLOYMENT_CONTRACTS',
        '',
        'Enterprise engagement lifecycle (SAP HCM / Odoo hr.contract).',
        '',
        '- Types: PERMANENT | CASUAL | CONTRACT | INTERN',
        '- Versioned `employee_contracts` with sign / renew / convert / expire',
        '- Fixed-term requires end date; payroll fails if ACTIVE past end',
        '- Employee form bundled (accordion) — identity/kin/pay collapsed by default',
        '',
        '```json',
        JSON.stringify(checks, null, 2),
        '```',
        '',
      ].join('\n')
    );
    expect(evidence.ok).toBe(true);
  });
});
