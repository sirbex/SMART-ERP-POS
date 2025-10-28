import { Prisma, PrismaClient, MovementType, DocumentType } from '@prisma/client';
import { Decimal } from 'decimal.js';

export type ValuationRecordInput = {
  productId: string;
  movementType: MovementType;
  quantity: number;
  unitCost: number;
  totalCost?: number; // optional, computed if not provided
  movementId?: string | null;
  batchId?: string | null;
  sourceDocType?: DocumentType | null;
  sourceDocId?: string | null;
  reference?: string | null;
  performedById: string;
};

export class ValuationService {
  // Accept a transaction client or a normal Prisma client
  static async record(
    trx: PrismaClient | Prisma.TransactionClient,
    input: ValuationRecordInput
  ) {
    // Basic input validation
    if (!input.productId) throw new Error('Valuation record requires productId');
    if (!input.performedById) throw new Error('Valuation record requires performedById');
    if (!Object.values(MovementType).includes(input.movementType)) {
      throw new Error(`Invalid movementType: ${input.movementType}`);
    }

    const qty = new Decimal(input.quantity);
    const unit = new Decimal(input.unitCost);

    if (!qty.isFinite()) throw new Error('Quantity must be finite');
    if (!unit.isFinite()) throw new Error('Unit cost must be finite');
    if (qty.lt(0)) throw new Error('Quantity cannot be negative');
    if (unit.lt(0)) throw new Error('Unit cost cannot be negative');
    if (qty.eq(0)) throw new Error('Quantity cannot be zero for valuation entry');

    // Compute total with proper precision
    const total = input.totalCost !== undefined ? new Decimal(input.totalCost) : qty.mul(unit);

    // Align to DB scales: quantity (4 dp), unitCost (2 dp), totalCost (2 dp)
    const qtyStr = qty.toDecimalPlaces(4).toFixed(4);
    const unitStr = unit.toDecimalPlaces(2).toFixed(2);
    const totalStr = total.toDecimalPlaces(2).toFixed(2);

    try {
      // Cast to any to avoid transient TS errors before Prisma Client is regenerated
      return (trx as any).stockValuationLayer.create({
        data: {
          productId: input.productId,
          movementType: input.movementType,
          quantity: qtyStr,
          unitCost: unitStr,
          totalCost: totalStr,
          movementId: input.movementId ?? null,
          batchId: input.batchId ?? null,
          sourceDocType: input.sourceDocType ?? null,
          sourceDocId: input.sourceDocId ?? null,
          reference: input.reference ?? null,
          performedById: input.performedById,
        },
      });
    } catch (err: any) {
      // Surface a precise error for better diagnostics
      const message = err?.message || String(err);
      throw new Error(`Failed to create valuation layer: ${message}`);
    }
  }
}
