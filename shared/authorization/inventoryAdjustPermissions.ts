/**
 * Stock adjustment permission SSOT.
 *
 * Historical split:
 * - Client Adjustments page gated on `inventory.adjust`
 * - Server POST /inventory/adjust gated on `inventory.approve`
 *
 * Both mean "may change stock quantities". Accept either so Role UI ticks work.
 */
export const INVENTORY_STOCK_ADJUST_PERMISSIONS = [
  'inventory.adjust',
  'inventory.approve',
] as const;

export type InventoryStockAdjustPermission =
  (typeof INVENTORY_STOCK_ADJUST_PERMISSIONS)[number];

export function isInventoryStockAdjustPermission(key: string): boolean {
  return (INVENTORY_STOCK_ADJUST_PERMISSIONS as readonly string[]).includes(key);
}
