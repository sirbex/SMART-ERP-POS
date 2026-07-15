════════════════════════════════════════════════════════════════════════════
 BANK RECONCILIATION E2E PROOF (live API)
 Generated: 2026-07-15T09:13:51.251Z
 BASE_URL: http://localhost:3001
════════════════════════════════════════════════════════════════════════════
  PASS  API health
  PASS  Login as admin

── 1. Dedicated bank GL + bank book ──
  PASS  Create ASSET GL for bank via sql — 10981749
  PASS  Create bank account
  PASS  Fresh account has no last reconciled (never) — undefined
  PASS  Contra accounts for bank journal present — 4100/7000

── 2. Post bank transactions (GL-backed) ──
  PASS  Create DEPOSIT — status=201 err= id=e4c40f0d-944c-4942-95f5-c5e4123938a1
  PASS  Create WITHDRAWAL — status=201 err= id=99a17216-a041-41d2-8105-e3ef86629ed1 body={"success":true,"data":{"id":"99a17216-a041-41d2-8105-e3ef86629ed1","transactionNumber":"BTX-2026-0009","bankAccountId":"c68811a2-b8b2-4a2f-a34c-7cd1677820c8","bankAccountName":"E2E Recon 06831749","t
  PASS  Book (GL) balance = deposit − withdrawal — 750000

── 3. Unbalanced reconcile must fail ──
  PASS  Unbalanced reconcile rejected by API — status=400 err=Reconciliation unbalanced: statement 800000.00 vs cleared 750000.00 (difference 50000.00). Cleared = last reconciled 0.00 + selected net. Adjust selected transactions or the statement ending balance.
  PASS  Error mentions unbalanced / cleared / difference — Reconciliation unbalanced: statement 800000.00 vs cleared 750000.00 (difference 50000.00). Cleared = last reconciled 0.00 + selected net. Adjust selected transactions or the statem

── 4. Balanced reconcile must succeed ──
  PASS  Balanced reconcile HTTP 200 — 2 transactions reconciled
  PASS  Reconciled count = 2 — 2
  PASS  newBalance = statement ending — 750000
  PASS  clearedBalance matches — 750000
  PASS  difference ~ 0 — 0
  PASS  bookBalance reported — 750000

── 5. Persist last reconciled on account ──
  PASS  lastReconciledBalance persisted = statement ending — 750000
  PASS  lastReconciledAt set
  PASS  Both transactions flagged reconciled

════════════════════════════════════════════════════════════════════════════
 RESULT: E2E OK — 20 assertions — reconcile accurate end-to-end
════════════════════════════════════════════════════════════════════════════
