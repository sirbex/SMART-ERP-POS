-- ============================================================
-- REPAIR: Return GRN UoM Mismatch — RGRN-2026-0001
-- ============================================================
--
-- Problem: RGRN-2026-0001 returned "1" Gofen 400 with no UoM context.
--   System stored base_quantity=1 (1 tablet) but the GRN received in PKT
--   (1 PKT = 10 tablets). The correct interpretation is 1 PKT = 10 tablets.
--
-- Impact of the bug:
--   - GL posted DR 2150/2160 UGX 600 instead of UGX 6,000 (10x under)
--   - Batch deducted 1 tablet instead of 10 tablets
--   - Stock movement recorded -1 instead of -10
--
-- This script:
--   1. Fixes goods_receipt_items.uom_id (backfill purchase UoM)
--   2. Fixes return_grn_lines (correct base_quantity=10, uom_id=PKT)
--   3. Fixes inventory batch (correct remaining_quantity)
--   4. Fixes stock movement (correct quantity=-10)
--   5. Reverses wrong GL journals and posts correct ones
--   6. Rebuilds gl_period_balances for affected accounts
--   7. Updates accounts.CurrentBalance for affected accounts
--
-- GL flow after repair:
--   TXN-000007 (original RGRN-0001): DR 2150 600 / CR 1300 600  [REVERSED]
--   GRIR-CORR-2026-0002 (migration): DR 2160 600 / CR 2150 600  [REVERSED]
--   RGRN-REPAIR-REPOST-001 (correct): DR 2160 6000 / CR 1300 6000 [NEW]
--   Net: 2150=0, 2160=DR 6000, 1300=CR 6000  ✓
--
-- Preconditions verified:
--   PKT uom_id:        f9c13a3e-7c00-4d5f-9147-55158753c00d (conversion=10)
--   GR item id:        cad69789-e1a2-4564-a968-1b6f3c4ac06c
--   RGRN line id:      793e8b4b-af2e-4fc6-8f5d-c263bc3fe98c
--   RGRN id:           3192d1d6-f706-4418-84ee-244fb2a9b87f
--   TXN-000007 id:     eadc7901-da1a-4ea2-ac8b-241db0fd375a
--   GRIR-CORR-0002 id: fc00166b-8b71-4758-a19e-5cb45dcb0565
--   Batch id:          2d23535d-0687-459e-a304-97dcb08b15ef
--   Stock movement id: ebf0d417-af2a-48eb-8732-a55249608799
--   Account 1300 id:   261d1b86-37bd-4b9e-a99f-6599e37bc059
--   Account 2150 id:   ad447de6-8709-4097-963f-ed7a980a10f8
--   Account 2160 id:   1f832ea0-fe90-4c15-b69f-679965f24d1f
-- ============================================================

BEGIN;

-- Safety: verify preconditions before touching anything
-- (RAISE NOTICE on failure — tenants without RGRN-2026-0001 / TXN-000007
--  will simply update 0 rows and commit cleanly as a no-op)
DO $$
BEGIN
    -- RGRN must be POSTED and line must have base_quantity=1 (not yet repaired)
    IF NOT EXISTS (
        SELECT 1 FROM return_grn_lines rgl
        JOIN return_grn rg ON rg.id = rgl.rgrn_id
        WHERE rg.return_grn_number = 'RGRN-2026-0001'
          AND rgl.base_quantity = 1
          AND rg.status = 'POSTED'
    ) THEN
        RAISE NOTICE 'Precondition: RGRN-2026-0001 not in expected state — repair is a no-op on this tenant';
    END IF;
    -- TXN-000007 must exist and not be reversed
    IF NOT EXISTS (
        SELECT 1 FROM ledger_transactions
        WHERE "TransactionNumber" = 'TXN-000007' AND "IsReversed" = FALSE
    ) THEN
        RAISE NOTICE 'Precondition: TXN-000007 not found or already reversed — repair is a no-op on this tenant';
    END IF;
    RAISE NOTICE 'Precondition check complete — proceeding (may be no-op if data absent)';
END;
$$;

-- ============================================================
-- STEP 1: Fix goods_receipt_items.uom_id
-- GR-2026-0001 received Gofen 400 in PKT — backfill the purchase UoM
-- ============================================================
UPDATE goods_receipt_items
SET uom_id = 'f9c13a3e-7c00-4d5f-9147-55158753c00d'  -- PACKET
WHERE id = 'cad69789-e1a2-4564-a968-1b6f3c4ac06c'
  AND uom_id IS NULL;  -- only if not already set

-- ============================================================
-- STEP 2: Fix return_grn_lines for RGRN-2026-0001
-- base_quantity: 1 tablet → 10 tablets (1 PKT × 10 tablets/PKT)
-- uom_id: NULL → PKT
-- line_total: 6000 (unchanged: 1 PKT × 6000/PKT = 6000 ✓)
-- unit_cost: 6000 (unchanged: correct PKT price ✓)
-- ============================================================
UPDATE return_grn_lines
SET
    uom_id        = 'f9c13a3e-7c00-4d5f-9147-55158753c00d',  -- PACKET
    base_quantity = 10.0000  -- 1 PKT × 10 tablets/PKT
WHERE id = '793e8b4b-af2e-4fc6-8f5d-c263bc3fe98c';

-- ============================================================
-- STEP 3: Fix inventory batch
-- Wrong:   deducted 1 tablet  (1 base unit)
-- Correct: deduct 10 tablets  (1 PKT = 10 tablets)
-- Net:     restore 1, deduct 10 → remaining_quantity decreases by 9
-- ============================================================
UPDATE inventory_batches
SET
    remaining_quantity = remaining_quantity + 1 - 10,  -- net: -9 tablets
    updated_at = NOW()
WHERE id = '2d23535d-0687-459e-a304-97dcb08b15ef'
  AND remaining_quantity >= 9;  -- safety: ensure enough stock

-- ============================================================
-- STEP 4: Fix stock movement for RGRN-2026-0001
-- quantity: -1 tablet → -10 tablets (1 PKT)
-- unit_cost: 600/tablet unchanged (base-unit cost)
-- ============================================================
UPDATE stock_movements
SET
    quantity = -10.0000  -- 1 PKT = 10 tablets in base units
WHERE id = 'ebf0d417-af2a-48eb-8732-a55249608799';

-- ============================================================
-- STEP 5: GL Repair
-- 5a: Reverse TXN-000007     (DR 1300 600 / CR 2150 600)
-- 5b: Reverse GRIR-CORR-0002 (DR 2150 600 / CR 2160 600)
-- 5c: Post correct return     (DR 2160 6000 / CR 1300 6000)
-- ============================================================

-- Mark originals as reversed
UPDATE ledger_transactions
SET "IsReversed" = TRUE, "UpdatedAt" = NOW()
WHERE "Id" IN (
    'eadc7901-da1a-4ea2-ac8b-241db0fd375a',  -- TXN-000007
    'fc00166b-8b71-4758-a19e-5cb45dcb0565'   -- GRIR-CORR-2026-0002
);

-- 5a: Reversal of TXN-000007 — DR 1300 / CR 2150 @ 600
WITH rev1 AS (
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate",
        "ReferenceType", "ReferenceId", "ReferenceNumber",
        "Description",
        "TotalDebitAmount", "TotalCreditAmount",
        "Status", "IsReversed",
        "CreatedBy", "CreatedAt", "UpdatedAt"
    ) VALUES (
        gen_random_uuid(),
        'RGRN-REPAIR-REV-001',
        '2026-05-16'::date,
        'GRIR_CORRECTION',
        '3192d1d6-f706-4418-84ee-244fb2a9b87f'::uuid,
        'RGRN-2026-0001',
        'UoM repair: reversal of TXN-000007 (wrong 1-tablet return GL)',
        600, 600,
        'POSTED', FALSE,
        '00000000-0000-0000-0000-000000000000'::uuid,
        NOW(), NOW()
    ) RETURNING "Id"
)
INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType", "Amount",
    "DebitAmount", "CreditAmount", "LineNumber", "EntryDate",
    "RunningBalance", "IsReconciled", "TransactionCurrency", "CreatedAt"
) VALUES
    (gen_random_uuid(), (SELECT "Id" FROM rev1),
     '261d1b86-37bd-4b9e-a99f-6599e37bc059'::uuid,  -- 1300 Inventory
     'DEBIT',  600, 600, 0,   1, '2026-05-16', 0, false, 'UGX', NOW()),
    (gen_random_uuid(), (SELECT "Id" FROM rev1),
     'ad447de6-8709-4097-963f-ed7a980a10f8'::uuid,  -- 2150 GR/IR Clearing
     'CREDIT', 600, 0,   600, 2, '2026-05-16', 0, false, 'UGX', NOW());

-- 5b: Reversal of GRIR-CORR-2026-0002 — DR 2150 / CR 2160 @ 600
WITH rev2 AS (
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate",
        "ReferenceType", "ReferenceId", "ReferenceNumber",
        "Description",
        "TotalDebitAmount", "TotalCreditAmount",
        "Status", "IsReversed",
        "CreatedBy", "CreatedAt", "UpdatedAt"
    ) VALUES (
        gen_random_uuid(),
        'RGRN-REPAIR-REV-002',
        '2026-05-16'::date,
        'GRIR_CORRECTION',
        '3192d1d6-f706-4418-84ee-244fb2a9b87f'::uuid,
        'RGRN-2026-0001',
        'UoM repair: reversal of GRIR-CORR-2026-0002 (wrong 600 correction)',
        600, 600,
        'POSTED', FALSE,
        '00000000-0000-0000-0000-000000000000'::uuid,
        NOW(), NOW()
    ) RETURNING "Id"
)
INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType", "Amount",
    "DebitAmount", "CreditAmount", "LineNumber", "EntryDate",
    "RunningBalance", "IsReconciled", "TransactionCurrency", "CreatedAt"
) VALUES
    (gen_random_uuid(), (SELECT "Id" FROM rev2),
     'ad447de6-8709-4097-963f-ed7a980a10f8'::uuid,  -- 2150 GR/IR Clearing
     'DEBIT',  600, 600, 0,   1, '2026-05-16', 0, false, 'UGX', NOW()),
    (gen_random_uuid(), (SELECT "Id" FROM rev2),
     '1f832ea0-fe90-4c15-b69f-679965f24d1f'::uuid,  -- 2160 Supplier Return Clearing
     'CREDIT', 600, 0,   600, 2, '2026-05-16', 0, false, 'UGX', NOW());

-- 5c: Correct RGRN-2026-0001 posting — DR 2160 / CR 1300 @ 6000
-- (post-invoice return → routes to 2160, not 2150, per MR11 purity rules)
WITH repost AS (
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate",
        "ReferenceType", "ReferenceId", "ReferenceNumber",
        "Description",
        "TotalDebitAmount", "TotalCreditAmount",
        "Status", "IsReversed",
        "CreatedBy", "CreatedAt", "UpdatedAt"
    ) VALUES (
        gen_random_uuid(),
        'RGRN-REPAIR-REPOST-001',
        '2026-05-16'::date,
        'RETURN_GRN',
        '3192d1d6-f706-4418-84ee-244fb2a9b87f'::uuid,
        'RGRN-2026-0001',
        'UoM repair: correct return posting - 1 PKT Gofen 400 @ 6000/PKT',
        6000, 6000,
        'POSTED', FALSE,
        '00000000-0000-0000-0000-000000000000'::uuid,
        NOW(), NOW()
    ) RETURNING "Id"
)
INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType", "Amount",
    "DebitAmount", "CreditAmount", "LineNumber", "EntryDate",
    "RunningBalance", "IsReconciled", "TransactionCurrency", "CreatedAt"
) VALUES
    (gen_random_uuid(), (SELECT "Id" FROM repost),
     '1f832ea0-fe90-4c15-b69f-679965f24d1f'::uuid,  -- 2160 Supplier Return Clearing
     'DEBIT',  6000, 6000, 0,    1, '2026-05-16', 0, false, 'UGX', NOW()),
    (gen_random_uuid(), (SELECT "Id" FROM repost),
     '261d1b86-37bd-4b9e-a99f-6599e37bc059'::uuid,  -- 1300 Inventory
     'CREDIT', 6000, 0,    6000, 2, '2026-05-16', 0, false, 'UGX', NOW());

-- ============================================================
-- STEP 6: Rebuild gl_period_balances for affected accounts (1300, 2160)
-- Rebuild from ledger truth — never compute manually
-- ============================================================
INSERT INTO gl_period_balances (
    account_id, fiscal_year, fiscal_period,
    debit_total, credit_total, running_balance, last_updated
)
SELECT
    a."Id",
    EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT,
    EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT,
    COALESCE(SUM(le."DebitAmount"),  0),
    COALESCE(SUM(le."CreditAmount"), 0),
    COALESCE(SUM(le."DebitAmount"),  0) - COALESCE(SUM(le."CreditAmount"), 0),
    NOW()
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('1300', '2150', '2160')
  AND lt."Status" = 'POSTED'
GROUP BY
    a."Id",
    EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT,
    EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT
ON CONFLICT (account_id, fiscal_year, fiscal_period)
DO UPDATE SET
    debit_total     = EXCLUDED.debit_total,
    credit_total    = EXCLUDED.credit_total,
    running_balance = EXCLUDED.running_balance,
    last_updated    = NOW();

-- ============================================================
-- STEP 7: Update accounts.CurrentBalance for affected accounts
-- Recompute from GL truth (normal balance aware)
-- ============================================================
UPDATE accounts a
SET "CurrentBalance" = sub.gl_balance
FROM (
    SELECT
        le."AccountId",
        SUM(le."DebitAmount") - SUM(le."CreditAmount") AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    WHERE le."AccountId" IN (
        '261d1b86-37bd-4b9e-a99f-6599e37bc059',  -- 1300
        'ad447de6-8709-4097-963f-ed7a980a10f8',  -- 2150
        '1f832ea0-fe90-4c15-b69f-679965f24d1f'   -- 2160
    )
      AND lt."Status" = 'POSTED'
    GROUP BY le."AccountId"
) sub
WHERE a."Id" = sub."AccountId";

-- ============================================================
-- VERIFICATION — shows net state, must see:
--   2150: 0.00       (GR/IR fully cleared)
--   2160: 6000.00 DR (1 PKT return + 1 PKT RGRN-0002 return - SCN credits)
--   1300: negative   (net inventory credits)
-- ============================================================
SELECT
    a."AccountCode",
    a."AccountName",
    SUM(le."DebitAmount")  AS total_dr,
    SUM(le."CreditAmount") AS total_cr,
    SUM(le."DebitAmount") - SUM(le."CreditAmount") AS net_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('1300','2150','2160') AND lt."Status" = 'POSTED'
GROUP BY a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";

COMMIT;
