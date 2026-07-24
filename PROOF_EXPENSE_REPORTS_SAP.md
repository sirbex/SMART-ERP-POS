# Expense Reports — SAP Column Chooser + Business Logic

**Date:** 2026-07-24  
**Acceptance:** proof tests only

## Proof command

```bash
cd samplepos.client
npx vitest run src/__tests__/expense-reports-sap-proof.test.ts
```

## What is proven

| Check | Assertion |
|--|--|
| Column chooser | `Columns3`, `toggleColumn`, `Display columns`, layout key `expense-reports-layout-v1` |
| No raw dump UI | No `Object.keys(data[0])` / `Object.entries(data).map` table headers |
| Business KPIs | Recognized (P&L), Unpaid AP, `recognizedAmount`, `unpaidApAmount` |
| No twin columns | Defaults use `category` + `glAccount` only (not name+code twins) |
| Aggregations | `CANCELLED` excluded; `APPROVED`+`PAID` = recognized |

## Related expense proofs (must also pass)

```bash
npx vitest run \
  src/__tests__/expense-reports-sap-proof.test.ts \
  src/__tests__/expense-category-gl-proof.test.ts \
  src/__tests__/expenses-petty-ux-proof.test.ts
```

| Proof | File |
|--|--|
| Reports SAP UI + business columns | `expense-reports-sap-proof.test.ts` |
| Category ↔ GL consistency | `expense-category-gl-proof.test.ts` |
| Expenses vs Petty UX | `expenses-petty-ux-proof.test.ts` |
