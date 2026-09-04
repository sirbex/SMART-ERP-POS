# PROOF_AGED_SALE_RETURN_ADMIN_ONLY

Verdict: **PASS** (13/13)

Policy: returns/exchanges on sales older than **30 days** require **ADMIN**.

- PASS `LIMIT_30`: days=30
- PASS `DAY_31_AGED`: 31 days is aged
- PASS `DAY_30_NOT_AGED`: exactly 30 days still allowed for non-admin
- PASS `ADMIN_OK`: ADMIN
- PASS `SUPER_ADMIN_OK`: SUPER_ADMIN
- PASS `MANAGER_NOT_ADMIN`: MANAGER/CASHIER are not absolute admin
- PASS `CASHIER_AGED_DENY`: ageDays=74
- PASS `ADMIN_AGED_ALLOW`: ADMIN may return aged sales
- PASS `CASHIER_FRESH_ALLOW`: fresh sale
- PASS `SERVICE_USES_POLICY`: refundSale looks up users.role and applies aged policy
- PASS `EXCHANGE_USES_REFUND_SALE`: guided exchange goes through refundSale (same gate)
- PASS `UI_IMPORTS_POLICY`: SalesPage imports aged return policy
- PASS `UI_DISABLES_BUTTONS`: Return/Exchange disabled with ADMIN-only hint
