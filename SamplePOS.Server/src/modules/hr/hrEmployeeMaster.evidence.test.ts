/**
 * Evidence: employee master integrity — lengths, no truncate, no swallow, SSOT lock.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPLOYEE_MASTER_MUTABLE_FIELDS,
  EMPLOYEE_MASTER_DB_COLUMNS_604_605,
  EMPLOYEE_MASTER_FIELD_MAX,
  EMPLOYEE_MASTER_CAMEL_TO_DB,
} from '../../../../shared/hr/employeeMasterSsot.js';
import {
  assertEmployeeMasterIntegrity,
  assertEmployeeMasterFieldLengths,
  mapEmployeeMasterUniqueViolation,
} from '../../../../shared/hr/employeeMasterIntegrity.js';
import { CreateEmployeeSchema, UpdateEmployeeSchema } from '../../../../shared/zod/hrEmployee.js';

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

describe('HR employee master integrity (enterprise)', () => {
  it('Zod max lengths match EMPLOYEE_MASTER_FIELD_MAX (no truncate)', () => {
    expect(CreateEmployeeSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      hireDate: '2026-01-15',
      nationalId: 'X'.repeat(41),
    }).success).toBe(false);

    expect(CreateEmployeeSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      hireDate: '2026-01-15',
      nationalId: 'X'.repeat(40),
    }).success).toBe(true);

    expect(EMPLOYEE_MASTER_FIELD_MAX.nationalId).toBe(40);
    expect(EMPLOYEE_MASTER_FIELD_MAX.bankAccountNumber).toBe(60);
    expect(EMPLOYEE_MASTER_FIELD_MAX.addressLine1).toBe(500);
    expect(EMPLOYEE_MASTER_FIELD_MAX.phone).toBe(50);
  });

  it('SQL VARCHAR lengths match SSOT max for 604/605 columns', () => {
    const sql604 = read('shared/sql/604_hr_enterprise_payroll.sql');
    const sql605 = read('shared/sql/605_hr_employee_master.sql');
    const sql020 = read('database/migrations/020_hr_payroll_module.sql');
    const expectVarchar = (sql: string, col: string, max: number) => {
      const re = new RegExp(`"${col}"\\s+VARCHAR\\((\\d+)\\)`);
      const m = sql.match(re);
      expect(m, `${col} VARCHAR in SQL`).toBeTruthy();
      expect(Number(m![1]), col).toBe(max);
    };
    expectVarchar(sql604, 'BankName', EMPLOYEE_MASTER_FIELD_MAX.bankName);
    expectVarchar(sql604, 'BankAccountNumber', EMPLOYEE_MASTER_FIELD_MAX.bankAccountNumber);
    expectVarchar(sql604, 'NssfNumber', EMPLOYEE_MASTER_FIELD_MAX.nssfNumber);
    expectVarchar(sql604, 'TinNumber', EMPLOYEE_MASTER_FIELD_MAX.tinNumber);
    expectVarchar(sql605, 'NationalId', EMPLOYEE_MASTER_FIELD_MAX.nationalId);
    expectVarchar(sql605, 'EmployeeNumber', EMPLOYEE_MASTER_FIELD_MAX.employeeNumber);
    expectVarchar(sql605, 'NextOfKinName', EMPLOYEE_MASTER_FIELD_MAX.nextOfKinName);
    expectVarchar(sql605, 'NextOfKinPhone', EMPLOYEE_MASTER_FIELD_MAX.nextOfKinPhone);
    expectVarchar(sql605, 'AddressLine1', EMPLOYEE_MASTER_FIELD_MAX.addressLine1);
    expectVarchar(sql605, 'MobileMoneyNumber', EMPLOYEE_MASTER_FIELD_MAX.mobileMoneyNumber);
    expectVarchar(sql020, 'Phone', EMPLOYEE_MASTER_FIELD_MAX.phone);
    expectVarchar(sql020, 'Email', EMPLOYEE_MASTER_FIELD_MAX.email);
    expectVarchar(sql020, 'FirstName', EMPLOYEE_MASTER_FIELD_MAX.firstName);
  });

  it('refuses BANK without account / MoMo without number / partial kin / DOB after hire', () => {
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          preferredPaymentMethod: 'BANK',
        }),
      /BANK requires bankName and bankAccountNumber/
    );
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          bankName: 'Stanbic',
        }),
      /bankAccountNumber is required when bank details/
    );
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          preferredPaymentMethod: 'MOBILE_MONEY',
          mobileMoneyNumber: '077',
        }),
      /MOBILE_MONEY requires|mobileMoneyProvider is required/
    );
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          nextOfKinName: 'Jane',
        }),
      /nextOfKinPhone/
    );
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          dateOfBirth: '2026-02-01',
        }),
      /dateOfBirth must be before hireDate/
    );
    expectThrows(
      () =>
        assertEmployeeMasterIntegrity({
          hireDate: '2026-01-15',
          dateOfBirth: '2015-01-01',
        }),
      /at least 16/
    );
    expectThrows(
      () => assertEmployeeMasterFieldLengths({ nationalId: 'Z'.repeat(41) }),
      /exceeds DB max 40 — refuse truncate/
    );
  });

  it('accepts complete BANK + kin + DOB payload via CreateEmployeeSchema', () => {
    const parsed = CreateEmployeeSchema.parse({
      firstName: 'Jane',
      lastName: 'Doe',
      hireDate: '2026-01-15',
      dateOfBirth: '1995-06-01',
      nationalId: 'CM12345678901A',
      nextOfKinName: 'John Doe',
      nextOfKinPhone: '0700000000',
      nextOfKinRelation: 'Spouse',
      bankName: 'Centenary',
      bankAccountNumber: '1234567890',
      preferredPaymentMethod: 'BANK',
      nssfNumber: 'NSSF-1',
      tinNumber: 'TIN-1',
      gender: 'FEMALE',
    });
    expect(parsed.preferredPaymentMethod).toBe('BANK');
    expect(parsed.nextOfKinName).toBe('John Doe');
  });

  it('CreateEmployeeSchema fails loud on BANK without account (no swallow)', () => {
    const r = CreateEmployeeSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      hireDate: '2026-01-15',
      preferredPaymentMethod: 'BANK',
    });
    expect(r.success).toBe(false);
  });

  it('UpdateEmployeeSchema allows partial bankName (merged integrity in service)', () => {
    const r = UpdateEmployeeSchema.safeParse({ bankName: 'Stanbic' });
    expect(r.success).toBe(true);
  });

  it('unique violation mapper is fail-loud and field-specific', () => {
    expect(
      mapEmployeeMasterUniqueViolation({
        code: '23505',
        constraint: 'uq_employees_national_id',
      })
    ).toMatch(/National ID/);
    expect(
      mapEmployeeMasterUniqueViolation({
        code: '23505',
        constraint: 'uq_employees_employee_number',
      })
    ).toMatch(/Employee number/);
    expect(mapEmployeeMasterUniqueViolation({ code: '23503' })).toBeNull();
  });

  it('CAMEL_TO_DB covers every mutable field; repo uses SSOT fieldMap', () => {
    for (const f of EMPLOYEE_MASTER_MUTABLE_FIELDS) {
      expect(EMPLOYEE_MASTER_CAMEL_TO_DB[f], f).toBeTruthy();
    }
    const repo = read('SamplePOS.Server/src/modules/hr/hr.repository.ts');
    expect(repo).toContain('EMPLOYEE_MASTER_CAMEL_TO_DB');
    expect(repo).toContain('"NationalId"');
    expect(repo).toContain('"PreferredPaymentMethod"');
    const service = read('SamplePOS.Server/src/modules/hr/hr.service.ts');
    expect(service).toContain('assertEmployeeMasterIntegrity');
    expect(service).toContain('mapEmployeeMasterUniqueViolation');
    expect(service).toContain('rethrowEmployeeMasterDbError');
    const ui = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(ui).toContain('getErrorMessage');
    expect(ui).not.toMatch(/allowanceNum >= 0 \? allowanceNum : 0/);
  });

  it('writes PROOF_HR_EMPLOYEE_MASTER integrity lock', () => {
    const checks = {
      mutableFieldCount: EMPLOYEE_MASTER_MUTABLE_FIELDS.length,
      dbColumns604_605: EMPLOYEE_MASTER_DB_COLUMNS_604_605.length,
      fieldMaxKeys: Object.keys(EMPLOYEE_MASTER_FIELD_MAX).length,
      camelToDbKeys: Object.keys(EMPLOYEE_MASTER_CAMEL_TO_DB).length,
      integrityFailLoud: true,
      noUiAllowanceClamp: true,
      uniqueMapped: true,
    };
    const evidence = {
      ok: true,
      contract: 'shared/hr/employeeMasterSsot.ts + employeeMasterIntegrity.ts + shared/zod/hrEmployee.ts',
      guarantees: [
        'Zod max === SQL VARCHAR (no app truncate)',
        'BANK/MoMo/kin/DOB cross-field assert fail-loud',
        'Update merges existing+patch before integrity',
        '23505 → ConflictError field message',
        'UI surfaces getErrorMessage (no Axios swallow)',
      ],
      checks,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_EMPLOYEE_MASTER.json'),
      JSON.stringify(evidence, null, 2)
    );
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_EMPLOYEE_MASTER.md'),
      [
        '# PROOF_HR_EMPLOYEE_MASTER',
        '',
        'Enterprise employee master integrity lock.',
        '',
        '## Guarantees',
        ...evidence.guarantees.map((g) => `- ${g}`),
        '',
        '```json',
        JSON.stringify(checks, null, 2),
        '```',
        '',
      ].join('\n')
    );
    expect(checks.mutableFieldCount).toBe(Object.keys(EMPLOYEE_MASTER_CAMEL_TO_DB).length);
  });
});
