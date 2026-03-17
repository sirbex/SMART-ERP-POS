// Product History Service - business logic aggregation

import Decimal from 'decimal.js';
import type pg from 'pg';
import { productHistoryRepository } from './productHistoryRepository.js';
import * as productRepository from './productRepository.js';
import type {
  ProductHistoryItem,
  ProductHistorySummary,
} from '../../../../shared/zod/product-history.js';

export interface HistoryServiceFilters {
  startDate?: string;
  endDate?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export const productHistoryService = {
  async getProductHistory(
    productId: string,
    filters: HistoryServiceFilters = {},
    dbPool?: pg.Pool
  ): Promise<{
    items: ProductHistoryItem[];
    summary: ProductHistorySummary;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100;

    // Fetch product for costing method
    const product = await productRepository.findProductById(productId, dbPool);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Fetch all event types (filter by type later if provided)
    const [grRows, saleRows, moveRows] = await Promise.all([
      productHistoryRepository.getGoodsReceiptEvents(productId, filters, dbPool),
      productHistoryRepository.getSaleEvents(productId, filters, dbPool),
      productHistoryRepository.getStockMovementEvents(
        productId,
        filters.type ? { ...filters, type: filters.type } : filters,
        dbPool
      ),
    ]);

    // Normalize records to ProductHistoryItem
    const normalized: ProductHistoryItem[] = [];

    for (const r of grRows) {
      normalized.push({
        eventDate: r.event_date,
        type: 'GOODS_RECEIPT',
        quantityChange: new Decimal(r.quantity_change || r.received_quantity || 0).toNumber(),
        unitCost: r.unit_cost ?? undefined,
        totalCost: r.total_cost ?? undefined,
        batchNumber: r.batch_number ?? null,
        expiryDate: r.expiry_date ?? null,
        uomId: r.uom_id ?? undefined,
        uomName: r.uom_name ?? undefined,
        uomSymbol: r.uom_symbol ?? undefined,
        reference: {
          grId: r.gr_id,
          grNumber: r.gr_number,
          grStatus: r.gr_status ?? undefined,
          receivedDate: r.received_date ?? undefined,
          supplierDeliveryNote: r.supplier_delivery_note ?? undefined,
          poId: r.po_id ?? undefined,
          poNumber: r.po_number ?? undefined,
          supplierId: r.supplier_id ?? undefined,
          supplierName: r.supplier_name ?? undefined,
          receivedByName: r.received_by_name ?? undefined,
          orderedQuantity: r.ordered_quantity ?? undefined,
          poUnitPrice: r.po_unit_price ?? undefined,
          qtyVariance: r.qty_variance ?? undefined,
          costVariance: r.cost_variance ?? undefined,
        },
      });
    }

    for (const r of saleRows) {
      normalized.push({
        eventDate: r.event_date,
        type: 'SALE',
        quantityChange: new Decimal(r.quantity_change || -r.quantity || 0).toNumber(),
        unitPrice: r.unit_price ?? undefined,
        lineTotal: r.line_total ?? undefined,
        unitCost: r.cost_price ?? undefined,
        uomId: r.uom_id ?? undefined,
        uomName: r.uom_name ?? undefined,
        uomSymbol: r.uom_symbol ?? undefined,
        reference: {
          saleId: r.sale_id,
          saleNumber: r.sale_number,
          saleStatus: r.sale_status ?? undefined,
          customerId: r.customer_id ?? undefined,
          customerName: r.customer_name ?? undefined,
          soldByName: r.sold_by_name ?? undefined,
          paymentMethod: r.payment_method ?? undefined,
          paymentReceived: r.payment_received ?? undefined,
          changeAmount: r.change_amount ?? undefined,
          totalAmount: r.total_amount ?? undefined,
        },
      });
    }

    for (const r of moveRows) {
      normalized.push({
        eventDate: r.event_date,
        type: r.type,
        quantityChange: new Decimal(r.quantity_change || r.quantity || 0).toNumber(),
        batchNumber: r.batch_number ?? null,
        expiryDate: r.expiry_date ?? null,
        uomId: r.uom_id ?? undefined,
        uomName: r.uom_name ?? undefined,
        uomSymbol: r.uom_symbol ?? undefined,
        reference: {
          movementId: r.movement_id,
          referenceType: r.reference_type ?? undefined,
          referenceId: r.reference_id ?? undefined,
          notes: r.notes ?? undefined,
        },
      } as unknown as ProductHistoryItem);
    }

    // Optional type filter applied across all events
    const filtered = filters.type ? normalized.filter((x) => x.type === filters.type) : normalized;

    // Sort desc by date
    filtered.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    // Compute running quantity and valuation (from most recent backwards compute current balance?)
    // We'll compute forward in time for clarity: sort asc, accumulate, then map back to desc ordering
    const asc = [...filtered].sort(
      (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
    );
    let runningQty = new Decimal(0);
    let runningValue = new Decimal(0);
    let totalCostAccumulated = new Decimal(0);

    const withBalanceAsc = asc.map((item) => {
      const qtyChange = new Decimal(item.quantityChange || 0);
      runningQty = runningQty.plus(qtyChange);

      // For valuation:
      // - For receipts (IN): add totalCost to accumulated cost
      // - For sales/OUT: deduct based on averageCost (totalCostAccumulated / runningQty before deduction)
      // - Track average cost as totalCostAccumulated / runningQty

      if (qtyChange.greaterThan(0)) {
        // IN movement: add cost
        const addedCost = item.totalCost
          ? new Decimal(item.totalCost)
          : qtyChange.times(item.unitCost ?? product.costPrice ?? 0);
        totalCostAccumulated = totalCostAccumulated.plus(addedCost);
      } else if (qtyChange.lessThan(0)) {
        // OUT movement: deduct cost
        const qtyBefore = runningQty.minus(qtyChange); // qty before this movement
        const avgCost = qtyBefore.greaterThan(0)
          ? totalCostAccumulated.dividedBy(qtyBefore)
          : new Decimal(0);
        const deductedCost = avgCost.times(qtyChange.abs());
        totalCostAccumulated = totalCostAccumulated.minus(deductedCost);
      }

      runningValue = totalCostAccumulated;
      const avgCost = runningQty.greaterThan(0)
        ? totalCostAccumulated.dividedBy(runningQty)
        : new Decimal(0);

      return {
        ...item,
        runningQuantity: runningQty.toNumber(),
        runningValuation: runningValue.toNumber(),
        averageCost: avgCost.toNumber(),
      } as ProductHistoryItem;
    });

    // Map back to original desc order preserving running balances by matching event identity (timestamp+type+qty)
    const key = (x: ProductHistoryItem) => `${x.eventDate}|${x.type}|${x.quantityChange}`;
    const balanceByKey = new Map(
      withBalanceAsc.map((x) => [
        key(x),
        {
          runningQuantity: x.runningQuantity!,
          runningValuation: x.runningValuation!,
          averageCost: x.averageCost!,
        },
      ])
    );
    const withBalanceDesc = filtered.map((x) => {
      const bal = balanceByKey.get(key(x));
      return {
        ...x,
        runningQuantity: bal?.runningQuantity,
        runningValuation: bal?.runningValuation,
        averageCost: bal?.averageCost,
      } as ProductHistoryItem;
    });

    // Compute summary stats
    const summary: ProductHistorySummary = {
      firstMovementDate: asc.length > 0 ? asc[0].eventDate : undefined,
      lastMovementDate: asc.length > 0 ? asc[asc.length - 1].eventDate : undefined,
      totalInQuantity: asc
        .filter((x) => new Decimal(x.quantityChange || 0).greaterThan(0))
        .reduce((sum, x) => sum.plus(x.quantityChange || 0), new Decimal(0))
        .toNumber(),
      totalOutQuantity: asc
        .filter((x) => new Decimal(x.quantityChange || 0).lessThan(0))
        .reduce((sum, x) => sum.plus(new Decimal(x.quantityChange || 0).abs()), new Decimal(0))
        .toNumber(),
      netQuantityChange: asc
        .reduce((sum, x) => sum.plus(x.quantityChange || 0), new Decimal(0))
        .toNumber(),
      totalInValue: asc
        .filter((x) => new Decimal(x.quantityChange || 0).greaterThan(0))
        .reduce((sum, x) => sum.plus(x.totalCost || 0), new Decimal(0))
        .toNumber(),
      totalOutValue: asc
        .filter((x) => new Decimal(x.quantityChange || 0).lessThan(0))
        .reduce((sum, x) => sum.plus(x.lineTotal || 0), new Decimal(0))
        .toNumber(),
      currentValuation:
        asc.length > 0 ? withBalanceAsc[withBalanceAsc.length - 1].runningValuation : undefined,
    };

    const total = withBalanceDesc.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const items = withBalanceDesc.slice(start, start + limit);

    return {
      items,
      summary,
      pagination: { page, limit, total, totalPages },
    };
  },
};
