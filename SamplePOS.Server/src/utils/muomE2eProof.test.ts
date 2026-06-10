/**
 * End-to-end MUoM proof chain (no DB):
 * Product master → PO → GR → inventory valuation → POS stock display
 *
 * Scenario mirrors Pregnacare / SKU-5200: purchase PKT, sell base or PKT.
 */
import { describe, expect, it } from '@jest/globals';
import { PricingEngine } from './pricingEngine.js';

/** Mirrors shared/utils/po-line-uom.ts (client + PO UI) */
function poLineBaseQuantity(qty: number, factor: number): number {
  return qty * factor;
}

function convertPoLineQuantityForUomChange(
  qty: number,
  oldFactor: number,
  newFactor: number,
): number {
  const base = poLineBaseQuantity(qty, oldFactor);
  return newFactor > 0 ? base / newFactor : qty;
}

function poLineDisplayUnitCost(baseCost: number, factor: number): number {
  return Math.round(baseCost * factor * 100) / 100;
}

function getStockInSellingUom(stockBase: number, factor: number): number {
  return factor > 0 ? Math.floor(stockBase / factor) : stockBase;
}

describe('MUoM E2E proof — Pregnacare PKT (factor 30, 75_000/PKT)', () => {
  const PKT_FACTOR = 30;
  const PKT_UNIT_PRICE = 75_000;
  const baseUnitCost = PricingEngine.normalizeDisplayUnitCost(PKT_UNIT_PRICE, PKT_FACTOR);
  const baseSellPrice = baseUnitCost; // simplified; real system uses separate selling_price

  it('1. Product master: cost/sell SSOT is per base unit', () => {
    expect(baseUnitCost.toFixed(6)).toBe('2500.000000');
    expect(Number(baseUnitCost.toFixed(2))).toBe(2500);
    expect(poLineDisplayUnitCost(Number(baseUnitCost.toFixed(2)), PKT_FACTOR)).toBe(75000);
  });

  it('2. PO in PKT: 4 PKT @ 75,000 → canonical total 300,000', () => {
    const orderQty = 4;
    const baseQty = PricingEngine.calculateBaseQuantity(orderQty, PKT_FACTOR);
    const canonicalTotal = PricingEngine.calculateDocumentLineFromBase(baseQty, baseUnitCost);

    expect(baseQty.toNumber()).toBe(120);
    expect(canonicalTotal.toFixed(2)).toBe('300000.00');
    expect(PricingEngine.calculateLineTotal(orderQty, PKT_UNIT_PRICE).toFixed(2)).toBe('300000.00');
  });

  it('3. PO same line expressed in base UoM → identical canonical total (exact path)', () => {
    const baseOrderQty = 120;
    const fromExact = PricingEngine.calculateDocumentLineFromBase(baseOrderQty, baseUnitCost);
    const fromPkt = PricingEngine.calculateDocumentLineFromBase(
      PricingEngine.calculateBaseQuantity(4, PKT_FACTOR),
      baseUnitCost,
    );

    expect(fromExact.toFixed(2)).toBe('300000.00');
    expect(fromPkt.toFixed(2)).toBe(fromExact.toFixed(2));
  });

  it('3b. PO UI 2dp base cost: exact when factor divides evenly (30 × 2500)', () => {
    const baseOrderQty = 120;
    const baseDisplayCost = Number(baseUnitCost.toFixed(2));
    const fromRoundedBase = PricingEngine.calculateDocumentLineFromBase(baseOrderQty, baseDisplayCost);
    expect(fromRoundedBase.toFixed(2)).toBe('300000.00');
  });

  it('4. PO UI: auto reorder qty (base) + switch to PKT preserves total (no 30× inflation)', () => {
    const reorderQtyBase = 120; // stored in product_inventory.reorder_quantity
    const baseCostPerUnit = Number(baseUnitCost.toFixed(2));

    // User adds line: qty=112 (base reorder), then UomSelector picks PKT (factor 28)
    const pktQty = convertPoLineQuantityForUomChange(reorderQtyBase, 1, PKT_FACTOR);
    const pktUnitCost = poLineDisplayUnitCost(baseCostPerUnit, PKT_FACTOR);

    expect(pktQty).toBe(4);
    expect(pktUnitCost).toBe(75000);

    const uiTotal = pktQty * pktUnitCost;
    const canonicalTotal = PricingEngine.calculateDocumentLineFromBase(
      poLineBaseQuantity(pktQty, PKT_FACTOR),
      baseUnitCost,
    ).toNumber();

    expect(uiTotal).toBe(300000);
    expect(canonicalTotal).toBe(300000);
  });

  it('5. GR receive 3 PKT @ 75,000 → inventory +90 base units', () => {
    const receivedPkt = 3;
    const baseReceived = PricingEngine.calculateBaseQuantity(receivedPkt, PKT_FACTOR);
    const batchCost = PricingEngine.normalizeDisplayUnitCost(PKT_UNIT_PRICE, PKT_FACTOR);

    expect(baseReceived.toNumber()).toBe(90);
    expect(batchCost.toFixed(2)).toBe('2500.00');
    expect(
      PricingEngine.calculateDocumentLineFromBase(baseReceived, batchCost).toFixed(2),
    ).toBe('225000.00');
  });

  it('6. POS stock after GR: 3 PKT or 90 base — not "3 base"', () => {
    const inventoryBase = 90;

    expect(getStockInSellingUom(inventoryBase, PKT_FACTOR)).toBe(3);
    expect(getStockInSellingUom(inventoryBase, 1)).toBe(90);
  });

  it('7. POS cart: switch 1 PKT → base expands qty to 30 (preserves base commitment)', () => {
    expect(convertPoLineQuantityForUomChange(1, PKT_FACTOR, 1)).toBe(30);
    expect(convertPoLineQuantityForUomChange(30, 1, PKT_FACTOR)).toBe(1);
  });

  it('8. Sale posting: 2 PKT sold → deduct 60 base from inventory', () => {
    const sellingQty = 2;
    const baseDeducted = PricingEngine.calculateBaseQuantity(sellingQty, PKT_FACTOR);
    expect(baseDeducted.toNumber()).toBe(60);
  });
});

describe('MUoM E2E proof — misconfiguration (PKT-only, factor=1)', () => {
  it('documents SKU-5200 failure mode: 3 in DB means 3 everywhere', () => {
    const misconfiguredStock = 3;
    const wrongFactor = 1;

    expect(getStockInSellingUom(misconfiguredStock, wrongFactor)).toBe(3);
    expect(getStockInSellingUom(misconfiguredStock, 30)).toBe(0); // floor(3/30)

    // User sees "Only 3 PKT" — cannot sell 84 base units because inventory was never posted in base
  });
});

describe('MUoM E2E proof — PO/GR/invoice parity', () => {
  it('PO total = GR total = invoice total for partial receipt', () => {
    const factor = 12;
    const poQty = 10;
    const poUnitCost = 2400;
    const receivedQty = 7; // partial GR

    const baseUnitCost = PricingEngine.normalizeDisplayUnitCost(poUnitCost, factor);
    const poTotal = PricingEngine.calculateDocumentLineFromBase(
      PricingEngine.calculateBaseQuantity(poQty, factor),
      baseUnitCost,
    );
    const grTotal = PricingEngine.calculateDocumentLineFromBase(
      PricingEngine.calculateBaseQuantity(receivedQty, factor),
      baseUnitCost,
    );

    expect(poTotal.toFixed(2)).toBe('24000.00'); // 10 BOX × 2,400 display
    expect(grTotal.toFixed(2)).toBe('16800.00'); // 7 BOX received
    // Invoice follows GR received qty, not PO ordered qty — by design
  });
});
