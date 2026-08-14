# PROOF_HR_LEAVE_STATUTORY_HARDENING

Enterprise leave + NSSF/PAYE hardening:
- Overlapping unpaid leave merged (no double-count)
- Invalid dates / rates / bands throw (no silent 0)
- Negative payroll inputs rejected
- Process/Post assert statutory COA 2410/2420/6010 exist
- Missing hr_statutory_settings row fails loud

```json
{
  "leaveDateFailLoud": true,
  "leaveOverlapMerge": true,
  "noSilentNegativeClamp": true,
  "statutoryBandsFailLoud": true,
  "processCoaAssert": true,
  "identity2dp": true
}
```
