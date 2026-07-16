════════════════════════════════════════════════════════════════════════
 PROOF — Customer detail WHT read inconsistency fix
 Generated: 2026-07-16T05:44:44.973Z
════════════════════════════════════════════════════════════════════════

Root cause: findCustomerById used a private SELECT without wht_liable,
so update saved correctly but overview always showed Not liable.

── 1. Source: findCustomerById uses CUSTOMER_SELECT (includes WHT) ──
✓ CUSTOMER_SELECT includes whtLiable
✓ findCustomerById uses CUSTOMER_SELECT + CUSTOMER_FROM_JOIN
✓ findCustomerByEmail uses CUSTOMER_SELECT
✓ findCustomerByNumber uses CUSTOMER_SELECT
✓ searchCustomers uses CUSTOMER_SELECT

── 2. Live DB: CUST-0006 save vs detail SELECT shape ──
✓ CUST-0006 DB wht_liable=true (default_wht_type_id=a74aa08f-e236-43d8-8c26-7e5639beacee)
✓ Detail SELECT returns whtLiable=true for CUST-0006 (becca becca)
✓ GET /api/customers/:id returns whtLiable=true for CUST-0006

── 3. Unit tests (partner WHT) ──
RUN  v3.2.4 C:/Users/Chase/source/repos/SamplePOS/samplepos.client

 ✓ src/__tests__/partner-wht-default.test.ts (4 tests) 11ms
 ✓ src/__tests__/partner-wht-offline.test.ts (4 tests) 11ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  08:44:42
   Duration  1.83s (transform 188ms, setup 0ms, collect 342ms, tests 22ms, environment 2ms, prepare 1.70s)
✓ vitest partner-wht suites PASS

RESULT: PASS

