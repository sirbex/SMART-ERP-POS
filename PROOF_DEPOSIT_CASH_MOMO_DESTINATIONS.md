# Proof: Deposit destinations — Cash / Mobile Money / Bank

Run: 2026-07-28T09:58:28.597Z

Base: http://localhost:3001


## A. Source evidence

- **PASS** ensureDepositLiquidityBook maps CASH→1010 and MOBILE_MONEY→1040
- **PASS** depositWorksheetService accepts destinationKind + lists destinations
- **PASS** treasuryRoutes exposes /deposit-destinations and destinationKind schema
- **PASS** DepositWorksheetPage offers explicit Cash / Mobile money / Bank
- **PASS** client api.treasury wires listDepositDestinations + destinationKind

## B. Automated proofs

- **PASS** Jest depositWorksheet.test.ts — 9 passed
- **PASS** Vitest banking-treasury-merge-proof (incl. Cash/MoMo UI) — 6 passed

## C. Live API evidence

- **PASS** Login — 200
- **PASS** Treasury documents enabled
- **PASS** GET /deposit-destinations returns Cash (1010) + Mobile Money (1040) — banks=4

```json
{
  "cash": {
    "kind": "CASH",
    "bankAccountId": "3bdfdabb-cb7a-478a-99f3-bea84db0a1a9",
    "name": "Cash Drawer",
    "glAccountCode": "1010",
    "glAccountName": "Cash Drawer",
    "systemAccountTag": "CASH"
  },
  "mobileMoney": {
    "kind": "MOBILE_MONEY",
    "bankAccountId": "3f2b6eb4-34a5-447e-8032-1c49788df473",
    "name": "Mobile Money",
    "glAccountCode": "1040",
    "glAccountName": "Mobile Money",
    "systemAccountTag": "MOBILE_MONEY"
  },
  "bankCount": 4,
  "bankSample": [
    {
      "kind": "BANK",
      "bankAccountId": "e6863345-27c6-4ca6-b09e-813c58999810",
      "name": "PHARMACURE ACCOUNT",
      "glAccountCode": "1032",
      "glAccountName": "CENTENARY BANK",
      "systemAccountTag": "BANK",
      "isDefault": false
    },
    {
      "kind": "BANK",
      "bankAccountId": "832b50c0-a4c3-4857-bdf6-2e3be60c617e",
      "name": "PHARMACURE ACCOUNT",
      "glAccountCode": "1030",
      "glAccountName": "Checking Account",
      "systemAccountTag": "BANK",
      "isDefault": false
    }
  ]
}
```

- **PASS** BANK destination requires bankAccountId — bankAccountId is required when depositing to a bank account
- **PASS** Customer for seed receipts — zaman zam zam
- **PASS** Seed AR payment (unallocated) for Cash clear — CRP-000008 17.25
- **PASS** Seed AR payment (unallocated) for MoMo clear — CRP-000009 23.5
- **PASS** Cash seed appears in unsettled receipts — CRP-000008 residual=17.25
- **PASS** Post deposit destinationKind=CASH → 1010 — TD-2026-00078 bankAccountId=3bdfdabb-cb7a-478a-99f3-bea84db0a1a9 to=1010
- **PASS** MoMo seed appears in unsettled receipts — CRP-000009 residual=23.5
- **PASS** Post deposit destinationKind=MOBILE_MONEY → 1040 — TD-2026-00079 bankAccountId=3f2b6eb4-34a5-447e-8032-1c49788df473 to=1040
- **PASS** After deposit, Cash/MoMo Banking books exist (auto-created) — cash=3bdfdabb… momo=3f2b6eb4…

```json
{
  "cash": {
    "kind": "CASH",
    "bankAccountId": "3bdfdabb-cb7a-478a-99f3-bea84db0a1a9",
    "name": "Cash Drawer",
    "glAccountCode": "1010",
    "glAccountName": "Cash Drawer",
    "systemAccountTag": "CASH"
  },
  "mobileMoney": {
    "kind": "MOBILE_MONEY",
    "bankAccountId": "3f2b6eb4-34a5-447e-8032-1c49788df473",
    "name": "Mobile Money",
    "glAccountCode": "1040",
    "glAccountName": "Mobile Money",
    "systemAccountTag": "MOBILE_MONEY"
  }
}
```


## Verdict

- PASS: 19
- FAIL: 0
- SKIP: 0

**Overall: PASS** — Undeposited clearing offers Cash (1010) and Mobile Money (1040) without manual Banking → Accounts setup.
