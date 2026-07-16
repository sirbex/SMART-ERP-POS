# Customer search missing results — root cause + fix

Generated: 2026-07-16

## Root cause

POS (and several dropdowns) called `GET /customers` with **default page size 50**, then filtered in the browser.

Local DB has **193 active** customers → anyone sorted after the first 50 A→Z never appeared in POS search.

Proof against live API:
```
customer_beyond_page1=PROOF-BELOW-COST-1779565531576
list_page1_has_beyond=0
search_has_beyond=1
list_count=50 active=193
ROOT CAUSE CONFIRMED + SEARCH FIX WORKS
```

## Secondary causes

1. **Inactive customers** (`is_active = false`) are excluded from list and `/customers/search` by design (10 inactive locally).
2. POS online search previously did **not** match `customer_number` (backend search does).

## Fixes applied

| Path | Change |
|---|---|
| `CustomerSelector` (POS) | Uses `api.customers.search(q)` when typing |
| `api.customers.search` | New client helper → `GET /customers/search` |
| POS quote customer resolve | Uses search instead of first list page |
| Customer Payments / Invoice ledger dropdowns | `list({ limit: 5000 })` |
| Offline IndexedDB search | Also matches phone (case-insensitive) + customer number |

## Note

Customers **page** already used server-side search via list `search=` — that path was fine. The bug was POS typeahead and full-set dropdowns capped at 50.
