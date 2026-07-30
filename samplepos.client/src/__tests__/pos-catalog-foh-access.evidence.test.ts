import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('POS catalog FOH access (waiter without pos.read)', () => {
  it('GET /inventory/pos/catalog accepts pos.read OR restaurant.read', () => {
    const routes = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/inventory/inventoryRoutes.ts'),
      'utf8',
    );
    expect(routes).toMatch(
      /\/pos\/catalog[\s\S]*?requireAnyPermission\(\[\s*'pos\.read'\s*,\s*'restaurant\.read'\s*\]\)/,
    );
    expect(routes).not.toMatch(
      /inventoryRoutes\.get\(\s*'\/pos\/catalog'\s*,\s*authenticate\s*,\s*requirePermission\('pos\.read'\)/,
    );
  });

  it('client skips catalog sync when cached RBAC lacks catalog permissions', () => {
    const svc = readFileSync(
      resolve(here, '../services/offlineCatalogService.ts'),
      'utf8',
    );
    const offline = readFileSync(
      resolve(here, '../contexts/OfflineContext.tsx'),
      'utf8',
    );
    expect(svc).toContain("POS_CATALOG_PERMISSIONS = ['pos.read', 'restaurant.read']");
    expect(svc).toContain('canSyncPosCatalogFromCache');
    expect(svc).toContain('if (!canSyncPosCatalogFromCache())');
    expect(offline).toContain('canSyncPosCatalogFromCache');
  });
});
