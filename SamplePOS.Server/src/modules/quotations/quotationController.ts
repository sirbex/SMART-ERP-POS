/**
 * Quotation Controller
 * HTTP handlers for quotations system
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateQuotationInputSchema,
  UpdateQuotationInputSchema,
  ConvertQuotationInputSchema,
  CreateQuickQuoteInputSchema,
  SendQuotationEmailInputSchema,
  QuotationListFiltersSchema,
} from '../../../../shared/zod/quotation';
import { quotationService } from './quotationService';

export const quotationController = {
  /**
   * POST /api/quotations
   * Create standard quotation
   */
  async createQuotation(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const userId: string = (req as any).user.id;

      // Validate input
      const validatedData = CreateQuotationInputSchema.parse(req.body);

      const result = await quotationService.createQuotation(pool, {
        quoteType: 'standard',
        customerId: validatedData.customerId || null,
        customerName: validatedData.customerName || null,
        customerPhone: validatedData.customerPhone || null,
        customerEmail: validatedData.customerEmail || null,
        reference: validatedData.reference || null,
        description: validatedData.description || null,
        validFrom: validatedData.validFrom || new Date().toISOString().split('T')[0],
        validUntil: validatedData.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        createdById: userId,
        assignedToId: validatedData.assignedToId || null,
        termsAndConditions: validatedData.termsAndConditions || null,
        paymentTerms: validatedData.paymentTerms || null,
        deliveryTerms: validatedData.deliveryTerms || null,
        internalNotes: validatedData.internalNotes || null,
        requiresApproval: validatedData.requiresApproval || false,
        items: validatedData.items,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Quotation ${result.quotation.quoteNumber} created successfully`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      console.error('Error creating quotation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create quotation',
      });
    }
  },

  /**
   * POST /api/pos/quote
   * Create quick quote from POS
   */
  async createQuickQuote(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const userId: string = (req as any).user.id;

      const validatedData = CreateQuickQuoteInputSchema.parse(req.body);

      // Quick quotes have default 30 day validity
      const validFrom = new Date().toISOString().split('T')[0];
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await quotationService.createQuotation(pool, {
        quoteType: 'quick',
        customerId: validatedData.customerId || null,
        customerName: validatedData.customerName || null,
        customerPhone: validatedData.customerPhone || null,
        description: 'Quick quote from POS',
        validFrom,
        validUntil,
        createdById: userId,
        items: validatedData.items,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Quick quote ${result.quotation.quoteNumber} created`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      console.error('Error creating quick quote:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create quick quote',
      });
    }
  },

  /**
   * GET /api/quotations/:id
   * Get quotation by ID
   */
  async getQuotation(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const { id } = req.params;

      const quotation = await quotationService.getQuotationById(pool, id);

      if (!quotation) {
        return res.status(404).json({
          success: false,
          error: 'Quotation not found',
        });
      }

      res.json({
        success: true,
        data: quotation,
      });
    } catch (error: any) {
      console.error('Error getting quotation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get quotation',
      });
    }
  },

  /**
   * GET /api/quotations/number/:quoteNumber
   * Get quotation by quote number
   */
  async getQuotationByNumber(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const { quoteNumber } = req.params;

      const quotation = await quotationService.getQuotationByNumber(pool, quoteNumber);

      if (!quotation) {
        return res.status(404).json({
          success: false,
          error: 'Quotation not found',
        });
      }

      res.json({
        success: true,
        data: quotation,
      });
    } catch (error: any) {
      console.error('Error getting quotation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get quotation',
      });
    }
  },

  /**
   * GET /api/quotations
   * List quotations with filters
   */
  async listQuotations(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;

      const filters = QuotationListFiltersSchema.parse({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        customerId: req.query.customerId,
        status: req.query.status,
        quoteType: req.query.quoteType,
        assignedToId: req.query.assignedToId,
        createdById: req.query.createdById,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        searchTerm: req.query.searchTerm,
      });

      const result = await quotationService.listQuotations(pool, filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filters',
          details: error.errors,
        });
      }

      console.error('Error listing quotations:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list quotations',
      });
    }
  },

  /**
   * PUT /api/quotations/:id/status
   * Update quotation status
   * 
   * Note: CONVERTED status cannot be set manually - use the convert endpoint
   * Converted quotations are locked and cannot have their status changed
   */
  async updateQuotationStatus(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const { id } = req.params;
      const { status, notes } = req.body;

      // CONVERTED is not allowed here - must use /convert endpoint
      if (!['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Allowed values: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CANCELLED',
        });
      }

      const quotation = await quotationService.updateQuotationStatus(pool, id, status, notes);

      res.json({
        success: true,
        data: quotation,
        message: `Quotation status updated to ${status}`,
      });
    } catch (error: any) {
      console.error('Error updating quotation status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update quotation status',
      });
    }
  },

  /**
   * PUT /api/quotations/:id
   * Update quotation (DRAFT only)
   */
  async updateQuotation(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const { id } = req.params;

      // Validate input
      const validatedData = UpdateQuotationInputSchema.parse(req.body);

      const quotation = await quotationService.updateQuotation(pool, id, validatedData);

      res.json({
        success: true,
        data: quotation,
        message: 'Quotation updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating quotation:', error);
      res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to update quotation',
      });
    }
  },

  /**
   * POST /api/quotations/:id/convert
   * Convert quotation to sale + invoice
   */
  async convertQuotation(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const userId: string = (req as any).user.id;
      const { id } = req.params;

      const validatedData = ConvertQuotationInputSchema.parse(req.body);

      const result = await quotationService.convertQuotationToSale(pool, id, {
        paymentOption: validatedData.paymentOption,
        depositAmount: validatedData.depositAmount,
        depositMethod: validatedData.depositMethod === 'BANK_TRANSFER' ? 'MOBILE_MONEY' : validatedData.depositMethod,
        cashierId: userId,
        notes: validatedData.notes,
      });

      res.json({
        success: true,
        data: result,
        message: 'Quotation converted to sale successfully',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      console.error('Error converting quotation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to convert quotation',
      });
    }
  },

  /**
   * DELETE /api/quotations/:id
   * Delete quotation (DRAFT only)
   */
  async deleteQuotation(req: Request, res: Response) {
    try {
      const pool: Pool = (req as any).pool;
      const { id } = req.params;

      await quotationService.deleteQuotation(pool, id);

      res.json({
        success: true,
        message: 'Quotation deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting quotation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete quotation',
      });
    }
  },
};
