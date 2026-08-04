/**
 * Kitchen Ops Hub — ADR-005 Phase 6.
 * One-shot business operations so kitchen staff do not walk multi-page draft rounds.
 *
 * Still posts only through existing services (Inventory Engine SSOT).
 */

import type { Pool, PoolClient } from 'pg';
import {
  BusinessError,
  ForbiddenError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  canQuickProduce,
  canStartService,
  recommendKitchenOpsAction,
  type KitchenOpsAction,
} from '../../../../shared/kitchen-production/opsPlan.js';
import { kitchenProductionService } from './kitchenProductionService.js';
import { buffetSessionService } from './buffetSessionService.js';
import { kitchenWasteService } from './kitchenWasteService.js';
import { kitchenAnalyticsService } from './kitchenAnalyticsService.js';
import { isKitchenProductionEnabled } from './kitchenProductionSettings.js';
import type { KitchenProductionDocument } from '../../../../shared/kitchen-production/types.js';
import type { BuffetSession } from './buffetSessionRepository.js';
import type { KitchenWasteDocument } from './kitchenWasteRepository.js';

type Db = Pool | PoolClient;

async function assertEnabled(conn: Db): Promise<void> {
  if (!(await isKitchenProductionEnabled(conn))) {
    throw new ForbiddenError(
      'Kitchen Production is disabled. Turn on Restaurant mode and Enable Kitchen Production in system settings.',
    );
  }
}

async function hasTable(conn: Db, table: string): Promise<boolean> {
  const r = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table],
  );
  return r.rows.length > 0;
}

export type KitchenOpsBoard = {
  serviceDate: string;
  nextAction: KitchenOpsAction;
  openSessions: Array<{
    id: string;
    documentNumber: string;
    name: string;
    status: string;
    coverProductId: string;
    coverProductName?: string;
    expectedCovers: number;
    soldCovers: number;
    remainingCovers: number | null;
    allowOverbook: boolean;
  }>;
  todayBatches: {
    count: number;
    totalIngredientCost: number;
    totalOutputQty: number;
    items: Array<{
      id: string;
      documentNumber: string;
      status: string;
      outputProductName?: string;
      outputQtyBase: number;
      totalIngredientCost: number;
    }>;
  };
  preparedStock: Array<{
    productId: string;
    productName: string;
    qtyOnHand: number;
  }>;
  todayWaste: {
    count: number;
    totalCost: number;
  };
  kpis: {
    productionCost: number;
    wasteCost: number;
    soldCovers: number;
    coverRevenue: number;
    foodCostPercent: number | null;
  };
};

export const kitchenOpsService = {
  /**
   * Central day board for the kitchen: stock, open sessions, KPIs, next action.
   */
  async getBoard(pool: Pool, opts?: { serviceDate?: string }): Promise<KitchenOpsBoard> {
    await assertEnabled(pool);
    const serviceDate = (opts?.serviceDate || getBusinessDate()).slice(0, 10);

    let openSessions: KitchenOpsBoard['openSessions'] = [];
    if (await hasTable(pool, 'kitchen_buffet_sessions')) {
      const sessions = await buffetSessionService.list(pool, {
        status: 'OPEN',
        serviceDate,
        limit: 20,
      });
      openSessions = sessions.map((s) => ({
        id: s.id,
        documentNumber: s.documentNumber,
        name: s.name,
        status: s.status,
        coverProductId: s.coverProductId,
        coverProductName: s.coverProductName,
        expectedCovers: s.expectedCovers,
        soldCovers: s.soldCovers,
        remainingCovers: s.allowOverbook
          ? null
          : Math.max(0, s.expectedCovers - s.soldCovers),
        allowOverbook: s.allowOverbook,
      }));
    }

    let todayBatchItems: KitchenOpsBoard['todayBatches']['items'] = [];
    let postedBatchCount = 0;
    let batchCost = 0;
    let batchOut = 0;
    if (await hasTable(pool, 'kitchen_production_documents')) {
      const r = await pool.query<{
        id: string;
        document_number: string;
        status: string;
        output_product_name: string | null;
        output_qty_base: string;
        total_ingredient_cost: string;
      }>(
        `SELECT d.id, d.document_number, d.status,
                p.name AS output_product_name,
                d.output_qty_base::text,
                COALESCE(d.total_ingredient_cost, 0)::text AS total_ingredient_cost
         FROM kitchen_production_documents d
         LEFT JOIN products p ON p.id = d.output_product_id
         WHERE d.production_date = $1::date
           AND d.status IN ('DRAFT', 'POSTED')
         ORDER BY d.created_at DESC
         LIMIT 30`,
        [serviceDate],
      );
      todayBatchItems = r.rows.map((row) => ({
        id: row.id,
        documentNumber: row.document_number,
        status: row.status,
        outputProductName: row.output_product_name ?? undefined,
        outputQtyBase: Number(row.output_qty_base) || 0,
        totalIngredientCost: Number(row.total_ingredient_cost) || 0,
      }));
      for (const b of todayBatchItems) {
        if (b.status === 'POSTED') {
          postedBatchCount += 1;
          batchCost += b.totalIngredientCost;
          batchOut += b.outputQtyBase;
        }
      }
    }

    let preparedStock: KitchenOpsBoard['preparedStock'] = [];
    try {
      const stock = await pool.query<{
        id: string;
        name: string;
        qty: string;
      }>(
        `SELECT p.id, p.name, COALESCE(pi.quantity_on_hand, 0)::text AS qty
         FROM products p
         LEFT JOIN product_inventory pi ON pi.product_id = p.id
         WHERE COALESCE(p.is_active, TRUE) = TRUE
           AND COALESCE(p.is_prepared_food, FALSE) = TRUE
           AND COALESCE(pi.quantity_on_hand, 0) > 0
         ORDER BY p.name
         LIMIT 40`,
      );
      preparedStock = stock.rows.map((row) => ({
        productId: row.id,
        productName: row.name,
        qtyOnHand: Number(row.qty) || 0,
      }));
    } catch {
      // is_prepared_food or inventory join may be missing on older DBs
      preparedStock = [];
    }

    let wasteCount = 0;
    let wasteCost = 0;
    if (await hasTable(pool, 'kitchen_waste_documents')) {
      const w = await pool.query<{ c: string; cost: string }>(
        `SELECT COUNT(*)::text AS c,
                COALESCE(SUM(total_cost), 0)::text AS cost
         FROM kitchen_waste_documents
         WHERE waste_date = $1::date AND status = 'POSTED'`,
        [serviceDate],
      );
      wasteCount = Number(w.rows[0]?.c) || 0;
      wasteCost = Number(w.rows[0]?.cost) || 0;
    }

    let kpis: KitchenOpsBoard['kpis'] = {
      productionCost: batchCost,
      wasteCost,
      soldCovers: openSessions.reduce((n, s) => n + s.soldCovers, 0),
      coverRevenue: 0,
      foodCostPercent: null,
    };
    try {
      const summary = await kitchenAnalyticsService.summary(pool, {
        from: serviceDate,
        to: serviceDate,
      });
      kpis = {
        productionCost: summary.foodCost.productionCost,
        wasteCost: summary.foodCost.wasteCost,
        soldCovers: summary.buffet.soldCovers,
        coverRevenue: summary.buffet.coverRevenue,
        foodCostPercent: summary.foodCost.foodCostPercent,
      };
    } catch {
      // analytics schema optional for board shell
    }

    const nextAction = recommendKitchenOpsAction({
      postedBatchCount,
      preparedStockLines: preparedStock.length,
      openSessionCount: openSessions.length,
      openSessions: openSessions.map((s) => ({
        soldCovers: s.soldCovers,
        expectedCovers: s.expectedCovers,
      })),
      postedWasteCount: wasteCount,
    });

    return {
      serviceDate,
      nextAction,
      openSessions,
      todayBatches: {
        count: todayBatchItems.length,
        totalIngredientCost: batchCost,
        totalOutputQty: batchOut,
        items: todayBatchItems,
      },
      preparedStock,
      todayWaste: { count: wasteCount, totalCost: wasteCost },
      kpis,
    };
  },

  /**
   * One shot: plan recipe (if needed) → create draft → post inventory movements.
   */
  async quickProduce(
    pool: Pool,
    input: {
      outputProductId: string;
      outputQtyBase: number;
      storeLocationId?: string | null;
      notes?: string | null;
      productionDate?: string;
      lines?: Array<{
        productId: string;
        plannedQtyBase?: number;
        actualQtyBase: number;
        sortOrder?: number;
      }>;
    },
    userId: string,
  ): Promise<KitchenProductionDocument> {
    await assertEnabled(pool);
    if (!canQuickProduce(input)) {
      throw new ValidationError('outputProductId and positive outputQtyBase are required');
    }
    if (!userId) throw new ValidationError('User is required');

    let lines = input.lines;
    if (!lines?.length) {
      const planned = await kitchenProductionService.planFromRecipe(
        pool,
        input.outputProductId,
        input.outputQtyBase,
      );
      lines = planned.map((l, i) => ({
        productId: l.productId,
        plannedQtyBase: l.plannedQtyBase,
        actualQtyBase: l.actualQtyBase,
        sortOrder: i,
      }));
    }

    const draft = await kitchenProductionService.createDraft(
      pool,
      {
        productionDate: input.productionDate,
        storeLocationId: input.storeLocationId ?? null,
        outputProductId: input.outputProductId,
        outputQtyBase: input.outputQtyBase,
        notes: input.notes ?? null,
        lines: lines.map((l, i) => ({
          productId: l.productId,
          plannedQtyBase: l.plannedQtyBase ?? l.actualQtyBase,
          actualQtyBase: l.actualQtyBase,
          sortOrder: l.sortOrder ?? i,
        })),
      },
      userId,
    );

    return kitchenProductionService.post(pool, draft.id, userId);
  },

  /**
   * One shot: create buffet session + open for POS capacity.
   */
  async startService(
    pool: Pool,
    input: {
      name: string;
      serviceDate?: string;
      coverProductId: string;
      expectedCovers: number;
      allowOverbook?: boolean;
      storeLocationId?: string | null;
      notes?: string | null;
      lines?: Array<{
        preparedProductId: string;
        plannedQtyBase: number;
        unitLabel?: string | null;
        sortOrder?: number;
        notes?: string | null;
      }>;
    },
    userId: string,
  ): Promise<BuffetSession> {
    await assertEnabled(pool);
    if (!canStartService(input)) {
      throw new ValidationError('name, coverProductId, and expectedCovers are required');
    }
    if (!userId) throw new ValidationError('User is required');

    const draft = await buffetSessionService.createDraft(pool, input, userId);
    return buffetSessionService.open(pool, draft.id, userId);
  },

  /**
   * One shot: create waste draft + post LOSS_DISPOSAL.
   */
  async quickWaste(
    pool: Pool,
    input: {
      documentType?: 'WASTE_YIELD' | 'CLOSING';
      wasteDate?: string;
      reason?: string;
      storeLocationId?: string | null;
      buffetSessionId?: string | null;
      productionDocumentId?: string | null;
      notes?: string | null;
      lines: Array<{
        productId: string;
        plannedQtyBase?: number;
        qtyBase: number;
        sortOrder?: number;
        notes?: string | null;
      }>;
    },
    userId: string,
  ): Promise<KitchenWasteDocument> {
    await assertEnabled(pool);
    if (!userId) throw new ValidationError('User is required');
    if (!input.lines?.length) throw new ValidationError('At least one waste line is required');

    const draft = await kitchenWasteService.createDraft(
      pool,
      {
        documentType: input.documentType,
        wasteDate: input.wasteDate,
        reason: input.reason as never,
        storeLocationId: input.storeLocationId,
        buffetSessionId: input.buffetSessionId,
        productionDocumentId: input.productionDocumentId,
        notes: input.notes,
        lines: input.lines,
      },
      userId,
    );
    return kitchenWasteService.post(pool, draft.id, userId);
  },

  /**
   * One shot end-of-service: leftover waste (optional) + close session.
   * Delegates to kitchenWasteService.closeBuffetWithLeftovers (already atomic).
   */
  async endService(
    pool: Pool,
    sessionId: string,
    userId: string,
    body?: {
      leftoverLines?: Array<{
        productId: string;
        plannedQtyBase?: number;
        qtyBase: number;
        notes?: string | null;
      }>;
      reason?: string;
      storeLocationId?: string | null;
      notes?: string | null;
    },
  ): Promise<{ sessionId: string; wasteDocumentId: string | null }> {
    await assertEnabled(pool);
    if (!sessionId) throw new ValidationError('sessionId is required');
    if (!userId) throw new ValidationError('User is required');
    if (!(await hasTable(pool, 'kitchen_buffet_sessions'))) {
      throw new BusinessError(
        'Buffet session schema missing. Apply migration 589.',
        'ERR_BUFFET_SESSION_SCHEMA',
      );
    }
    return kitchenWasteService.closeBuffetWithLeftovers(pool, sessionId, userId, {
      leftoverLines: body?.leftoverLines,
      reason: body?.reason as never,
      storeLocationId: body?.storeLocationId,
      notes: body?.notes,
    });
  },
};
