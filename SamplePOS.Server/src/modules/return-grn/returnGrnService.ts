/**
 * Return GRN Service
 * 
 * Business logic for creating and posting Return Goods Receipt Notes.
 * 
 * POSTING LOGIC (SAP LUW — atomic inventory + GL):
 * - Validates return qty ≤ (received qty − previously returned qty)
 * - Creates SUPPLIER_RETURN stock movements (decreases stock)
 * - Reduces batch remaining_quantity
 * - Recalculates product_inventory.quantity_on_hand
 * - Posts GL: DR Accounts Payable (2100) / CR Inventory (1300) — inside same transaction
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
import * as glEntryService from '../../services/glEntryService.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import {
    supplierCreditDebitNoteRepository,
} from '../credit-debit-notes/creditDebitNoteRepository.js';
import { recordSupplierCreditNoteToGL } from '../../services/glEntryService.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import { getBusinessDate } from '../../utils/dateRange.js';

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

            // 4. Create line items with validation
            const lines: ReturnGrnLine[] = [];
            for (const line of input.lines) {
                if (line.quantity <= 0) throw new Error('Return quantity must be positive');

                // Look up conversion factor for UoM (default 1 = base unit)
                let conversionFactor = 1;
                if (line.uomId) {
                    const cfResult = await client.query(
                        `SELECT conversion_factor FROM product_uoms WHERE product_id = $1 AND uom_id = $2`,
                        [line.productId, line.uomId]
                    );
                    if (cfResult.rows.length > 0) {
                        conversionFactor = Number(cfResult.rows[0].conversion_factor) || 1;
                    }
                }
                const baseQuantity = Money.toNumber(
                    Money.multiply(Money.parseDb(line.quantity), Money.parseDb(conversionFactor))
                );

                const lineTotal = Money.toNumber(
                    Money.multiply(Money.parseDb(baseQuantity), Money.parseDb(line.unitCost))
                );

                const created = await returnGrnRepository.createLine(client, {
                    rgrnId: returnGrn.id,
                    productId: line.productId,
                    batchId: line.batchId || null,
                    uomId: line.uomId || null,
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

            // 3. Process each line
            for (const line of lines) {
                // 3a. Resolve batch — prefer explicit batchId, otherwise look up via GR linkage
                let effectiveBatchId = line.batchId;
                if (!effectiveBatchId) {
                    const batchLookup = await client.query(
                        `SELECT ib.id FROM inventory_batches ib
                         WHERE ib.goods_receipt_id = $1
                           AND ib.product_id = $2
                           AND ib.status = 'ACTIVE'
                           AND ib.remaining_quantity > 0
                         ORDER BY ib.expiry_date ASC NULLS LAST, ib.created_at ASC
                         LIMIT 1`,
                        [rgrn.grnId, line.productId]
                    );
                    if (batchLookup.rows.length > 0) {
                        effectiveBatchId = batchLookup.rows[0].id;
                    }
                }

                // 3b. Validate returnable quantity
                const alreadyReturned = await returnGrnRepository.getReturnedQuantity(
                    client, rgrn.grnId, line.productId, effectiveBatchId,
                );

                // Get originally received quantity for this product from the GR
                const receivedResult = await client.query(
                    `SELECT COALESCE(SUM(gri.received_quantity), 0) AS received
           FROM goods_receipt_items gri
           WHERE gri.goods_receipt_id = $1
             AND gri.product_id = $2`,
                    [rgrn.grnId, line.productId]
                );
                const received = Number(receivedResult.rows[0].received) || 0;
                const returnable = received - alreadyReturned;

                if (line.baseQuantity > returnable) {
                    throw new Error(
                        `Cannot return ${line.baseQuantity} of ${line.productName}. ` +
                        `Received: ${received}, already returned: ${alreadyReturned}, returnable: ${returnable}`
                    );
                }

                // 3c. Reduce batch remaining_quantity
                if (effectiveBatchId) {
                    const batchUpdate = await client.query(
                        `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND remaining_quantity >= $1
             RETURNING remaining_quantity`,
                        [line.baseQuantity, effectiveBatchId]
                    );
                    if (batchUpdate.rows.length === 0) {
                        throw new Error(
                            `Insufficient batch quantity for ${line.productName} (batch ${line.batchNumber || 'auto'})`
                        );
                    }
                } else {
                    logger.warn('No batch found for return line — stock movement will be recorded but batch not deducted', {
                        productId: line.productId,
                        grnId: rgrn.grnId,
                    });
                }

                // 3d. Create SUPPLIER_RETURN stock movement
                await stockMovementRepository.recordMovement(client, {
                    productId: line.productId,
                    batchId: effectiveBatchId,
                    movementType: 'SUPPLIER_RETURN',
                    quantity: -line.baseQuantity, // Negative = stock decrease
                    unitCost: line.unitCost,
                    referenceType: 'RETURN_GRN',
                    referenceId: rgrnId,
                    notes: `Return to supplier: ${rgrn.reason}`,
                    createdBy: rgrn.createdBy,
                });

                // 3d. App-layer sync: update BOTH product_inventory and products.quantity_on_hand
                await syncProductQuantity(client, line.productId);
            }

            // 4. Post the RGRN
            const posted = await returnGrnRepository.post(client, rgrnId);
            if (!posted) throw new Error('Failed to post Return GRN');

            // 5. GL posting — INSIDE transaction (SAP LUW: atomic with inventory)
            //    DR Accounts Payable (2100) / CR Inventory (1300)
            const returnTotal = lines.reduce((sum, line) => {
                return sum.plus(new Decimal(String(line.baseQuantity)).times(new Decimal(String(line.unitCost || 0))));
            }, new Decimal(0));
            const returnTotalNum = Money.toNumber(returnTotal);

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
                await glEntryService.recordReturnGrnToGL(
                    {
                        returnGrnId: rgrnId,
                        returnGrnNumber: posted.returnGrnNumber || rgrnId,
                        returnDate: getBusinessDate(),
                        totalAmount: returnTotalNum,
                        supplierId,
                        supplierName,
                        originalGrNumber,
                    },
                    undefined, // pool — not needed when txClient is provided
                    client,    // atomic: GL commits/rolls back with inventory
                );
            }

            // 5b. Recalculate supplier balance (accounts for GR, returns, payments)
            if (supplierId) {
                await recalcSupplierBalance(client, supplierId);
            }

            logger.info('Return GRN posted — stock decreased, GL posted, supplier balance updated', {
                rgrnId: posted.id,
                rgrnNumber: posted.returnGrnNumber,
                grnId: posted.grnId,
                lineCount: lines.length,
                glAmount: returnTotalNum,
            });

            // 6. SAP MIRO: Auto-create & auto-post Supplier Credit Note
            //    This gives accounting full product-level visibility of the return.
            //    Linked via document flow: RETURN_GRN → SUPPLIER_CREDIT_NOTE
            let supplierCreditNoteId: string | undefined;
            try {
                // Find the supplier invoice linked to the original GR (via document_flow or PO)
                const siResult = await client.query(
                    `SELECT si."Id" FROM supplier_invoices si
                     WHERE si."PurchaseOrderId" = (
                       SELECT purchase_order_id FROM goods_receipts WHERE id = $1
                     )
                     AND si.document_type = 'SUPPLIER_INVOICE'
                     ORDER BY si."CreatedAt" DESC LIMIT 1`,
                    [rgrn.grnId]
                );
                const referenceInvoiceId = siResult.rows[0]?.Id as string | undefined;

                if (referenceInvoiceId) {
                    // Generate SCN number
                    const scnNumber = await supplierCreditDebitNoteRepository.generateSupplierCreditNoteNumber(client);

                    // Create the SCN header (DRAFT → will auto-post below)
                    const scn = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
                        invoiceNumber: scnNumber,
                        documentType: 'SUPPLIER_CREDIT_NOTE',
                        referenceInvoiceId,
                        supplierId: supplierId || rgrn.supplierId,
                        issueDate: getBusinessDate(),
                        subtotal: returnTotalNum,
                        taxAmount: 0,
                        totalAmount: returnTotalNum,
                        reason: `Auto-generated from ${posted.returnGrnNumber}: ${rgrn.reason}`,
                        notes: `Source: ${posted.returnGrnNumber} against ${originalGrNumber || rgrn.grnId}`,
                        returnGrnId: rgrnId,
                    });

                    // Create line items with product detail
                    await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
                        client,
                        scn.id,
                        lines.map((line, idx) => ({
                            productId: line.productId,
                            productName: line.productName || `Product ${idx + 1}`,
                            description: `Returned: ${line.baseQuantity} × ${line.unitCost} (${rgrn.reason})`,
                            quantity: line.baseQuantity,
                            unitCost: line.unitCost,
                            taxRate: 0,
                        })),
                    );

                    // Auto-post the SCN
                    const postedScn = await supplierCreditDebitNoteRepository.postSupplierNote(client, scn.id);
                    if (postedScn) {
                        supplierCreditNoteId = postedScn.id;

                        // Post SCN GL: DR AP (2100) / CR Purchase Returns (5010)
                        await recordSupplierCreditNoteToGL({
                            noteId: postedScn.id,
                            noteNumber: postedScn.invoiceNumber,
                            noteDate: getBusinessDate(),
                            subtotal: returnTotalNum,
                            taxAmount: 0,
                            totalAmount: returnTotalNum,
                            supplierId: supplierId || rgrn.supplierId,
                            supplierName,
                        }, undefined, client);

                        // Reduce outstanding on original supplier invoice
                        await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
                            client,
                            referenceInvoiceId,
                            returnTotalNum,
                            'CREDIT',
                        );

                        // Document Flow: RETURN_GRN → SUPPLIER_CREDIT_NOTE
                        await documentFlowService.linkDocuments(
                            client, 'RETURN_GRN', rgrnId,
                            'SUPPLIER_CREDIT_NOTE', postedScn.id, 'CREATES',
                        );

                        logger.info('Auto-created Supplier Credit Note from RGRN', {
                            scnId: postedScn.id,
                            scnNumber: postedScn.invoiceNumber,
                            rgrnNumber: posted.returnGrnNumber,
                            amount: returnTotalNum,
                        });
                    }
                } else {
                    logger.warn('No supplier invoice found for GR — Supplier Credit Note not auto-created', {
                        rgrnId, grnId: rgrn.grnId,
                    });
                }
            } catch (scnError: unknown) {
                // Non-fatal: RGRN + GL are already committed, SCN is a convenience document
                logger.error('Failed to auto-create Supplier Credit Note (non-fatal)', {
                    rgrnId, error: scnError instanceof Error ? scnError.message : String(scnError),
                });
            }

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
};
