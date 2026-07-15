# Sales Analysis Accuracy + Transfer Reverse — Proof

Run: 2026-07-15T10:10:12.459Z

API: http://localhost:3001


Goal: no inconsistent sales KPIs across analyse-by dimensions; transfer reverse restores liquidity.


## Static UI / wiring

- **PASS** SalesAnalysisReportPage exists
- **PASS** UI dimension: cashier
- **PASS** UI dimension: payment_method
- **PASS** UI column: quantity
- **PASS** UI column picker
- **PASS** UI does not render *Formatted KPIs
- **PASS** UI calls reports/sales
- **PASS** TreasuryDocumentsPage exists
- **PASS** Documents UI has Reverse
- **PASS** Documents UI calls reverse API
- **PASS** Reverse gated by accounting permission copy
- **PASS** Route /reports/sales-analysis wired
- **PASS** Reports gallery opens Sales Analysis
- **PASS** Zod group_by allows cashier
- **PASS** Vitest sales-analysis-transfer UI proof — Tests  5 passed (5)

## Live API — Sales Analysis accuracy

- **PASS** API health — 200
- **PASS** Admin login — admin@samplepos.com
- **PASS** Sales report group_by=day — 2 groups · 110ms
- **PASS** No *Formatted summary keys (day) — clean
- **PASS** totalQuantitySold in summary (day) — 4
- **PASS** Rows have totalQuantitySold (day) — sample=1
- **PASS** Row sales sum = summary (day) — rows=91900.00 summary=91900.00
- **PASS** Row qty sum = summary (day) — rows=4 summary=4
- **PASS** Row txn sum = summary (day) — rows=4 summary=4
- **PASS** Sales report group_by=week — 1 groups · 17ms
- **PASS** No *Formatted summary keys (week) — clean
- **PASS** totalQuantitySold in summary (week) — 4
- **PASS** Rows have totalQuantitySold (week) — sample=4
- **PASS** Sales report group_by=month — 1 groups · 7ms
- **PASS** No *Formatted summary keys (month) — clean
- **PASS** totalQuantitySold in summary (month) — 4
- **PASS** Rows have totalQuantitySold (month) — sample=4
- **PASS** Sales report group_by=cashier — 1 groups · 6ms
- **PASS** No *Formatted summary keys (cashier) — clean
- **PASS** totalQuantitySold in summary (cashier) — 4
- **PASS** Rows have totalQuantitySold (cashier) — sample=4
- **PASS** Cashier periods are names (not Invalid Date) — System Administrator
- **PASS** Row sales sum = summary (cashier) — rows=91900.00 summary=91900.00
- **PASS** Row qty sum = summary (cashier) — rows=4 summary=4
- **PASS** Row txn sum = summary (cashier) — rows=4 summary=4
- **PASS** Sales report group_by=payment_method — 1 groups · 8ms
- **PASS** No *Formatted summary keys (payment_method) — clean
- **PASS** totalQuantitySold in summary (payment_method) — 4
- **PASS** Rows have totalQuantitySold (payment_method) — sample=4
- **PASS** Row sales sum = summary (payment_method) — rows=91900.00 summary=91900.00
- **PASS** Row qty sum = summary (payment_method) — rows=4 summary=4
- **PASS** Row txn sum = summary (payment_method) — rows=4 summary=4
- **PASS** Sales report group_by=product — 3 groups · 32ms
- **PASS** No *Formatted summary keys (product) — clean
- **PASS** totalQuantitySold in summary (product) — 4
- **PASS** Rows have totalQuantitySold (product) — sample=2
- **PASS** Rows include item category (product) — sample=MEDICINE F
- **PASS** Product row sales sum = summary — rows=91900.00 summary=91900.00
- **PASS** Product row qty sum = summary — rows=4 summary=4
- **PASS** Sales report group_by=category — 2 groups · 34ms
- **PASS** No *Formatted summary keys (category) — clean
- **PASS** totalQuantitySold in summary (category) — 4
- **PASS** Rows have totalQuantitySold (category) — sample=1
- **PASS** Rows include item category (category) — sample=COSMETICS A
- **PASS** Category row sales sum = summary — rows=91900.00 summary=91900.00
- **PASS** Category row qty sum = summary — rows=4 summary=4
- **PASS** Sales report group_by=customer — 2 groups · 5ms
- **PASS** No *Formatted summary keys (customer) — clean
- **PASS** totalQuantitySold in summary (customer) — 4
- **PASS** Rows have totalQuantitySold (customer) — sample=1
- **PASS** Row sales sum = summary (customer) — rows=91900.00 summary=91900.00
- **PASS** Row qty sum = summary (customer) — rows=4 summary=4
- **PASS** Row txn sum = summary (customer) — rows=4 summary=4

Baseline (day): sales=91900 net=91900 qty=4 txns=4

- **PASS** Summary consistent vs day (day) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (day) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (day) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (week) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (week) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (week) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (month) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (month) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (month) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (cashier) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (cashier) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (cashier) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (payment_method) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (payment_method) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (payment_method) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (product) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (product) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (product) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (category) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (category) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (category) — calc=91900.00 reported=91900
- **PASS** Summary consistent vs day (customer) — sales=91900 net=91900 qty=4 txns=4
- **PASS** Margin = GP/Net (customer) — calc=80.63 reported=80.63
- **PASS** Net = sales − discounts (customer) — calc=91900.00 reported=91900

## Live API — Transfer reverse

- **PASS** Treasury already enabled
- **PASS** List liquidity accounts — n=6
- **PASS** Account 1010 present — Cash Drawer
- **PASS** Account 1030 present — Checking Account

Balances before: cash=56900 bank=900

- **PASS** Post TREASURY_TRANSFER — TD-2026-00049 1030→1010
- **PASS** Reverse creates posted TREASURY_REVERSAL — TD-2026-00050
- **PASS** Original linked to reversal — b889241c-2ba4-4812-82d8-01dfd262ca1e
- **PASS** Reversal journal balanced (DR=CR=amount) — DR=1.37 CR=1.37
- **PASS** Double reverse rejected — 409 Document has already been reversed
- **PASS** Reverse-of-reversal rejected — 400 Reversal documents cannot be reversed — post a correcting transfer instead
- **PASS** Balance restored 1010 — before=56900 after=56900
- **PASS** Balance restored 1030 — before=900 after=900

## Verdict

- PASS: 104
- FAIL: 0
- SKIP: 0

**Overall: PASS**


Commit only after Overall PASS.

