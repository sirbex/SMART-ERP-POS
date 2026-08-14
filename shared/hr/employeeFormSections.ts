/**
 * HR employee master form section catalog — uses global formSectionsSsot.
 * Do not redefine accordion metadata in HRPage.
 */

import type { FormSectionDef, FormSectionIdOf } from '../ui/formSectionsSsot.js';

export const EMPLOYEE_FORM_SECTIONS = [
  {
    id: 'employment',
    label: 'Employment',
    defaultOpen: true,
    description: 'Name, type, hire, dept/position',
  },
  {
    id: 'contract',
    label: 'Contract & probation',
    defaultOpen: true,
    description: 'Initial engagement term (fixed-term requires end date)',
  },
  {
    id: 'identity',
    label: 'Identity',
    defaultOpen: false,
    description: 'National ID, DOB, gender, nationality',
  },
  {
    id: 'contact',
    label: 'Contact & address',
    defaultOpen: false,
  },
  {
    id: 'nextOfKin',
    label: 'Next of kin',
    defaultOpen: false,
  },
  {
    id: 'compliance',
    label: 'Compliance (NSSF / TIN)',
    defaultOpen: false,
  },
  {
    id: 'payment',
    label: 'Payment (bank / MoMo)',
    defaultOpen: false,
  },
] as const satisfies readonly FormSectionDef[];

export type EmployeeFormSectionId = FormSectionIdOf<typeof EMPLOYEE_FORM_SECTIONS>;

/** Persistence key for useFormSections — shared chrome, not invent per screen. */
export const EMPLOYEE_FORM_SECTIONS_STORAGE_KEY = 'hr.employee.master';
