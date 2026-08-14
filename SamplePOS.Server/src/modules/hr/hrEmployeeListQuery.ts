/**
 * Re-export shared SSOT so server paths stay stable.
 * Source of truth: shared/hr/employeeListQuerySsot.ts
 */

export {
  EmployeeListQuerySchema,
  emptyQueryToUndefined,
  buildHrEmployeeListParams,
  buildHrActiveEmployeePickerParams,
  HR_EMPLOYEE_LIST_MAX_LIMIT,
  HR_EMPLOYEE_LIST_DEFAULT_LIMIT,
  HR_EMPLOYEE_LIST_PAGE_LIMIT,
  HR_EMPLOYEE_PICKER_LIMIT,
  type EmployeeListQuery,
  type HrEmployeeListParamsInput,
} from '../../../../shared/hr/employeeListQuerySsot.js';
