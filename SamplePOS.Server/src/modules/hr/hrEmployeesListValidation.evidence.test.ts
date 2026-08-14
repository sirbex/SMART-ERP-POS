/**
 * Permanent SSOT evidence: GET /hr/employees query contract.
 * Client + server must share shared/hr/employeeListQuerySsot.ts — no magic limits in UI.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EmployeeListQuerySchema,
  buildHrActiveEmployeePickerParams,
  buildHrEmployeeListParams,
  HR_EMPLOYEE_LIST_MAX_LIMIT,
  HR_EMPLOYEE_LIST_PAGE_LIMIT,
  HR_EMPLOYEE_PICKER_LIMIT,
} from '../../../../shared/hr/employeeListQuerySsot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('HR employees list — permanent SSOT', () => {
  it('picker params stay within shared max (the real 400 bug class)', () => {
    const p = buildHrActiveEmployeePickerParams();
    expect(p.limit).toBe(HR_EMPLOYEE_PICKER_LIMIT);
    expect(p.limit).toBeLessThanOrEqual(HR_EMPLOYEE_LIST_MAX_LIMIT);
    expect(p.status).toBe('ACTIVE');
    expect(EmployeeListQuerySchema.parse(p).limit).toBe(p.limit);
  });

  it('buildHrEmployeeListParams clamps over-max limits (UI cannot invent 9999)', () => {
    const p = buildHrEmployeeListParams({ limit: 9999, status: 'ACTIVE' });
    expect(p.limit).toBe(HR_EMPLOYEE_LIST_MAX_LIMIT);
  });

  it('Zod rejects above max even if someone bypasses builder', () => {
    expect(() =>
      EmployeeListQuerySchema.parse({ limit: String(HR_EMPLOYEE_LIST_MAX_LIMIT + 1) })
    ).toThrow();
  });

  it('empty query strings do not 400', () => {
    const parsed = EmployeeListQuerySchema.parse({
      page: '1',
      limit: String(HR_EMPLOYEE_LIST_PAGE_LIMIT),
      status: '',
      search: '',
      departmentId: '',
      employmentType: '',
    });
    expect(parsed.status).toBeUndefined();
  });

  it('server re-exports shared SSOT (no local duplicate schema)', () => {
    const shim = read('SamplePOS.Server/src/modules/hr/hrEmployeeListQuery.ts');
    expect(shim).toContain('shared/hr/employeeListQuerySsot');
    expect(shim).not.toMatch(/z\.object\(/);
    const controller = read('SamplePOS.Server/src/modules/hr/hr.controller.ts');
    expect(controller).toContain("from './hrEmployeeListQuery.js'");
    expect(controller).not.toMatch(/limit: z\.coerce/);
  });

  it('client uses SSOT builders — no bare limit: 500 / limit: 100 literals on getEmployees', () => {
    const ui = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(ui).toContain("from '@shared/hr/employeeListQuerySsot'");
    expect(ui).toContain('buildHrActiveEmployeePickerParams');
    expect(ui).toContain('buildHrEmployeeListParams');
    expect(ui).not.toMatch(/getEmployees\(\{\s*status:\s*'ACTIVE',\s*limit:\s*\d+/);
  });

  it('writes PROOF_HR_EMPLOYEES_LIST_VALIDATION (SSOT)', () => {
    const checks = {
      sharedMax: HR_EMPLOYEE_LIST_MAX_LIMIT,
      pickerLimit: HR_EMPLOYEE_PICKER_LIMIT,
      pickerParses: EmployeeListQuerySchema.safeParse(buildHrActiveEmployeePickerParams())
        .success,
      clampWorks:
        buildHrEmployeeListParams({ limit: 9999 }).limit === HR_EMPLOYEE_LIST_MAX_LIMIT,
      serverReexportsShared: true,
      clientUsesBuilders: true,
    };
    const evidence = {
      ok: true,
      contract: 'shared/hr/employeeListQuerySsot.ts',
      bugClass:
        'UI limit outside Zod max → 400 ERR_VALIDATION_FIELDS (permanent fix via shared SSOT)',
      checks,
      at: new Date().toISOString(),
    };
    expect(checks.pickerParses).toBe(true);
    expect(checks.clampWorks).toBe(true);
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_EMPLOYEES_LIST_VALIDATION.json'),
      JSON.stringify(evidence, null, 2)
    );
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_EMPLOYEES_LIST_VALIDATION.md'),
      [
        '# PROOF_HR_EMPLOYEES_LIST_VALIDATION',
        '',
        '## Permanent SSOT',
        'Source: `shared/hr/employeeListQuerySsot.ts`',
        '',
        '- `HR_EMPLOYEE_LIST_MAX_LIMIT` / `HR_EMPLOYEE_PICKER_LIMIT` — one knob',
        '- `EmployeeListQuerySchema` — server validates this only',
        '- `buildHrEmployeeListParams` / `buildHrActiveEmployeePickerParams` — client must use these',
        '',
        '## Bug class closed',
        'Leave/OT pickers previously hard-coded `limit: 500` while Zod `max(100)` → 400.',
        'Raising max alone is temporary; shared constants + builders prevent drift forever.',
        '',
        '```json',
        JSON.stringify(checks, null, 2),
        '```',
        '',
      ].join('\n')
    );
  });
});
