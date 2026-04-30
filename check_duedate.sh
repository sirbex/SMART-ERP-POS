#!/bin/bash
for db in pos_system pos_tenant_acme_store pos_tenant_blis pos_tenant_dynamics pos_tenant_henber_pharmacy; do
  nullable=$(docker exec smarterp-postgres psql -U postgres -d "$db" -tc \
    "SELECT is_nullable FROM information_schema.columns WHERE table_name='supplier_invoices' AND column_name='DueDate'" \
    2>/dev/null | tr -d ' ')
  echo "$db: DueDate nullable=$nullable"
done
