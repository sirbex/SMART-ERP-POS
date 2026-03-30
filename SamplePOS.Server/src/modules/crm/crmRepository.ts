/**
 * CRM Repository
 * Raw SQL queries for leads, opportunities, opportunity_items, activities, opportunity_documents
 *
 * ISOLATION: May ONLY query crm-owned tables (leads, opportunities, opportunity_items,
 * activities, opportunity_documents). Reads from customers, users are done via JOINs only.
 */

import { Pool, PoolClient } from 'pg';

// ============================================================================
// DB ROW INTERFACES (snake_case from PostgreSQL)
// ============================================================================

export interface LeadDbRow {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    source: string | null;
    notes: string | null;
    status: string;
    converted_customer_id: string | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    created_by_name?: string;
}

export interface OpportunityDbRow {
    id: string;
    customer_id: string | null;
    lead_id: string | null;
    title: string;
    tender_ref: string | null;
    procuring_entity: string | null;
    deadline: string | null;
    estimated_value: string | null;
    probability: number;
    status: string;
    assigned_to: string | null;
    won_at: Date | null;
    lost_reason: string | null;
    quotation_id: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    customer_name?: string;
    assigned_to_name?: string;
    lead_name?: string;
    item_count?: string;
}

export interface OpportunityItemDbRow {
    id: string;
    opportunity_id: string;
    description: string | null;
    quantity: string | null;
    estimated_price: string | null;
    line_total: string | null;
    sort_order: number;
}

export interface ActivityDbRow {
    id: string;
    opportunity_id: string | null;
    lead_id: string | null;
    type: string;
    title: string | null;
    notes: string | null;
    activity_date: Date | null;
    due_date: Date | null;
    completed: boolean;
    created_by: string | null;
    created_at: Date;
    // Joined fields
    created_by_name?: string;
    opportunity_title?: string;
    lead_name?: string;
}

export interface OpportunityDocumentDbRow {
    id: string;
    opportunity_id: string;
    file_name: string;
    file_url: string;
    file_size: number | null;
    mime_type: string | null;
    uploaded_by: string | null;
    uploaded_at: Date;
    // Joined
    uploaded_by_name?: string;
}

// ============================================================================
// LEADS
// ============================================================================

export const leadRepository = {
    async create(
        client: Pool | PoolClient,
        data: {
            name: string;
            phone?: string | null;
            email?: string | null;
            source?: string | null;
            notes?: string | null;
            status?: string;
            createdBy?: string | null;
        }
    ): Promise<LeadDbRow> {
        const result = await client.query<LeadDbRow>(
            `INSERT INTO leads (name, phone, email, source, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [
                data.name,
                data.phone || null,
                data.email || null,
                data.source || null,
                data.notes || null,
                data.status || 'NEW',
                data.createdBy || null,
            ]
        );
        return result.rows[0];
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<LeadDbRow | null> {
        const result = await pool.query<LeadDbRow>(
            `SELECT l.*, u.full_name AS created_by_name
       FROM leads l
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async list(
        pool: Pool | PoolClient,
        params: { offset: number; limit: number; status?: string; search?: string }
    ): Promise<{ rows: LeadDbRow[]; total: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (params.status) {
            conditions.push(`l.status = $${idx++}`);
            values.push(params.status);
        }
        if (params.search) {
            conditions.push(`(l.name ILIKE $${idx} OR l.email ILIKE $${idx} OR l.phone ILIKE $${idx})`);
            values.push(`%${params.search}%`);
            idx++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM leads l ${where}`,
            values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const dataResult = await pool.query<LeadDbRow>(
            `SELECT l.*, u.full_name AS created_by_name
       FROM leads l
       LEFT JOIN users u ON u.id = l.created_by
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, params.limit, params.offset]
        );

        return { rows: dataResult.rows, total };
    },

    async update(
        client: Pool | PoolClient,
        id: string,
        data: {
            name?: string;
            phone?: string | null;
            email?: string | null;
            source?: string | null;
            notes?: string | null;
            status?: string;
            convertedCustomerId?: string | null;
        }
    ): Promise<LeadDbRow> {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (data.name !== undefined) { sets.push(`name = $${idx++}`); values.push(data.name); }
        if (data.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(data.phone); }
        if (data.email !== undefined) { sets.push(`email = $${idx++}`); values.push(data.email); }
        if (data.source !== undefined) { sets.push(`source = $${idx++}`); values.push(data.source); }
        if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(data.notes); }
        if (data.status !== undefined) { sets.push(`status = $${idx++}`); values.push(data.status); }
        if (data.convertedCustomerId !== undefined) {
            sets.push(`converted_customer_id = $${idx++}`);
            values.push(data.convertedCustomerId);
        }

        sets.push(`updated_at = now()`);

        const result = await client.query<LeadDbRow>(
            `UPDATE leads SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
            [...values, id]
        );
        return result.rows[0];
    },

    async delete(client: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await client.query('DELETE FROM leads WHERE id = $1', [id]);
        return (result.rowCount ?? 0) > 0;
    },
};

// ============================================================================
// OPPORTUNITIES
// ============================================================================

export const opportunityRepository = {
    async create(
        client: Pool | PoolClient,
        data: {
            customerId?: string | null;
            leadId?: string | null;
            title: string;
            tenderRef?: string | null;
            procuringEntity?: string | null;
            deadline?: string | null;
            estimatedValue?: number | null;
            probability?: number;
            status?: string;
            assignedTo?: string | null;
            notes?: string | null;
            createdBy?: string | null;
        }
    ): Promise<OpportunityDbRow> {
        const result = await client.query<OpportunityDbRow>(
            `INSERT INTO opportunities
         (customer_id, lead_id, title, tender_ref, procuring_entity,
          deadline, estimated_value, probability, status, assigned_to, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
            [
                data.customerId || null,
                data.leadId || null,
                data.title,
                data.tenderRef || null,
                data.procuringEntity || null,
                data.deadline || null,
                data.estimatedValue ?? null,
                data.probability ?? 0,
                data.status || 'OPEN',
                data.assignedTo || null,
                data.notes || null,
                data.createdBy || null,
            ]
        );
        return result.rows[0];
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<OpportunityDbRow | null> {
        const result = await pool.query<OpportunityDbRow>(
            `SELECT o.*,
              c.name AS customer_name,
              u.full_name AS assigned_to_name,
              l.name AS lead_name,
              (SELECT COUNT(*) FROM opportunity_items WHERE opportunity_id = o.id) AS item_count
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_to
       LEFT JOIN leads l ON l.id = o.lead_id
       WHERE o.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async list(
        pool: Pool | PoolClient,
        params: {
            offset: number;
            limit: number;
            status?: string;
            customerId?: string;
            assignedTo?: string;
            search?: string;
        }
    ): Promise<{ rows: OpportunityDbRow[]; total: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (params.status) {
            conditions.push(`o.status = $${idx++}`);
            values.push(params.status);
        }
        if (params.customerId) {
            conditions.push(`o.customer_id = $${idx++}`);
            values.push(params.customerId);
        }
        if (params.assignedTo) {
            conditions.push(`o.assigned_to = $${idx++}`);
            values.push(params.assignedTo);
        }
        if (params.search) {
            conditions.push(
                `(o.title ILIKE $${idx} OR o.tender_ref ILIKE $${idx} OR o.procuring_entity ILIKE $${idx})`
            );
            values.push(`%${params.search}%`);
            idx++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM opportunities o ${where}`,
            values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const dataResult = await pool.query<OpportunityDbRow>(
            `SELECT o.*,
              c.name AS customer_name,
              u.full_name AS assigned_to_name,
              l.name AS lead_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_to
       LEFT JOIN leads l ON l.id = o.lead_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, params.limit, params.offset]
        );

        return { rows: dataResult.rows, total };
    },

    async update(
        client: Pool | PoolClient,
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
            status?: string;
            assignedTo?: string | null;
            wonAt?: Date | null;
            lostReason?: string | null;
            quotationId?: string | null;
            notes?: string | null;
        }
    ): Promise<OpportunityDbRow> {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (data.customerId !== undefined) { sets.push(`customer_id = $${idx++}`); values.push(data.customerId); }
        if (data.leadId !== undefined) { sets.push(`lead_id = $${idx++}`); values.push(data.leadId); }
        if (data.title !== undefined) { sets.push(`title = $${idx++}`); values.push(data.title); }
        if (data.tenderRef !== undefined) { sets.push(`tender_ref = $${idx++}`); values.push(data.tenderRef); }
        if (data.procuringEntity !== undefined) { sets.push(`procuring_entity = $${idx++}`); values.push(data.procuringEntity); }
        if (data.deadline !== undefined) { sets.push(`deadline = $${idx++}`); values.push(data.deadline); }
        if (data.estimatedValue !== undefined) { sets.push(`estimated_value = $${idx++}`); values.push(data.estimatedValue); }
        if (data.probability !== undefined) { sets.push(`probability = $${idx++}`); values.push(data.probability); }
        if (data.status !== undefined) { sets.push(`status = $${idx++}`); values.push(data.status); }
        if (data.assignedTo !== undefined) { sets.push(`assigned_to = $${idx++}`); values.push(data.assignedTo); }
        if (data.wonAt !== undefined) { sets.push(`won_at = $${idx++}`); values.push(data.wonAt); }
        if (data.lostReason !== undefined) { sets.push(`lost_reason = $${idx++}`); values.push(data.lostReason); }
        if (data.quotationId !== undefined) { sets.push(`quotation_id = $${idx++}`); values.push(data.quotationId); }
        if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(data.notes); }

        sets.push(`updated_at = now()`);

        const result = await client.query<OpportunityDbRow>(
            `UPDATE opportunities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
            [...values, id]
        );
        return result.rows[0];
    },

    async delete(client: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await client.query('DELETE FROM opportunities WHERE id = $1', [id]);
        return (result.rowCount ?? 0) > 0;
    },

    /** Pipeline summary: count + total estimated_value grouped by status */
    async getPipelineSummary(
        pool: Pool | PoolClient
    ): Promise<Array<{ status: string; count: number; total_value: string }>> {
        const result = await pool.query<{ status: string; count: string; total_value: string }>(
            `SELECT status, COUNT(*)::int AS count,
              COALESCE(SUM(estimated_value), 0) AS total_value
       FROM opportunities
       GROUP BY status
       ORDER BY CASE status
         WHEN 'OPEN' THEN 1 WHEN 'BIDDING' THEN 2
         WHEN 'SUBMITTED' THEN 3 WHEN 'WON' THEN 4 WHEN 'LOST' THEN 5
       END`
        );
        return result.rows.map(r => ({
            status: r.status,
            count: parseInt(r.count, 10),
            total_value: r.total_value,
        }));
    },
};

// ============================================================================
// OPPORTUNITY ITEMS
// ============================================================================

export const opportunityItemRepository = {
    async createMany(
        client: Pool | PoolClient,
        opportunityId: string,
        items: Array<{
            description?: string | null;
            quantity?: number | null;
            estimatedPrice?: number | null;
            lineTotal?: number | null;
            sortOrder?: number;
        }>
    ): Promise<OpportunityItemDbRow[]> {
        if (items.length === 0) return [];

        const rows: OpportunityItemDbRow[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const result = await client.query<OpportunityItemDbRow>(
                `INSERT INTO opportunity_items (opportunity_id, description, quantity, estimated_price, line_total, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
                [
                    opportunityId,
                    item.description || null,
                    item.quantity ?? null,
                    item.estimatedPrice ?? null,
                    item.lineTotal ?? null,
                    item.sortOrder ?? i,
                ]
            );
            rows.push(result.rows[0]);
        }
        return rows;
    },

    async getByOpportunityId(
        pool: Pool | PoolClient,
        opportunityId: string
    ): Promise<OpportunityItemDbRow[]> {
        const result = await pool.query<OpportunityItemDbRow>(
            `SELECT * FROM opportunity_items WHERE opportunity_id = $1 ORDER BY sort_order, id`,
            [opportunityId]
        );
        return result.rows;
    },

    async deleteByOpportunityId(client: Pool | PoolClient, opportunityId: string): Promise<void> {
        await client.query('DELETE FROM opportunity_items WHERE opportunity_id = $1', [opportunityId]);
    },
};

// ============================================================================
// ACTIVITIES
// ============================================================================

export const activityRepository = {
    async create(
        client: Pool | PoolClient,
        data: {
            opportunityId?: string | null;
            leadId?: string | null;
            type: string;
            title?: string | null;
            notes?: string | null;
            activityDate?: string | null;
            dueDate?: string | null;
            completed?: boolean;
            createdBy?: string | null;
        }
    ): Promise<ActivityDbRow> {
        const result = await client.query<ActivityDbRow>(
            `INSERT INTO activities (opportunity_id, lead_id, type, title, notes, activity_date, due_date, completed, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
            [
                data.opportunityId || null,
                data.leadId || null,
                data.type,
                data.title || null,
                data.notes || null,
                data.activityDate || null,
                data.dueDate || null,
                data.completed ?? false,
                data.createdBy || null,
            ]
        );
        return result.rows[0];
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<ActivityDbRow | null> {
        const result = await pool.query<ActivityDbRow>(
            `SELECT a.*, u.full_name AS created_by_name,
              o.title AS opportunity_title,
              l.name AS lead_name
       FROM activities a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN leads l ON l.id = a.lead_id
       WHERE a.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async list(
        pool: Pool | PoolClient,
        params: {
            offset: number;
            limit: number;
            opportunityId?: string;
            leadId?: string;
            type?: string;
            completed?: boolean;
            upcoming?: boolean;
        }
    ): Promise<{ rows: ActivityDbRow[]; total: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (params.opportunityId) {
            conditions.push(`a.opportunity_id = $${idx++}`);
            values.push(params.opportunityId);
        }
        if (params.leadId) {
            conditions.push(`a.lead_id = $${idx++}`);
            values.push(params.leadId);
        }
        if (params.type) {
            conditions.push(`a.type = $${idx++}`);
            values.push(params.type);
        }
        if (params.completed !== undefined) {
            conditions.push(`a.completed = $${idx++}`);
            values.push(params.completed);
        }
        if (params.upcoming) {
            conditions.push(`a.due_date >= now()`);
            conditions.push(`a.completed = false`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM activities a ${where}`,
            values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const dataResult = await pool.query<ActivityDbRow>(
            `SELECT a.*, u.full_name AS created_by_name,
              o.title AS opportunity_title,
              l.name AS lead_name
       FROM activities a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN leads l ON l.id = a.lead_id
       ${where}
       ORDER BY COALESCE(a.due_date, a.activity_date, a.created_at) DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, params.limit, params.offset]
        );

        return { rows: dataResult.rows, total };
    },

    async update(
        client: Pool | PoolClient,
        id: string,
        data: {
            type?: string;
            title?: string | null;
            notes?: string | null;
            activityDate?: string | null;
            dueDate?: string | null;
            completed?: boolean;
        }
    ): Promise<ActivityDbRow> {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (data.type !== undefined) { sets.push(`type = $${idx++}`); values.push(data.type); }
        if (data.title !== undefined) { sets.push(`title = $${idx++}`); values.push(data.title); }
        if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(data.notes); }
        if (data.activityDate !== undefined) { sets.push(`activity_date = $${idx++}`); values.push(data.activityDate); }
        if (data.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); values.push(data.dueDate); }
        if (data.completed !== undefined) { sets.push(`completed = $${idx++}`); values.push(data.completed); }

        const result = await client.query<ActivityDbRow>(
            `UPDATE activities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
            [...values, id]
        );
        return result.rows[0];
    },

    async delete(client: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await client.query('DELETE FROM activities WHERE id = $1', [id]);
        return (result.rowCount ?? 0) > 0;
    },
};

// ============================================================================
// OPPORTUNITY DOCUMENTS
// ============================================================================

export const opportunityDocumentRepository = {
    async create(
        client: Pool | PoolClient,
        data: {
            opportunityId: string;
            fileName: string;
            fileUrl: string;
            fileSize?: number | null;
            mimeType?: string | null;
            uploadedBy?: string | null;
        }
    ): Promise<OpportunityDocumentDbRow> {
        const result = await client.query<OpportunityDocumentDbRow>(
            `INSERT INTO opportunity_documents (opportunity_id, file_name, file_url, file_size, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
            [
                data.opportunityId,
                data.fileName,
                data.fileUrl,
                data.fileSize ?? null,
                data.mimeType || null,
                data.uploadedBy || null,
            ]
        );
        return result.rows[0];
    },

    async getByOpportunityId(
        pool: Pool | PoolClient,
        opportunityId: string
    ): Promise<OpportunityDocumentDbRow[]> {
        const result = await pool.query<OpportunityDocumentDbRow>(
            `SELECT d.*, u.full_name AS uploaded_by_name
       FROM opportunity_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.opportunity_id = $1
       ORDER BY d.uploaded_at DESC`,
            [opportunityId]
        );
        return result.rows;
    },

    async delete(client: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await client.query('DELETE FROM opportunity_documents WHERE id = $1', [id]);
        return (result.rowCount ?? 0) > 0;
    },
};
