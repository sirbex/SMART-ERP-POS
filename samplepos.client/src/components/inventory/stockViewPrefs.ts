export type StockViewMode = 'company' | 'store';

const STOCK_VIEW_MODE_KEY = 'inventory.stockViewMode';

export function readStockViewMode(): StockViewMode {
  try {
    const v = localStorage.getItem(STOCK_VIEW_MODE_KEY);
    return v === 'store' ? 'store' : 'company';
  } catch {
    return 'company';
  }
}

export function writeStockViewMode(mode: StockViewMode): void {
  try {
    localStorage.setItem(STOCK_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
