# PROOF_HR_EMPLOYEE_IDENTITY

Generated: 2026-08-12T13:28:18.577Z

**Result: PASS** — 33/33 gates

## Model

- Employee = HR/payroll master (Odoo `hr.employee` / SAP Personnel Number)
- User = optional related login (POS/RBAC)
- Casuals/contractors may have no login
- Unique UserId when linked; EndDate + INACTIVE ends employment
- Payroll/advance GL logic unchanged

## Gates

- [x] **ssot/types** — PERMANENT,CASUAL,CONTRACT
- [x] **ssot/normalize_default** — defaults PERMANENT
- [x] **ssot/casual_no_login_required** — casuals need no user
- [x] **ssot/permanent_no_login_required** — login always optional
- [x] **ssot/block_double_link** — user cannot link to two employees
- [x] **ssot/allow_same_employee** — re-save same link ok
- [x] **ssot/null_user_ok** — no login is valid
- [x] **ssot/end_ok** — INACTIVE + EndDate valid
- [x] **ssot/end_requires_date** — EndDate required when ending
- [x] **ssot/end_before_hire** — EndDate before HireDate rejected
- [x] **schema/file** — shared/sql/602_hr_employee_identity.sql
- [x] **schema/employment_type** — EmploymentType column
- [x] **schema/end_date** — EndDate column
- [x] **schema/unique_userid** — partial unique UserId
- [x] **schema/types_check** — PERMANENT in CHECK
- [x] **schema/casual** — CASUAL in CHECK
- [x] **api/linkable_route** — GET linkable-users
- [x] **api/related_user_route** — POST related-user
- [x] **api/end_route** — POST end-employment
- [x] **api/createRelatedUser** — service createRelatedUser
- [x] **api/endEmployment** — service endEmployment
- [x] **api/findByUserId** — repo findByUserId
- [x] **api/employmentType_schema** — controller EmploymentType
- [x] **api/assert_link** — link uniqueness enforced
- [x] **ui/employmentType** — employment type field
- [x] **ui/related_login** — related login picker
- [x] **ui/create_login** — create login API
- [x] **ui/end_employment** — end employment API
- [x] **ui/casual_filter** — casual filter/option
- [x] **payroll/math_ssot** — payrollMath still SSOT
- [x] **payroll/advance_journal** — advance journal builder intact
- [x] **payroll/disbursement** — cash governance intact
- [x] **payroll/service_uses_math** — hr.service still posts via payrollMath
