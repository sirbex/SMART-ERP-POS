/**
 * CRM Service
 * Business logic for leads, opportunities, activities
 *
 * ISOLATION: This module is completely isolated from sales, quotations, delivery,
 * invoices, inventory, and accounting modules.
 * The ONLY cross-module call is quotationService.createFromOpportunity() when
 * an opportunity status changes to WON.
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import {
    leadRepository,
    opportunityRepository,
    opportunityItemRepository,
    activityRepository,
    opportunityDocumentRepository,
    type LeadDbRow,
    type OpportunityDbRow,
    type OpportunityItemDbRow,
    type ActivityDbRow,
    type OpportunityDocumentDbRow,
} from './crmRepository.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { logAction } from '../audit/auditService.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import type { AuditContext } from '../../../../shared/types/audit.js';

// ============================================================================
// APPLICATION INTERFACES (camelCase)
// ============================================================================

export interface Lead {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    source: string | null;
    notes: string | null;
    status: string;
    convertedCustomerId: string | null;
    createdBy: string | null;
    createdByName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Opportunity {
    id: string;
    customerId: string | null;
    leadId: string | null;
    title: string;
    tenderRef: string | null;
    procuringEntity: string | null;
    deadline: string | null;
    estimatedValue: number | null;
    probability: number;
    status: string;
    assignedTo: string | null;
    wonAt: string | null;
    lostReason: string | null;
    quotationId: string | null;
    notes: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    // Joined display fields
    customerName?: string;
    assignedToName?: string;
    leadName?: string;
    itemCount?: number;
}

export interface OpportunityItem {
    id: string;
    opportunityId: string;
    description: string | null;
    quantity: number | null;
    estimatedPrice: number | null;
    lineTotal: number | null;
    sortOrder: number;
}

export interface Activity {
    id: string;
    opportunityId: string | null;
    leadId: string | null;
    type: string;
    title: string | null;
    notes: string | null;
    activityDate: string | null;
    dueDate: string | null;
    completed: boolean;
    createdBy: string | null;
    createdByName?: string;
    createdAt: string;
    // Joined
    opportunityTitle?: string;
    leadName?: string;
}

export interface OpportunityDocument {
    id: string;
    opportunityId: string;
    fileName: string;
    fileUrl: string;
    fileSize: number | null;
    mimeType: string | null;
    uploadedBy: string | null;
    uploadedByName?: string;
    uploadedAt: string;
}

export interface OpportunityDetail {
    opportunity: Opportunity;
    items: OpportunityItem[];
    activities: Activity[];
    documents: OpportunityDocument[];
}

export interface PipelineSummary {
    status: string;
    count: number;
    totalValue: number;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeLead(row: LeadDbRow): Lead {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        source: row.source,
        notes: row.notes,
        status: row.status,
        convertedCustomerId: row.converted_customer_id,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

function normalizeOpportunity(row: OpportunityDbRow): Opportunity {
    return {
        id: row.id,
        customerId: row.customer_id,
        leadId: row.lead_id,
        title: row.title,
        tenderRef: row.tender_ref,
        procuringEntity: row.procuring_entity,
        deadline: row.deadline,
        estimatedValue: row.estimated_value ? parseFloat(row.estimated_value) : null,
        probability: row.probability,
        status: row.status,
        assignedTo: row.assigned_to,
        wonAt: row.won_at ? row.won_at.toISOString() : null,
        lostReason: row.lost_reason,
        quotationId: row.quotation_id,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        customerName: row.customer_name,
        assignedToName: row.assigned_to_name,
        leadName: row.lead_name,
        itemCount: row.item_count ? parseInt(row.item_count, 10) : undefined,
    };
}

function normalizeItem(row: OpportunityItemDbRow): OpportunityItem {
    return {
        id: row.id,
        opportunityId: row.opportunity_id,
        description: row.description,
        quantity: row.quantity ? parseFloat(row.quantity) : null,
        estimatedPrice: row.estimated_price ? parseFloat(row.estimated_price) : null,
        lineTotal: row.line_total ? parseFloat(row.line_total) : null,
        sortOrder: row.sort_order,
    };
}

function normalizeActivity(row: ActivityDbRow): Activity {
    return {
        id: row.id,
        opportunityId: row.opportunity_id,
        leadId: row.lead_id,
        type: row.type,
        title: row.title,
        notes: row.notes,
        activityDate: row.activity_date ? row.activity_date.toISOString() : null,
        dueDate: row.due_date ? row.due_date.toISOString() : null,
        completed: row.completed,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at.toISOString(),
        opportunityTitle: row.opportunity_title,
        leadName: row.lead_name,
    };
}

function normalizeDocument(row: OpportunityDocumentDbRow): OpportunityDocument {
    return {
        id: row.id,
        opportunityId: row.opportunity_id,
        fileName: row.file_name,
        fileUrl: row.file_url,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        uploadedBy: row.uploaded_by,
        uploadedByName: row.uploaded_by_name,
        uploadedAt: row.uploaded_at.toISOString(),
    };
}

// ============================================================================
// SERVICE
// ============================================================================

export const crmService = {
    // ============================
    // LEADS
    // ============================

    async createLead(
        pool: Pool,
        data: {
            name: string;
            phone?: string | null;
            email?: string | null;
            source?: string | null;
            notes?: string | null;
        },
        context: AuditContext
    ): Promise<Lead> {
        const row = await leadRepository.create(pool, {
            ...data,
            createdBy: context.userId,
        });

        await logAction(
            pool,
            {
                entityType: 'LEAD',
                entityId: row.id,
                action: 'CREATE',
                actionDetails: `Lead created: ${data.name}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'lead', 'create'],
            },
            context
        );

        return normalizeLead(row);
    },

    async getLeadById(pool: Pool, id: string): Promise<Lead | null> {
        const row = await leadRepository.getById(pool, id);
        return row ? normalizeLead(row) : null;
    },

    async listLeads(
        pool: Pool,
        params: { page: number; limit: number; status?: string; search?: string }
    ): Promise<{ data: Lead[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
        const offset = (params.page - 1) * params.limit;
        const { rows, total } = await leadRepository.list(pool, {
            offset,
            limit: params.limit,
            status: params.status,
            search: params.search,
        });
        return {
            data: rows.map(normalizeLead),
            pagination: {
                page: params.page,
                limit: params.limit,
                total,
                totalPages: Math.ceil(total / params.limit),
            },
        };
    },

    async updateLead(
        pool: Pool,
        id: string,
        data: {
            name?: string;
            phone?: string | null;
            email?: string | null;
            source?: string | null;
            notes?: string | null;
            status?: string;
        },
        context: AuditContext
    ): Promise<Lead> {
        const existing = await leadRepository.getById(pool, id);
        const row = await leadRepository.update(pool, id, data);

        await logAction(
            pool,
            {
                entityType: 'LEAD',
                entityId: id,
                action: 'UPDATE',
                actionDetails: `Lead updated: ${row.name}`,
                oldValues: existing as unknown as Record<string, unknown>,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'lead', 'update'],
            },
            context
        );

        return normalizeLead(row);
    },

    async deleteLead(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await leadRepository.getById(pool, id);
        const deleted = await leadRepository.delete(pool, id);

        if (deleted && existing) {
            await logAction(
                pool,
                {
                    entityType: 'LEAD',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Lead deleted: ${existing.name}`,
                    oldValues: { name: existing.name, status: existing.status },
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'lead', 'delete'],
                },
                context
            );
        }

        return deleted;
    },

    /**
     * Convert a lead to a customer by marking status = CONVERTED
     * and storing the new customer id. Customer creation itself is
     * handled by the CRM controller calling the customers endpoint.
     */
    async convertLead(
        pool: Pool,
        leadId: string,
        customerId: string,
        context: AuditContext
    ): Promise<Lead> {
        const row = await leadRepository.update(pool, leadId, {
            status: 'CONVERTED',
            convertedCustomerId: customerId,
        });

        await logAction(
            pool,
            {
                entityType: 'LEAD',
                entityId: leadId,
                action: 'UPDATE',
                actionDetails: `Lead converted to customer ${customerId}`,
                newValues: { status: 'CONVERTED', convertedCustomerId: customerId },
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'lead', 'convert'],
            },
            context
        );

        return normalizeLead(row);
    },

    // ============================
    // OPPORTUNITIES
    // ============================

    async createOpportunity(
        pool: Pool,
        data: {
            customerId?: string | null;
            leadId?: string | null;
            title: string;
            tenderRef?: string | null;
            procuringEntity?: string | null;
            deadline?: string | null;
            estimatedValue?: number | null;
            probability?: number;
            assignedTo?: string | null;
            notes?: string | null;
            items?: Array<{
                description?: string | null;
                quantity?: number | null;
                estimatedPrice?: number | null;
            }>;
        },
        context: AuditContext
    ): Promise<OpportunityDetail> {
        return UnitOfWork.run(pool, async (client) => {
            // Calculate estimated value from items if provided
            let estimatedValue = data.estimatedValue ?? null;
            const itemsWithTotals = (data.items || []).map((item, idx) => {
                const qty = new Decimal(item.quantity ?? 0);
                const price = new Decimal(item.estimatedPrice ?? 0);
                const lineTotal = qty.times(price);
                return {
                    description: item.description,
                    quantity: item.quantity,
                    estimatedPrice: item.estimatedPrice,
                    lineTotal: lineTotal.toNumber(),
                    sortOrder: idx,
                };
            });

            if (itemsWithTotals.length > 0 && estimatedValue === null) {
                estimatedValue = itemsWithTotals.reduce(
                    (sum, i) => sum + (i.lineTotal || 0),
                    0
                );
            }

            const oppRow = await opportunityRepository.create(client, {
                ...data,
                estimatedValue,
                createdBy: context.userId,
            });

            const itemRows = await opportunityItemRepository.createMany(
                client,
                oppRow.id,
                itemsWithTotals
            );

            await logAction(
                client,
                {
                    entityType: 'OPPORTUNITY',
                    entityId: oppRow.id,
                    action: 'CREATE',
                    actionDetails: `Opportunity created: ${data.title}`,
                    newValues: { title: data.title, estimatedValue, customerId: data.customerId },
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'opportunity', 'create'],
                },
                context
            );

            return {
                opportunity: normalizeOpportunity(oppRow),
                items: itemRows.map(normalizeItem),
                activities: [],
                documents: [],
            };
        });
    },

    async getOpportunityById(pool: Pool, id: string): Promise<OpportunityDetail | null> {
        const oppRow = await opportunityRepository.getById(pool, id);
        if (!oppRow) return null;

        const [itemRows, activityRows, docRows] = await Promise.all([
            opportunityItemRepository.getByOpportunityId(pool, id),
            activityRepository.list(pool, { offset: 0, limit: 50, opportunityId: id }),
            opportunityDocumentRepository.getByOpportunityId(pool, id),
        ]);

        return {
            opportunity: normalizeOpportunity(oppRow),
            items: itemRows.map(normalizeItem),
            activities: activityRows.rows.map(normalizeActivity),
            documents: docRows.map(normalizeDocument),
        };
    },

    async listOpportunities(
        pool: Pool,
        params: {
            page: number;
            limit: number;
            status?: string;
            customerId?: string;
            assignedTo?: string;
            search?: string;
        }
    ): Promise<{
        data: Opportunity[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    }> {
        const offset = (params.page - 1) * params.limit;
        const { rows, total } = await opportunityRepository.list(pool, {
            offset,
            limit: params.limit,
            status: params.status,
            customerId: params.customerId,
            assignedTo: params.assignedTo,
            search: params.search,
        });
        return {
            data: rows.map(normalizeOpportunity),
            pagination: {
                page: params.page,
                limit: params.limit,
                total,
                totalPages: Math.ceil(total / params.limit),
            },
        };
    },

    async updateOpportunity(
        pool: Pool,
        id: string,
        data: {
            customerId?: string | null;
            leadId?: string | null;
            title?: string;
            tenderRef?: string | null;
            procuringEntity?: string | null;
            deadline?: string | null;
            estimatedValue?: number | null;
            probability?: number;
            assignedTo?: string | null;
            notes?: string | null;
            items?: Array<{
                description?: string | null;
                quantity?: number | null;
                estimatedPrice?: number | null;
            }>;
        },
        context: AuditContext
    ): Promise<OpportunityDetail> {
        return UnitOfWork.run(pool, async (client) => {
            const existing = await opportunityRepository.getById(client, id);

            const oppRow = await opportunityRepository.update(client, id, data);

            // Replace items if provided
            if (data.items !== undefined) {
                await opportunityItemRepository.deleteByOpportunityId(client, id);
                const itemsWithTotals = data.items.map((item, idx) => {
                    const qty = new Decimal(item.quantity ?? 0);
                    const price = new Decimal(item.estimatedPrice ?? 0);
                    return {
                        description: item.description,
                        quantity: item.quantity,
                        estimatedPrice: item.estimatedPrice,
                        lineTotal: qty.times(price).toNumber(),
                        sortOrder: idx,
                    };
                });
                await opportunityItemRepository.createMany(client, id, itemsWithTotals);
            }

            await logAction(
                client,
                {
                    entityType: 'OPPORTUNITY',
                    entityId: id,
                    action: 'UPDATE',
                    actionDetails: `Opportunity updated: ${oppRow.title}`,
                    oldValues: existing as unknown as Record<string, unknown>,
                    newValues: data as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'opportunity', 'update'],
                },
                context
            );

            // Reload full detail
            const detail = await crmService.getOpportunityById(pool, id);
            return detail!;
        });
    },

    /**
     * Update opportunity status with special handling for WON/LOST transitions.
     * When status → WON: calls quotationService.createFromOpportunity() to bridge.
     */
    async updateOpportunityStatus(
        pool: Pool,
        id: string,
        status: string,
        extra: { lostReason?: string } | undefined,
        context: AuditContext
    ): Promise<Opportunity> {
        return UnitOfWork.run(pool, async (client) => {
            const existing = await opportunityRepository.getById(client, id);
            if (!existing) {
                throw new Error('Opportunity not found');
            }

            const updateData: Record<string, unknown> = { status };

            if (status === 'WON') {
                updateData.wonAt = new Date();

                // Bridge: create a quotation from this opportunity's items
                try {
                    const { quotationService } = await import('../quotations/quotationService.js');
                    const quotation = await quotationService.createFromOpportunity(client, id, context.userId);
                    updateData.quotationId = quotation.quotation.id;
                } catch (err) {
                    // Log but do not block the status change
                    console.error('Failed to create quotation from opportunity:', err);
                }
            }

            if (status === 'LOST' && extra?.lostReason) {
                updateData.lostReason = extra.lostReason;
            }

            const row = await opportunityRepository.update(
                client,
                id,
                updateData as Parameters<typeof opportunityRepository.update>[2]
            );

            await logAction(
                client,
                {
                    entityType: 'OPPORTUNITY',
                    entityId: id,
                    action: 'UPDATE',
                    actionDetails: `Opportunity status changed: ${existing.status} → ${status}`,
                    oldValues: { status: existing.status },
                    newValues: { status, ...updateData },
                    severity: status === 'WON' ? 'INFO' : 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'opportunity', 'status', status.toLowerCase()],
                },
                context
            );

            return normalizeOpportunity(row);
        });
    },

    async deleteOpportunity(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await opportunityRepository.getById(pool, id);
        if (existing && (existing.status === 'WON' || existing.status === 'LOST')) {
            throw new ValidationError(
                `Cannot delete ${existing.status} opportunity — it is a historical record`
            );
        }
        const deleted = await opportunityRepository.delete(pool, id);

        if (deleted && existing) {
            await logAction(
                pool,
                {
                    entityType: 'OPPORTUNITY',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Opportunity deleted: ${existing.title}`,
                    oldValues: { title: existing.title, status: existing.status },
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'opportunity', 'delete'],
                },
                context
            );
        }

        return deleted;
    },

    async getPipelineSummary(pool: Pool): Promise<PipelineSummary[]> {
        const rows = await opportunityRepository.getPipelineSummary(pool);
        return rows.map((r) => ({
            status: r.status,
            count: r.count,
            totalValue: parseFloat(r.total_value),
        }));
    },

    // ============================
    // ACTIVITIES
    // ============================

    async createActivity(
        pool: Pool,
        data: {
            opportunityId?: string | null;
            leadId?: string | null;
            type: string;
            title?: string | null;
            notes?: string | null;
            activityDate?: string | null;
            dueDate?: string | null;
        },
        context: AuditContext
    ): Promise<Activity> {
        const row = await activityRepository.create(pool, {
            ...data,
            createdBy: context.userId,
        });

        await logAction(
            pool,
            {
                entityType: 'ACTIVITY',
                entityId: row.id,
                action: 'CREATE',
                actionDetails: `Activity created: ${data.type} - ${data.title || ''}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'activity', 'create'],
            },
            context
        );

        return normalizeActivity(row);
    },

    async getActivityById(pool: Pool, id: string): Promise<Activity | null> {
        const row = await activityRepository.getById(pool, id);
        return row ? normalizeActivity(row) : null;
    },

    async listActivities(
        pool: Pool,
        params: {
            page: number;
            limit: number;
            opportunityId?: string;
            leadId?: string;
            type?: string;
            completed?: boolean;
            upcoming?: boolean;
        }
    ): Promise<{
        data: Activity[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    }> {
        const offset = (params.page - 1) * params.limit;
        const { rows, total } = await activityRepository.list(pool, {
            offset,
            limit: params.limit,
            opportunityId: params.opportunityId,
            leadId: params.leadId,
            type: params.type,
            completed: params.completed,
            upcoming: params.upcoming,
        });
        return {
            data: rows.map(normalizeActivity),
            pagination: {
                page: params.page,
                limit: params.limit,
                total,
                totalPages: Math.ceil(total / params.limit),
            },
        };
    },

    async updateActivity(
        pool: Pool,
        id: string,
        data: {
            type?: string;
            title?: string | null;
            notes?: string | null;
            activityDate?: string | null;
            dueDate?: string | null;
            completed?: boolean;
        },
        context: AuditContext
    ): Promise<Activity> {
        const row = await activityRepository.update(pool, id, data);

        await logAction(
            pool,
            {
                entityType: 'ACTIVITY',
                entityId: id,
                action: 'UPDATE',
                actionDetails: `Activity updated`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'activity', 'update'],
            },
            context
        );

        return normalizeActivity(row);
    },

    async deleteActivity(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const deleted = await activityRepository.delete(pool, id);

        if (deleted) {
            await logAction(
                pool,
                {
                    entityType: 'ACTIVITY',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Activity deleted`,
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'activity', 'delete'],
                },
                context
            );
        }

        return deleted;
    },

    // ============================
    // DOCUMENTS
    // ============================

    async addDocument(
        pool: Pool,
        data: {
            opportunityId: string;
            fileName: string;
            fileUrl: string;
            fileSize?: number | null;
            mimeType?: string | null;
        },
        context: AuditContext
    ): Promise<OpportunityDocument> {
        const row = await opportunityDocumentRepository.create(pool, {
            ...data,
            uploadedBy: context.userId,
        });

        await logAction(
            pool,
            {
                entityType: 'OPPORTUNITY_DOCUMENT',
                entityId: row.id,
                action: 'CREATE',
                actionDetails: `Document uploaded: ${data.fileName}`,
                newValues: { fileName: data.fileName, opportunityId: data.opportunityId },
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['crm', 'document', 'upload'],
            },
            context
        );

        return normalizeDocument(row);
    },

    async deleteDocument(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const deleted = await opportunityDocumentRepository.delete(pool, id);

        if (deleted) {
            await logAction(
                pool,
                {
                    entityType: 'OPPORTUNITY_DOCUMENT',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Document deleted`,
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['crm', 'document', 'delete'],
                },
                context
            );
        }

        return deleted;
    },
};
