# Treasury Transfer Flow — Liquidity Moves Proof

Run: 2026-07-15T09:59:32.125Z

API: http://localhost:3001

Amount per leg: 1.25


Covers operator path: **Accounting → Treasury Transfer**


## Unit / static proofs

- **PASS** Jest treasuryTransfer invariants (incl. route matrix) — Tests:       4 passed, 4 total
- **PASS** Vitest treasury-transfer-flow UI proof — Tests  3 passed (3)

## Live API — Treasury Transfer scenarios

- **PASS** API health — 200
- **PASS** Admin login — admin@samplepos.com
- **PASS** Treasury already enabled
- **PASS** List liquidity accounts — count=6
- **PASS** Liquidity account 1010 present — Cash Drawer
- **PASS** Liquidity account 1030 present — Checking Account
- **PASS** Liquidity account 1040 present — Mobile Money

Balances before: cash=56900 bank=900 momo=0


### Cash → Bank (1010 → 1030)

- **PASS** cash-to-bank posted TREASURY_TRANSFER — TD-2026-00039 journal=0d6830e1-bb17-48ae-b877-4e1bdf14f4cd
- **PASS** cash-to-bank has journalEntryId
- **PASS** cash-to-bank DR 1030 = 1.25 — 1.25
- **PASS** cash-to-bank CR 1010 = 1.25 — 1.25

### Bank → Mobile money (1030 → 1040)

- **PASS** bank-to-momo posted TREASURY_TRANSFER — TD-2026-00040 journal=a6b9163f-8b81-4aac-8389-b62881dde1b9
- **PASS** bank-to-momo has journalEntryId
- **PASS** bank-to-momo DR 1040 = 1.25 — 1.25
- **PASS** bank-to-momo CR 1030 = 1.25 — 1.25

### Bank → Cash (1030 → 1010)

- **PASS** bank-to-cash posted TREASURY_TRANSFER — TD-2026-00041 journal=b2a5ee19-d093-478f-99b3-eee614f833bb
- **PASS** bank-to-cash has journalEntryId
- **PASS** bank-to-cash DR 1010 = 1.25 — 1.25
- **PASS** bank-to-cash CR 1030 = 1.25 — 1.25

### Mobile money → Bank (1040 → 1030)

- **PASS** momo-to-bank posted TREASURY_TRANSFER — TD-2026-00042 journal=a1aab653-23aa-4997-919d-7f570be2e737
- **PASS** momo-to-bank has journalEntryId
- **PASS** momo-to-bank DR 1030 = 1.25 — 1.25
- **PASS** momo-to-bank CR 1040 = 1.25 — 1.25

### Reversals (non-destructive cleanup)

- **PASS** Reverse TD-2026-00039 — TD-2026-00043
- **PASS** Reverse TD-2026-00040 — TD-2026-00044
- **PASS** Reverse TD-2026-00041 — TD-2026-00045
- **PASS** Reverse TD-2026-00042 — TD-2026-00046
- **PASS** Balance restored 1010 — before=56900 after=56900
- **PASS** Balance restored 1030 — before=900 after=900
- **PASS** Balance restored 1040 — before=0 after=0

## Verdict

- PASS: 32
- FAIL: 0
- SKIP: 0

**Overall: PASS**

