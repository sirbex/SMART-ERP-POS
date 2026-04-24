import { Pool } from 'pg';
import {
  salesRepository,
  CreateSaleData,
  CreateSaleItemData,
  SaleRecord,
  SaleItemRecord,
  CreateRefundData,
  CreateRefundItemData,
  RefundRecord,
  RefundItemRecord,
} from './salesRepository.js';
import * as costLayerService from '../../services/costLayerService.js';
import { BankingService } from '../../services/bankingService.js';
import { jobQueue } from '../../services/jobQueue.js';
import { incrementMetric } from '../../routes/health.js';
import { cashRegisterService, cashRegisterRepository } from '../cash-register/index.js';
import { ValidationError, BusinessError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { SalesBusinessRules, InventoryBusinessRules } from '../../middleware/businessRules.js';
import { accountingApiClient } from '../../services/accountingApiClient.js';
import * as glEntryService from '../../services/glEntryService.js';
import { checkMaintenanceMode } from '../../utils/maintenanceGuard.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessDate, getBusinessYear, addDaysToDateString } from '../../utils/dateRange.js';
import type { SaleData, SaleRefundData } from '../../services/glEntryService.js';
import {
  batchFetchProducts,
  batchFetchProductUoms,
  type ProductBatchRow,
  type ProductUomRow,
} from '../../db/batchFetch.js';
import * as stateTablesRepo from '../../repositories/stateTablesRepository.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import { getFinalPricesBulk, type ResolvedPrice } from '../pricing/pricingEngineService.js';
import { detectCogsDrift } from '../../utils/cogsDriftGuard.js';

export interface SaleItemInput {
  productId: string;
  productName: string;
  uom?: string; // POS-selected UoM label (name or symbol)
  uomId?: string; // UUID of product_uom used
  quantity: number;
  unitPrice: number;
  discountAmount?: number; // Per-item discount amount
}

export interface PaymentLineInput {
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT';
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  customerId?: string | null;
  quoteId?: string | null; // Link to quotation for auto-conversion workflow
  items: SaleItemInput[];
  subtotal?: number; // Subtotal before tax
  discountAmount?: number; // Discount amount applied to sale
  taxAmount?: number; // Tax amount
  totalAmount?: number; // Total amount (can be provided or calculated)
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT' | 'BANK_TRANSFER';
  paymentReceived: number;
  soldBy: string;
  saleDate?: string; // ISO 8601 datetime for backdated sales
  paymentLines?: PaymentLineInput[]; // Split payment support
  cashRegisterSessionId?: string; // Link to cash register session for drawer tracking
  idempotencyKey?: string; // Offline sync idempotency key
  offlineId?: string; // Offline sale identifier
  fromOrderId?: string; // POS order ID — if set, mark the order COMPLETED atomically with this sale
}

export interface RefundItemInput {
  saleItemId: string;   // UUID of the sale_item to refund
  quantity: number;     // How many units to refund (must be <= remaining refundable qty)
}

export interface RefundSaleInput {
  items: RefundItemInput[];
  reason: string;
  approvedById?: string;
  refundDate?: string; // YYYY-MM-DD, defaults to today
}

export const salesService = {
  /**
   * Create a complete sale with items (ATOMIC TRANSACTION)
   * @param pool - Database connection pool
   * @param input - Sale creation data with items, payment, customer
   * @returns Created sale with generated sale_number, profit calculation, and cost layers consumed
   * @throws Error if validation fails or insufficient inventory
   *
   * Business Rules Enforced:
   * - BR-SAL-002: Sale must have at least one item
   * - BR-SAL-003: Credit sales require customer association
   * - BR-INV-001: FIFO cost layer consumption on sale
   * - BR-INV-002: Stock movement audit trail
   *
   * Transaction Flow:
   * 1. Validate sale items and payment method
   * 2. Calculate FIFO cost for each item
   * 3. Create sale record with auto-generated sale_number
   * 4. Create sale_items records
   * 5. Consume cost layers (FIFO)
   * 6. Create stock movement records
   * 7. Commit transaction atomically
   *
   * Financial Precision: Uses Decimal.js for all calculations
   */
  async createSale(
    pool: Pool,
    input: CreateSaleInput,
    tenantId?: string
  ): Promise<{
    sale: SaleRecord;
    items: SaleItemRecord[];
    paymentLines: PaymentLineInput[];
    warnings?: string[];
  }> {
    const client = await pool.connect();
    const warnings: string[] = [];

    try {
      await client.query('BEGIN');

      // Maintenance mode guard (replaces trg_maintenance_check_sales)
      await checkMaintenanceMode(client);

      // ========== POS SESSION ENFORCEMENT ==========
      // Reads policy via the SAME transactional client to avoid race conditions.
      // Uses cashRegisterRepository.getSessionById (single source of truth).
      let validatedSessionId: string | null = null;
      try {
        // Use SAVEPOINT so a missing column/table doesn't abort the whole TX
        await client.query('SAVEPOINT session_policy_check');

        // Read policy inside the transaction (same client) for serialisation safety
        const policyRow = await client.query(
          `SELECT pos_session_policy FROM system_settings LIMIT 1`
        );
        const policy = (policyRow.rows[0]?.pos_session_policy as string) || 'DISABLED';

        if (policy !== 'DISABLED') {
          if (!input.cashRegisterSessionId) {
            throw new BusinessError(
              'POS session is required. Please open a cash register session before making sales.',
              'ERR_SESSION_001',
              { policy }
            );
          }

          // Validate session via the canonical repository method (reuses client = same TX)
          const session = await cashRegisterRepository.getSessionById(
            client,
            input.cashRegisterSessionId
          );

          if (!session) {
            throw new BusinessError(
              'Invalid cash register session. The session does not exist.',
              'ERR_SESSION_002',
              { sessionId: input.cashRegisterSessionId }
            );
          }

          if (session.status !== 'OPEN') {
            throw new BusinessError(
              `Cash register session is ${session.status}. Only OPEN sessions can process sales.`,
              'ERR_SESSION_003',
              { sessionId: input.cashRegisterSessionId, status: session.status }
            );
          }

          // Policy-specific validation
          if (policy === 'PER_CASHIER_SESSION') {
            if (session.userId !== input.soldBy) {
              throw new BusinessError(
                'This session belongs to a different cashier. Per-cashier policy requires your own session.',
                'ERR_SESSION_004',
                { sessionUserId: session.userId, currentUserId: input.soldBy, registerId: session.registerId }
              );
            }
          }

          validatedSessionId = input.cashRegisterSessionId;
          logger.info('POS session validated for sale', {
            sessionId: validatedSessionId,
            policy,
            registerId: session.registerId,
            userId: input.soldBy,
          });
        } else if (input.cashRegisterSessionId) {
          // Policy is DISABLED but session was provided — still link it
          validatedSessionId = input.cashRegisterSessionId;
        }

        await client.query('RELEASE SAVEPOINT session_policy_check');
      } catch (sessionError: unknown) {
        if (sessionError instanceof BusinessError) throw sessionError;
        // Rollback savepoint to keep the TX usable even if the query failed
        await client.query('ROLLBACK TO SAVEPOINT session_policy_check').catch(() => { });
        // Non-blocking: settings fetch failure should not block sales
        logger.warn('Session policy check failed, proceeding without enforcement', {
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        });
        if (input.cashRegisterSessionId) {
          validatedSessionId = input.cashRegisterSessionId;
        }
      }

      // Suppress the inventory_batches trigger that auto-creates SM- stock_movements
      // Sales code already creates proper MOV- movements for each batch deduction
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // ========== BUSINESS RULE VALIDATIONS ==========

      // BR-SAL-002: Sale must have at least one item
      SalesBusinessRules.validateSaleItems(input.items);

      // BR-SAL-003: Validate credit sales
      if (input.paymentMethod === 'CREDIT') {
        const totalAmount = input.items
          .reduce(
            (sum, item) => sum.plus(new Decimal(item.quantity).times(item.unitPrice)),
            new Decimal(0)
          )
          .toNumber();
        await SalesBusinessRules.validateCreditSale(
          client,
          input.customerId || null,
          totalAmount,
          input.paymentMethod
        );
      }

      // BR-SAL-005: DEPOSIT payment requires a customer (covers both paymentMethod and paymentLines)
      const hasDepositInMethod = input.paymentMethod === 'DEPOSIT';
      const hasDepositInLines = input.paymentLines?.some(
        (line) => line.paymentMethod === 'DEPOSIT'
      ) ?? false;
      if ((hasDepositInMethod || hasDepositInLines) && !input.customerId) {
        throw new BusinessError(
          'DEPOSIT payment requires a customer. Cannot apply deposit without a customer account.',
          'ERR_SALE_005',
          { paymentMethod: 'DEPOSIT' }
        );
      }

      // Calculate totals and costs using new cost layer service
      let totalAmount = new Decimal(0);
      let totalCost = new Decimal(0);
      const itemsWithCosts: CreateSaleItemData[] = [];

      // Collect cost layer deduction data to process AFTER main transaction commits
      // This prevents nested transactions and connection pool exhaustion
      const costLayerDeductions: Array<{
        productId: string;
        quantity: number;
        costingMethod: 'FIFO' | 'AVCO' | 'STANDARD';
      }> = [];

      // ========== BATCH PRE-FETCH (N+1 elimination) ==========
      // Collect all regular product IDs and fetch in bulk before the per-item loop.
      // Previously each item triggered 2-3 individual product queries.
      const regularProductIds = input.items
        .filter((it) => !it.productId?.startsWith('custom_'))
        .map((it) => it.productId);

      const [productsMap, uomsMap] = await Promise.all([
        batchFetchProducts(client, regularProductIds),
        batchFetchProductUoms(client, regularProductIds),
      ]);

      // ========== PRICING ENGINE RESOLUTION ==========
      // Resolve prices through the full cascade (tier → rule → group discount → formula → base)
      // This ensures customer-group pricing, quantity breaks, and price rules are enforced server-side.
      const resolvedPriceMap = new Map<string, ResolvedPrice>();
      if (regularProductIds.length > 0) {
        try {
          const bulkItems = input.items
            .filter((it) => !it.productId?.startsWith('custom_'))
            .map((it) => ({ productId: it.productId, quantity: it.quantity }));

          const resolved = await getFinalPricesBulk(
            bulkItems,
            input.customerId || undefined,
            undefined, // groupId resolved internally from customerId
            client,
          );

          for (let i = 0; i < bulkItems.length; i++) {
            resolvedPriceMap.set(
              `${bulkItems[i].productId}:${bulkItems[i].quantity}`,
              resolved[i],
            );
          }

          logger.info('Pricing engine resolved prices for sale', {
            itemCount: resolved.length,
            customerId: input.customerId,
            hasCustomerPricing: resolved.some((r) => r.appliedRule.scope !== 'base'),
          });
        } catch (pricingError) {
          // Non-blocking: if pricing engine fails, fall through to frontend-supplied prices
          logger.warn('Pricing engine failed, using frontend-supplied prices', {
            error: pricingError instanceof Error ? pricingError.message : String(pricingError),
          });
        }
      }

      for (const item of input.items) {
        // ========== CUSTOM ITEM DETECTION ==========
        // Custom items (service/one-off items from quotations) have custom_* IDs
        // They don't exist in products table, so skip all product-based validations
        const isCustomItem = item.productId?.startsWith('custom_');

        if (isCustomItem) {
          // Custom items: no product lookup, no cost, no inventory tracking
          const lineTotal = new Decimal(item.quantity).times(item.unitPrice);
          const customItemDiscount = new Decimal(item.discountAmount || 0);
          const lineTotalAfterDiscount = lineTotal.minus(customItemDiscount);
          totalAmount = totalAmount.plus(lineTotalAfterDiscount);

          itemsWithCosts.push({
            saleId: '', // Will be set after sale creation
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: Money.toNumber(lineTotalAfterDiscount),
            costPrice: 0, // Custom items have no cost tracking
            profit: Money.toNumber(lineTotalAfterDiscount), // Full amount is profit
            discountAmount: Money.toNumber(customItemDiscount),
            uomId: undefined,
          });

          logger.info('Custom item added to sale', {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: lineTotal.toFixed(2),
          });

          continue; // Skip all product-based validations and processing
        }

        // ========== REGULAR PRODUCT PROCESSING ==========
        // Determine base-unit quantity using MUoM conversion (if any)
        let baseQty = new Decimal(item.quantity);
        const selectedUom = (item.uom || '').trim();
        let baseUnit = 'PIECE';
        let snapshotConversionFactor = new Decimal(1); // SAP UoM snapshot
        let snapshotBaseUomId: string | null = null; // SAP UoM snapshot
        let snapshotSellingUomId: string | null = null; // Resolved uoms.id for the selling UoM
        try {
          // Use pre-fetched product data (batch query instead of per-item)
          const prefetchedProduct = productsMap.get(item.productId);
          if (!prefetchedProduct) {
            throw new NotFoundError(`Product ${item.productId}`);
          }
          // Use pre-fetched UoMs (batch query instead of per-item)
          const productUoms = uomsMap.get(item.productId) || [];
          const defaultUom = productUoms.find((u) => u.is_default);
          baseUnit = defaultUom?.symbol || 'PIECE';
          snapshotBaseUomId = defaultUom?.uom_id || null; // Capture base UoM ID at posting time

          // SAP-like: Use uomId (product_uoms.id) for deterministic conversion lookup
          // Fallback to string matching on UoM name/symbol for backward compatibility
          let convMatch: ProductUomRow | undefined;
          if (item.uomId) {
            convMatch = productUoms.find((r: ProductUomRow) => r.id === item.uomId);
          }
          if (!convMatch && selectedUom && selectedUom.toUpperCase() !== String(baseUnit).toUpperCase()) {
            convMatch = productUoms.find((r: ProductUomRow) => {
              const name = (r.name || '').toString().toUpperCase();
              const symbol = (r.symbol || '').toString().toUpperCase();
              const want = selectedUom.toUpperCase();
              return name === want || (symbol && symbol === want);
            });
          }
          if (convMatch && !convMatch.is_default) {
            const factor = new Decimal(convMatch.conversion_factor || 1);
            baseQty = new Decimal(item.quantity).times(factor);
            snapshotConversionFactor = factor; // Capture conversion factor at posting time
            snapshotSellingUomId = convMatch.uom_id; // Capture uoms.id for the selling UoM
          } else if (convMatch) {
            // Matched by uomId but it IS the default (base) UoM — no conversion needed
            snapshotSellingUomId = convMatch.uom_id;
          }

          logger.info('UoM conversion resolved', {
            productId: item.productId,
            inputUom: selectedUom,
            inputUomId: item.uomId,
            baseUnit,
            matchedById: convMatch ? convMatch.id === item.uomId : false,
            conversionFactor: snapshotConversionFactor.toNumber(),
            enteredQty: item.quantity,
            baseQty: baseQty.toNumber(),
          });
          // Use productResult later below
        } catch (e) {
          logger.warn('UoM conversion failed, falling back to base unit', {
            productId: item.productId,
            uom: item.uom,
            error: (e as Error).message,
          });
          baseQty = new Decimal(item.quantity);
        }
        // BR-INV-002: Validate positive quantity
        InventoryBusinessRules.validatePositiveQuantity(item.quantity, 'sale item');

        // BR-SAL-005: Validate product is active
        await SalesBusinessRules.validateProductActive(client, item.productId);

        // ========== PRICING ENGINE OVERRIDE ==========
        // If the pricing engine resolved a better price for this customer/quantity,
        // use it instead of the frontend-supplied price.
        const resolvedPrice = resolvedPriceMap.get(`${item.productId}:${item.quantity}`);
        let effectiveUnitPrice = item.unitPrice;
        if (resolvedPrice && resolvedPrice.appliedRule.scope !== 'base') {
          // Engine found a tier/rule/group discount — enforce it
          if (resolvedPrice.finalPrice !== item.unitPrice) {
            logger.info('Pricing engine adjusted unit price', {
              productId: item.productId,
              frontendPrice: item.unitPrice,
              enginePrice: resolvedPrice.finalPrice,
              rule: resolvedPrice.appliedRule.scope,
              ruleName: resolvedPrice.appliedRule.ruleName,
            });
          }
          effectiveUnitPrice = resolvedPrice.finalPrice;
        }

        const lineTotal = new Decimal(item.quantity).times(effectiveUnitPrice);
        const itemDiscountAmount = new Decimal(item.discountAmount || 0);
        const lineTotalAfterDiscount = lineTotal.minus(itemDiscountAmount);
        totalAmount = totalAmount.plus(lineTotalAfterDiscount);

        // Use pre-fetched product data (eliminates duplicate per-item query)
        const productData = productsMap.get(item.productId);
        if (!productData) {
          throw new NotFoundError(`Product ${item.productId}`);
        }
        const costingMethod = (productData.costing_method || 'FIFO') as
          | 'FIFO'
          | 'AVCO'
          | 'STANDARD';
        const originalPrice = Money.toNumber(
          Money.parse(productData.selling_price || String(effectiveUnitPrice))
        );

        // BR-SAL-004: Validate minimum price
        await SalesBusinessRules.validateMinimumPrice(client, item.productId, effectiveUnitPrice);

        // BR-SAL-006: Validate discount
        if (effectiveUnitPrice < originalPrice) {
          await SalesBusinessRules.validateDiscount(
            client,
            item.productId,
            effectiveUnitPrice,
            originalPrice
          );
        }

        // BR-INV-001: Validate stock availability
        await InventoryBusinessRules.validateStockAvailability(
          client,
          item.productId,
          baseQty.toNumber()
        );

        // Calculate actual cost from FEFO inventory batches (same source as stock movements).
        // Using batch.cost_price directly ensures sale_items.unit_cost = SM unit_cost,
        // keeping GL COGS in sync with the batch subledger and preventing reconciliation drift.
        // Previously used costLayerService.calculateActualCost() which could diverge from
        // batch.cost_price due to FIFO layer averaging and UoM conversion rounding.
        let itemCostDecimal = new Decimal(0);
        let unitCost: number = 0; // per base unit — used for profit margin validation only
        try {
          // Read FEFO batches in the same order as the physical deduction loop below.
          // No FOR UPDATE here — the deduction loop acquires row locks when it runs.
          const fefoPreview = await client.query(
            `SELECT remaining_quantity, cost_price
             FROM inventory_batches
             WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
             ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
            [item.productId]
          );

          let remainingForCost = new Decimal(baseQty);
          for (const b of fefoPreview.rows) {
            if (remainingForCost.lessThanOrEqualTo(0)) break;
            const batchAvail = new Decimal(b.remaining_quantity);
            const take = Decimal.min(remainingForCost, batchAvail);
            itemCostDecimal = itemCostDecimal.plus(take.times(new Decimal(b.cost_price)));
            remainingForCost = remainingForCost.minus(take);
          }

          // ── DRIFT GUARD (preview) ────────────────────────────────────────────
          // If FEFO batches can't cover the full quantity the GL COGS will fall
          // back to average_cost instead of exact batch.cost_price — this causes
          // inventory GL 1300 to drift from inventory_batches valuation.
          // The sale will also throw ERR_STOCK_001 shortly, but logging here
          // makes the accounting impact explicit before the rollback.
          if (remainingForCost.greaterThan(0.001)) {
            logger.warn('[COGS DRIFT RISK] FEFO batches insufficient for GL cost preview — GL COGS will use estimated average_cost, not exact batch cost_price', {
              productId: item.productId,
              productName: item.productName,
              requestedBaseQty: baseQty.toFixed(4),
              coveredByBatches: baseQty.minus(remainingForCost).toFixed(4),
              shortfall: remainingForCost.toFixed(4),
              action: 'Ensure stock is received before selling. Inventory integrity check recommended.',
            });
          }
          // ────────────────────────────────────────────────────────────────────

          // Per-base-unit cost used only for profit margin validation
          unitCost = baseQty.greaterThan(0)
            ? Money.toNumber(Money.round(itemCostDecimal.dividedBy(baseQty), 2))
            : 0;

          logger.info(`Batch-derived FEFO cost for product ${item.productId}`, {
            method: costingMethod,
            baseQty: baseQty.toNumber(),
            totalBatchCost: itemCostDecimal.toFixed(2),
            unitCostPerBase: unitCost,
          });
        } catch (error: unknown) {
          // Fallback: use pre-fetched average_cost, then cost_price
          const avgCost = Money.parseDb(productData.average_cost);
          const costPriceDec = Money.parseDb(productData.cost_price);
          unitCost = Money.toNumber(avgCost.greaterThan(0) ? avgCost : costPriceDec);
          itemCostDecimal = new Decimal(unitCost).times(baseQty);

          logger.debug(`Using product cost_price fallback for ${item.productId}`, {
            productId: item.productId,
            unitCost,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // BR-SAL-007: Validate profit margin (warning only)
        SalesBusinessRules.validateProfitMargin(unitCost, effectiveUnitPrice, false);

        // Exact batch-derived cost — no per-base-unit rounding applied
        const itemCost = itemCostDecimal;
        totalCost = totalCost.plus(itemCost);
        const profit = lineTotalAfterDiscount.minus(itemCost);

        // CRITICAL: costPrice must reflect cost per SELLING UoM unit, not per base unit.
        // When selling 1 Box (12 pieces) at base cost 6,000/piece, costPrice = 72,000/box.
        // The DB trigger fn_post_sale_to_ledger computes COGS as SUM(unit_cost * quantity),
        // so storing base-unit cost with selling-UoM quantity understates COGS.
        // Using exact batch cost ensures GL COGS = batch subledger (no reconciliation drift).
        const costPerSellingUnit = Money.toNumber(
          Money.round(itemCost.dividedBy(new Decimal(item.quantity)), 2)
        );

        // Use the selling UoM ID resolved during conversion lookup (no extra query needed)
        const actualUomId = snapshotSellingUomId || undefined;

        itemsWithCosts.push({
          saleId: '', // Will be set after sale creation
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: effectiveUnitPrice,
          lineTotal: Money.toNumber(lineTotalAfterDiscount),
          costPrice: costPerSellingUnit,
          profit: Money.toNumber(profit),
          discountAmount: Money.toNumber(itemDiscountAmount),
          uomId: actualUomId, // Use the actual uom_id from uoms table
          baseQty: baseQty.toNumber(), // SAP UoM snapshot: base quantity at posting time
          baseUomId: snapshotBaseUomId, // SAP UoM snapshot: base UoM ID at posting time
          conversionFactor: snapshotConversionFactor.toNumber(), // SAP UoM snapshot: conversion factor at posting time
        });
      }

      // Use provided tax if available, otherwise default to 0
      const taxAmount = input.taxAmount ? new Decimal(input.taxAmount) : new Decimal(0);

      // Use provided discount if available, otherwise default to 0
      const discountAmount = input.discountAmount
        ? new Decimal(input.discountAmount)
        : new Decimal(0);

      // DEBUG: Log received values
      logger.info('💰 TAX CALCULATION DEBUG', {
        'input.totalAmount': input.totalAmount,
        'input.taxAmount': input.taxAmount,
        'input.subtotal': input.subtotal,
        'input.discountAmount': input.discountAmount,
        calculated_totalAmount_from_items: totalAmount.toFixed(2),
      });

      // Use provided totalAmount if available (from POS), otherwise calculate from items + tax - discount
      const finalTotalAmount = input.totalAmount
        ? new Decimal(input.totalAmount)
        : totalAmount.minus(discountAmount).plus(taxAmount);

      logger.info('💰 FINAL TOTAL AMOUNT', {
        finalTotalAmount: finalTotalAmount.toFixed(2),
        used: input.totalAmount ? 'input.totalAmount' : 'calculated (items + tax - discount)',
      });

      // Calculate subtotal: if provided use it, otherwise use line item totals
      const subtotal = input.subtotal ? new Decimal(input.subtotal) : totalAmount;

      // For CREDIT/split payment sales, allow partial or zero payment
      // For other payment methods (CASH, CARD, MOBILE_MONEY), require full payment

      // Check if payment lines contain CREDIT
      const hasPaymentLines = input.paymentLines && input.paymentLines.length > 0;
      const hasCreditPayment = hasPaymentLines
        ? (input.paymentLines?.some((line) => line.paymentMethod === 'CREDIT') ?? false)
        : input.paymentMethod === 'CREDIT';

      // ============================================================
      // CRITICAL FIX: Calculate ACTUAL payment received (EXCLUDING CREDIT)
      // ============================================================
      // CREDIT is NOT actual payment - it's debt owed by the customer
      // DEPOSIT IS actual payment - it's money already received as prepayment
      // Only count CASH, CARD, MOBILE_MONEY, DEPOSIT, BANK_TRANSFER as actual payments
      // This ensures amount_paid reflects what was actually received
      // ============================================================
      const paymentReceived = hasPaymentLines
        ? (input.paymentLines
          ?.filter((line) => line.paymentMethod !== 'CREDIT') // Exclude CREDIT
          .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0)) ??
          new Decimal(0))
        : new Decimal(input.paymentReceived || 0);

      // Calculate the CREDIT amount for logging/invoice purposes
      const creditAmount = hasPaymentLines
        ? (input.paymentLines
          ?.filter((line) => line.paymentMethod === 'CREDIT')
          .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0)) ??
          new Decimal(0))
        : new Decimal(0);

      logger.info('Payment breakdown calculated', {
        totalPaymentLines: input.paymentLines?.length || 0,
        actualPaymentReceived: paymentReceived.toFixed(2),
        creditAmount: creditAmount.toFixed(2),
        totalAmount: finalTotalAmount.toFixed(2),
        hasCreditPayment,
      });

      const changeAmount = paymentReceived.minus(finalTotalAmount);

      // BR-SAL-001: Validate payment amount based on payment method
      if (hasCreditPayment) {
        // BUSINESS RULE: Credit sales MUST have a customer
        if (!input.customerId) {
          throw new BusinessError(
            'Credit payment requires a customer to be selected. Cannot process credit sale without customer linkage.',
            'ERR_SALE_002',
            { paymentMethod: 'CREDIT' }
          );
        }

        // Credit sales: Allow 0 to full payment (partial payments allowed)
        if (paymentReceived.lessThan(0)) {
          throw new BusinessError('Payment amount cannot be negative', 'ERR_PAYMENT_002', {
            amountReceived: Money.toNumber(paymentReceived),
          });
        }
        // Allow underpayment or exact payment for credit
        if (paymentReceived.greaterThan(finalTotalAmount.plus(0.01))) {
          throw new BusinessError(
            `Overpayment not allowed for credit sales. Total: ${finalTotalAmount.toFixed(2)}, Received: ${paymentReceived.toFixed(2)}`,
            'ERR_PAYMENT_003',
            {
              totalAmount: Money.toNumber(finalTotalAmount),
              amountReceived: Money.toNumber(paymentReceived),
            }
          );
        }

        logger.info('Credit sale validation passed', {
          customerId: input.customerId,
          totalAmount: finalTotalAmount.toFixed(2),
          paymentReceived: paymentReceived.toFixed(2),
          creditAmount: finalTotalAmount.minus(paymentReceived).toFixed(2),
        });
      } else if (!hasPaymentLines) {
        // Legacy single payment method validation
        // CASH, CARD, MOBILE_MONEY: Require full payment or more (for change)
        SalesBusinessRules.validatePaymentAmount(
          Money.toNumber(finalTotalAmount),
          Money.toNumber(paymentReceived),
          input.paymentMethod
        );

        if (changeAmount.lessThan(0)) {
          throw new BusinessError(
            `Insufficient payment. Total: ${finalTotalAmount.toFixed(2)}, Received: ${paymentReceived.toFixed(2)}`,
            'ERR_PAYMENT_001',
            {
              totalAmount: Money.toNumber(finalTotalAmount),
              amountReceived: Money.toNumber(paymentReceived),
              shortfall: Money.toNumber(changeAmount.abs()),
            }
          );
        }
      }

      // Create sale record with bank-grade precision
      // ============================================================
      // SINGLE SOURCE OF TRUTH: Payment Method Determination
      // ============================================================
      // Rule: If customer owes money after the sale, it's a CREDIT sale.
      // This ensures consistency between sales.payment_method and invoices.
      // - Full payment (amount_paid >= total): Use actual payment method (CASH, CARD, etc.)
      // - Partial/No payment (amount_paid < total): Always CREDIT
      // ============================================================
      const actualAmountPaid = Money.round(paymentReceived, 2);
      const actualTotalAmount = Money.round(finalTotalAmount, 2);
      const hasOutstandingBalance = actualAmountPaid.lessThan(actualTotalAmount);

      // Determine the effective payment method
      // CREDIT if there's any outstanding balance, otherwise use the provided method
      const effectivePaymentMethod = hasOutstandingBalance ? 'CREDIT' : input.paymentMethod;

      // ============================================================
      // CRITICAL: PREVENT GHOST SALES/INVOICES
      // ============================================================
      // Any sale with outstanding balance REQUIRES a customer for invoice tracking
      // This is the SINGLE SOURCE OF TRUTH enforcement point
      if (hasOutstandingBalance && !input.customerId) {
        const outstandingDec = actualTotalAmount.minus(actualAmountPaid);
        throw new BusinessError(
          `Customer required: Cannot create sale with outstanding balance of ${outstandingDec.toFixed(2)} without customer linkage. An invoice must be created to track receivables.`,
          'ERR_SALE_003',
          {
            outstandingBalance: Money.toNumber(outstandingDec),
            totalAmount: Money.toNumber(actualTotalAmount),
            amountPaid: Money.toNumber(actualAmountPaid),
          }
        );
      }

      // Validate customer exists in database if provided
      if (input.customerId) {
        const customerCheck = await client.query(
          'SELECT id, name, credit_limit, balance FROM customers WHERE id = $1',
          [input.customerId]
        );

        if (customerCheck.rows.length === 0) {
          throw new NotFoundError(`Customer ${input.customerId}`);
        }

        const customer = customerCheck.rows[0];
        const outstandingAmount = actualTotalAmount.minus(actualAmountPaid);

        // Check credit limit for sales with outstanding balance
        if (hasOutstandingBalance && customer.credit_limit) {
          const newBalance = Money.add(customer.balance || 0, outstandingAmount);
          const creditLimit = Money.parse(customer.credit_limit || 0);

          if (newBalance.greaterThan(creditLimit)) {
            logger.warn('Customer exceeding credit limit', {
              customerId: input.customerId,
              customerName: customer.name,
              currentBalance: customer.balance,
              newBalance: Money.toNumber(newBalance),
              creditLimit: Money.toNumber(creditLimit),
              outstandingAmount: Money.toNumber(outstandingAmount),
            });

            // Option: throw error to prevent exceeding credit limit
            // throw new Error(
            //   `CREDIT LIMIT EXCEEDED: Customer "${customer.name}" has credit limit of ${creditLimit.toFixed(2)}. ` +
            //   `Current balance: ${parseFloat(customer.balance || 0).toFixed(2)}, This sale: ${outstandingAmount.toFixed(2)}, ` +
            //   `New balance would be: ${newBalance.toFixed(2)}. Cannot proceed.`
            // );
          }
        }

        logger.info('Customer validation passed', {
          customerId: input.customerId,
          customerName: customer.name,
          hasOutstandingBalance,
          outstandingAmount: hasOutstandingBalance ? outstandingAmount.toFixed(2) : '0',
        });
      }

      // Total discount = cart-level discount + sum of all line-item discounts
      // This ensures sales.discount_amount reflects ALL discounts (not just cart-level)
      const cartDiscount = input.discountAmount
        ? Money.round(new Decimal(input.discountAmount), 2)
        : new Decimal(0);
      const lineItemDiscountTotal = itemsWithCosts.reduce(
        (sum, item) => sum.plus(new Decimal(item.discountAmount || 0)),
        new Decimal(0)
      );
      const totalDiscountAmount = cartDiscount.plus(lineItemDiscountTotal);

      const saleData: CreateSaleData = {
        customerId: input.customerId || null,
        subtotal: input.subtotal
          ? Money.toNumber(Money.round(new Decimal(input.subtotal), 2))
          : Money.toNumber(subtotal),
        totalAmount: Money.toNumber(actualTotalAmount),
        totalCost: Money.toNumber(totalCost),
        discountAmount: Money.toNumber(totalDiscountAmount),
        taxAmount: Money.toNumber(taxAmount),
        paymentMethod: effectivePaymentMethod,
        // Store the actual amount received from the customer (cash tendered)
        // For fully-paid sales: this is the real tendered amount (may exceed totalAmount for cash change)
        // For credit/partial: this is what was actually received
        paymentReceived: Money.toNumber(actualAmountPaid),
        changeAmount: hasOutstandingBalance
          ? 0 // No change for credit/partial payment sales
          : Money.toNumber(changeAmount),
        soldBy: input.soldBy,
        saleDate: input.saleDate, // Pass through backdated sale date if provided
        quoteId: input.quoteId || null, // Link to quotation for auto-conversion
        idempotencyKey: input.idempotencyKey,
        offlineId: input.offlineId,
        cashRegisterSessionId: validatedSessionId || undefined,
      };

      const sale = await salesRepository.createSale(client, saleData);

      // ============================================================
      // CRITICAL: DISCOUNT ALLOCATION TO ITEM-LEVEL PROFITS
      // ============================================================
      // Problem: lineTotal and profit were calculated BEFORE discount
      // Fix: Proportionally allocate discount to each item's profit AND discount_amount
      // Formula: itemDiscountShare = lineTotal * (discountAmount / subtotal)
      //          adjustedProfit = originalProfit - itemDiscountShare
      // The item-level discount_amount is also set so the DB trigger
      // (fn_update_sale_totals_internal) can recalculate sale totals correctly.
      // ============================================================
      const discountToAllocate = new Decimal(saleData.discountAmount || 0);
      const saleSubtotal = new Decimal(saleData.subtotal || 0);

      if (discountToAllocate.greaterThan(0) && saleSubtotal.greaterThan(0)) {
        const discountRatio = discountToAllocate.dividedBy(saleSubtotal);

        logger.info('Allocating cart discount to items', {
          discountAmount: discountToAllocate.toFixed(2),
          subtotal: saleSubtotal.toFixed(2),
          discountRatio: discountRatio.toFixed(6),
          itemCount: itemsWithCosts.length,
        });

        let totalDiscountAllocated = new Decimal(0);

        for (let i = 0; i < itemsWithCosts.length; i++) {
          const item = itemsWithCosts[i];
          const itemLineTotal = new Decimal(item.lineTotal);

          // Calculate this item's share of the cart discount
          let itemDiscountShare: Decimal;

          if (i === itemsWithCosts.length - 1) {
            // Last item gets remainder to avoid rounding errors
            itemDiscountShare = discountToAllocate.minus(totalDiscountAllocated);
          } else {
            itemDiscountShare = itemLineTotal.times(discountRatio);
          }

          // Adjust profit: subtract the discount share
          const originalProfit = new Decimal(item.profit);
          const adjustedProfit = originalProfit.minus(itemDiscountShare);

          item.profit = Money.toNumber(adjustedProfit);

          // Distribute cart discount to each item's discount_amount.
          // This is the correct SAP-style approach: application layer calculates
          // all totals, and DB only validates (trg_validate_sale_totals).
          // Cart discount is stored at item level for accurate per-item reporting.
          const existingItemDiscount = new Decimal(item.discountAmount || 0);
          item.discountAmount = Money.toNumber(existingItemDiscount.plus(itemDiscountShare));

          totalDiscountAllocated = totalDiscountAllocated.plus(itemDiscountShare);

          logger.debug('Item adjusted for cart discount', {
            productName: item.productName,
            lineTotal: item.lineTotal,
            itemDiscountShare: itemDiscountShare.toFixed(2),
            totalItemDiscount: item.discountAmount,
            originalProfit: originalProfit.toFixed(2),
            adjustedProfit: adjustedProfit.toFixed(2),
          });
        }

        logger.info('Cart discount allocation complete', {
          totalDiscountAllocated: totalDiscountAllocated.toFixed(2),
          expectedDiscount: discountToAllocate.toFixed(2),
          allocationAccurate: totalDiscountAllocated.equals(discountToAllocate),
        });
      }

      // Add sale ID to items
      itemsWithCosts.forEach((item) => {
        item.saleId = sale.id;
      });

      // Create sale items
      const items = await salesRepository.addSaleItems(client, itemsWithCosts);

      // GL POSTING: Application-layer double-entry (replaces database trigger)
      // Post AFTER items exist so revenue/COGS split is accurate.
      // CRITICAL: pass `client` (the active transaction) so GL journals are
      // atomic with the sale. Without txClient each journal opens its own
      // inner transaction, causing phantom GL entries when the outer TX rolls back.
      try {
        await glEntryService.recordSaleToGL(
          {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            saleDate: sale.saleDate || getBusinessDate(),
            totalAmount: sale.totalAmount,
            costAmount: sale.totalCost || 0,
            paymentMethod: sale.paymentMethod as SaleData['paymentMethod'],
            amountPaid: sale.amountPaid ?? 0,
            taxAmount: sale.taxAmount || 0,
            customerId: sale.customerId || undefined,
            saleItems: itemsWithCosts.map((item) => ({
              productType: item.productId?.startsWith('custom_')
                ? ('service' as const)
                : ('inventory' as const),
              totalPrice: item.lineTotal,
              unitCost: item.costPrice || 0,
              quantity: item.quantity,
            })),
          },
          pool,
          client
        );
      } catch (glError: unknown) {
        logger.error('GL posting failed for sale — transaction will rollback', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          error: glError instanceof Error ? glError.message : String(glError),
        });
        throw glError;
      }

      // Map to accumulate actual FEFO batch deduction costs per productId.
      // Used after all deductions to verify GL COGS matches actual batch costs (drift guard).
      const actualBatchCostMap = new Map<string, Decimal>();

      // Deduct from cost layers AND inventory batches for each item
      for (const item of input.items) {
        // Skip custom items - they don't have inventory or cost layers
        const isCustomItem = item.productId?.startsWith('custom_');
        if (isCustomItem) {
          logger.info('Skipping inventory deduction for custom item', {
            productId: item.productId,
            productName: item.productName,
          });
          continue;
        }

        // ========== REGULAR PRODUCT INVENTORY DEDUCTION ==========
        // Recompute base quantity to deduct from inventory and cost layers
        let baseQty = new Decimal(item.quantity);
        const selectedUom = (item.uom || '').trim();
        let baseUnit = 'PIECE';
        let deductConversionFactor = new Decimal(1); // SAP UoM snapshot for stock movements
        let deductBaseUomId: string | null = null; // SAP UoM snapshot for stock movements
        // Get base unit from default product_uom
        const productBaseRes = await client.query(
          `SELECT u.symbol, u.id AS uom_id
           FROM product_uoms pu
           JOIN uoms u ON u.id = pu.uom_id
           WHERE pu.product_id = $1 AND pu.is_default = true
           LIMIT 1`,
          [item.productId]
        );
        baseUnit = productBaseRes.rows[0]?.symbol || 'PIECE';
        deductBaseUomId = productBaseRes.rows[0]?.uom_id || null;

        // SAP-like: Use uomId (product_uoms.id) for deterministic conversion lookup
        const conv = await client.query(
          `SELECT pu.id, pu.conversion_factor, pu.is_default, u.name, u.symbol
           FROM product_uoms pu
           JOIN uoms u ON u.id = pu.uom_id
           WHERE pu.product_id = $1`,
          [item.productId]
        );
        let deductMatch: Record<string, unknown> | undefined;
        if (item.uomId) {
          deductMatch = conv.rows.find((r: Record<string, unknown>) => r.id === item.uomId);
        }
        if (!deductMatch && selectedUom && selectedUom.toUpperCase() !== String(baseUnit).toUpperCase()) {
          deductMatch = conv.rows.find((r: Record<string, unknown>) => {
            const name = (r.name || '').toString().toUpperCase();
            const symbol = (r.symbol || '').toString().toUpperCase();
            const want = selectedUom.toUpperCase();
            return name === want || (symbol && symbol === want);
          });
        }
        if (deductMatch && !deductMatch.is_default) {
          const factor = new Decimal(Number(deductMatch.conversion_factor) || 1);
          baseQty = new Decimal(item.quantity).times(factor);
          deductConversionFactor = factor;
        }
        // Get product costing method again
        const productResult = await client.query(
          'SELECT costing_method FROM product_valuation WHERE product_id = $1',
          [item.productId]
        );

        const costingMethod = productResult.rows[0]?.costing_method || 'FIFO';

        // Collect cost layer deduction data - will be processed AFTER transaction commits
        // This avoids nested transactions which cause connection pool exhaustion
        if (costingMethod === 'FIFO') {
          costLayerDeductions.push({
            productId: item.productId,
            quantity: baseQty.toNumber(),
            costingMethod,
          });
        }

        // 2. PHYSICAL: Deduct from inventory batches using FEFO (First Expiry First Out)
        // This is critical for products with expiry dates and physical stock tracking
        let remainingQty = new Decimal(baseQty.toNumber());

        // Fetch min_days_before_expiry_sale for this product
        const expiryRuleRes = await client.query(
          `SELECT COALESCE(min_days_before_expiry_sale, 0) AS min_days
           FROM products WHERE id = $1`,
          [item.productId]
        );
        const minDaysBeforeExpiry = parseInt(expiryRuleRes.rows[0]?.min_days ?? '0', 10);

        // Get batches ordered by expiry date (FEFO)
        // When min_days_before_expiry_sale > 0, first try excluding near-expiry batches
        // If that yields no results, fall back to all active batches so the sale isn't blocked
        let batchesResult;
        if (minDaysBeforeExpiry > 0) {
          batchesResult = await client.query(
            `SELECT id, remaining_quantity, expiry_date, cost_price
             FROM inventory_batches
             WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE + $2 * INTERVAL '1 day')
             ORDER BY expiry_date ASC NULLS LAST, received_date ASC
             FOR UPDATE`,
            [item.productId, minDaysBeforeExpiry]
          );
        }

        // Fallback: if no non-expiring batches or no threshold configured, use all active non-expired batches
        if (!batchesResult || batchesResult.rows.length === 0) {
          batchesResult = await client.query(
            `SELECT id, remaining_quantity, expiry_date, cost_price
             FROM inventory_batches
             WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
             ORDER BY expiry_date ASC NULLS LAST, received_date ASC
             FOR UPDATE`,
            [item.productId]
          );
        }

        // Generate movement number ONCE for all batch deductions per item
        // This drastically reduces DB queries (from O(batches) to O(1) per item)
        // Advisory lock prevents concurrent duplicate movement number generation
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const movNumRes = await client.query(
          `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
           LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
           AS movement_number
           FROM stock_movements 
           WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
        );
        let movementSeq = parseInt(movNumRes.rows[0]?.movement_number?.split('-')[2] || '1');

        for (const batch of batchesResult.rows) {
          if (remainingQty.lessThanOrEqualTo(0)) break;

          const batchQty = new Decimal(batch.remaining_quantity || 0);
          const qtyToDeduct = Decimal.min(remainingQty, batchQty);
          const qtyToDeductStr = qtyToDeduct.toFixed(4); // String for PostgreSQL NUMERIC

          // Update batch quantity
          await client.query(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 status = CASE 
                   WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = $2`,
            [qtyToDeductStr, batch.id]
          );

          // Use pre-generated movement number and increment
          const movementNumber = `MOV-${getBusinessYear()}-${String(movementSeq).padStart(4, '0')}`;
          movementSeq++;

          // Determine unit cost from batch with bank precision
          const batchUnitCost = new Decimal(batch.cost_price ?? batch.costPrice ?? 0).toFixed(2);

          // Record stock movement with batch reference and unit cost
          await client.query(
            `INSERT INTO stock_movements (
              movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
              reference_type, reference_id, notes, created_by_id,
              entered_qty, base_uom_id, conversion_factor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              movementNumber,
              item.productId,
              batch.id,
              'SALE',
              qtyToDeduct.abs().toFixed(4), // string for PostgreSQL NUMERIC — bank-grade precision
              batchUnitCost,
              'SALE',
              sale.id,
              `Sale ${sale.saleNumber} - FEFO batch deduction`,
              input.soldBy || null,
              item.quantity, // SAP UoM snapshot: original entered quantity
              deductBaseUomId, // SAP UoM snapshot: base UoM at posting time
              deductConversionFactor.toFixed(6), // SAP UoM snapshot: conversion factor at posting time
            ]
          );

          remainingQty = remainingQty.minus(qtyToDeduct);

          // Drift guard: accumulate actual batch cost so we can compare against GL after deductions
          const _prevActual = actualBatchCostMap.get(item.productId) ?? new Decimal(0);
          actualBatchCostMap.set(
            item.productId,
            _prevActual.plus(qtyToDeduct.times(new Decimal(batch.cost_price ?? 0)))
          );

          logger.info(`Inventory batch deducted for product ${item.productId}`, {
            batchId: batch.id,
            quantity: qtyToDeduct.toFixed(4),
            remaining: remainingQty.toFixed(4),
            expiryDate: batch.expiry_date,
          });
        }

        if (remainingQty.greaterThan(0)) {
          const nearestExpiry =
            batchesResult.rows.length > 0 ? batchesResult.rows[0].expiry_date : null;
          const totalAvailable = batchesResult.rows.reduce(
            (sum: Decimal, b: { remaining_quantity: string | number }) =>
              sum.plus(new Decimal(String(b.remaining_quantity || 0))),
            new Decimal(0)
          );
          const isExpiryBlock = minDaysBeforeExpiry > 0 && nearestExpiry;
          const errorCode =
            batchesResult.rows.length === 0
              ? 'ERR_STOCK_001'
              : isExpiryBlock
                ? 'ERR_EXPIRY_001'
                : 'ERR_STOCK_001';

          throw new BusinessError(
            `Not enough stock for "${item.productName}". ` +
            `Requested: ${baseQty.toFixed(2)}, Available: ${totalAvailable.toFixed(2)}, ` +
            `Short by: ${remainingQty.toFixed(2)}.`,
            errorCode,
            {
              product: item.productName,
              productId: item.productId,
              requested: Money.toNumber(baseQty),
              available: Money.toNumber(totalAvailable),
              shortBy: Money.toNumber(remainingQty),
              expiryDate: nearestExpiry,
              minDaysBeforeExpiry: minDaysBeforeExpiry > 0 ? minDaysBeforeExpiry : undefined,
              batchCount: batchesResult.rows.length,
            }
          );
        }

        // App-layer sync: update BOTH product_inventory and products.quantity_on_hand
        await syncProductQuantity(client, item.productId);
      }

      // ============================================================
      // PERMANENT DRIFT GUARD: GL COGS vs actual FEFO batch deductions
      // ============================================================
      // PERMANENT DRIFT GUARD: GL COGS vs actual FEFO batch deductions
      // ============================================================
      // The FEFO preview (no lock) and the actual deduction (FOR UPDATE) run
      // in separate query rounds within the same transaction. Under PostgreSQL
      // READ COMMITTED, a concurrent sale that commits between the preview and
      // the deduction can change which batches are available — causing the GL
      // to post a cost different from what was physically deducted.
      //
      // detectCogsDrift() is a pure function (tested in cogsDriftGuard.test.ts)
      // that returns all items whose |GL cost − actual batch cost| > 0.01.
      const cogsDrifts = detectCogsDrift(itemsWithCosts, actualBatchCostMap);
      for (const d of cogsDrifts) {
        logger.warn('[COGS DRIFT DETECTED] GL COGS does not match actual FEFO batch deduction', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          productId: d.productId,
          productName: d.productName,
          glCostPosted: d.glCost,
          actualBatchCost: d.actualBatchCost,
          drift: d.drift,
          likelyCause: 'Concurrent sale modified FEFO batches between cost preview and deduction.',
          action: 'Run /api/accounting/integrity to quantify impact.',
        });
        warnings.push(d.message);
      }

      // BR-SAL-002: Update customer balance for CREDIT sales (split payment support)
      // Customer balance represents accounts receivable (amount owed by customer)

      // Check if any payment line is CREDIT
      const hasCreditInPaymentLines =
        input.paymentLines?.some((line) => line.paymentMethod === 'CREDIT') || false;
      const isCreditSale = input.paymentMethod === 'CREDIT' || hasCreditInPaymentLines;

      // creditAmount is already calculated above (from payment lines or as Decimal)
      // Convert to number for use below
      const creditAmountNum = Money.toNumber(creditAmount);

      // NOTE: Customer balance is now managed by the invoice system (SINGLE SOURCE OF TRUTH)
      // When an invoice is created/updated, the database trigger `trg_sync_customer_balance_on_invoice`
      // automatically recalculates customer.balance from SUM(invoices.OutstandingBalance)
      // We no longer directly update customer balance here to avoid double-counting
      if (isCreditSale && input.customerId && creditAmountNum > 0) {
        logger.info('Credit sale detected - customer balance will be updated by invoice trigger', {
          customerId: input.customerId,
          creditAmount: creditAmountNum,
        });
      }

      // ========== CREATE PAYMENT LINES (Split Payment Support) ==========
      if (input.paymentLines && input.paymentLines.length > 0) {
        // Insert payment lines
        const paymentLinesValues: unknown[] = [];
        const paymentLinesPlaceholders: string[] = [];

        input.paymentLines.forEach((line, index) => {
          const offset = index * 4;
          paymentLinesPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
          );
          paymentLinesValues.push(
            sale.id,
            line.paymentMethod,
            new Decimal(line.amount).toFixed(2), // String for PostgreSQL NUMERIC
            line.reference || null
          );
        });

        await client.query(
          `INSERT INTO payment_lines (sale_id, payment_method, amount, reference)
           VALUES ${paymentLinesPlaceholders.join(', ')}`,
          paymentLinesValues
        );

        logger.info('Payment lines created', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          paymentCount: input.paymentLines.length,
          totalPaid: input.paymentLines
            .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0))
            .toDecimalPlaces(2)
            .toNumber(),
        });

        // ========== APPLY DEPOSITS (if DEPOSIT payment method used) ==========
        const depositPaymentLines = input.paymentLines.filter(
          (line) => line.paymentMethod === 'DEPOSIT'
        );
        if (depositPaymentLines.length > 0 && !input.customerId) {
          throw new BusinessError(
            'DEPOSIT payment requires a customer. Cannot apply deposit without a customer account.',
            'ERR_SALE_005',
            { paymentMethod: 'DEPOSIT' }
          );
        }
        if (depositPaymentLines.length > 0 && input.customerId) {
          const totalDepositAmount = depositPaymentLines
            .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0))
            .toNumber();

          if (totalDepositAmount > 0) {
            try {
              const { applyDepositsToSaleInTransaction } = await import(
                '../deposits/depositsService.js'
              );

              const depositResult = await applyDepositsToSaleInTransaction(
                client,
                input.customerId,
                sale.id,
                totalDepositAmount,
                input.soldBy
              );

              // GL POSTING: Clear Customer Deposits liability and AR for each application
              // MUST succeed — if GL fails, the entire sale rolls back to prevent discrepancies
              const custRow = await client.query(
                'SELECT name FROM customers WHERE id = $1',
                [input.customerId]
              );
              const depositCustomerName = custRow.rows[0]?.name || 'Unknown';
              for (const app of depositResult.applications) {
                await glEntryService.recordDepositApplicationToGL(
                  {
                    applicationId: app.id,
                    depositId: app.depositId,
                    depositNumber: app.depositNumber || '',
                    saleId: sale.id,
                    saleNumber: sale.saleNumber,
                    applicationDate: sale.saleDate || getBusinessDate(),
                    amount: app.amountApplied,
                    customerId: input.customerId,
                    customerName: depositCustomerName,
                  },
                  pool,
                  client
                );
              }

              logger.info('Customer deposits applied to sale', {
                saleId: sale.id,
                saleNumber: sale.saleNumber,
                customerId: input.customerId,
                totalDepositsApplied: depositResult.totalApplied,
                applicationsCount: depositResult.applications.length,
              });
            } catch (depositError: unknown) {
              logger.error('Failed to apply customer deposits', {
                saleId: sale.id,
                customerId: input.customerId,
                requestedAmount: totalDepositAmount,
                error: depositError instanceof Error ? depositError.message : String(depositError),
              });
              throw new BusinessError(
                `Failed to apply customer deposits: ${depositError instanceof Error ? depositError.message : String(depositError)}`,
                'ERR_SALE_004',
                { customerId: input.customerId, requestedAmount: totalDepositAmount }
              );
            }
          }
        }
      }

      // AUTO-CONVERSION: If quote ID provided, mark quotation as converted
      // Business Logic for POS: Allow DRAFT/SENT/ACCEPTED quotations to convert
      // Workflow: Quote (DRAFT/SENT/ACCEPTED) → Load to POS → Customer Pays → CONVERTED
      // Note: Stricter validation (ACCEPTED only) applies to formal conversion endpoint
      if (input.quoteId) {
        try {
          logger.info('🔍 Starting quote auto-conversion from POS', {
            quoteId: input.quoteId,
            customerId: input.customerId,
            hasPaymentLines: !!(input.paymentLines && input.paymentLines.length > 0),
          });

          // BR-QUOTE-001: Verify quotation exists and isn't already converted
          const quoteCheck = await client.query('SELECT status FROM quotations WHERE id = $1', [
            input.quoteId,
          ]);

          if (!quoteCheck.rows[0]) {
            throw new NotFoundError('Quotation');
          }

          const quoteStatus = quoteCheck.rows[0].status;

          // POS allows DRAFT, SENT, or ACCEPTED quotes to convert
          // (customer payment in POS implies acceptance)
          const allowedStatuses = ['DRAFT', 'SENT', 'ACCEPTED'];
          if (!allowedStatuses.includes(quoteStatus)) {
            throw new BusinessError(
              `Cannot convert quotation with status: ${quoteStatus}. Already converted, cancelled, or rejected.`,
              'ERR_SALE_005',
              { quoteId: input.quoteId, currentStatus: quoteStatus, allowedStatuses }
            );
          }

          logger.info('✅ Quotation verified for POS conversion', {
            quoteId: input.quoteId,
            status: quoteStatus,
            note: 'POS conversion allows DRAFT/SENT/ACCEPTED statuses',
          });

          // Create invoice for quote conversion (business rule: quotes always get invoices)
          let invoiceId: string | undefined;
          if (input.customerId) {
            const { invoiceRepository } = await import('../invoices/invoiceRepository.js');

            // Fetch customer name for invoice (required field)
            const customerResult = await client.query('SELECT name FROM customers WHERE id = $1', [
              input.customerId,
            ]);
            const customerName = customerResult.rows[0]?.name || 'Unknown Customer';

            // Calculate due date (30 days from today) — string-only, no Date conversion
            const dueDateStr = addDaysToDateString(getBusinessDate(), 30);

            const invoiceResult = await invoiceRepository.createInvoice(client, {
              saleId: sale.id,
              customerId: input.customerId,
              customerName: customerName,
              quoteId: input.quoteId,
              dueDate: dueDateStr,
              subtotal: Money.toNumber(Money.parse(input.subtotal || 0)),
              taxAmount: Money.toNumber(Money.parse(input.taxAmount || 0)),
              totalAmount: Money.toNumber(Money.parse(input.totalAmount || 0)),
              createdById: input.soldBy,
            });
            invoiceId = invoiceResult?.id;

            // Record payments on invoice using repository (not service - we're already in a transaction)
            // Follow BR-INV-001, BR-INV-002, BR-INV-003 (established invoice payment business rules)
            if (input.paymentLines && input.paymentLines.length > 0 && invoiceId) {
              // VALIDATION: Ensure total payment amount doesn't exceed invoice total
              const totalPayments = input.paymentLines
                .filter((p) => p.paymentMethod !== 'CREDIT' && p.amount > 0)
                .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0))
                .toNumber();

              if (
                new Decimal(totalPayments).greaterThan(
                  new Decimal(input.totalAmount || 0).plus('0.01')
                )
              ) {
                throw new BusinessError(
                  `Payment amount (${totalPayments}) exceeds invoice total (${input.totalAmount})`,
                  'ERR_PAYMENT_004',
                  { totalPayments, invoiceTotal: input.totalAmount }
                );
              }

              // Record each non-CREDIT payment separately (matches invoice_payments table structure)
              for (const paymentLine of input.paymentLines) {
                if (paymentLine.paymentMethod !== 'CREDIT' && paymentLine.amount > 0) {
                  await invoiceRepository.addPayment(client, {
                    invoiceId,
                    amount: Money.toNumber(Money.parse(paymentLine.amount)),
                    paymentMethod: paymentLine.paymentMethod as
                      | 'CASH'
                      | 'CARD'
                      | 'MOBILE_MONEY'
                      | 'BANK_TRANSFER',
                    paymentDate: undefined, // Use current date
                    referenceNumber: paymentLine.reference || null,
                    notes: null,
                    processedById: input.soldBy, // Cashier who processed the sale
                  });
                }
              }

              // Recalculate invoice aggregates & status after all payments
              await invoiceRepository.recalcInvoice(client, invoiceId);

              // Synchronize payment to linked sale
              const freshInvoice = await invoiceRepository.getInvoiceById(client, invoiceId);
              if (freshInvoice) {
                await client.query(
                  `UPDATE sales 
                   SET amount_paid = $1 
                   WHERE id = $2`,
                  [freshInvoice.amount_paid, sale.id]
                );
              }

              // Recalculate customer balance from invoices (SSOT)
              const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
              await syncCustomerBalanceFromInvoices(client, input.customerId, 'QUOTATION_CREDIT_SALE');
            }
          }

          // BR-QUOTE-003: Mark quotation as CONVERTED (proper business logic)
          // CONVERTED status provides clear audit trail and prevents duplicate conversions
          const { quotationRepository } = await import('../quotations/quotationRepository.js');
          await quotationRepository.markQuotationAsConverted(
            client,
            input.quoteId,
            sale.id,
            invoiceId || null
          );

          logger.info('✅ Quote converted to sale', {
            quoteId: input.quoteId,
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            invoiceId,
            note: 'Quotation status unchanged - remains visible in active list',
            workflow: 'Quote → POS Sale → Invoice (status preserved)',
          });
        } catch (quoteError) {
          logger.error('❌ Failed to link quote to sale', {
            quoteId: input.quoteId,
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            error: quoteError instanceof Error ? quoteError.message : String(quoteError),
            stack: quoteError instanceof Error ? quoteError.stack : undefined,
          });
          // Don't fail the sale if quote conversion fails
          // The sale is already successful, just log the issue
          warnings.push(
            `Quote conversion failed for quote ${input.quoteId}: ${quoteError instanceof Error ? quoteError.message : String(quoteError)}. Sale created but quotation status not updated.`
          );
        }
      }
      // CREDIT SALE INVOICE: Create invoice if there's any outstanding balance
      // Single Source of Truth: hasOutstandingBalance determines if invoice is needed
      else if (input.customerId && hasOutstandingBalance) {
        try {
          const { invoiceRepository } = await import('../invoices/invoiceRepository.js');

          // ============================================================
          // CRITICAL: VALIDATE CUSTOMER BEFORE INVOICE CREATION
          // ============================================================
          // Prevent ghost invoices - customer MUST exist and be valid
          const customerResult = await client.query(
            'SELECT name, is_active FROM customers WHERE id = $1',
            [input.customerId]
          );

          if (customerResult.rows.length === 0) {
            throw new BusinessError(
              `Cannot create invoice for non-existent customer. This would create an orphaned receivable.`,
              'ERR_SALE_006',
              { customerId: input.customerId }
            );
          }

          const customer = customerResult.rows[0];
          const customerName = customer.name || 'Unknown Customer';

          if (!customer.is_active) {
            logger.warn('Creating invoice for inactive customer', {
              customerId: input.customerId,
              customerName,
              saleId: sale.id,
              saleNumber: sale.saleNumber,
            });
            // Optional: Throw error to prevent sales to inactive customers
            // throw new Error(`Cannot create invoice for inactive customer "${customerName}"`);
          }

          logger.info('🧾 Creating invoice for credit sale', {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            customerId: input.customerId,
            customerName,
            creditAmount: creditAmount.toFixed(2),
            totalAmount: Money.toNumber(finalTotalAmount),
            hasPaymentLines: !!(input.paymentLines && input.paymentLines.length > 0),
          });

          // Calculate due date (30 days from today) — string-only, no Date conversion
          const dueDateStr = addDaysToDateString(getBusinessDate(), 30);

          // IMPORTANT: Invoice represents the FULL SALE, not just the credit portion
          // This allows tracking all payments against the full amount
          const invoiceResult = await invoiceRepository.createInvoice(client, {
            saleId: sale.id,
            customerId: input.customerId,
            customerName: customerName,
            dueDate: dueDateStr,
            subtotal: Money.toNumber(Money.parse(input.subtotal || subtotal.toNumber())),
            taxAmount: Money.toNumber(Money.parse(input.taxAmount || taxAmount.toNumber())),
            totalAmount: Money.toNumber(finalTotalAmount), // Full sale amount
            createdById: input.soldBy,
          });
          const invoiceId = invoiceResult?.id;

          // Record ALL non-CREDIT payments on the invoice
          // This ensures the invoice shows what was already paid
          if (input.paymentLines && input.paymentLines.length > 0 && invoiceId) {
            for (const paymentLine of input.paymentLines) {
              if (paymentLine.paymentMethod !== 'CREDIT' && paymentLine.amount > 0) {
                await invoiceRepository.addPayment(client, {
                  invoiceId,
                  amount: Money.toNumber(Money.parse(paymentLine.amount)),
                  paymentMethod: paymentLine.paymentMethod as
                    | 'CASH'
                    | 'CARD'
                    | 'MOBILE_MONEY'
                    | 'BANK_TRANSFER',
                  paymentDate: undefined,
                  referenceNumber: paymentLine.reference || null,
                  notes: 'Initial payment from sale',
                  processedById: input.soldBy,
                });

                logger.info('Invoice payment recorded for credit sale', {
                  invoiceId,
                  amount: paymentLine.amount,
                  paymentMethod: paymentLine.paymentMethod,
                });
              }
            }

            // Recalculate invoice after all payments
            // This will update: amount_paid, balance, and status
            const updatedInvoice = await invoiceRepository.recalcInvoice(client, invoiceId);

            logger.info('Invoice recalculated', {
              invoiceId,
              totalAmount: updatedInvoice?.total_amount,
              amountPaid: updatedInvoice?.amount_paid,
              balance: updatedInvoice?.balance,
              status: updatedInvoice?.status,
            });
          }

          logger.info('✅ Invoice created for credit sale', {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            invoiceId,
            totalAmount: parseFloat(finalTotalAmount.toFixed(2)),
            creditAmount: creditAmount.toFixed(2),
            workflow: 'Credit sale → Invoice with initial payment',
          });

          // Recalculate customer balance from invoices (SSOT)
          const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
          await syncCustomerBalanceFromInvoices(client, input.customerId, 'CREDIT_SALE');
        } catch (invoiceError) {
          logger.error('❌ Failed to create invoice for credit sale - ROLLING BACK TRANSACTION', {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
            stack: invoiceError instanceof Error ? invoiceError.stack : undefined,
          });
          // CRITICAL: Invoice is MANDATORY for credit sales - must rollback!
          // Without invoice, accounts receivable cannot be tracked
          throw new BusinessError(
            `Credit sale requires invoice but invoice creation failed: ${invoiceError instanceof Error ? invoiceError.message : String(invoiceError)}`,
            'ERR_SALE_007',
            { saleId: sale.id, saleNumber: sale.saleNumber }
          );
        }
      }

      // ============================================================
      // PRE-COMMIT: Deduct from cost layers (FIFO products)
      // Must run inside transaction for atomicity with inventory changes
      // ============================================================
      for (const deduction of costLayerDeductions) {
        try {
          await costLayerService.deductFromCostLayers(
            deduction.productId,
            deduction.quantity,
            deduction.costingMethod,
            undefined, // dbPool
            client // txClient: reuse sale transaction to prevent deadlock
          );
          logger.info(`Cost layers deducted for product ${deduction.productId}`, {
            quantity: deduction.quantity,
            method: deduction.costingMethod,
          });
        } catch (error: unknown) {
          // Cost layer deduction failed - inventory already deducted but FIFO/AVCO tracking incomplete
          if (
            (error instanceof Error ? error.message : String(error))?.includes(
              'Insufficient cost layers'
            )
          ) {
            // Expected case: product uses average cost or has no layers
            logger.debug(
              `No cost layers available for product ${deduction.productId}, using average cost`,
              {
                productId: deduction.productId,
                quantity: deduction.quantity,
              }
            );
          } else {
            // Unexpected failure - log for manual review
            logger.warn('Cost layer deduction failed - FIFO/AVCO tracking may be inaccurate', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              productId: deduction.productId,
              quantity: deduction.quantity,
              error: error instanceof Error ? error.message : String(error),
              remediation: 'Review cost layers for this product and adjust if needed',
            });
            warnings.push(
              `Cost layer deduction failed for product ${deduction.productId}: ${error instanceof Error ? error.message : String(error)}. FIFO/AVCO tracking may be inaccurate.`
            );
          }
        }
      }

      // ============================================================
      // SAP GLT0-EQUIVALENT: Atomically update daily summary rollup
      // Must happen INSIDE the transaction so totals stay in sync
      // SAVEPOINT: prevents PG aborted-transaction if this fails
      // ============================================================
      try {
        await client.query('SAVEPOINT daily_summary');
        const summaryDate = sale.saleDate || getBusinessDate();
        const isCredit = sale.paymentMethod === 'CREDIT';
        // pg returns NUMERIC as strings — must convert for numeric comparison
        const paidNum = parseFloat(String(sale.amountPaid ?? 0));
        const totalNum = parseFloat(String(sale.totalAmount));
        const isPartial = isCredit && paidNum > 0 && paidNum < totalNum;
        await salesRepository.incrementDailySummary(
          client,
          summaryDate,
          sale.paymentMethod,
          sale.totalAmount,
          sale.totalCost || 0,
          sale.discountAmount || 0,
          isCredit,
          isPartial
        );
      } catch (summaryError: unknown) {
        await client.query('ROLLBACK TO SAVEPOINT daily_summary');
        logger.error('Daily summary rollup update failed — will be healed by reconciliation', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          error: summaryError instanceof Error ? summaryError.message : String(summaryError),
        });
      }

      // ============================================================
      // STATE TABLES: Product daily summary + Inventory balances
      // Atomically maintained inside posting transaction (SAP pattern)
      // Batch UPSERTs: 1 query per table instead of N per item (100M-scale)
      // SAVEPOINT: prevents PG aborted-transaction if this fails
      // ============================================================
      try {
        await client.query('SAVEPOINT state_tables');
        const stateDate = sale.saleDate || getBusinessDate();

        // Batch-fetch categories for all non-custom products
        const productIdsForCategory = itemsWithCosts
          .filter((it) => it.productId && !it.productId.startsWith('custom_'))
          .map((it) => it.productId!);

        const categoryMap = new Map<string, string>();
        if (productIdsForCategory.length > 0) {
          const catResult = await client.query(
            `SELECT id, COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') as category
             FROM products WHERE id = ANY($1)`,
            [[...new Set(productIdsForCategory)]]
          );
          for (const row of catResult.rows) {
            categoryMap.set(row.id, row.category);
          }
        }

        // Pre-aggregate by productId to avoid ON CONFLICT self-collision
        const pdsSummaryMap = new Map<string, { category: string; unitsSold: Decimal; revenue: Decimal; costOfGoods: Decimal; discountGiven: Decimal }>();
        const invSummaryMap = new Map<string, Decimal>();

        for (const item of itemsWithCosts) {
          if (!item.productId || item.productId.startsWith('custom_')) continue;

          const existing = pdsSummaryMap.get(item.productId);
          const costOfGoods = new Decimal(item.costPrice || 0).times(item.quantity);
          if (existing) {
            existing.unitsSold = existing.unitsSold.plus(item.quantity);
            existing.revenue = existing.revenue.plus(item.lineTotal);
            existing.costOfGoods = existing.costOfGoods.plus(costOfGoods);
            existing.discountGiven = existing.discountGiven.plus(item.discountAmount || 0);
          } else {
            pdsSummaryMap.set(item.productId, {
              category: categoryMap.get(item.productId) || 'Uncategorized',
              unitsSold: new Decimal(item.quantity),
              revenue: new Decimal(item.lineTotal),
              costOfGoods,
              discountGiven: new Decimal(item.discountAmount || 0),
            });
          }

          const invExisting = invSummaryMap.get(item.productId);
          invSummaryMap.set(item.productId, (invExisting || new Decimal(0)).plus(item.quantity));
        }

        // 1 query: batch product daily summary
        const pdsItems = Array.from(pdsSummaryMap.entries()).map(([productId, agg]) => ({
          productId,
          category: agg.category,
          unitsSold: agg.unitsSold.toNumber(),
          revenue: agg.revenue.toNumber(),
          costOfGoods: agg.costOfGoods.toNumber(),
          discountGiven: agg.discountGiven.toNumber(),
        }));
        await stateTablesRepo.batchUpsertProductDailySummary(client, stateDate, pdsItems);

        // 1 query: batch inventory balances
        const invItems = Array.from(invSummaryMap.entries()).map(([productId, qty]) => ({
          productId,
          quantity: qty.toNumber(),
        }));
        await stateTablesRepo.batchUpsertInventoryBalance(client, invItems, 'SOLD', stateDate);

        // Customer balances for credit sales
        if (sale.paymentMethod === 'CREDIT' && sale.customerId) {
          await stateTablesRepo.upsertCustomerBalance(client, {
            customerId: sale.customerId,
            invoicedAmount: Money.toNumber(finalTotalAmount),
            paidAmount: sale.amountPaid ?? 0,
            invoiceDate: stateDate,
          });
        }
      } catch (stateError: unknown) {
        await client.query('ROLLBACK TO SAVEPOINT state_tables');
        logger.error('State table update failed — will be healed by reconciliation', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }

      // ============================================================
      // ATOMIC ORDER COMPLETION: Mark POS order COMPLETED and link
      // Must run INSIDE this transaction so sale creation and order
      // status update are a single atomic unit (prevents duplicate sale risk)
      // ============================================================
      if (input.fromOrderId) {
        await client.query(
          `UPDATE pos_orders SET status = 'COMPLETED', completed_at = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [input.fromOrderId]
        );
        await client.query(
          `UPDATE sales SET from_order_id = $1 WHERE id = $2`,
          [input.fromOrderId, sale.id]
        );
        // Document flow: ORDER → SALE (non-fatal)
        try {
          await documentFlowService.linkDocuments(client, 'ORDER', input.fromOrderId, 'SALE', sale.id, 'CREATES');
        } catch (dfErr) {
          logger.warn('Document flow link ORDER→SALE failed (non-fatal)', { orderId: input.fromOrderId, saleId: sale.id, error: dfErr });
        }
      }

      await client.query('COMMIT');

      // NOTE: Audit logging is now handled in the controller layer
      // where we have access to request context (IP, user agent, session ID)

      // ============================================================
      // BANKING INTEGRATION: Create bank transactions for non-CASH payments
      // CRITICAL: Must succeed for bank reconciliation accuracy
      // Processes each payment individually so partial failures only
      // retry the payments that actually failed (not already-committed ones).
      // ============================================================
      {
        const saleDateStr = sale.saleDate || getBusinessDate();

        // Build the full list of non-cash payments that need bank transactions
        const paymentLinesToProcess = input.paymentLines || [];
        const pendingBankPayments: Array<{ amount: number; paymentMethod: string }> =
          paymentLinesToProcess
            .filter(
              (line) =>
                line.paymentMethod !== 'CASH' &&
                line.paymentMethod !== 'CREDIT' &&
                line.paymentMethod !== 'DEPOSIT'
            )
            .map((line) => ({ amount: line.amount, paymentMethod: line.paymentMethod }));

        // Single-payment fallback (no payment lines, non-cash)
        if (
          paymentLinesToProcess.length === 0 &&
          effectivePaymentMethod !== 'CASH' &&
          effectivePaymentMethod !== 'CREDIT'
        ) {
          pendingBankPayments.push({
            amount: Money.toNumber(actualTotalAmount),
            paymentMethod: effectivePaymentMethod,
          });
        }

        // Process each payment individually — track failures separately
        const failedPayments: Array<{ amount: number; paymentMethod: string }> = [];
        let lastError = '';

        for (const payment of pendingBankPayments) {
          try {
            await BankingService.createFromSale(
              sale.id,
              sale.saleNumber,
              payment.amount,
              payment.paymentMethod,
              saleDateStr,
              pool
            );
            logger.info('Bank transaction created for sale payment', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              paymentMethod: payment.paymentMethod,
              amount: payment.amount,
            });
          } catch (error: unknown) {
            lastError = error instanceof Error ? error.message : String(error);
            failedPayments.push(payment);
            logger.error('Bank transaction failed for payment', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              paymentMethod: payment.paymentMethod,
              amount: payment.amount,
              error: lastError,
            });
          }
        }

        // Queue ONLY the payments that actually failed
        if (failedPayments.length > 0) {
          const bankingPayload = {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            saleDate: saleDateStr,
            payments: failedPayments,
            failedAt: new Date().toISOString(),
            originalError: lastError,
            tenantId: tenantId || undefined,
          };

          try {
            await jobQueue.addJob('banking', 'create-bank-transaction', bankingPayload);
            incrementMetric('bankingRetriesTotal');
            logger.info('Banking retry job queued', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              failedCount: failedPayments.length,
            });
          } catch (queueErr: unknown) {
            // Queue itself failed (Redis down?) — fall back to error log for manual remediation
            logger.error('CRITICAL: Banking queue also failed — manual remediation required', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              queueError: queueErr instanceof Error ? queueErr.message : String(queueErr),
              bankingPayload,
            });
          }

          warnings.push(
            `Banking integration failed for ${failedPayments.length} payment(s) on sale ${sale.saleNumber}. Queued for automatic retry.`
          );
        }
      }

      // ============================================================
      // CASH REGISTER INTEGRATION: Record cash movements for drawer tracking
      // CRITICAL: Must record CASH payments to update expected closing amount
      // This ensures cash register closing has accurate expected total
      // ============================================================
      try {
        if (input.cashRegisterSessionId) {
          // Calculate total cash received (from payment lines or single payment)
          let totalCashReceived = new Decimal(0);

          if (input.paymentLines && input.paymentLines.length > 0) {
            // Split payment - sum up all CASH payments
            for (const line of input.paymentLines) {
              if (line.paymentMethod === 'CASH') {
                totalCashReceived = totalCashReceived.plus(new Decimal(line.amount));
              }
            }
          } else if (effectivePaymentMethod === 'CASH') {
            // Single payment method is CASH
            totalCashReceived = new Decimal(actualAmountPaid);
          }

          // Record cash movement if any cash was received
          if (totalCashReceived.greaterThan(0)) {
            await cashRegisterService.recordSaleMovement(
              input.cashRegisterSessionId,
              sale.id,
              totalCashReceived.toNumber(),
              input.soldBy
            );

            logger.info('Cash register movement recorded for sale', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              sessionId: input.cashRegisterSessionId,
              cashAmount: totalCashReceived.toNumber(),
            });
          }
        } else {
          // No session provided - log warning if CASH payment
          const hasCashPayment =
            input.paymentLines?.some((l) => l.paymentMethod === 'CASH') ||
            effectivePaymentMethod === 'CASH';

          if (hasCashPayment) {
            logger.warn('Cash sale without register session - drawer tracking will be incomplete', {
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              paymentMethod: effectivePaymentMethod,
              remediation: 'Ensure frontend passes cashRegisterSessionId for cash sales',
            });
          }
        }
      } catch (error: unknown) {
        // Non-blocking - sale is already committed
        logger.error('Cash register integration failed - drawer tracking incomplete', {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          sessionId: input.cashRegisterSessionId,
          error: error instanceof Error ? error.message : String(error),
          remediation: 'Manually record cash movement in cash register',
        });
        warnings.push(
          `Cash register integration failed: ${error instanceof Error ? error.message : String(error)}. Drawer tracking incomplete.`
        );
      }

      const result = {
        sale,
        items,
        paymentLines: input.paymentLines || [],
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      // GL POSTING: Done above via glEntryService.recordSaleToGL()
      // (Database GL triggers disabled — application-layer posting is single source of truth)

      // ============================================================
      // DELIVERY NOTE: Created manually via Delivery > "From Sale" UI.
      // Previously auto-created here via setImmediate, but that conflicted
      // with the manual Tally-style workflow (createDeliveryFromSale).
      // Delivery should be an intentional user action, not automatic.
      // See: deliveryService.createDeliveryFromSale()
      // ============================================================

      incrementMetric('salesCreatedTotal');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get sale by ID
   */
  async getSaleById(
    pool: Pool,
    id: string
  ): Promise<{
    sale: SaleRecord;
    items: SaleItemRecord[];
    paymentLines?: Record<string, unknown>[];
  }> {
    const result = await salesRepository.getSaleById(pool, id);

    if (!result) {
      throw new NotFoundError(`Sale ${id}`);
    }

    return result;
  },

  /**
   * List sales with pagination
   */
  async listSales(
    pool: Pool,
    page: number = 1,
    limit: number = 50,
    filters?: {
      status?: string;
      customerId?: string;
      cashierId?: string;
      paymentMethod?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ sales: SaleRecord[]; total: number }> {
    return salesRepository.listSales(pool, page, limit, filters);
  },

  /**
   * Get sales summary (totals, count, by payment method)
   */
  async getSalesSummary(
    pool: Pool,
    filters?: {
      startDate?: string;
      endDate?: string;
      groupBy?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>> {
    // SAP GLT0-equivalent: read from pre-aggregated rollup table
    // Falls back to raw table scan if cashierId filter is present
    return salesRepository.getSalesSummaryFromRollup(pool, filters);
  },

  /**
   * Reconcile daily summary rollup vs raw sales table.
   */
  async reconcileDailySummary(
    pool: Pool,
    startDate?: string,
    endDate?: string
  ): Promise<{ drifts: Record<string, unknown>[]; isClean: boolean }> {
    return salesRepository.reconcileDailySummary(pool, startDate, endDate);
  },

  /**
   * Full rebuild of the daily summary rollup from raw sales data.
   */
  async rebuildDailySummary(pool: Pool): Promise<number> {
    return salesRepository.rebuildDailySummary(pool);
  },

  /**
   * Get product sales summary report
   */
  async getProductSalesSummary(
    pool: Pool,
    filters?: {
      startDate?: string;
      endDate?: string;
      productId?: string;
      customerId?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    return salesRepository.getProductSalesSummary(pool, filters);
  },

  /**
   * Get top selling products
   */
  async getTopSellingProducts(
    pool: Pool,
    limit: number = 10,
    filters?: {
      startDate?: string;
      endDate?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    return salesRepository.getTopSellingProducts(pool, limit, filters);
  },

  /**
   * Get sales summary by date
   */
  async getSalesSummaryByDate(
    pool: Pool,
    groupBy: 'day' | 'week' | 'month' = 'day',
    filters?: {
      startDate?: string;
      endDate?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    return salesRepository.getSalesSummaryByDate(pool, groupBy, filters);
  },

  /**
   * Get sales details report - items sold with quantity, UOM, and date
   */
  async getSalesDetailsReport(
    pool: Pool,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      productId?: string;
      customerId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    return salesRepository.getSalesDetailsReport(pool, filters);
  },

  /**
   * Get sales by cashier report - sales performance by user
   */
  async getSalesByCashier(
    pool: Pool,
    filters?: {
      startDate?: string;
      endDate?: string;
      userId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    return salesRepository.getSalesByCashier(pool, filters);
  },

  /**
   * Void a sale (requires manager approval for high-value sales)
   *
   * Business Rules:
   * - Only COMPLETED sales can be voided
   * - Void reason is MANDATORY
   * - Manager approval required for sales > threshold
   * - Inventory is restored to batches (FEFO reversal)
   * - Cost layers are restored (FIFO reversal)
   * - Customer balance is adjusted if credit sale
   * - Audit trail is created
   *
   * @param pool - Database connection pool
   * @param saleId - UUID of sale to void
   * @param voidedById - UUID of user requesting void
   * @param voidReason - Required explanation for void
   * @param approvedById - Optional UUID of manager approving void
   * @param amountThreshold - Amount requiring manager approval (default 1000000 UGX)
   */
  async voidSale(
    pool: Pool,
    saleId: string,
    voidedById: string,
    voidReason: string,
    approvedById?: string,
    amountThreshold: number = 1000000
  ): Promise<{
    success: boolean;
    sale: Record<string, unknown>;
    itemsRestored: number;
    totalAmount: number;
  }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Maintenance mode guard (replaces trg_maintenance_check_sales)
      await checkMaintenanceMode(client);

      // Suppress the inventory_batches trigger that auto-creates SM- stock_movements
      // Void code already creates proper MOV- movements for inventory restoration
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // Get sale details
      const saleResult = await client.query(`SELECT * FROM sales WHERE id = $1`, [saleId]);

      if (saleResult.rows.length === 0) {
        throw new NotFoundError('Sale');
      }

      const sale = saleResult.rows[0];

      // ERP discipline: A completed POS sale is NEVER voided.
      // Stock, invoice, and payment are already posted subsystems.
      // Reverse via Return workflow (refundSale) which posts CREDIT_NOTE + RETURN_IN + refund payment.
      if (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED') {
        throw new BusinessError(
          `Cannot void a completed POS sale (status: ${sale.status}). ` +
          `Stock, invoice, and payment are already posted. ` +
          `Use Return to reverse this sale — this restores inventory, posts a Credit Note, and issues a refund.`,
          'ERR_SALE_COMPLETED_NO_VOID',
          { saleId, currentStatus: sale.status }
        );
      }
      // Block void for already-reversed or already-voided statuses
      if (['VOID', 'REFUNDED', 'VOIDED_BY_RETURN'].includes(sale.status)) {
        throw new BusinessError(
          `Cannot void sale with status ${sale.status}.`,
          'ERR_SALE_008',
          { saleId, currentStatus: sale.status }
        );
      }

      // Fiscal period guard — cannot void sales in closed periods
      const saleDate = String(sale.sale_date).slice(0, 10);
      await checkAccountingPeriodOpen(client, saleDate);

      // Validate void reason
      if (!voidReason || voidReason.trim().length === 0) {
        throw new BusinessError('Void reason is required', 'ERR_SALE_009', { saleId });
      }

      // Check if manager approval is required
      const totalAmount = Money.toNumber(Money.parseDb(sale.total_amount ?? 0));
      const requiresApproval = totalAmount > amountThreshold;

      // ADMIN and MANAGER can self-approve high-value voids
      const voiderIsPrivileged = await salesRepository.isManager(client, voidedById);

      if (requiresApproval && !approvedById && !voiderIsPrivileged) {
        throw new BusinessError(
          `Manager approval required for sales over ${amountThreshold}. Total amount: ${totalAmount}`,
          'ERR_SALE_010',
          { saleId, totalAmount, amountThreshold }
        );
      }

      // If approval provided by someone else, verify approver is manager/admin
      if (approvedById && approvedById !== voidedById) {
        const isManager = await salesRepository.isManager(client, approvedById);
        if (!isManager) {
          throw new BusinessError('Approver must have MANAGER or ADMIN role', 'ERR_SALE_011', {
            approvedById,
          });
        }
      }

      // Get sale items for inventory restoration
      const saleItems = await salesRepository.getSaleItemsForVoid(client, saleId);

      logger.info('Voiding sale - restoring inventory', {
        saleId,
        saleNumber: sale.sale_number,
        itemCount: saleItems.length,
        totalAmount,
      });

      // Restore inventory for each item
      for (const item of saleItems) {
        const quantity = Money.toNumber(Money.parseDb(item.quantity ?? 0));
        const productId = String(item.productId);
        const batchId = item.batchId;

        // Get product costing method
        const productResult = await client.query(
          'SELECT costing_method FROM product_valuation WHERE product_id = $1',
          [productId]
        );
        const costingMethod = productResult.rows[0]?.costing_method || 'FIFO';

        // 1. FINANCIAL: Restore cost layers (reverse FIFO deduction)
        if (costingMethod === 'FIFO') {
          try {
            // Add back to cost layers
            const unitCost = Money.toNumber(Money.parseDb(item.unitCost ?? 0));
            await client.query(
              `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, batch_number, created_at)
               VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
              [productId, quantity, quantity, unitCost, `VOID-${sale.sale_number}`]
            );

            logger.info('Cost layer restored for voided sale', {
              productId,
              quantity,
              unitCost,
              saleNumber: sale.sale_number,
            });
          } catch (error: unknown) {
            logger.error('Failed to restore cost layer', {
              productId,
              error: error instanceof Error ? error.message : String(error),
            });
            // Don't fail transaction - inventory restoration is more critical
          }
        }

        // 2. PHYSICAL: Restore inventory batch (reverse FEFO deduction)
        if (batchId) {
          // Restore to specific batch
          await client.query(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity + $1,
                 status = CASE 
                   WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE'::batch_status
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = $2`,
            [quantity, batchId]
          );

          logger.info('Inventory batch restored for voided sale', {
            batchId,
            quantity,
            productId,
          });
        } else {
          // No batch tracked on the original sale item.
          // MUST create a new batch at the original unit_cost — NOT add to an existing
          // batch that may have a different cost_price. The GL reversal uses the original
          // sale COGS exactly; the Sub must match or GL 1300 > subledger drift results.
          await client.query(
            `INSERT INTO inventory_batches (
              product_id, batch_number, quantity, remaining_quantity,
              cost_price, received_date, status, notes
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'ACTIVE', $6)`,
            [
              productId,
              `VOID-RESTORE-${sale.sale_number}`,
              quantity,
              quantity,
              Money.toNumber(Money.parseDb(item.unitCost ?? 0)),
              `Restored from voided sale ${sale.sale_number}`,
            ]
          );

          logger.info('New inventory batch created for void restoration (no original batch tracked)', {
            productId,
            quantity,
            unitCost: Money.toNumber(Money.parseDb(item.unitCost ?? 0)),
            saleNumber: sale.sale_number,
          });
        }

        // App-layer sync: update BOTH product_inventory and products.quantity_on_hand
        await syncProductQuantity(client, productId);

        // 3. Record stock movement (VOID reversal)
        // Advisory lock prevents concurrent duplicate movement number generation
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const movNumRes = await client.query(
          `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
           LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
           AS movement_number
           FROM stock_movements 
           WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
        );
        const movementNumber =
          movNumRes.rows[0]?.movement_number || `MOV-${getBusinessYear()}-0001`;

        await client.query(
          `INSERT INTO stock_movements (
            movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
            reference_type, reference_id, notes, created_by_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            movementNumber,
            productId,
            batchId || null,
            'ADJUSTMENT_IN',
            quantity,
            Money.toNumber(Money.parseDb(item.unitCost ?? 0)),
            'VOID',
            saleId,
            `Void sale ${sale.sale_number}: ${voidReason}`,
            voidedById,
          ]
        );
      }

      // Cancel linked invoice if exists (SINGLE SOURCE OF TRUTH)
      // The invoice cancellation will trigger customer balance recalculation
      const linkedInvoiceResult = await client.query(
        `SELECT id FROM invoices WHERE sale_id = $1`,
        [saleId]
      );

      if (linkedInvoiceResult.rows.length > 0) {
        const invoiceId = linkedInvoiceResult.rows[0].id;

        // Set invoice to Cancelled with zero outstanding (customer no longer owes)
        await client.query(
          `UPDATE invoices 
           SET status = 'CANCELLED', 
               amount_due = 0,
               updated_at = NOW()
           WHERE id = $1`,
          [invoiceId]
        );

        logger.info('Invoice cancelled for voided sale', {
          saleId,
          invoiceId,
        });

        // NOTE: The trg_sync_customer_balance_on_invoice trigger will automatically
        // recalculate customer.balance from remaining unpaid invoices
      } else if (sale.customer_id) {
        // No invoice exists - recalculate customer balance from invoices (SSOT)
        // Even legacy sales: the balance must always derive from invoices
        const paymentLinesResult = await client.query(
          `SELECT SUM(amount) as credit_amount 
           FROM payment_lines 
           WHERE sale_id = $1 AND payment_method = 'CREDIT'`,
          [saleId]
        );

        const creditAmount = Money.toNumber(Money.parseDb(paymentLinesResult.rows[0]?.credit_amount ?? 0));

        if (creditAmount > 0) {
          const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
          await syncCustomerBalanceFromInvoices(client, sale.customer_id, 'SALE_VOID');

          logger.info('Customer balance recalculated for voided credit sale (no invoice)', {
            customerId: sale.customer_id,
            saleId,
            creditAmount,
          });
        }
      }

      // Mark sale as VOID
      const voidedSale = await salesRepository.voidSale(
        client,
        saleId,
        voidedById,
        voidReason,
        approvedById
      );

      // GL POSTING: Reverse the original sale GL entry
      // MUST succeed — if GL fails, the entire void rolls back to prevent discrepancies
      await glEntryService.recordSaleVoidToGL(
        {
          saleId,
          saleNumber: sale.sale_number,
          voidDate: getBusinessDate(),
          voidReason: voidReason || 'No reason provided',
        },
        pool,
        client
      );

      // ============================================================
      // SAP GLT0-EQUIVALENT: Atomically decrement daily summary rollup
      // Must happen INSIDE the transaction so totals stay in sync
      // SAVEPOINT: prevents PG aborted-transaction if this fails
      // ============================================================
      try {
        await client.query('SAVEPOINT void_daily_summary');
        const voidSaleDate = String(sale.sale_date).slice(0, 10);
        const isCredit = sale.payment_method === 'CREDIT';
        const amountPaid = Money.toNumber(Money.parseDb(sale.amount_paid ?? 0));
        const saleTotal = Money.toNumber(Money.parseDb(sale.total_amount ?? 0));
        const isPartial = isCredit && amountPaid > 0 && amountPaid < saleTotal;
        await salesRepository.decrementDailySummary(
          client,
          voidSaleDate,
          sale.payment_method,
          sale.total_amount || 0,
          sale.total_cost || 0,
          sale.discount_amount || 0,
          isCredit,
          isPartial
        );
      } catch (summaryError: unknown) {
        await client.query('ROLLBACK TO SAVEPOINT void_daily_summary');
        logger.error('Daily summary rollup decrement failed — will be healed by reconciliation', {
          saleId,
          saleNumber: sale.sale_number,
          error: summaryError instanceof Error ? summaryError.message : String(summaryError),
        });
      }

      // ============================================================
      // STATE TABLES: Reverse product daily summary + Inventory
      // Batch UPSERTs: 1 query per table instead of N per item (100M-scale)
      // SAVEPOINT: prevents PG aborted-transaction if this fails
      // ============================================================
      try {
        await client.query('SAVEPOINT void_state_tables');
        const voidDateStr = String(sale.sale_date).slice(0, 10);

        // Batch-fetch categories
        const voidProductIds = saleItems.map((it: { productId: string }) => it.productId).filter(Boolean);
        const voidCategoryMap = new Map<string, string>();
        if (voidProductIds.length > 0) {
          const catRes = await client.query(
            `SELECT id, COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') as category
             FROM products WHERE id = ANY($1)`,
            [[...new Set(voidProductIds)]]
          );
          for (const row of catRes.rows) {
            voidCategoryMap.set(row.id, row.category);
          }
        }

        // Pre-aggregate by productId
        const voidPdsMap = new Map<string, { category: string; unitsSold: Decimal; revenue: Decimal; costOfGoods: Decimal; discountGiven: Decimal }>();
        const voidInvMap = new Map<string, Decimal>();

        for (const item of saleItems) {
          if (!item.productId) continue;
          const qty = Money.parseDb(item.quantity);
          const unitCost = Money.parseDb(item.unitCost);
          const totalPrice = Money.parseDb(item.totalPrice);
          const costOfGoods = unitCost.times(qty);

          const itemDiscount = Money.parseDb(item.discountAmount ?? 0);
          const existing = voidPdsMap.get(item.productId);
          if (existing) {
            existing.unitsSold = existing.unitsSold.plus(qty);
            existing.revenue = existing.revenue.plus(totalPrice);
            existing.costOfGoods = existing.costOfGoods.plus(costOfGoods);
            existing.discountGiven = existing.discountGiven.plus(itemDiscount);
          } else {
            voidPdsMap.set(item.productId, {
              category: voidCategoryMap.get(item.productId) || 'Uncategorized',
              unitsSold: qty,
              revenue: totalPrice,
              costOfGoods,
              discountGiven: itemDiscount,
            });
          }

          const invExisting = voidInvMap.get(item.productId);
          voidInvMap.set(item.productId, (invExisting || new Decimal(0)).plus(qty));
        }

        // 1 query: batch decrement product daily summary
        const voidPdsItems = Array.from(voidPdsMap.entries()).map(([productId, agg]) => ({
          productId,
          category: agg.category,
          unitsSold: agg.unitsSold.toNumber(),
          revenue: agg.revenue.toNumber(),
          costOfGoods: agg.costOfGoods.toNumber(),
          discountGiven: agg.discountGiven.toNumber(),
        }));
        await stateTablesRepo.batchDecrementProductDailySummary(client, voidDateStr, voidPdsItems);

        // 1 query: batch restore inventory (void = RECEIVED)
        const voidInvItems = Array.from(voidInvMap.entries()).map(([productId, qty]) => ({
          productId,
          quantity: qty.toNumber(),
        }));
        await stateTablesRepo.batchUpsertInventoryBalance(client, voidInvItems, 'RECEIVED', voidDateStr);

        // Reverse customer balance for credit sales
        if (sale.payment_method === 'CREDIT' && sale.customer_id) {
          await stateTablesRepo.upsertCustomerBalance(client, {
            customerId: sale.customer_id,
            invoicedAmount: -Money.parseDb(sale.total_amount).toNumber(),
            paidAmount: -Money.parseDb(sale.amount_paid ?? 0).toNumber(),
            invoiceDate: voidDateStr,
          });
        }
      } catch (stateError: unknown) {
        await client.query('ROLLBACK TO SAVEPOINT void_state_tables');
        logger.error('State table void reversal failed — will be healed by reconciliation', {
          saleId,
          saleNumber: sale.sale_number,
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }

      await client.query('COMMIT');

      logger.info('Sale voided successfully', {
        saleId,
        saleNumber: sale.sale_number,
        voidedById,
        approvedById,
        totalAmount,
      });

      return {
        success: true,
        sale: voidedSale,
        itemsRestored: saleItems.length,
        totalAmount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to void sale', {
        saleId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  },

  // ============================================================
  // REFUND SALE (PARTIAL OR FULL)
  // ============================================================

  /**
   * Create a refund against a COMPLETED sale.
   *
   * Supports partial refunds (specific items/quantities) and full refunds.
   * Each refund creates an immutable sale_refunds document with line items.
   *
   * Business Rules:
   * - Only COMPLETED sales can be refunded (ERR_REFUND_001)
   * - Each item's refund qty must not exceed (quantity - refunded_qty) (ERR_REFUND_002)
   * - Inventory is restored to the original batch (or newest active)
   * - Cost layers are restored at original unit_cost (FIFO-accurate)
   * - GL entries are created: DR Revenue / CR Cash, DR Inventory / CR COGS
   * - When ALL items on the sale are fully refunded, sale status → REFUNDED
   * - Refund documents are immutable once created
   *
   * @param pool - Database connection pool
   * @param saleId - UUID of the sale to refund
   * @param refundedById - UUID of the user creating the refund
   * @param input - Refund items, reason, optional approval
   * @returns Refund document with items and restored inventory count
   */
  async refundSale(
    pool: Pool,
    saleId: string,
    refundedById: string,
    input: RefundSaleInput
  ): Promise<{
    refund: RefundRecord;
    refundItems: RefundItemRecord[];
    itemsRestored: number;
    isFullRefund: boolean;
  }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Maintenance mode guard
      await checkMaintenanceMode(client);

      // Suppress the inventory_batches trigger (refund code creates proper movements)
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // ── 1. Load & validate the sale ──────────────────────────────

      const saleResult = await client.query(
        `SELECT * FROM sales WHERE id = $1`,
        [saleId]
      );

      if (saleResult.rows.length === 0) {
        throw new NotFoundError('Sale');
      }

      const sale = saleResult.rows[0];

      // Allow return (refund) for COMPLETED and PARTIALLY_RETURNED sales
      // PARTIALLY_RETURNED = some items already returned; further returns allowed
      if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_RETURNED') {
        throw new BusinessError(
          `Cannot return sale with status ${sale.status}. Only COMPLETED or PARTIALLY_RETURNED sales can be returned.`,
          'ERR_REFUND_001',
          { saleId, currentStatus: sale.status, requiredStatus: 'COMPLETED or PARTIALLY_RETURNED' }
        );
      }

      // Fiscal period guard — cannot refund sales in closed periods
      const saleDate = String(sale.sale_date).slice(0, 10);
      await checkAccountingPeriodOpen(client, saleDate);

      // Validate reason
      if (!input.reason || input.reason.trim().length === 0) {
        throw new BusinessError('Refund reason is required', 'ERR_REFUND_003', { saleId });
      }

      // Validate at least one item
      if (!input.items || input.items.length === 0) {
        throw new BusinessError(
          'At least one item must be specified for refund',
          'ERR_REFUND_004',
          { saleId }
        );
      }

      // If approval provided, verify approver is manager
      if (input.approvedById) {
        const isManager = await salesRepository.isManager(client, input.approvedById);
        if (!isManager) {
          throw new BusinessError('Approver must have MANAGER or ADMIN role', 'ERR_REFUND_005', {
            approvedById: input.approvedById,
          });
        }
      }

      // ── 2. Load sale items & validate refund quantities ──────────

      const saleItems = await salesRepository.getSaleItemsForRefund(client, saleId);

      // Build lookup map by sale_item_id
      const saleItemMap = new Map(saleItems.map((si) => [si.id, si]));

      let refundTotalAmount = new Decimal(0);
      let refundTotalCost = new Decimal(0);

      // Validated list of items to process
      const validatedItems: Array<{
        saleItem: typeof saleItems[0];
        refundQty: Decimal;
        lineTotal: Decimal;
        costTotal: Decimal;
      }> = [];

      for (const refundItem of input.items) {
        const saleItem = saleItemMap.get(refundItem.saleItemId);
        if (!saleItem) {
          throw new BusinessError(
            `Sale item ${refundItem.saleItemId} not found on sale ${sale.sale_number}`,
            'ERR_REFUND_006',
            { saleItemId: refundItem.saleItemId, saleId }
          );
        }

        const remainingQty = new Decimal(saleItem.remainingQty);
        const refundQty = new Decimal(refundItem.quantity);

        if (refundQty.lessThanOrEqualTo(0)) {
          throw new BusinessError(
            'Refund quantity must be positive',
            'ERR_REFUND_007',
            { saleItemId: refundItem.saleItemId, quantity: refundItem.quantity }
          );
        }

        if (refundQty.greaterThan(remainingQty)) {
          throw new BusinessError(
            `Refund quantity ${refundQty} exceeds remaining refundable quantity ${remainingQty} for item "${saleItem.productName}"`,
            'ERR_REFUND_002',
            {
              saleItemId: refundItem.saleItemId,
              productName: saleItem.productName,
              requested: refundQty.toNumber(),
              remaining: remainingQty.toNumber(),
              originalQty: new Decimal(saleItem.quantity).toNumber(),
              alreadyRefunded: new Decimal(saleItem.refundedQty).toNumber(),
            }
          );
        }

        // Calculate refund amounts using ORIGINAL unit_price and unit_cost
        const unitPrice = new Decimal(saleItem.unitPrice);
        const unitCost = new Decimal(saleItem.unitCost);
        const lineTotal = Money.round(refundQty.times(unitPrice), 2);
        const costTotal = Money.round(refundQty.times(unitCost), 2);

        refundTotalAmount = refundTotalAmount.plus(lineTotal);
        refundTotalCost = refundTotalCost.plus(costTotal);

        validatedItems.push({ saleItem, refundQty, lineTotal, costTotal });
      }

      // ── 3. Create refund document ───────────────────────────────

      const refundData: CreateRefundData = {
        saleId,
        refundDate: input.refundDate || getBusinessDate(),
        reason: input.reason.trim(),
        totalAmount: refundTotalAmount.toFixed(2),
        totalCost: refundTotalCost.toFixed(2),
        createdById: refundedById,
        approvedById: input.approvedById,
      };

      const refund = await salesRepository.createRefund(client, refundData);

      logger.info('Refund document created', {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        saleId,
        saleNumber: sale.sale_number,
        totalAmount: refundTotalAmount.toFixed(2),
        totalCost: refundTotalCost.toFixed(2),
        itemCount: validatedItems.length,
      });

      // ── 4. Create refund line items & update refunded_qty ───────

      const refundItemsData: CreateRefundItemData[] = validatedItems.map(
        ({ saleItem, refundQty, lineTotal, costTotal }) => ({
          refundId: refund.id,
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          batchId: saleItem.batchId,
          quantity: refundQty.toFixed(4),
          unitPrice: saleItem.unitPrice,
          unitCost: saleItem.unitCost,
          lineTotal: lineTotal.toFixed(2),
          costTotal: costTotal.toFixed(2),
        })
      );

      const refundItems = await salesRepository.addRefundItems(client, refundItemsData);

      // Increment refunded_qty on each sale_item
      for (const { saleItem, refundQty } of validatedItems) {
        await salesRepository.incrementRefundedQty(client, saleItem.id, refundQty.toNumber());
      }

      // ── 5. Restore inventory for each refunded item ─────────────

      for (const { saleItem, refundQty } of validatedItems) {
        const productId = saleItem.productId;
        const batchId = saleItem.batchId;
        const quantity = refundQty.toNumber();
        const unitCost = Money.toNumber(Money.parseDb(saleItem.unitCost));

        // Skip custom items (no inventory)
        if (!productId || saleItem.itemType === 'custom') {
          logger.info('Skipping inventory restoration for custom/null product', {
            saleItemId: saleItem.id,
          });
          continue;
        }

        // 5a. Restore cost layer (FIFO-accurate at original unit_cost)
        try {
          await client.query(
            `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, batch_number, created_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [productId, quantity, quantity, unitCost, `REFUND-${refund.refundNumber}`]
          );
        } catch (error: unknown) {
          logger.error('Failed to restore cost layer for refund', {
            productId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // 5b. Restore inventory batch
        if (batchId) {
          await client.query(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity + $1,
                 status = CASE
                   WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE'::batch_status
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = $2`,
            [quantity, batchId]
          );
        } else {
          // No specific batch — restore to newest active batch
          const batchResult = await client.query(
            `SELECT id FROM inventory_batches
             WHERE product_id = $1 AND status = 'ACTIVE'
             ORDER BY received_date DESC, created_at DESC
             LIMIT 1`,
            [productId]
          );

          if (batchResult.rows.length > 0) {
            await client.query(
              `UPDATE inventory_batches
               SET remaining_quantity = remaining_quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [quantity, batchResult.rows[0].id]
            );
          } else {
            // Create new batch with REFUND reference
            await client.query(
              `INSERT INTO inventory_batches (
                product_id, batch_number, quantity, remaining_quantity,
                cost_price, received_date, status, notes
              ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'ACTIVE', $6)`,
              [
                productId,
                `REFUND-RESTORE-${refund.refundNumber}`,
                quantity,
                quantity,
                unitCost,
                `Restored from refund ${refund.refundNumber} on sale ${sale.sale_number}`,
              ]
            );
          }
        }

        // 5c. Sync product_inventory and products.quantity_on_hand
        await syncProductQuantity(client, productId);

        // 5d. Record stock movement (RETURN type)
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const movNumRes = await client.query(
          `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
           LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0')
           AS movement_number
           FROM stock_movements
           WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
        );
        const movementNumber =
          movNumRes.rows[0]?.movement_number || `MOV-${getBusinessYear()}-0001`;

        await client.query(
          `INSERT INTO stock_movements (
            movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
            reference_type, reference_id, notes, created_by_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            movementNumber,
            productId,
            batchId || null,
            'RETURN',
            quantity,
            unitCost,
            'REFUND',
            refund.id,
            `Refund ${refund.refundNumber} for sale ${sale.sale_number}: ${input.reason}`,
            refundedById,
          ]
        );
      }

      // ── 6. Handle customer balance (credit sale refund) ─────────

      if (sale.customer_id && sale.payment_method === 'CREDIT') {
        // Recalculate customer balance from invoices (SSOT) — never use incremental arithmetic
        const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
        await syncCustomerBalanceFromInvoices(client, sale.customer_id, 'SALE_REFUND');
      }

      // ── 7. GL Posting: Refund journal entry ─────────────────────

      // GL POSTING: Refund journal entry
      // MUST succeed — if GL fails, the entire refund rolls back to prevent discrepancies
      const glRefundData: SaleRefundData = {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        saleId,
        saleNumber: sale.sale_number,
        refundDate: input.refundDate || getBusinessDate(),
        reason: input.reason,
        totalAmount: refundTotalAmount.toNumber(),
        totalCost: refundTotalCost.toNumber(),
        paymentMethod: sale.payment_method,
        customerId: sale.customer_id || undefined,
      };

      const glTransactionId = await glEntryService.recordSaleRefundToGL(glRefundData, pool, client);

      // Link GL transaction to refund document
      if (glTransactionId) {
        await salesRepository.updateRefundGlTransaction(client, refund.id, glTransactionId);
      }

      // ── 8. Check if sale is now fully refunded ──────────────────

      const isFullRefund = await salesRepository.isSaleFullyRefunded(client, saleId);

      if (isFullRefund) {
        // Full return: COMPLETED/PARTIALLY_RETURNED → VOIDED_BY_RETURN
        // (SAP/Odoo discipline: original sale document preserved in audit trail;
        //  VOIDED_BY_RETURN signals it was fully reversed through the return workflow)
        await salesRepository.markSaleVoidedByReturn(client, saleId);
        logger.info('Sale fully returned — status changed to VOIDED_BY_RETURN', {
          saleId,
          saleNumber: sale.sale_number,
        });

        // SAP GLT0: Sale status changes from COMPLETED → REFUNDED,
        // so it no longer counts in COMPLETED summaries — decrement rollup
        // SAVEPOINT: prevents PG aborted-transaction if this fails
        try {
          await client.query('SAVEPOINT refund_daily_summary');
          const refundSaleDate = String(sale.sale_date).slice(0, 10);
          const isCredit = sale.payment_method === 'CREDIT';
          const amtPaid = Money.toNumber(Money.parseDb(sale.amount_paid ?? 0));
          const saleTotalAmt = Money.toNumber(Money.parseDb(sale.total_amount ?? 0));
          const isPartial = isCredit && amtPaid > 0 && amtPaid < saleTotalAmt;
          await salesRepository.decrementDailySummary(
            client,
            refundSaleDate,
            sale.payment_method,
            sale.total_amount || 0,
            sale.total_cost || 0,
            sale.discount_amount || 0,
            isCredit,
            isPartial
          );
        } catch (summaryError: unknown) {
          await client.query('ROLLBACK TO SAVEPOINT refund_daily_summary');
          logger.error('Daily summary rollup decrement failed on full return — will be healed by reconciliation', {
            saleId,
            saleNumber: sale.sale_number,
            error: summaryError instanceof Error ? summaryError.message : String(summaryError),
          });
        }
      } else {
        // Partial return: advance status from COMPLETED → PARTIALLY_RETURNED
        // If already PARTIALLY_RETURNED (prior returns exist), leave status as-is
        if (sale.status === 'COMPLETED') {
          await salesRepository.markSalePartiallyReturned(client, saleId);
          logger.info('Sale partially returned — status changed to PARTIALLY_RETURNED', {
            saleId,
            saleNumber: sale.sale_number,
          });
        }
      }

      await client.query('COMMIT');

      logger.info('Sale return completed successfully', {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        saleId,
        saleNumber: sale.sale_number,
        totalAmount: refundTotalAmount.toFixed(2),
        totalCost: refundTotalCost.toFixed(2),
        itemsRestored: validatedItems.length,
        isFullRefund,
      });

      return {
        refund,
        refundItems,
        itemsRestored: validatedItems.length,
        isFullRefund,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to refund sale', {
        saleId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  },
};
