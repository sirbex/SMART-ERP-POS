# Customer opening balance — proof only

Per project rule: **only a passing proof script counts as acceptance** (not Jest alone, not manual UI checks).

## Local proof

```bash
# Terminal 1
npm run dev:server

# Terminal 2 — apply migration 417 on your tenant DB first
npm run proof:customer-ob:local
```

Env:

- `BASE_URL` (default `http://localhost:3001`)
- `TEST_EMAIL` / `TEST_PASSWORD`
- `CUSTOMER_ID` — reuse customer (must not already have OB)
- `OB_AMOUNT` — default `50000`

## Pass criteria

1. `POST /api/customers/opening-balance` → `201`, invoice `OB-*`
2. `customers.balance` increases by posted amount
3. Second post for same customer → error (one OB per customer)

## Not proof-accepted yet

| Work | Proof |
|------|--------|
| Customer OB on production | `proof:customer-ob:local` on staging, then live variant TBD |
| BOU invoice cleanup | No proof script — do not run on prod until scripted |
| Pricing phases Jest | `test:pricing-phases` — informational only, not deploy gate |
| SALE-2026-3755 / void vs return | Investigation SQL only |

## Related

- Migration: `shared/sql/417_customer_opening_balance.sql`
- Supplier mirror: `npm run proof:deploy` / Supplier Payments OB UI
