/**
 * HR employee master-data SSOT (SAP HCM / Odoo HR / Tally / QB Payroll — Uganda SME).
 *
 * Sections:
 *   identity   — who they are (NIN, DOB, gender, nationality, employee no.)
 *   contact    — phone/email/address
 *   nextOfKin  — emergency / next of kin
 *   compliance — NSSF, TIN (statutory remittance)
 *   payment    — bank / MoMo / preferred pay method
 *   employment — dept/position/hire/type (existing)
 *   payroll    — monthly allowance (existing); basic via position/history
 *
 * Zod create/update schemas MUST include every mutable master field.
 * UI sections MUST bind the same keys — no dead DB columns.
 */

export const EMPLOYEE_GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;
export type EmployeeGender = (typeof EMPLOYEE_GENDERS)[number];

export const EMPLOYEE_MARITAL_STATUSES = [
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
  'OTHER',
] as const;
export type EmployeeMaritalStatus = (typeof EMPLOYEE_MARITAL_STATUSES)[number];

export const EMPLOYEE_PAYMENT_METHODS = [
  'BANK',
  'MOBILE_MONEY',
  'CASH',
  'PETTY_CASH',
] as const;
export type EmployeePaymentMethod = (typeof EMPLOYEE_PAYMENT_METHODS)[number];

export const EMPLOYEE_MOMO_PROVIDERS = ['MTN', 'AIRTEL', 'OTHER'] as const;
export type EmployeeMomoProvider = (typeof EMPLOYEE_MOMO_PROVIDERS)[number];

/** Mutable master fields — single catalog for migration anchors, Zod, UI, proofs. */
export const EMPLOYEE_MASTER_MUTABLE_FIELDS = [
  // core
  'firstName',
  'lastName',
  'phone',
  'email',
  'userId',
  'departmentId',
  'positionId',
  'hireDate',
  'endDate',
  'employmentType',
  'status',
  'monthlyAllowance',
  // identity
  'employeeNumber',
  'nationalId',
  'dateOfBirth',
  'gender',
  'nationality',
  'maritalStatus',
  // address
  'addressLine1',
  'addressDistrict',
  // next of kin / emergency
  'nextOfKinName',
  'nextOfKinPhone',
  'nextOfKinRelation',
  // compliance
  'nssfNumber',
  'tinNumber',
  // payment
  'bankName',
  'bankBranch',
  'bankAccountNumber',
  'bankAccountName',
  'mobileMoneyNumber',
  'mobileMoneyProvider',
  'preferredPaymentMethod',
] as const;

export type EmployeeMasterMutableField = (typeof EMPLOYEE_MASTER_MUTABLE_FIELDS)[number];

/**
 * VARCHAR max lengths — MUST match migrations 020/604/605 exactly.
 * Zod + integrity assert use this; never truncate in app code.
 */
export const EMPLOYEE_MASTER_FIELD_MAX = {
  firstName: 255,
  lastName: 255,
  phone: 50,
  email: 255,
  employeeNumber: 40,
  nationalId: 40,
  gender: 20,
  nationality: 80,
  maritalStatus: 20,
  addressLine1: 500,
  addressDistrict: 120,
  nextOfKinName: 255,
  nextOfKinPhone: 50,
  nextOfKinRelation: 80,
  nssfNumber: 40,
  tinNumber: 40,
  bankName: 120,
  bankBranch: 120,
  bankAccountNumber: 60,
  bankAccountName: 255,
  mobileMoneyNumber: 40,
  mobileMoneyProvider: 20,
  preferredPaymentMethod: 20,
} as const;

/** CamelCase → quoted DB column for UPDATE fieldMap lock. */
export const EMPLOYEE_MASTER_CAMEL_TO_DB: Record<string, string> = {
  userId: 'UserId',
  firstName: 'FirstName',
  lastName: 'LastName',
  phone: 'Phone',
  email: 'Email',
  departmentId: 'DepartmentId',
  positionId: 'PositionId',
  hireDate: 'HireDate',
  status: 'Status',
  employmentType: 'EmploymentType',
  endDate: 'EndDate',
  monthlyAllowance: 'MonthlyAllowance',
  bankName: 'BankName',
  bankAccountNumber: 'BankAccountNumber',
  nssfNumber: 'NssfNumber',
  tinNumber: 'TinNumber',
  employeeNumber: 'EmployeeNumber',
  nationalId: 'NationalId',
  dateOfBirth: 'DateOfBirth',
  gender: 'Gender',
  nationality: 'Nationality',
  maritalStatus: 'MaritalStatus',
  addressLine1: 'AddressLine1',
  addressDistrict: 'AddressDistrict',
  nextOfKinName: 'NextOfKinName',
  nextOfKinPhone: 'NextOfKinPhone',
  nextOfKinRelation: 'NextOfKinRelation',
  bankBranch: 'BankBranch',
  bankAccountName: 'BankAccountName',
  mobileMoneyNumber: 'MobileMoneyNumber',
  mobileMoneyProvider: 'MobileMoneyProvider',
  preferredPaymentMethod: 'PreferredPaymentMethod',
};

/** DB PascalCase columns added in 604 + 605 (beyond core 020/598/602). */
export const EMPLOYEE_MASTER_DB_COLUMNS_604_605 = [
  // 604
  'BankName',
  'BankAccountNumber',
  'NssfNumber',
  'TinNumber',
  // 605
  'EmployeeNumber',
  'NationalId',
  'DateOfBirth',
  'Gender',
  'Nationality',
  'MaritalStatus',
  'AddressLine1',
  'AddressDistrict',
  'NextOfKinName',
  'NextOfKinPhone',
  'NextOfKinRelation',
  'BankBranch',
  'BankAccountName',
  'MobileMoneyNumber',
  'MobileMoneyProvider',
  'PreferredPaymentMethod',
] as const;

export function isEmployeeGender(v: unknown): v is EmployeeGender {
  return typeof v === 'string' && (EMPLOYEE_GENDERS as readonly string[]).includes(v);
}

export function isEmployeeMaritalStatus(v: unknown): v is EmployeeMaritalStatus {
  return (
    typeof v === 'string' && (EMPLOYEE_MARITAL_STATUSES as readonly string[]).includes(v)
  );
}

export function isEmployeePaymentMethod(v: unknown): v is EmployeePaymentMethod {
  return (
    typeof v === 'string' && (EMPLOYEE_PAYMENT_METHODS as readonly string[]).includes(v)
  );
}

export function isEmployeeMomoProvider(v: unknown): v is EmployeeMomoProvider {
  return typeof v === 'string' && (EMPLOYEE_MOMO_PROVIDERS as readonly string[]).includes(v);
}
