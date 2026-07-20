# Proof: CoA CurrentBalance + Move Money guards

Run: 2026-07-20T13:05:00.089Z

Base: http://localhost:3001

- **PASS** Login — 200
- **PASS** CoA create posting Asset with CurrentBalance=0 — 103100400 id=c1e6e4f1-0a34-4b78-8687-0c1aa880b47a
- **PASS** Source insert includes CurrentBalance=0 + timestamps
- **PASS** Move Money rejects from 1015 Undeposited Funds — Undeposited Funds (1015) cannot be used in Move Money. Use Banking → Undeposited receipts to deposit customer receipts into a bank account.
- **PASS** Move Money rejects to 1015 Undeposited Funds — Undeposited Funds (1015) cannot be used in Move Money. Use Banking → Undeposited receipts to deposit customer receipts into a bank account.
- **PASS** Source transfer service guards UNDEPOSITED_FUNDS

## Verdict

- PASS: 6
- FAIL: 0

**Overall: PASS** — CoA create + Move Money 1015 guards proven.
