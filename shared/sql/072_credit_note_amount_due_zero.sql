-- Posted credit/debit notes are not collectible AR open items.
-- AR impact is on the reference invoice (amount_paid / amount_due).
UPDATE invoices
SET amount_paid = total_amount,
    amount_due = 0,
    updated_at = NOW()
WHERE document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')
  AND UPPER(status) IN ('POSTED', 'PAID');
