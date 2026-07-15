# Banking & Liquidity — SSOT E2E Proof

Run: 2026-07-15T04:46:11.128Z

API: http://localhost:3001


## Unit proofs

- **PASS** Jest liquidityFundsGuard — Tests:       3 passed, 3 total

## Live API

- **PASS** API health
- **PASS** Admin login — admin@samplepos.com
- **PASS** Treasury enabled for proof
- **PASS** GET liquidity balances (GL SSOT)
- **PASS** Liquidity accounts present — count=6
- **PASS** Cash 1010 present
- **PASS** UI listLiquidityAccounts matches GL SSOT for 1010 — ui=56900 gl=56900
- **PASS** Blocks transfer when funds insufficient — Insufficient funds in 1010 (Cash Drawer) for transfer to 1030. Available 56900.00, required 156900.00. Reduce the amount or fund the account first.
- **PASS** Posts cash→bank when funded — TD-2026-00027
- **PASS** Reverse funded transfer — TD-2026-00028
- **PASS** Liquidity movements report
- **PASS** Report respects selected columns
- **PASS** Report declares ledger SSOT
- **PASS** Posted transfer appears in movements report — TD-2026-00027
- **PASS** Column catalog for field picker
- **PASS** CSV export returns 200
- **PASS** CSV export content-type + header row
- **PASS** PDF export returns 200
- **PASS** PDF export is application/pdf — bytes=6318
- **PASS** Report totals are consistent (money in/out/net)

## Verdict

- PASS: 21
- FAIL: 0

**Overall: PASS**

