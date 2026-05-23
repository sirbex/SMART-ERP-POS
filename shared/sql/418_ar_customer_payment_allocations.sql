-- AR open-item allocation engine (SAP/Odoo-style customer receipts)
-- Payment header + allocation lines; no hard deletes on posted data.

CREATE TABLE IF NOT EXISTS ar_customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
  currency_code VARCHAR(3) NOT NULL DEFAULT 'UGX',
  exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1,
  payment_date DATE NOT NULL,
  reference VARCHAR(200),
  notes TEXT,
  total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount > 0),
  allocated_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  unallocated_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT', 'POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'REVERSED')),
  gl_transaction_id UUID,
  journal_id UUID,
  created_by_id UUID REFERENCES users(id),
  reversed_by_id UUID REFERENCES users(id),
  reversal_of_payment_id UUID REFERENCES ar_customer_payments(id),
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ar_customer_payments_alloc_bounds
    CHECK (allocated_amount + unallocated_amount = total_amount)
);

CREATE INDEX IF NOT EXISTS idx_ar_customer_payments_customer
  ON ar_customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_customer_payments_status
  ON ar_customer_payments(status);
CREATE INDEX IF NOT EXISTS idx_ar_customer_payments_payment_date
  ON ar_customer_payments(payment_date);

CREATE TABLE IF NOT EXISTS ar_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES ar_customer_payments(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  invoice_payment_id UUID REFERENCES invoice_payments(id),
  amount_allocated NUMERIC(18, 2) NOT NULL CHECK (amount_allocated > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'UGX',
  exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1,
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  allocation_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
    CHECK (allocation_type IN ('MANUAL', 'FIFO', 'EXACT', 'DUE_DATE')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVERSED')),
  reversal_of_allocation_id UUID REFERENCES ar_payment_allocations(id),
  reversed_by_id UUID REFERENCES users(id),
  reversed_at TIMESTAMPTZ,
  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_payment_allocations_payment
  ON ar_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_ar_payment_allocations_invoice
  ON ar_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_payment_allocations_status
  ON ar_payment_allocations(status);

COMMENT ON TABLE ar_customer_payments IS 'AR payment receipt header (one bank receipt, many invoice allocations)';
COMMENT ON TABLE ar_payment_allocations IS 'Open-item reconciliation: links payment to invoice; SSOT for settlement';
