-- 596: Heal sales.tax_restatement for Manager + Admin + Accountant
-- Apply omitted VAT is a privileged correction; cashiers stay excluded.
-- Aligns live rbac_role_permissions with systemRoleGrants SSOT
-- (Accountant has sales.tax_restatement in SYSTEM_ACCOUNTANT_EXTRA_KEYS;
-- Manager gets sales.* via SYSTEM_MANAGER_MODULES).

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'sales.tax_restatement',
  'sales',
  'update',
  'Restate tax on posted sales/invoices from product+customer DocumentTax rules (omit-VAT correction; manager/admin/accountant)'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.tax_restatement', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE lower(r.name) IN (
  'super administrator',
  'administrator',
  'manager',
  'accountant'
)
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO schema_version (version) VALUES (596) ON CONFLICT DO NOTHING;
