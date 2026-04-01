/**
 * Document Flow Routes
 *
 * GET /api/document-flow/:entityType/:entityId  → full graph for any document
 */

import { Router } from 'express';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import * as documentFlowService from './documentFlowService.js';
import type { EntityType } from './documentFlowRepository.js';

const VALID_ENTITY_TYPES = new Set<string>([
  'QUOTATION', 'SALE', 'DELIVERY_ORDER', 'DELIVERY_NOTE',
  'INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE',
  'PURCHASE_ORDER', 'GOODS_RECEIPT', 'RETURN_GRN',
  'SUPPLIER_INVOICE', 'SUPPLIER_PAYMENT',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

router.get(
  '/:entityType/:entityId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;

    if (!VALID_ENTITY_TYPES.has(entityType)) {
      throw new ValidationError(`Invalid entity type: ${entityType}`);
    }
    if (!UUID_RE.test(entityId)) {
      throw new ValidationError('entityId must be a valid UUID');
    }

    const pool = req.app.get('pool');
    const nodes = await documentFlowService.getDocumentFlow(
      pool,
      entityType as EntityType,
      entityId,
    );

    res.json({ success: true, data: nodes });
  }),
);

export const documentFlowRoutes = router;
