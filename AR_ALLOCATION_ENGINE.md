# AR Open-Item Allocation Engine (SAP / Odoo parity)

## Current state vs target

| Layer | Today (henber) | Target |
|-------|----------------|--------|
| AP | `supplier_payments` + `supplier_payment_allocations` | ✅ Reference model |
| AR | Per-invoice `invoice_payments` only; lump `customer_credit_transactions` | `ar_customer_payments` + `ar_payment_allocations` |
| Balance SSOT | `SUM(invoices.amount_due)` | Open items − unallocated receipts |
| GL | Per-invoice or lump customer payment | **One** receipt journal; allocations link only |

## Architecture (strict separation)

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│ ar_customer_payments│────▶│ ar_payment_allocations   │────▶│ invoices        │
│ (financial receipt) │     │ (reconciliation SSOT)  │     │ (open items)    │
└─────────┬───────────┘     └──────────────────────────┘     └─────────────────┘
          │                              │
          ▼                              ▼
   GL: DR Undeposited / CR AR      invoice_payments (audit line)
          │                              │
          └──────────┬───────────────────┘
                     ▼
          openItemAllocationEngine
                     ▼
          customers.balance + aging + statements
```

**Rules enforced in code (`openItemAllocationEngine.ts`):**

1. Open invoice balance = `invoice.total − SUM(active allocations) ± CN/DN` (via `invoiceRepository.getInvoiceSettlement`).
2. Payment unallocated = `payment.amount − SUM(active allocations on payment)`.
3. Customer balance = `SUM(open invoice amount_due) − SUM(payment.unallocated_amount)` for posted payments.
4. Allocations never exceed invoice open or payment unallocated.
5. Posted documents: `ACTIVE` → `REVERSED` only (no hard delete).
6. GL posted once on payment receipt; allocation does not post GL (FX later).

## Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Tables 418, engine, `ar-payments` API, FIFO/manual allocate, reversal, proof | Done |
| **2** | Customer Payments UI (`/accounting/customer-payments`) | Done |
| **3** | Retire lump `recordCustomerPayment` without allocation | Next |
| **4** | Multi-currency FX journals | Next |
| **5** | Statement/aging from allocations only; integrity diagnostics | Next |

## API (`/api/ar-payments`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/` | Post receipt + optional FIFO allocation |
| GET | `/customer/:customerId/open-invoices` | Open items for grid |
| GET | `/:paymentId` | Payment + allocations |
| POST | `/:paymentId/allocate` | Manual / exact / due-date allocation |
| POST | `/allocations/:allocationId/reverse` | Enterprise reversal |

## Proof

```bash
npm run proof:ar-allocation:local
```

## Integrity

```bash
cd SamplePOS.Server && npm run test -- openItemAllocationEngine
```

Expected: `SUM(customers.balance)` ties to open items − unallocated receipts; allocations ⊆ invoice open.
