# PROOF_HR_PAYROLL_PAY_MODES

Enterprise payroll disbursement:
- **ALL** — remaining net for every unpaid entry
- **SELECTED** — full remaining for chosen employees
- **PARTIAL** — explicit amount ≤ remaining per employee

Period stays `PARTIALLY_PAID` until all positive nets are cleared → `PAID`.

```json
{
  "modes": "ALL|SELECTED|PARTIAL",
  "remainingIdentity": true,
  "periodStatuses": "POSTED|PARTIALLY_PAID|PAID"
}
```
