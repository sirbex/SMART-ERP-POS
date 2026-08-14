/**
 * GET /hr/employees query SSOT (client + server).
 *
 * Permanent contract — do NOT duplicate limit/status enums in UI or controller.
 * Bug class prevented: UI sends limit outside Zod max → 400 ERR_VALIDATION_FIELDS.
 */

import { z } from 'zod';
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
} from './employeeIdentitySsot.js';

/** Absolute max page size accepted by API (pickers may use this). */
export const HR_EMPLOYEE_LIST_MAX_LIMIT = 500;

/** Default when query omits limit. */
export const HR_EMPLOYEE_LIST_DEFAULT_LIMIT = 20;

/** Employees tab table page size. */
export const HR_EMPLOYEE_LIST_PAGE_LIMIT = 100;

/**
 * Active-staff picker size (Leave, OT/bonus, Advances).
 * Always ≤ HR_EMPLOYEE_LIST_MAX_LIMIT — single knob.
 */
export const HR_EMPLOYEE_PICKER_LIMIT = HR_EMPLOYEE_LIST_MAX_LIMIT;

const EmploymentTypeEnum = z.enum(EMPLOYMENT_TYPES);
const EmployeeStatusEnum = z.enum(EMPLOYEE_STATUSES);

/** Empty query-string values (axios "") must not fail optional enums/uuids. */
export function emptyQueryToUndefined(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

export const EmployeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(HR_EMPLOYEE_LIST_MAX_LIMIT)
    .default(HR_EMPLOYEE_LIST_DEFAULT_LIMIT),
  status: z.preprocess(emptyQueryToUndefined, EmployeeStatusEnum.optional()),
  search: z.preprocess(
    emptyQueryToUndefined,
    z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : undefined))
  ),
  departmentId: z.preprocess(emptyQueryToUndefined, z.string().uuid().optional()),
  employmentType: z.preprocess(emptyQueryToUndefined, EmploymentTypeEnum.optional()),
});

export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;

export type HrEmployeeListParamsInput = {
  page?: number;
  limit?: number;
  status?: (typeof EMPLOYEE_STATUSES)[number];
  search?: string;
  departmentId?: string | null;
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];
};

/**
 * Build query params for GET /hr/employees.
 * Clamps limit to SSOT max and strips empties — UI cannot invent out-of-contract limits.
 */
export function buildHrEmployeeListParams(
  input: HrEmployeeListParamsInput = {}
): EmployeeListQuery {
  const limitRaw = input.limit ?? HR_EMPLOYEE_LIST_DEFAULT_LIMIT;
  const limit = Math.min(
    Math.max(1, Math.floor(limitRaw)),
    HR_EMPLOYEE_LIST_MAX_LIMIT
  );
  return EmployeeListQuerySchema.parse({
    page: input.page ?? 1,
    limit,
    status: input.status,
    search: input.search,
    departmentId: input.departmentId ?? undefined,
    employmentType: input.employmentType,
  });
}

/** Picker convenience: ACTIVE staff, full picker page size. */
export function buildHrActiveEmployeePickerParams(
  overrides: Omit<HrEmployeeListParamsInput, 'status'> = {}
): EmployeeListQuery {
  return buildHrEmployeeListParams({
    page: 1,
    limit: HR_EMPLOYEE_PICKER_LIMIT,
    status: 'ACTIVE',
    ...overrides,
  });
}
