/**
 * Audit trail for POS/API sale line price edits and below-cost blocks.
 */
import type { Pool, PoolClient } from 'pg';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { logAction } from '../audit/auditService.js';
import logger from '../../utils/logger.js';

export type SaleLinePriceEventType = 'PRICE_EDIT' | 'BELOW_COST_BLOCKED';

export interface RecordSaleLinePriceEventInput {
  eventType: SaleLinePriceEventType;
  productId: string;
  customerId?: string | null;
  saleId?: string | null;
  originalUnitPrice?: number | null;
  newUnitPrice?: number | null;
  allocatedCostPerSellingUnit: number;
  allocatedTotalCost: number;
  quantity: number;
  uomId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordSaleLinePriceEvent(
  pool: Pool | PoolClient,
  input: RecordSaleLinePriceEventInput,
  context: AuditContext,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sale_line_price_events (
         sale_id, product_id, customer_id, user_id, session_id, terminal_id, request_id,
         event_type, original_unit_price, new_unit_price,
         allocated_cost_per_selling_unit, allocated_total_cost, quantity, uom_id, reason, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10,
         $11, $12, $13, $14, $15, $16::jsonb
       )`,
      [
        input.saleId ?? null,
        input.productId,
        input.customerId ?? null,
        context.userId,
        context.sessionId ?? null,
        (input.metadata?.terminalId as string) ?? null,
        context.requestId ?? null,
        input.eventType,
        input.originalUnitPrice ?? null,
        input.newUnitPrice ?? null,
        input.allocatedCostPerSellingUnit,
        input.allocatedTotalCost,
        input.quantity,
        input.uomId ?? null,
        input.reason ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const severity = input.eventType === 'BELOW_COST_BLOCKED' ? 'WARNING' : 'INFO';
    const action = input.eventType === 'BELOW_COST_BLOCKED' ? 'REJECT' : 'PRICE_OVERRIDE';

    await logAction(
      pool,
      {
        entityType: 'SALE',
        entityId: input.saleId ?? input.productId,
        entityNumber: input.saleId ? undefined : input.productId,
        action,
        severity,
        category: 'FINANCIAL',
        actionDetails:
          input.eventType === 'BELOW_COST_BLOCKED'
            ? `Blocked below-cost sale line for product ${input.productId}`
            : `Sale line unit price changed for product ${input.productId}`,
        oldValues:
          input.originalUnitPrice != null
            ? { unitPrice: input.originalUnitPrice }
            : undefined,
        newValues: {
          ...(input.newUnitPrice != null ? { unitPrice: input.newUnitPrice } : {}),
          eventType: input.eventType,
          allocatedCostPerSellingUnit: input.allocatedCostPerSellingUnit,
          allocatedTotalCost: input.allocatedTotalCost,
          quantity: input.quantity,
          uomId: input.uomId,
          reason: input.reason,
          ...input.metadata,
        },
        tags: ['pos', 'price', input.eventType.toLowerCase()],
      },
      context,
    );
  } catch (error) {
    logger.error('Failed to record sale line price audit event (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
      productId: input.productId,
      eventType: input.eventType,
    });
  }
}
