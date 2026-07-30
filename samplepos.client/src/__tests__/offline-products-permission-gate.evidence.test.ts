/**
 * Offline prewarm must not call /products without inventory.read (waiter/FOH 403 toast).
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canSyncCustomersReadFromCache,
  canSyncInventoryReadFromCache,
} from '../contexts/OfflineContext';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

function stubLocalStorage(perms: string[] | null) {
  const store = new Map<string, string>();
  if (perms) store.set('rbac_permissions', JSON.stringify(perms));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
}

describe('offline products prewarm permission gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('EVIDENCE: waiters without inventory.read do not sync products', () => {
    stubLocalStorage(['restaurant.read', 'restaurant.order', 'customers.read']);
    expect(canSyncInventoryReadFromCache()).toBe(false);
    expect(canSyncCustomersReadFromCache()).toBe(true);
  });

  it('EVIDENCE: cashiers with inventory.read may sync products', () => {
    stubLocalStorage(['inventory.read', 'pos.create', 'restaurant.pay']);
    expect(canSyncInventoryReadFromCache()).toBe(true);
  });

  it('EVIDENCE: missing RBAC cache fails closed (no speculative /products call)', () => {
    stubLocalStorage(null);
    expect(canSyncInventoryReadFromCache()).toBe(false);
  });

  it('EVIDENCE gate: OfflineContext gates products + silentForbidden; migration 576 heals grants', () => {
    const offline = readRepo('samplepos.client/src/contexts/OfflineContext.tsx');
    expect(offline).toContain('canSyncInventoryReadFromCache');
    expect(offline).toContain("'/products?page=1&limit=5000&includeUoms=true'");
    expect(offline).toMatch(/prewarmProducts[\s\S]*?canSyncInventoryReadFromCache/);
    expect(offline).toContain('silentForbidden: true');

    const api = readRepo('samplepos.client/src/utils/api.ts');
    expect(api).toContain('silentForbidden');
    expect(api).toContain('error.config?.silentForbidden');

    const mig = readRepo('shared/sql/576_rbac_inventory_read_cashier_accountant_heal.sql');
    expect(mig).toContain("'inventory.read'");
    expect(mig).toContain("lower(name) IN ('cashier', 'accountant')");
    expect(mig).not.toMatch(/lower\(name\)\s*=\s*'waiter'/i);
    expect(mig).toMatch(/Waiter intentionally does NOT get inventory\.read/);
  });
});
