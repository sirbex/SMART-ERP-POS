/**
 * CRM Controller
 * HTTP handlers with Zod validation for leads, opportunities, activities
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { crmService } from './crmService.js';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler.js';
import type { AuditContext } from '../../../../shared/types/audit.js';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const UuidParam = z.object({ id: z.string().uuid('ID must be a valid UUID') });

// --- Leads ---
const CreateLeadSchema = z.object({
    name: z.string().min(1).max(255),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    source: z.string().max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
});

const UpdateLeadSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    source: z.string().max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST']).optional(),
});

const ConvertLeadSchema = z.object({
    customerId: z.string().uuid(),
});

// --- Opportunities ---
const OpportunityItemSchema = z.object({
    description: z.string().max(500).optional().nullable(),
    quantity: z.number().nonnegative().optional().nullable(),
    estimatedPrice: z.number().nonnegative().optional().nullable(),
});

const CreateOpportunitySchema = z.object({
    customerId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).max(255),
    tenderRef: z.string().max(100).optional().nullable(),
    procuringEntity: z.string().max(255).optional().nullable(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
    estimatedValue: z.number().nonnegative().optional().nullable(),
    probability: z.number().int().min(0).max(100).optional(),
    assignedTo: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(OpportunityItemSchema).optional(),
});

const UpdateOpportunitySchema = z.object({
    customerId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).max(255).optional(),
    tenderRef: z.string().max(100).optional().nullable(),
    procuringEntity: z.string().max(255).optional().nullable(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
    estimatedValue: z.number().nonnegative().optional().nullable(),
    probability: z.number().int().min(0).max(100).optional(),
    assignedTo: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(OpportunityItemSchema).optional(),
});

const UpdateOpportunityStatusSchema = z.object({
    status: z.enum(['OPEN', 'BIDDING', 'SUBMITTED', 'WON', 'LOST']),
    lostReason: z.string().max(500).optional(),
});

// --- Activities ---
const CreateActivitySchema = z.object({
    opportunityId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK']),
    title: z.string().max(255).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    activityDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
});

const UpdateActivitySchema = z.object({
    type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK']).optional(),
    title: z.string().max(255).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    activityDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    completed: z.boolean().optional(),
});

// --- Documents ---
const AddDocumentSchema = z.object({
    opportunityId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    fileUrl: z.string().min(1).max(2000),
    fileSize: z.number().int().nonnegative().optional().nullable(),
    mimeType: z.string().max(100).optional().nullable(),
});

// --- Query params ---
const ListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    search: z.string().optional(),
    customerId: z.string().uuid().optional(),
    assignedTo: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    type: z.string().optional(),
    completed: z
        .string()
        .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
        .optional(),
    upcoming: z
        .string()
        .transform((v) => v === 'true')
        .optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

function buildAuditContext(req: Request): AuditContext {
    return {
        userId: req.user!.id,
        userName: req.user!.fullName,
        userRole: req.user!.role,
        sessionId: (req as unknown as Record<string, unknown>).sessionId as string | undefined,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
    };
}

// ============================================================================
// CONTROLLER
// ============================================================================

export const crmController = {
    // ============================
    // LEADS
    // ============================

    createLead: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateLeadSchema.parse(req.body);
        const lead = await crmService.createLead(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: lead, message: 'Lead created' });
    }),

    getLead: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const lead = await crmService.getLeadById(pool, id);
        if (!lead) throw new NotFoundError('Lead');
        res.json({ success: true, data: lead });
    }),

    listLeads: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = ListQuerySchema.parse(req.query);
        const result = await crmService.listLeads(pool, {
            page: query.page,
            limit: query.limit,
            status: query.status,
            search: query.search,
        });
        res.json({ success: true, ...result });
    }),

    updateLead: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdateLeadSchema.parse(req.body);
        const lead = await crmService.updateLead(pool, id, data, buildAuditContext(req));
        res.json({ success: true, data: lead, message: 'Lead updated' });
    }),

    deleteLead: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await crmService.deleteLead(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Lead');
        res.json({ success: true, message: 'Lead deleted' });
    }),

    convertLead: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const { customerId } = ConvertLeadSchema.parse(req.body);
        const lead = await crmService.convertLead(pool, id, customerId, buildAuditContext(req));
        res.json({ success: true, data: lead, message: 'Lead converted to customer' });
    }),

    // ============================
    // OPPORTUNITIES
    // ============================

    createOpportunity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateOpportunitySchema.parse(req.body);
        const result = await crmService.createOpportunity(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: result, message: 'Opportunity created' });
    }),

    getOpportunity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const detail = await crmService.getOpportunityById(pool, id);
        if (!detail) throw new NotFoundError('Opportunity');
        res.json({ success: true, data: detail });
    }),

    listOpportunities: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = ListQuerySchema.parse(req.query);
        const result = await crmService.listOpportunities(pool, {
            page: query.page,
            limit: query.limit,
            status: query.status,
            customerId: query.customerId,
            assignedTo: query.assignedTo,
            search: query.search,
        });
        res.json({ success: true, ...result });
    }),

    updateOpportunity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdateOpportunitySchema.parse(req.body);
        const result = await crmService.updateOpportunity(pool, id, data, buildAuditContext(req));
        res.json({ success: true, data: result, message: 'Opportunity updated' });
    }),

    updateOpportunityStatus: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const { status, lostReason } = UpdateOpportunityStatusSchema.parse(req.body);
        const opp = await crmService.updateOpportunityStatus(
            pool,
            id,
            status,
            lostReason ? { lostReason } : undefined,
            buildAuditContext(req)
        );
        res.json({ success: true, data: opp, message: `Opportunity marked as ${status}` });
    }),

    deleteOpportunity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await crmService.deleteOpportunity(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Opportunity');
        res.json({ success: true, message: 'Opportunity deleted' });
    }),

    getPipelineSummary: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const summary = await crmService.getPipelineSummary(pool);
        res.json({ success: true, data: summary });
    }),

    // ============================
    // ACTIVITIES
    // ============================

    createActivity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateActivitySchema.parse(req.body);
        const activity = await crmService.createActivity(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: activity, message: 'Activity created' });
    }),

    getActivity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const activity = await crmService.getActivityById(pool, id);
        if (!activity) throw new NotFoundError('Activity');
        res.json({ success: true, data: activity });
    }),

    listActivities: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = ListQuerySchema.parse(req.query);
        const result = await crmService.listActivities(pool, {
            page: query.page,
            limit: query.limit,
            opportunityId: query.opportunityId,
            leadId: query.leadId,
            type: query.type,
            completed: query.completed as boolean | undefined,
            upcoming: query.upcoming,
        });
        res.json({ success: true, ...result });
    }),

    updateActivity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdateActivitySchema.parse(req.body);
        const activity = await crmService.updateActivity(pool, id, data, buildAuditContext(req));
        res.json({ success: true, data: activity, message: 'Activity updated' });
    }),

    deleteActivity: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await crmService.deleteActivity(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Activity');
        res.json({ success: true, message: 'Activity deleted' });
    }),

    // ============================
    // DOCUMENTS
    // ============================

    addDocument: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = AddDocumentSchema.parse(req.body);
        const doc = await crmService.addDocument(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: doc, message: 'Document added' });
    }),

    deleteDocument: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await crmService.deleteDocument(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Document');
        res.json({ success: true, message: 'Document deleted' });
    }),
};
