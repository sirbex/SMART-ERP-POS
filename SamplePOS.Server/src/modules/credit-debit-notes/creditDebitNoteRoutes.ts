/**
 * Credit/Debit Note Routes
 * 
 * Routes for customer and supplier credit/debit note operations.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { creditDebitNoteController, supplierCreditDebitNoteController } from './creditDebitNoteController.js';

export const creditDebitNoteRoutes = Router();

// ============================================================
// CUSTOMER CREDIT/DEBIT NOTES (/api/credit-debit-notes/customer/...)
// ============================================================

// List customer notes
creditDebitNoteRoutes.get(
  '/customer',
  authenticate,
  creditDebitNoteController.listNotes,
);

// Get all notes linked to a specific invoice (must come before /:id)
creditDebitNoteRoutes.get(
  '/customer/invoice/:id',
  authenticate,
  creditDebitNoteController.getNotesForInvoice,
);

// Get single customer note
creditDebitNoteRoutes.get(
  '/customer/:id',
  authenticate,
  creditDebitNoteController.getNoteById,
);

// Create customer credit note
creditDebitNoteRoutes.post(
  '/customer/credit-note',
  authenticate,
  requirePermission('accounting.create'),
  creditDebitNoteController.createCreditNote,
);

// Create customer debit note
creditDebitNoteRoutes.post(
  '/customer/debit-note',
  authenticate,
  requirePermission('accounting.create'),
  creditDebitNoteController.createDebitNote,
);

// Post customer note (DRAFT → POSTED)
creditDebitNoteRoutes.post(
  '/customer/:id/post',
  authenticate,
  requirePermission('accounting.create'),
  creditDebitNoteController.postNote,
);

// ============================================================
// SUPPLIER CREDIT/DEBIT NOTES (/api/credit-debit-notes/supplier/...)
// ============================================================

// List supplier notes
creditDebitNoteRoutes.get(
  '/supplier',
  authenticate,
  supplierCreditDebitNoteController.listNotes,
);

// Get single supplier note
creditDebitNoteRoutes.get(
  '/supplier/:id',
  authenticate,
  supplierCreditDebitNoteController.getNoteById,
);

// Create supplier credit note
creditDebitNoteRoutes.post(
  '/supplier/credit-note',
  authenticate,
  requirePermission('accounting.create'),
  supplierCreditDebitNoteController.createCreditNote,
);

// Create supplier debit note
creditDebitNoteRoutes.post(
  '/supplier/debit-note',
  authenticate,
  requirePermission('accounting.create'),
  supplierCreditDebitNoteController.createDebitNote,
);

// Post supplier note (DRAFT → POSTED)
creditDebitNoteRoutes.post(
  '/supplier/:id/post',
  authenticate,
  requirePermission('accounting.create'),
  supplierCreditDebitNoteController.postNote,
);
