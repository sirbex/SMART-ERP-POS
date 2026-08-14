# PROOF_HR_EMPLOYEE_MASTER

Enterprise employee master integrity lock.

## Guarantees
- Zod max === SQL VARCHAR (no app truncate)
- BANK/MoMo/kin/DOB cross-field assert fail-loud
- Update merges existing+patch before integrity
- 23505 → ConflictError field message
- UI surfaces getErrorMessage (no Axios swallow)

```json
{
  "mutableFieldCount": 32,
  "dbColumns604_605": 20,
  "fieldMaxKeys": 23,
  "camelToDbKeys": 32,
  "integrityFailLoud": true,
  "noUiAllowanceClamp": true,
  "uniqueMapped": true
}
```
