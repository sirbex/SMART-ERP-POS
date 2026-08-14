# PROOF_HR_EMPLOYMENT_CONTRACTS

Enterprise engagement lifecycle (SAP HCM / Odoo hr.contract).

- Types: PERMANENT | CASUAL | CONTRACT | INTERN
- Versioned `employee_contracts` with sign / renew / convert / expire
- Fixed-term requires end date; payroll fails if ACTIVE past end
- Employee form bundled (accordion) — identity/kin/pay collapsed by default

```json
{
  "types": "PERMANENT|CASUAL|CONTRACT|INTERN",
  "statuses": "DRAFT|ACTIVE|EXPIRED|RENEWED|CONVERTED|TERMINATED",
  "formSections": [
    "employment:open",
    "contract:open",
    "identity:closed",
    "contact:closed",
    "nextOfKin:closed",
    "compliance:closed",
    "payment:closed"
  ],
  "convertIntern": "CONTRACT→PERMANENT"
}
```
