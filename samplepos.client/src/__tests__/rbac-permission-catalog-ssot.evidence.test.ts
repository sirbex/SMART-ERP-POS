/**
 * EVIDENCE: RBAC permission catalog SSOT
 * - SamplePOS.Server/src/rbac/permissions.ts PERMISSION_KEYS is the allowlist for PUT/POST roles
 * - Every key inserted into rbac_permissions_catalog via shared/sql must exist in that allowlist
 * - restaurant.edit_others (migration 573) must be registered or role save fails Zod
 *
 * Run: npx vitest run src/__tests__/rbac-permission-catalog-ssot.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESTAURANT_EDIT_OTHERS_PERMISSION } from '@shared/utils/restaurantCheckOwnership';
import {
  SYSTEM_CASHIER_PERMISSION_KEYS,
  SYSTEM_WAITER_PERMISSION_KEYS,
} from '@shared/authorization/systemRoleGrants';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

/** Keys registered via p('module.action', ...) — including multiline p( forms. */
function extractTsPermissionKeys(src: string): string[] {
  const keys = new Set<string>();
  for (const m of src.matchAll(/p\(\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'/g)) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

function extractSqlCatalogKeys(): string[] {
  const sqlDir = join(repoRoot, 'shared/sql');
  const keys = new Set<string>();
  for (const file of readdirSync(sqlDir).filter((f) => f.endsWith('.sql'))) {
    const text = readFileSync(join(sqlDir, file), 'utf8');
    if (!/INSERT INTO rbac_permissions_catalog/i.test(text)) continue;
    const blocks = text.split(/INSERT INTO rbac_permissions_catalog/i).slice(1);
    for (const block of blocks) {
      const end = block.search(/;\s*(?:--|INSERT|UPDATE|DELETE|ALTER|CREATE|DO\b|$)/i);
      const chunk = block.slice(0, end > 0 ? end : Math.min(block.length, 8000));
      // Catalog rows are (key, module, action, description)
      for (const km of chunk.matchAll(/\(\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'\s*,\s*'[a-z_]+'\s*,/gi)) {
        keys.add(km[1]);
      }
    }
  }
  return [...keys].sort();
}

describe('EVIDENCE — RBAC permission catalog SSOT', () => {
  const permSrc = readRepo('SamplePOS.Server/src/rbac/permissions.ts');
  const permissionKeys = extractTsPermissionKeys(permSrc);

  it('restaurant.edit_others is in PERMISSION_KEYS (role save allowlist)', () => {
    expect(RESTAURANT_EDIT_OTHERS_PERMISSION).toBe('restaurant.edit_others');
    expect(permissionKeys).toContain('restaurant.edit_others');
    expect(permSrc).toMatch(/RESTAURANT_EDIT_OTHERS/);
  });

  it('cashier gets edit_others; waiter never does', () => {
    expect(SYSTEM_CASHIER_PERMISSION_KEYS).toContain('restaurant.edit_others');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.edit_others');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.pay');
  });

  it('every SQL rbac_permissions_catalog key is in TS PERMISSION_KEYS', () => {
    const sqlKeys = extractSqlCatalogKeys();
    expect(sqlKeys.length).toBeGreaterThan(20);
    expect(sqlKeys).toContain('restaurant.edit_others');

    const missing = sqlKeys.filter((k) => !permissionKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('UpdateRoleSchema validates against PERMISSION_KEYS with named invalid keys', () => {
    const validation = readRepo('SamplePOS.Server/src/rbac/validation.ts');
    expect(validation).toMatch(/PERMISSION_KEYS/);
    expect(validation).toMatch(/Invalid permission key\(s\)/);
    expect(validation).toMatch(/superRefine/);
  });
});
