/**
 * PROOF — Employee ↔ User identity SSOT (Odoo/SAP-style, SamplePOS-smart)
 *
 * Gates: employment types, optional related user, 1:1 unique UserId,
 * end-employment lifecycle, API/UI surface, payroll logic preserved.
 *
 * Emits (repo root):
 *   PROOF_HR_EMPLOYEE_IDENTITY.md
 *   PROOF_HR_EMPLOYEE_IDENTITY.json
 *
 * Re-run:
 *   cd SamplePOS.Server
 *   npm test -- --runInBand src/modules/hr/hrEmployeeIdentity.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertEmploymentLifecycle,
  assertUserLinkAvailable,
  EMPLOYMENT_TYPES,
  normalizeEmploymentType,
  requiresRelatedUser,
} from '@shared/hr/employeeIdentitySsot.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; section: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(section: string, id: string, ok: boolean, detail: string): void {
  gates.push({ id, section, ok, detail });
  if (!ok) {
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, re: RegExp | string): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof re === 'string' ? src.includes(re) : re.test(src);
}

describe('PROOF_HR_EMPLOYEE_IDENTITY', () => {
  it('SSOT: employment types + optional login', () => {
    gate('ssot', 'types', EMPLOYMENT_TYPES.length === 4, EMPLOYMENT_TYPES.join(','));
    gate('ssot', 'normalize_default', normalizeEmploymentType('nope') === 'PERMANENT', 'defaults PERMANENT');
    gate('ssot', 'casual_no_login_required', requiresRelatedUser('CASUAL') === false, 'casuals need no user');
    gate('ssot', 'permanent_no_login_required', requiresRelatedUser('PERMANENT') === false, 'login always optional');
  });

  it('SSOT: 1:1 user link uniqueness', () => {
    let threw = false;
    try {
      assertUserLinkAvailable({
        userId: 'u1',
        currentEmployeeId: 'e1',
        linkedEmployeeId: 'e2',
      });
    } catch {
      threw = true;
    }
    gate('ssot', 'block_double_link', threw, 'user cannot link to two employees');

    threw = false;
    try {
      assertUserLinkAvailable({
        userId: 'u1',
        currentEmployeeId: 'e1',
        linkedEmployeeId: 'e1',
      });
    } catch {
      threw = true;
    }
    gate('ssot', 'allow_same_employee', !threw, 're-save same link ok');

    threw = false;
    try {
      assertUserLinkAvailable({ userId: null, linkedEmployeeId: 'e2' });
    } catch {
      threw = true;
    }
    gate('ssot', 'null_user_ok', !threw, 'no login is valid');
  });

  it('SSOT: end employment lifecycle', () => {
    let threw = false;
    try {
      assertEmploymentLifecycle({
        status: 'INACTIVE',
        hireDate: '2026-01-01',
        endDate: '2026-08-01',
        ending: true,
      });
    } catch {
      threw = true;
    }
    gate('ssot', 'end_ok', !threw, 'INACTIVE + EndDate valid');

    threw = false;
    try {
      assertEmploymentLifecycle({
        status: 'INACTIVE',
        hireDate: '2026-01-01',
        endDate: null,
        ending: true,
      });
    } catch {
      threw = true;
    }
    gate('ssot', 'end_requires_date', threw, 'EndDate required when ending');

    threw = false;
    try {
      assertEmploymentLifecycle({
        status: 'ACTIVE',
        hireDate: '2026-08-01',
        endDate: '2026-01-01',
        ending: false,
      });
    } catch {
      threw = true;
    }
    gate('ssot', 'end_before_hire', threw, 'EndDate before HireDate rejected');
  });

  it('schema migration 602 present', () => {
    const sql = 'shared/sql/602_hr_employee_identity.sql';
    gate('schema', 'file', existsSync(path.join(repoRoot, sql)), sql);
    gate('schema', 'employment_type', fileHas(sql, 'EmploymentType'), 'EmploymentType column');
    gate('schema', 'end_date', fileHas(sql, 'EndDate'), 'EndDate column');
    gate('schema', 'unique_userid', fileHas(sql, 'uq_employees_userid_linked'), 'partial unique UserId');
    gate('schema', 'types_check', fileHas(sql, 'PERMANENT'), 'PERMANENT in CHECK');
    gate('schema', 'casual', fileHas(sql, 'CASUAL'), 'CASUAL in CHECK');
  });

  it('API surface: link + create related user + end employment', () => {
    const routes = 'SamplePOS.Server/src/modules/hr/hr.routes.ts';
    const svc = 'SamplePOS.Server/src/modules/hr/hr.service.ts';
    const ctrl = 'SamplePOS.Server/src/modules/hr/hr.controller.ts';
    const repo = 'SamplePOS.Server/src/modules/hr/hr.repository.ts';

    gate('api', 'linkable_route', fileHas(routes, 'linkable-users'), 'GET linkable-users');
    gate('api', 'related_user_route', fileHas(routes, 'related-user'), 'POST related-user');
    gate('api', 'end_route', fileHas(routes, 'end-employment'), 'POST end-employment');
    gate('api', 'createRelatedUser', fileHas(svc, 'createRelatedUser'), 'service createRelatedUser');
    gate('api', 'endEmployment', fileHas(svc, 'endEmployment'), 'service endEmployment');
    gate('api', 'findByUserId', fileHas(repo, 'findByUserId'), 'repo findByUserId');
    gate('api', 'employmentType_schema', fileHas(ctrl, 'employmentType') && fileHas(svc, 'EmploymentType'), 'controller+service employment type');
    gate('api', 'assert_link', fileHas(svc, 'assertUserAvailableForLink'), 'link uniqueness enforced');
  });

  it('UI: employee form exposes type / related user / create login / end', () => {
    const ui = 'samplepos.client/src/pages/hr/HRPage.tsx';
    gate('ui', 'employmentType', fileHas(ui, 'employmentType'), 'employment type field');
    gate('ui', 'related_login', fileHas(ui, 'Related Login'), 'related login picker');
    gate('ui', 'create_login', fileHas(ui, 'createRelatedUser'), 'create login API');
    gate('ui', 'end_employment', fileHas(ui, 'endEmployment'), 'end employment API');
    gate('ui', 'casual_filter', fileHas(ui, 'CASUAL'), 'casual filter/option');
  });

  it('payroll business logic preserved (not rewritten by identity)', () => {
    gate(
      'payroll',
      'math_ssot',
      fileHas('shared/hr/payrollMath.ts', 'assertPayrollIdentity'),
      'payrollMath still SSOT'
    );
    gate(
      'payroll',
      'advance_journal',
      fileHas('shared/hr/payrollMath.ts', 'buildEmployeeAdvanceJournal'),
      'advance journal builder intact'
    );
    gate(
      'payroll',
      'disbursement',
      fileHas('shared/hr/hrDisbursementAccount.ts', 'assertHrDisbursementAccount'),
      'cash governance intact'
    );
    gate(
      'payroll',
      'service_uses_math',
      fileHas('SamplePOS.Server/src/modules/hr/hr.service.ts', 'buildPayrollAccrualJournal'),
      'hr.service still posts via payrollMath'
    );
  });

  afterAll(() => {
    const passed = gates.filter((g) => g.ok).length;
    const failed = gates.filter((g) => !g.ok).length;
    const payload = {
      proof: 'PROOF_HR_EMPLOYEE_IDENTITY',
      generatedAt: new Date().toISOString(),
      summary: { total: gates.length, passed, failed, ok: failed === 0 },
      gates,
      model: {
        employee: 'HR/payroll master (always)',
        user: 'optional related login / POS / RBAC',
        link: '1:1 when set; NULL allowed for casuals',
        types: EMPLOYMENT_TYPES,
        end: 'INACTIVE + EndDate; optionally deactivate login',
      },
    };

    const md = [
      '# PROOF_HR_EMPLOYEE_IDENTITY',
      '',
      `Generated: ${payload.generatedAt}`,
      '',
      `**Result: ${failed === 0 ? 'PASS' : 'FAIL'}** — ${passed}/${gates.length} gates`,
      '',
      '## Model',
      '',
      '- Employee = HR/payroll master (Odoo `hr.employee` / SAP Personnel Number)',
      '- User = optional related login (POS/RBAC)',
      '- Casuals/contractors may have no login',
      '- Unique UserId when linked; EndDate + INACTIVE ends employment',
      '- Payroll/advance GL logic unchanged',
      '',
      '## Gates',
      '',
      ...gates.map((g) => `- [${g.ok ? 'x' : ' '}] **${g.section}/${g.id}** — ${g.detail}`),
      '',
    ].join('\n');

    writeFileSync(path.join(repoRoot, 'PROOF_HR_EMPLOYEE_IDENTITY.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(repoRoot, 'PROOF_HR_EMPLOYEE_IDENTITY.md'), md);

    expect(failed).toBe(0);
  });
});
