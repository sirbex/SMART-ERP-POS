/**
 * Quotation product pick — same MUoM + selling price rules as POS catalog (stock-levels).
 */
import type { CachedProductUom } from '../services/offlineCatalogService';

export type StockProductUom = CachedProductUom;

export interface StockLevelProductRow {
  product_id: string;
  product_name: string;
  sku?: string;
  selling_price?: number | string;
  average_cost?: number | string;
  total_stock?: number | string;
  is_taxable?: boolean;
  tax_rate?: number | string;
  product_type?: string;
  barcode?: string;
  generic_name?: string;
  uoms?: StockProductUom[];
  /** @deprecated use uoms[] — not returned by stock-levels API */
  uom_id?: string;
  uom_name?: string;
}

export function displayProductUomName(uom: Pick<StockProductUom, 'name' | 'symbol'>): string {
  return (uom.symbol?.trim() || uom.name).trim();
}

/** Same fallback as POS offlineCatalogService when product_uoms missing. */
export function normalizeStockLevelUoms(
  item: StockLevelProductRow,
): StockProductUom[] {
  const sellingPrice = parseFloat(String(item.selling_price ?? '0')) || 0;
  const averageCost = parseFloat(String(item.average_cost ?? '0')) || 0;
  let uoms = item.uoms ?? [];
  if (uoms.length === 0) {
    uoms = [
      {
        uomId: `default-${item.product_id}`,
        name: 'PIECE',
        symbol: 'PIECE',
        conversionFactor: 1,
        isDefault: true,
        price: sellingPrice,
        cost: averageCost,
      },
    ];
  }
  return uoms;
}

export function pickDefaultProductUom(uoms: StockProductUom[]): StockProductUom {
  return uoms.find((u) => u.isDefault) || uoms[0];
}

export function findProductUom(
  uoms: StockProductUom[],
  uomId: string | null | undefined,
): StockProductUom | undefined {
  if (!uomId) return undefined;
  return uoms.find((u) => u.uomId === uomId);
}

export interface QuoteLineFromStock {
  productId: string;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  uomId: string;
  uomName: string;
  availableUoms: StockProductUom[];
  stockOnHand: number;
  isTaxable: boolean;
  taxRate: number;
}

/** Build quotation line fields when user picks a product from inventory search. */
export function buildQuoteLineFromStockProduct(
  product: StockLevelProductRow,
): QuoteLineFromStock {
  const availableUoms = normalizeStockLevelUoms(product);
  const selected = pickDefaultProductUom(availableUoms);
  const unitPrice = Number(selected.price) || parseFloat(String(product.selling_price ?? '0')) || 0;

  return {
    productId: product.product_id,
    sku: product.sku,
    description: product.product_name,
    quantity: 1,
    unitPrice,
    uomId: selected.uomId.startsWith('default-') ? '' : selected.uomId,
    uomName: displayProductUomName(selected),
    availableUoms,
    stockOnHand: Number(product.total_stock ?? 0),
    isTaxable: product.is_taxable ?? false,
    taxRate: parseFloat(String(product.tax_rate ?? '18')) || 0,
  };
}

/** POS-style: switching selling UoM updates display unit price from catalog price. */
export function applySellingUomToQuoteLine(
  availableUoms: StockProductUom[],
  uomId: string,
): { uomId: string; uomName: string; unitPrice: number } | null {
  const selected = findProductUom(availableUoms, uomId);
  if (!selected) return null;
  const id = selected.uomId.startsWith('default-') ? '' : selected.uomId;
  return {
    uomId: id,
    uomName: displayProductUomName(selected),
    unitPrice: Number(selected.price) || 0,
  };
}
