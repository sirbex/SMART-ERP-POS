/**
 * Evidence: global form-section SSOT — no per-screen FormBundle invention.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOpenSectionsMap,
  formSectionsStorageKey,
  getFormSection,
  mergeFormSectionOpenState,
} from '../../../../shared/ui/formSectionsSsot.js';
import {
  EMPLOYEE_FORM_SECTIONS,
  EMPLOYEE_FORM_SECTIONS_STORAGE_KEY,
} from '../../../../shared/hr/employeeFormSections.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Global form sections SSOT', () => {
  it('helpers: defaults, fail-loud lookup, merge drops unknown keys', () => {
    const map = buildOpenSectionsMap(EMPLOYEE_FORM_SECTIONS);
    expect(map.employment).toBe(true);
    expect(map.identity).toBe(false);
    expect(getFormSection(EMPLOYEE_FORM_SECTIONS, 'payment').label).toMatch(/Payment/);
    expect(() => getFormSection(EMPLOYEE_FORM_SECTIONS, 'nope')).toThrow(/Unknown form section/);
    const merged = mergeFormSectionOpenState(EMPLOYEE_FORM_SECTIONS, {
      identity: true,
      ghost: true,
    } as Record<string, boolean>);
    expect(merged.identity).toBe(true);
    expect(merged).not.toHaveProperty('ghost');
    expect(formSectionsStorageKey(EMPLOYEE_FORM_SECTIONS_STORAGE_KEY)).toBe(
      'formSections.open.hr.employee.master'
    );
  });

  it('HR catalog lives in shared/hr; UI uses FormSectionCatalog only', () => {
    const catalog = read('shared/hr/employeeFormSections.ts');
    expect(catalog).toContain('satisfies readonly FormSectionDef');
    expect(catalog).toContain("from '../ui/formSectionsSsot.js'");
    const uiComp = read('samplepos.client/src/components/ui/FormSection.tsx');
    expect(uiComp).toContain('@shared/ui/formSectionsSsot');
    expect(uiComp).toContain('AdaptiveFormLayout');
    expect(uiComp).toContain('useFormSections');
    const page = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(page).toContain("from '@shared/hr/employeeFormSections'");
    expect(page).toContain('FormSectionCatalog');
    expect(page).toContain('persistKey={EMPLOYEE_FORM_SECTIONS_STORAGE_KEY}');
    expect(page).not.toContain('const FormBundle');
    expect(page).not.toContain('FormBundle');
  });

  it('writes PROOF_FORM_SECTIONS_SSOT', () => {
    const checks = {
      globalSsot: 'shared/ui/formSectionsSsot.ts',
      hrCatalog: 'shared/hr/employeeFormSections.ts',
      react: 'components/ui/FormSection.tsx + hooks/useFormSections.ts',
      sectionCount: EMPLOYEE_FORM_SECTIONS.length,
      openByDefault: EMPLOYEE_FORM_SECTIONS.filter((s) => s.defaultOpen).map((s) => s.id),
    };
    const evidence = {
      ok: true,
      rule: 'Screens declare domain FormSectionDef catalogs; render via FormSectionCatalog — never invent local FormBundle',
      checks,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(root, 'PROOF_FORM_SECTIONS_SSOT.json'), JSON.stringify(evidence, null, 2));
    fs.writeFileSync(
      path.join(root, 'PROOF_FORM_SECTIONS_SSOT.md'),
      [
        '# PROOF_FORM_SECTIONS_SSOT',
        '',
        'Global progressive form field bundles.',
        '',
        '- SSOT types/helpers: `shared/ui/formSectionsSsot.ts`',
        '- Domain catalogs: e.g. `shared/hr/employeeFormSections.ts`',
        '- UI: `FormSectionCatalog` + `FormSection` (AdaptiveFormLayout density)',
        '- Hook: `useFormSections` with optional persist key',
        '',
        '```json',
        JSON.stringify(checks, null, 2),
        '```',
        '',
      ].join('\n')
    );
    expect(checks.sectionCount).toBeGreaterThan(5);
  });
});
