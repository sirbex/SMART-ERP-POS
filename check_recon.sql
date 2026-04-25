SELECT source, amount, difference, status FROM fn_reconcile_inventory(CURRENT_DATE) ORDER BY source;
