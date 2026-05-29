/**
 * Return GRN Service
 * 
 * Business logic for creating and posting Return Goods Receipt Notes.
 * 
 * POSTING LOGIC (SAP LUW — atomic inventory + GL):
 * - Validates return qty ≤ (received qty − previously returned qty)
 * - Creates SUPPLIER_RETURN stock movements (decreases stock)
 * - Reduces batch remaining_quantity
 * - Deducts FIFO cost_layers (keeps layer subledger aligned with inventory GL)
 * - Recalculates product_inventory.quantity_on_hand
 * - Posts GL: DR GRN/IR Clearing (2150) / CR Inventory (1300) — inside same transaction
 *   ⚠️  AP (2100) is NOT touched on Return GRN post.
 *       Only a manually-created Supplier Credit Note reduces AP.
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
    returnGrnRepository,
    type ReturnGrn,
    type ReturnGrnLine,
} from './returnGrnRepository.js';
import * as stockMovementRepository from '../stock-movements/stockMovementRepository.js';
import * as costLayerService from '../../services/costLayerService.js';
import * as glEntryService from '../../services/glEntryService.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import {
    supplierCreditDebitNoteRepository,
} from '../credit-debit-notes/creditDebitNoteRepository.js';
import { supplierCreditDebitNoteService } from '../credit-debit-notes/creditDebitNoteService.js';
import { recordSupplierCreditNoteToGL, AccountCodes } from '../../services/glEntryService.js';
import {
    assertInventoryCouplingUnchanged,
    captureInventoryCoupling,
} from '../../services/inventorySubledgerCoupling.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { resolveCanonicalProductUom } from '../products/uomService.js';
import { PricingEngine } from '../../utils/pricingEngine.js';
import {
    assertWithinReturnableLimits,
    pickReturnableRow,
    validateReturnLinesAgainstSnapshot,
} from './returnGrnValidation.js';

export interface CreateReturnGrnInput {
    grnId: string;
    returnDate?: string;
    reason: string;
    createdBy: string;
    lines: Array<{
        productId: string;
        batchId?: string | null;
        uomId?: string | null;
        quantity: number;
        unitCost: number;
    }>;
}

export const returnGrnService = {

    /**
     * Create a Return GRN (DRAFT).
     * Validates that the GRN is finalized and lines reference valid items.
     */
    async create(
        pool: Pool,
        input: CreateReturnGrnInput,
    ): Promise<{ returnGrn: ReturnGrn; lines: ReturnGrnLine[] }> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Validate source GRN exists and is finalized
            // Resolve supplier through PO (standard) or through manual PO (for manual GRs)
            const grResult = await client.query(
                `SELECT g.id, g.status, g.purchase_order_id,
                COALESCE(s."Id", s2."Id") AS "supplierId",
                COALESCE(s."CompanyName", s2."CompanyName") AS "supplierName"
         FROM goods_receipts g
         LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
         LEFT JOIN suppliers s ON s."Id" = po.supplier_id
         LEFT JOIN inventory_batches ib_any ON ib_any.goods_receipt_id = g.id
         LEFT JOIN purchase_orders po2 ON po2.id = ib_any.purchase_order_id
         LEFT JOIN suppliers s2 ON s2."Id" = po2.supplier_id
         WHERE g.id = $1
         LIMIT 1`,
                [input.grnId]
            );
            if (grResult.rows.length === 0) throw new Error('Goods receipt not found');
            const gr = grResult.rows[0];
            if (gr.status !== 'COMPLETED' && gr.status !== 'FINALIZED') {
                throw new Error('Can only return items from a finalized goods receipt');
            }
            if (!gr.supplierId) throw new Error('GRN has no linked supplier');

            // 2. Validate at least one line
            if (!input.lines.length) throw new Error('At least one return line is required');

            // 3. Create RGRN header
            const returnGrn = await returnGrnRepository.create(client, {
                grnId: input.grnId,
                supplierId: gr.supplierId,
                returnDate: input.returnDate || getBusinessDate(),
                reason: input.reason,
                createdBy: input.createdBy,
            });

            // 4. Validate all lines against one snapshot (prevents multi-line over-return)
            const returnableSnapshot = await returnGrnRepository.getReturnableItems(client, input.grnId);
            const pendingLines: Array<{
                productId: string;
                batchId?: string | null;
                baseQuantity: number;
                productName: string;
            }> = [];

            for (const line of input.lines) {
                if (line.quantity <= 0) throw new Error('Return quantity must be positive');

                // ── Purchase-UOM lock (SAP-grade rule) ───────────────────────────
                // Returns MUST use the same UoM the item was received in.
                // Allowing a different UoM produces wrong base_quantity, wrong GL,
                // wrong inventory value, and MR11 drift.
                const grItemRow = await client.query<{
                    uom_id: string | null;
                    uom_name: string | null;
                    product_name: string | null;
                }>(
                    `SELECT gri.uom_id, u.name AS uom_name, p.name AS product_name
                     FROM goods_receipt_items gri
                     LEFT JOIN uoms u ON u.id = gri.uom_id
                     JOIN products p ON p.id = gri.product_id
                     WHERE gri.goods_receipt_id = $1 AND gri.product_id = $2
                     LIMIT 1`,
                    [input.grnId, line.productId],
                );
                const purchaseUomId: string | null = grItemRow.rows[0]?.uom_id ?? null;
                const purchaseUomName: string | null = grItemRow.rows[0]?.uom_name ?? null;
                const productName = grItemRow.rows[0]?.product_name ?? 'product';

                let effectiveUomId: string | null = line.uomId || null;

                if (purchaseUomId) {
                    if (effectiveUomId && effectiveUomId !== purchaseUomId) {
                        throw new ValidationError(
                            `UoM mismatch: this product was received in "${purchaseUomName ?? purchaseUomId}". ` +
                            `Returns must use the same unit of measure — no conversion allowed on returns.`,
                        );
                    }
                    // Default to purchase UOM when caller omits it
                    if (!effectiveUomId) {
                        effectiveUomId = purchaseUomId;
                    }
                }
                // ────────────────────────────────────────────────────────────────

                const { conversionFactor } = await resolveCanonicalProductUom(
                    line.productId,
                    effectiveUomId,
                    client,
                );

                const baseQuantity = PricingEngine.calculateBaseQuantity(
                    line.quantity,
                    conversionFactor,
                ).toNumber();

                pendingLines.push({
                    productId: line.productId,
                    batchId: line.batchId ?? null,
                    baseQuantity,
                    productName,
                });
            }

            const resolvedBatches = validateReturnLinesAgainstSnapshot(
                returnableSnapshot,
                pendingLines,
            );

            const lines: ReturnGrnLine[] = [];
            for (let i = 0; i < input.lines.length; i++) {
                const line = input.lines[i];
                const pending = pendingLines[i];
                const resolvedBatchId = resolvedBatches[i]?.batchId ?? line.batchId ?? null;

                const grItemRow = await client.query<{
                    uom_id: string | null;
                }>(
                    `SELECT gri.uom_id FROM goods_receipt_items gri
                     WHERE gri.goods_receipt_id = $1 AND gri.product_id = $2 LIMIT 1`,
                    [input.grnId, line.productId],
                );
                const purchaseUomId: string | null = grItemRow.rows[0]?.uom_id ?? null;
                let effectiveUomId: string | null = line.uomId || purchaseUomId;

                const { conversionFactor } = await resolveCanonicalProductUom(
                    line.productId,
                    effectiveUomId,
                    client,
                );

                const baseQuantity = pending.baseQuantity;

                // lineTotal = quantity × unitCost (both in purchase-UOM units).
                const lineTotal = Money.toNumber(
                    Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost))
                );

                const created = await returnGrnRepository.createLine(client, {
                    rgrnId: returnGrn.id,
                    productId: line.productId,
                    batchId: resolvedBatchId,
                    uomId: effectiveUomId,
                    quantity: line.quantity,
                    baseQuantity,
                    unitCost: line.unitCost,
                    lineTotal,
                });
                lines.push(created);
            }

            // Document Flow: GR → Return GRN
            await documentFlowService.linkDocuments(client, 'GOODS_RECEIPT', input.grnId, 'RETURN_GRN', returnGrn.id, 'RETURNS');

            logger.info('Return GRN draft created', {
                rgrnId: returnGrn.id,
                rgrnNumber: returnGrn.returnGrnNumber,
                grnId: input.grnId,
                lineCount: lines.length,
            });

            return { returnGrn, lines };
        });
    },

    /**
     * Post a Return GRN (DRAFT → POSTED).
     * 
     * For each line:
     * - Validates quantity ≤ (received - previously returned)
     * - Reduces batch remaining_quantity
     * - Creates SUPPLIER_RETURN stock movement
     * - Recalculates product_inventory.quantity_on_hand
     * 
     * GL entries (SAP pattern — atomic with inventory changes):
     *   DR Accounts Payable (2100) — reduce what we owe
     *   CR Inventory (1300) — reduce inventory value
     */
    async post(
        pool: Pool,
        rgrnId: string,
    ): Promise<ReturnGrn> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Get the RGRN and validate DRAFT status
            const rgrn = await returnGrnRepository.getById(client, rgrnId);
            if (!rgrn) throw new Error('Return GRN not found');
            if (rgrn.status !== 'DRAFT') throw new Error('Only DRAFT Return GRNs can be posted');

            // 2. Get lines
            const lines = await returnGrnRepository.getLines(client, rgrnId);
            if (lines.length === 0) throw new Error('Return GRN has no line items');

            const returnableSnapshot = await returnGrnRepository.getReturnableItems(client, rgrn.grnId);

            validateReturnLinesAgainstSnapshot(
                returnableSnapshot,
                lines.map((l) => ({
                    productId: l.productId,
                    batchId: l.batchId,
                    baseQuantity: l.baseQuantity,
                    productName: l.productName,
                })),
            );

            const inventoryCouplingBefore = await captureInventoryCoupling(client);

            // 3. Process each line
            // Also accumulate the GL amount from actual batch.cost_price (not line.unitCost).
            // line.unitCost is user-entered on the return document and can be wrong;
            // batch.cost_price is the authoritative inventory cost used in the batch subledger.
            // Using batch cost for GL ensures CR Inventory = batch subledger reduction.
            let returnTotalFromBatch = new Decimal(0);

            for (const line of lines) {
                // 3a. Batch must match draft line (resolved at create); FIFO fallback for legacy drafts
                let effectiveBatchId = line.batchId;
                if (!effectiveBatchId) {
                    effectiveBatchId = pickReturnableRow(
                        returnableSnapshot,
                        line.productId,
                        null,
                    )?.batchId ?? null;
                }

                // 3b. Re-check limits against live snapshot row (defense in depth)
                assertWithinReturnableLimits(
                    pickReturnableRow(returnableSnapshot, line.productId, effectiveBatchId ?? null),
                    line.baseQuantity,
                    line.productName ?? 'product',
                );

                // 3c. Reduce batch remaining_quantity and capture batch.cost_price for GL
                let batchCostPrice = new Decimal(line.unitCost || 0); // fallback to line.unitCost
                if (effectiveBatchId) {
                    const batchUpdate = await client.query(
                        `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND remaining_quantity >= $1
             RETURNING remaining_quantity, cost_price`,
                        [line.baseQuantity, effectiveBatchId]
                    );
                    if (batchUpdate.rows.length === 0) {
                        assertWithinReturnableLimits(
                            pickReturnableRow(
                                returnableSnapshot,
                                line.productId,
                                effectiveBatchId ?? null,
                            ),
                            line.baseQuantity,
                            line.productName ?? 'product',
                        );
                        throw new ValidationError(
                            `Insufficient on-hand batch quantity for ${line.productName} (batch ${line.batchNumber || 'auto'}).`,
                        );
                    }
                    // Use actual batch cost_price for GL — this is the authoritative cost
                    batchCostPrice = new Decimal(batchUpdate.rows[0].cost_price || 0);
                } else {
                    logger.warn('No batch found for return line — stock movement will be recorded but batch not deducted', {
                        productId: line.productId,
                        grnId: rgrn.grnId,
                    });
                }

                // Accumulate GL amount at batch cost (not user-entered line.unitCost)
                returnTotalFromBatch = returnTotalFromBatch.plus(
                    new Decimal(String(line.baseQuantity)).times(batchCostPrice)
                );

                // 3d. Create SUPPLIER_RETURN stock movement (use batch cost for SM consistency)
                await stockMovementRepository.recordMovement(client, {
                    productId: line.productId,
                    batchId: effectiveBatchId,
                    movementType: 'SUPPLIER_RETURN',
                    quantity: -line.baseQuantity, // Negative = stock decrease
                    unitCost: Money.toNumber(batchCostPrice), // batch.cost_price, not line.unitCost
                    referenceType: 'RETURN_GRN',
                    referenceId: rgrnId,
                    notes: `Return to supplier: ${rgrn.reason}`,
                    createdBy: rgrn.createdBy,
                });

                // 3e. FIFO cost_layers — mirror sale outbound (GR finalize creates layers)
                const costingResult = await client.query<{ costing_method: string | null }>(
                    `SELECT costing_method FROM product_valuation WHERE product_id = $1`,
                    [line.productId],
                );
                const costingMethod = (costingResult.rows[0]?.costing_method || 'FIFO') as
                    | 'FIFO'
                    | 'AVCO'
                    | 'STANDARD';
                if (costingMethod === 'FIFO') {
                    await costLayerService.deductFromCostLayers(
                        line.productId,
                        line.baseQuantity,
                        'FIFO',
                        undefined,
                        client,
                    );
                    logger.debug('Return GRN cost layers deducted', {
                        rgrnId,
                        productId: line.productId,
                        baseQuantity: line.baseQuantity,
                    });
                }

                // 3f. App-layer sync: update BOTH product_inventory and products.quantity_on_hand
                await syncProductQuantity(client, line.productId);
            }

            // 4. Post the RGRN
            const posted = await returnGrnRepository.post(client, rgrnId);
            if (!posted) throw new Error('Failed to post Return GRN');

            // 5. GL posting — INSIDE transaction (SAP LUW: atomic with inventory)
            //    DR Accounts Payable (2100) / CR Inventory (1300)
            //    Use batch-derived total (returnTotalFromBatch) not line.unitCost total.
            const returnTotalNum = Money.toNumber(returnTotalFromBatch);

            // Look up supplier name for GL description (hoisted for use in both step 5 and step 6)
            const grResult = await client.query(
                `SELECT COALESCE(po.supplier_id, po2.supplier_id) AS supplier_id,
                        COALESCE(s."CompanyName", s2."CompanyName") AS supplier_name,
                        g.receipt_number AS gr_number
                 FROM goods_receipts g
                 LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
                 LEFT JOIN suppliers s ON s."Id" = po.supplier_id
                 LEFT JOIN inventory_batches ib_any ON ib_any.goods_receipt_id = g.id
                 LEFT JOIN purchase_orders po2 ON po2.id = ib_any.purchase_order_id
                 LEFT JOIN suppliers s2 ON s2."Id" = po2.supplier_id
                 WHERE g.id = $1
                 LIMIT 1`,
                [rgrn.grnId]
            );
            const supplierName = grResult.rows[0]?.supplier_name || 'Unknown Supplier';
            const supplierId = grResult.rows[0]?.supplier_id || rgrn.supplierId || '';
            const originalGrNumber = grResult.rows[0]?.gr_number;

            if (returnTotalNum > 0) {
                // MR11 PURITY — detect whether the originating GRN already has a
                // posted supplier invoice.  If yes, the return must route through
                // Supplier Return Clearing (2160) so GR/IR (2150) is not polluted.
                const invoiceCheck = await client.query<{ has_invoice: boolean }>(
                    `SELECT EXISTS(
                        SELECT 1
                        FROM supplier_invoices si
                        WHERE si.deleted_at IS NULL
                          AND COALESCE(si."Status",'') NOT IN ('Cancelled','CANCELLED','Voided','VOIDED')
                          AND (
                            si."Id" IN (
                              SELECT sigl.invoice_id
                              FROM supplier_invoice_grn_links sigl
                              WHERE sigl.grn_id = $1
                            )
                            OR si."InternalReferenceNumber" = (
                              SELECT receipt_number FROM goods_receipts WHERE id = $1
                            )
                          )
                     ) AS has_invoice`,
                    [rgrn.grnId],
                );
                const hasInvoice = invoiceCheck.rows[0]?.has_invoice ?? false;

                await glEntryService.recordReturnGrnToGL(
                    {
                        returnGrnId: rgrnId,
                        returnGrnNumber: posted.returnGrnNumber || rgrnId,
                        returnDate: getBusinessDate(),
                        totalAmount: returnTotalNum,
                        supplierId,
                        supplierName,
                        originalGrNumber,
                        hasInvoice,
                    },
                    undefined, // pool — not needed when txClient is provided
                    client,    // atomic: GL commits/rolls back with inventory
                );
            }

            assertInventoryCouplingUnchanged(
                inventoryCouplingBefore,
                await captureInventoryCoupling(client),
                `return GRN ${posted.returnGrnNumber || rgrnId}`,
            );

            // NOTE: supplier balance is NOT updated here.
            // AP (2100) is untouched by a Return GRN.
            // Only a Supplier Credit Note (created manually via POST /:id/credit-note)
            // should reduce AP and update the supplier's outstanding balance.

            logger.info('Return GRN posted — stock decreased, GL posted', {
                rgrnId: posted.id,
                rgrnNumber: posted.returnGrnNumber,
                grnId: posted.grnId,
                lineCount: lines.length,
                glAmount: returnTotalNum,
            });

            return posted;
        });
    },

    /**
     * Get a Return GRN with its line items.
     */
    async getById(
        pool: Pool,
        rgrnId: string,
    ): Promise<{ returnGrn: ReturnGrn; lines: ReturnGrnLine[] } | null> {
        const returnGrn = await returnGrnRepository.getById(pool, rgrnId);
        if (!returnGrn) return null;
        const lines = await returnGrnRepository.getLines(pool, rgrnId);
        return { returnGrn, lines };
    },

    /**
     * List Return GRNs with pagination.
     */
    async list(
        pool: Pool,
        options: { grnId?: string; supplierId?: string; status?: string; page: number; limit: number },
    ) {
        return returnGrnRepository.list(pool, options);
    },

    /**
     * Get returnable items for a GRN (for UI).
     */
    async getReturnableItems(pool: Pool, grnId: string) {
        const items = await returnGrnRepository.getReturnableItems(pool, grnId);
        return items.map(item => ({
            ...item,
            conversionFactor: Number(item.conversionFactor) || 1,
            receivedQuantity: Number(item.receivedQuantity) || 0,
            unitCost: Number(item.unitCost) || 0,
            returnedQuantity: Number(item.returnedQuantity) || 0,
            returnableQuantity: Number(item.returnableQuantity) || 0,
        }));
    },

    /**
     * Get Return GRNs linked to a specific GRN (for badge display).
     */
    async getByGrnId(pool: Pool, grnId: string) {
        return returnGrnRepository.getByGrnId(pool, grnId);
    },

    /**
     * Create a Supplier Credit Note from a POSTED Return GRN.
     *
     * This is the ONLY way a Return GRN should reduce AP (2100).
     *
     * Two GL flows depending on whether the Return GRN was posted before or
     * after the originating GRN had a supplier invoice:
     *
     * ── Pre-invoice return (GRN uninvoiced at return time) ──────────────
     *   Return GRN posts:  DR GR/IR Clearing (2150) / CR Inventory (1300)
     *   Credit Note posts: DR AP (2100)              / CR GR/IR Clearing (2150)
     *   Net effect: DR AP / CR Inventory ✓  |  GR/IR clears to zero ✓
     *
     * ── Post-invoice return (GRN already invoiced at return time) ───────
     *   Return GRN posts:  DR Supplier Return Clearing (2160) / CR Inventory (1300)
     *   Credit Note posts: DR AP (2100)                       / CR 2160
     *   Net effect: DR AP / CR Inventory ✓  |  GR/IR untouched ✓  |  2160 clears ✓
     *
     * The correct clearing account is determined by looking up which account
     * the Return GRN's journal entry debited (2150 or 2160).
     */
    async createCreditNoteFromReturn(
        pool: Pool,
        rgrnId: string,
        knownReferenceInvoiceId?: string,
    ): Promise<{ creditNoteId: string; creditNoteNumber: string }> {
        return UnitOfWork.run(pool, async (client) => {
            // 1. Validate RGRN exists and is POSTED
            const rgrn = await returnGrnRepository.getById(client, rgrnId);
            if (!rgrn) throw new Error('Return GRN not found');
            if (rgrn.status !== 'POSTED') throw new Error('Return GRN must be POSTED before creating a Credit Note');

            // 2. Prevent duplicate: check if a Credit Note already exists for this RGRN
            const existing = await client.query(
                `SELECT "Id" FROM supplier_invoices
                 WHERE return_grn_id = $1 AND document_type = 'SUPPLIER_CREDIT_NOTE' AND deleted_at IS NULL
                 LIMIT 1`,
                [rgrnId],
            );
            if (existing.rows.length > 0) {
                throw new Error('A Supplier Credit Note already exists for this Return GRN');
            }

            // 3. Load lines to calculate total and build line items
            const lines = await returnGrnRepository.getLines(client, rgrnId);
            if (lines.length === 0) throw new Error('Return GRN has no line items');

            // Use the pre-computed lineTotal from each return line.
            // lineTotal = quantity × unitCost (both in purchase-UOM units).
            // Do NOT recompute as baseQuantity × unitCost — that mixes base-unit
            // quantity with purchase-UOM price, producing a gross overstatement.
            let returnTotal = new Decimal(0);
            for (const line of lines) {
                returnTotal = returnTotal.plus(new Decimal(String(line.lineTotal)));
            }
            const returnTotalNum = Money.toNumber(returnTotal);
            if (returnTotalNum <= 0) throw new Error('Return GRN total amount is zero — cannot create Credit Note');

            // 4. Resolve supplier info
            const grResult = await client.query(
                `SELECT COALESCE(po.supplier_id, po2.supplier_id) AS supplier_id,
                        COALESCE(s."CompanyName", s2."CompanyName") AS supplier_name
                 FROM goods_receipts g
                 LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
                 LEFT JOIN suppliers s ON s."Id" = po.supplier_id
                 LEFT JOIN inventory_batches ib_any ON ib_any.goods_receipt_id = g.id
                 LEFT JOIN purchase_orders po2 ON po2.id = ib_any.purchase_order_id
                 LEFT JOIN suppliers s2 ON s2."Id" = po2.supplier_id
                 WHERE g.id = $1
                 LIMIT 1`,
                [rgrn.grnId],
            );
            const supplierId: string = grResult.rows[0]?.supplier_id || rgrn.supplierId || '';
            const supplierName: string = grResult.rows[0]?.supplier_name || 'Unknown Supplier';

            // 5. Find the original Supplier Invoice (to reduce its outstanding balance).
            //    Look-up order (most specific first):
            //      a) supplier_invoice_grn_links junction (set by createInvoiceFromGRN)
            //      b) InternalReferenceNumber = GR receipt_number (set by from-GR flow)
            //      c) PurchaseOrderId = GR's PO (legacy path / single-bill-per-PO)
            let referenceInvoiceId: string | undefined = knownReferenceInvoiceId;
            if (!referenceInvoiceId) {
                const siResult = await client.query(
                    `SELECT si."Id"
                     FROM supplier_invoices si
                     WHERE si.document_type = 'SUPPLIER_INVOICE'
                       AND si.deleted_at IS NULL
                       AND COALESCE(si."Status",'') NOT IN ('Cancelled','CANCELLED','Voided','VOIDED')
                       AND (
                         si."Id" IN (
                           SELECT sigl.invoice_id FROM supplier_invoice_grn_links sigl
                           WHERE sigl.grn_id = $1
                         )
                         OR si."InternalReferenceNumber" = (
                           SELECT receipt_number FROM goods_receipts WHERE id = $1
                         )
                         OR si."PurchaseOrderId" = (
                           SELECT purchase_order_id FROM goods_receipts WHERE id = $1
                         )
                       )
                     ORDER BY si."CreatedAt" DESC LIMIT 1`,
                    [rgrn.grnId],
                );
                referenceInvoiceId = siResult.rows[0]?.Id as string | undefined;
            }
            if (!referenceInvoiceId) {
                throw new ValidationError(
                    'Cannot create Supplier Credit Note: no Supplier Invoice has been billed for this Goods Receipt yet. ' +
                    'Open the Goods Receipt and click "Create Supplier Bill" first, then retry the Credit Note.',
                );
            }

            // 6. Generate SCN number and create header
            const scnNumber = await supplierCreditDebitNoteRepository.generateSupplierCreditNoteNumber(client);

            const scn = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
                invoiceNumber: scnNumber,
                documentType: 'SUPPLIER_CREDIT_NOTE',
                referenceInvoiceId: referenceInvoiceId,
                supplierId,
                issueDate: getBusinessDate(),
                subtotal: returnTotalNum,
                taxAmount: 0,
                totalAmount: returnTotalNum,
                reason: `Credit Note for ${rgrn.returnGrnNumber}: ${rgrn.reason}`,
                notes: `Linked to Return GRN ${rgrn.returnGrnNumber}`,
                returnGrnId: rgrnId,
            });

            // 7. Create line items
            // Use purchase-UOM quantity (line.quantity), not base quantity.
            // The supplier deals in purchase UOM (PKT, BOX) — not in base tablets.
            await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
                client,
                scn.id,
                lines.map((line, idx) => ({
                    productId: line.productId,
                    productName: line.productName || `Product ${idx + 1}`,
                    description: `Returned: ${line.quantity}${line.uomSymbol ? ' ' + line.uomSymbol : ''} × ${line.unitCost} (${rgrn.reason})`,
                    quantity: line.quantity,        // purchase-UOM qty (1 PKT, not 10 tablets)
                    unitCost: line.unitCost,        // purchase-UOM cost (6000/PKT, not 600/tablet)
                    taxRate: 0,
                })),
            );

            // 8. Post the SCN
            const postedScn = await supplierCreditDebitNoteRepository.postSupplierNote(client, scn.id);
            if (!postedScn) throw new Error('Failed to post Supplier Credit Note');

            // 9. GL: DR AP (2100) / CR [clearing account used by the RGRN]
            //
            // The clearing account depends on which path the Return GRN took:
            //   \u2022 Pre-invoice return  \u2192 RGRN debited GR/IR (2150)  \u2192 Credit Note credits 2150
            //   \u2022 Post-invoice return \u2192 RGRN debited 2160 (Supplier Return Clearing)
            //                         \u2192 Credit Note credits 2160
            //
            // Look up the debit leg of the RGRN journal to find which account was used.
            const rgrnClearingResult = await client.query<{ account_code: string }>(
                `SELECT a."AccountCode" AS account_code
                 FROM ledger_transactions lt
                 JOIN ledger_entries le ON le."TransactionId" = lt."Id"
                 JOIN accounts a ON a."Id" = le."AccountId"
                 WHERE lt."ReferenceType" = 'RETURN_GRN'
                   AND lt."ReferenceId" = $1
                   AND le."DebitAmount" > 0
                   AND a."AccountCode" IN ('2150','2160')
                 LIMIT 1`,
                [rgrnId],
            );
            const rgrnClearingCode: string =
                rgrnClearingResult.rows[0]?.account_code ?? AccountCodes.GRIR_CLEARING;

            await recordSupplierCreditNoteToGL({
                noteId: postedScn.id,
                noteNumber: postedScn.invoiceNumber,
                noteDate: getBusinessDate(),
                subtotal: returnTotalNum,
                taxAmount: 0,
                totalAmount: returnTotalNum,
                supplierId,
                supplierName,
                clearingAccountCode: rgrnClearingCode,
            }, undefined, client);

            // 10. Auto-allocate the credit note against the referenced bill
            //     (SAP/Odoo Case 1 — Return-derived CN, bill is known with
            //     certainty). The bill's outstanding is reduced and the CN is
            //     marked APPLIED if fully consumed. No floating credit.
            if (referenceInvoiceId) {
                await supplierCreditDebitNoteService.applySupplierCreditNote(
                    client,
                    postedScn.id,
                    { primaryBillId: referenceInvoiceId, allowFIFO: false },
                );
            }

            // 11. Recalculate supplier outstanding balance
            if (supplierId) {
                await recalcSupplierBalance(client, supplierId);
            }

            // 12. Document Flow: RETURN_GRN → SUPPLIER_CREDIT_NOTE
            await documentFlowService.linkDocuments(
                client, 'RETURN_GRN', rgrnId,
                'SUPPLIER_CREDIT_NOTE', postedScn.id, 'CREATES',
            );

            logger.info('Supplier Credit Note created from Return GRN', {
                scnId: postedScn.id,
                scnNumber: postedScn.invoiceNumber,
                rgrnId,
                rgrnNumber: rgrn.returnGrnNumber,
                amount: returnTotalNum,
            });

            return { creditNoteId: postedScn.id, creditNoteNumber: postedScn.invoiceNumber };
        });
    },
};
