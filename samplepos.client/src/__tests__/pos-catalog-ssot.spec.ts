import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchSrc = fs.readFileSync(path.join(root, 'pages/pos/POSProductSearch.tsx'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'services/offlineCatalogService.ts'), 'utf8');
const serverSrc = fs.readFileSync(
  path.resolve(root, '../../SamplePOS.Server/src/server.ts'),
  'utf8',
);

describe('POS catalog SSOT — SAP/Odoo offline-first', () => {
  it('POS search reads local catalog, not network per keystroke', () => {
    expect(searchSrc).toContain('searchCachedProducts');
    expect(searchSrc).not.toContain('useQuery');
    expect(searchSrc).not.toContain('api.inventory.stockLevels');
    expect(searchSrc).not.toContain("queryKey: ['pos-search', search]");
  });

  it('catalog sync is deduplicated and emits sync event', () => {
    expect(catalogSrc).toContain('catalogSyncInFlight');
    expect(catalogSrc).toContain('POS_CATALOG_SYNCED_EVENT');
    expect(catalogSrc).toContain('CATALOG_STALE_MS');
  });

  it('authenticated tenant API skips global IP rate limit', () => {
    expect(serverSrc).toContain('if (req.tenantId) return next()');
    expect(serverSrc).not.toMatch(/app\.use\(globalRateLimit\)/);
  });
});
