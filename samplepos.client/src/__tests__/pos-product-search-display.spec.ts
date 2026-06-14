import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchSrc = fs.readFileSync(path.join(root, 'pages/pos/POSProductSearch.tsx'), 'utf8');
const repoSrc = fs.readFileSync(
  path.resolve(root, '../../SamplePOS.Server/src/modules/inventory/inventoryRepository.ts'),
  'utf8',
);
const catalogSrc = fs.readFileSync(
  path.join(root, 'services/offlineCatalogService.ts'),
  'utf8',
);

describe('POS product search display contract', () => {
  it('shows selling price and category in search results', () => {
    expect(searchSrc).toContain('formatCurrency(p.sellingPrice)');
    expect(searchSrc).toContain('p.category');
    expect(searchSrc).toContain('Margin:');
    expect(searchSrc).toContain('Qty:');
    expect(searchSrc).toContain('searchCachedProducts');
  });

  it('does not render SKU in the search dropdown rows', () => {
    expect(searchSrc).not.toMatch(/SKU:\s*\{p\.sku\}/);
    expect(searchSrc).not.toMatch(/SKU:\s*\{selected\.sku\}/);
  });

  it('stock-levels API includes category for online and offline sync', () => {
    expect(repoSrc).toMatch(/p\.category/);
    expect(catalogSrc).toContain('category?: string');
    expect(catalogSrc).toContain('category: item.category');
  });

  it('stock-levels API falls back to base_uom_id when product_uoms is empty', () => {
    expect(repoSrc).toMatch(/COALESCE\([\s\S]*product_uoms pu[\s\S]*p\.base_uom_id/s);
  });
});
