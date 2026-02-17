/**
 * Supplier Payment Routes - Route definitions
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import * as supplierPaymentService from './supplierPaymentService.js';
import logger from '../../utils/logger.js';

export function createSupplierPaymentRoutes(pool: Pool): Router {
    const router = Router();

    // Apply authentication to all routes
    router.use(authenticate);

    // ============================================================
    // SUPPLIER PAYMENTS
    // ============================================================

    // Get all supplier payments
    router.get('/payments', async (req: Request, res: Response) => {
        try {
            const {
                page = '1',
                limit = '50',
                supplierId,
                paymentMethod,
                search,
                startDate,
                endDate
            } = req.query as Record<string, string>;

            const result = await supplierPaymentService.getSupplierPayments(pool, {
                page: parseInt(page),
                limit: parseInt(limit),
                supplierId,
                paymentMethod,
                search,
                startDate,
                endDate
            });

            res.json({
                success: true,
                ...result
            });
        } catch (error: any) {
            logger.error('Error fetching supplier payments', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Get supplier payment by ID
    router.get('/payments/:id', async (req: Request, res: Response) => {
        try {
            const payment = await supplierPaymentService.getSupplierPaymentById(pool, req.params.id);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, data: payment });
        } catch (error: any) {
            logger.error('Error fetching supplier payment', { id: req.params.id, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Create supplier payment
    router.post('/payments', requirePermission('suppliers.create'), async (req: Request, res: Response) => {
        try {
            const { supplierId, amount, paymentMethod, paymentDate, reference, notes } = req.body;

            if (!supplierId || !amount || !paymentMethod) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: supplierId, amount, paymentMethod'
                });
            }

            const userId = (req as any).user?.id;
            const payment = await supplierPaymentService.createSupplierPayment(pool, {
                supplierId,
                amount: parseFloat(amount),
                paymentMethod,
                paymentDate: paymentDate || new Date().toISOString().split('T')[0],
                reference,
                notes
            }, userId);

            res.status(201).json({ success: true, data: payment });
        } catch (error: any) {
            logger.error('Error creating supplier payment', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Update supplier payment
    router.put('/payments/:id', requirePermission('suppliers.update'), async (req: Request, res: Response) => {
        try {
            const payment = await supplierPaymentService.updateSupplierPayment(pool, req.params.id, req.body);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, data: payment });
        } catch (error: any) {
            logger.error('Error updating supplier payment', { id: req.params.id, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Delete supplier payment
    router.delete('/payments/:id', requirePermission('suppliers.delete'), async (req: Request, res: Response) => {
        try {
            const result = await supplierPaymentService.deleteSupplierPayment(pool, req.params.id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, message: 'Payment deleted successfully' });
        } catch (error: any) {
            logger.error('Error deleting supplier payment', { id: req.params.id, error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Get payment allocations
    router.get('/payments/:id/allocations', async (req: Request, res: Response) => {
        try {
            const allocations = await supplierPaymentService.getPaymentAllocations(pool, req.params.id);
            res.json({ success: true, data: allocations });
        } catch (error: any) {
            logger.error('Error fetching payment allocations', { id: req.params.id, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Auto-allocate payment
    router.post('/payments/:id/auto-allocate', requirePermission('suppliers.create'), async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            const allocations = await supplierPaymentService.autoAllocatePayment(pool, req.params.id, userId);
            res.json({ success: true, data: allocations });
        } catch (error: any) {
            logger.error('Error auto-allocating payment', { id: req.params.id, error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // ============================================================
    // SUPPLIER INVOICES (BILLS)
    // ============================================================

    // Get all supplier invoices
    router.get('/invoices', async (req: Request, res: Response) => {
        try {
            const {
                page = '1',
                limit = '50',
                supplierId,
                status,
                search,
                startDate,
                endDate
            } = req.query as Record<string, string>;

            const result = await supplierPaymentService.getSupplierInvoices(pool, {
                page: parseInt(page),
                limit: parseInt(limit),
                supplierId,
                status,
                search,
                startDate,
                endDate
            });

            res.json({
                success: true,
                ...result
            });
        } catch (error: any) {
            logger.error('Error fetching supplier invoices', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Get supplier invoice by ID
    router.get('/invoices/:id', async (req: Request, res: Response) => {
        try {
            const invoice = await supplierPaymentService.getSupplierInvoiceById(pool, req.params.id);
            if (!invoice) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }
            res.json({ success: true, data: invoice });
        } catch (error: any) {
            logger.error('Error fetching supplier invoice', { id: req.params.id, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Create supplier invoice
    router.post('/invoices', requirePermission('purchasing.create'), async (req: Request, res: Response) => {
        try {
            const { supplierId, supplierInvoiceNumber, invoiceDate, dueDate, notes, lineItems } = req.body;

            if (!supplierId || !invoiceDate || !lineItems || lineItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: supplierId, invoiceDate, lineItems'
                });
            }

            const userId = (req as any).user?.id;
            const invoice = await supplierPaymentService.createSupplierInvoice(pool, {
                supplierId,
                supplierInvoiceNumber,
                invoiceDate,
                dueDate,
                notes,
                lineItems
            }, userId);

            res.status(201).json({ success: true, data: invoice });
        } catch (error: any) {
            logger.error('Error creating supplier invoice', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Delete supplier invoice
    router.delete('/invoices/:id', requirePermission('purchasing.delete'), async (req: Request, res: Response) => {
        try {
            const result = await supplierPaymentService.deleteSupplierInvoice(pool, req.params.id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }
            res.json({ success: true, message: 'Invoice deleted successfully' });
        } catch (error: any) {
            logger.error('Error deleting supplier invoice', { id: req.params.id, error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Get outstanding invoices for a supplier
    router.get('/suppliers/:supplierId/outstanding-invoices', async (req: Request, res: Response) => {
        try {
            const invoices = await supplierPaymentService.getOutstandingInvoices(pool, req.params.supplierId);
            res.json({ success: true, data: invoices });
        } catch (error: any) {
            logger.error('Error fetching outstanding invoices', { supplierId: req.params.supplierId, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================================
    // PAYMENT ALLOCATIONS
    // ============================================================

    // Allocate payment to invoice
    router.post('/allocations', requirePermission('suppliers.create'), async (req: Request, res: Response) => {
        try {
            const { supplierPaymentId, supplierInvoiceId, amount } = req.body;

            if (!supplierPaymentId || !supplierInvoiceId || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: supplierPaymentId, supplierInvoiceId, amount'
                });
            }

            const userId = (req as any).user?.id;
            const allocation = await supplierPaymentService.allocatePayment(pool, {
                supplierPaymentId,
                supplierInvoiceId,
                amount: parseFloat(amount)
            }, userId);

            res.status(201).json({ success: true, data: allocation });
        } catch (error: any) {
            logger.error('Error allocating payment', { error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Remove allocation
    router.delete('/allocations/:id', requirePermission('suppliers.delete'), async (req: Request, res: Response) => {
        try {
            const result = await supplierPaymentService.removeAllocation(pool, req.params.id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Allocation not found' });
            }
            res.json({ success: true, message: 'Allocation removed successfully' });
        } catch (error: any) {
            logger.error('Error removing allocation', { id: req.params.id, error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}
