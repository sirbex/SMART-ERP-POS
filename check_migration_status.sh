#!/bin/bash
# Check migration status across all tenant DBs
for db in pos_system pos_tenant_acme_store pos_tenant_blis pos_tenant_dynamics pos_tenant_henber_pharmacy; do
  # Check migration 513: is_posted_to_gl column
  m513=$(docker exec smarterp-postgres psql -U postgres -d "$db" -tc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='supplier_invoices' AND column_name='is_posted_to_gl'" 2>/dev/null | tr -d ' ')
  
  # Check migration 514: HIST_GRN_REROUTE idempotency keys in ledger_transactions
  m514=$(docker exec smarterp-postgres psql -U postgres -d "$db" -tc "SELECT COUNT(*) FROM ledger_transactions WHERE \"IdempotencyKey\" LIKE 'HIST_GRN_REROUTE%'" 2>/dev/null | tr -d ' ')
  
  # Check supplier_invoice_grn_links table
  links=$(docker exec smarterp-postgres psql -U postgres -d "$db" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='supplier_invoice_grn_links'" 2>/dev/null | tr -d ' ')
  
  # Check tenants table for slug
  slug=$(docker exec smarterp-postgres psql -U postgres -d "$db" -tc "SELECT slug FROM tenants LIMIT 1" 2>/dev/null | tr -d ' ')
  
  echo "=== $db ==="
  echo "  Migration 513 (is_posted_to_gl): $m513"
  echo "  Migration 514 (HIST_GRN_REROUTE rows): $m514"
  echo "  supplier_invoice_grn_links: $links"
  echo "  tenant slug: $slug"
done
