# PROOF_HR_EMPLOYEES_LIST_VALIDATION

## Permanent SSOT
Source: `shared/hr/employeeListQuerySsot.ts`

- `HR_EMPLOYEE_LIST_MAX_LIMIT` / `HR_EMPLOYEE_PICKER_LIMIT` — one knob
- `EmployeeListQuerySchema` — server validates this only
- `buildHrEmployeeListParams` / `buildHrActiveEmployeePickerParams` — client must use these

## Bug class closed
Leave/OT pickers previously hard-coded `limit: 500` while Zod `max(100)` → 400.
Raising max alone is temporary; shared constants + builders prevent drift forever.

```json
{
  "sharedMax": 500,
  "pickerLimit": 500,
  "pickerParses": true,
  "clampWorks": true,
  "serverReexportsShared": true,
  "clientUsesBuilders": true
}
```
