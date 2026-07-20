# Proof: BANK_MANUAL posting + deposit destination GL guard

**Date:** 2026-07-20  
**Commit scope:** server-only (governance + banking create + deposit worksheet)

## What was proven

### A. Posting governance unit suite
```
cd SamplePOS.Server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  src/services/postingGovernanceService.test.ts --no-coverage --forceExit
```
**Result:** 56 passed (includes BANK_MANUAL allow + MANUAL_JOURNAL AR credit block).

### B. Live API — bank register uses `BANK_MANUAL`
Against local `http://localhost:3001`:

| Case | Expected | Result |
|------|----------|--------|
| DEPOSIT + Sales Deposit (→ 4000) | 201 success | PASS `BTX-2026-0020` on Primary Bank (1030) |
| DEPOSIT + Customer Payment (→ 1200 AR) | 201 success (not Rule A MANUAL_JOURNAL block) | PASS `BTX-2026-0021` |

### C. Live API — Deposit Worksheet rejects non-bank destination
Create deposit worksheet with bank account linked to **1015 Undeposited Funds**:

**Result:** PASS — rejected with:
> Bank account "Petty Cash" is linked to GL 1015 (UNDEPOSITED_FUNDS), which cannot receive deposits…

Same guard covers AR `1200`, OBE `3050`, and non-ASSET GLs.

## Not in this commit (UI-only, unproven)
- `ReconciliationTab.tsx` (statement-balance UX)
- `BankTransactionsTab.tsx` (category filter / error display)
- `DepositWorksheetPage.tsx` (eligible-account filter UX)
- `useBanking.ts` (error message parsing)
- `CRMPage.tsx.bak`

## Files committed
- `SamplePOS.Server/src/services/postingGovernanceService.ts`
- `SamplePOS.Server/src/services/postingGovernanceService.test.ts`
- `SamplePOS.Server/src/services/bankingService.ts` (`source: 'BANK_MANUAL'`)
- `SamplePOS.Server/src/modules/treasury/depositWorksheetService.ts`
