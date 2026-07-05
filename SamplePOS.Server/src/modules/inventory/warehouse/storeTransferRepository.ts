import type { Pool, PoolClient } from 'pg';
import { getBusinessYear } from '../../../utils/dateRange.js';
import {
    normalizeStoreTransfer,
    normalizeStoreTransferLine,
    type StoreTransfer,
    type StoreTransferDbRow,
    type StoreTransferLine,
    type StoreTransferLineDbRow,
    type StoreTransferStatus,
} from '../../../../../shared/types/storeTransfer.js';
import type { TransferWorkflowMode } from '../../../../../shared/types/transferWorkflow.js';
import { productLotRepository } from './productLotRepository.js';

export type DbConn = Pool | PoolClient;

export const storeTransferRepository = {
    async generateTransferNumber(conn: DbConn): Promise<string> {
        const year = getBusinessYear();
        await conn.query(`SELECT pg_advisory_xact_lock(hashtext('store_transfer_number_seq'))`);
        const result = await conn.query<{ transfer_number: string }>(
            `SELECT transfer_number
             FROM store_transfers
             WHERE transfer_number LIKE $1
             ORDER BY transfer_number DESC
             LIMIT 1`,
            [`ST-${year}-%`],
        );

        if (result.rows.length === 0) {
            return `ST-${year}-0001`;
        }

        const last = result.rows[0].transfer_number;
        const seq = parseInt(last.split('-')[2], 10) + 1;
        return `ST-${year}-${seq.toString().padStart(4, '0')}`;
    },

    async createTransfer(
        conn: DbConn,
        data: {
            transferNumber: string;
            sourceStoreId: string;
            transitStoreId: string;
            destinationStoreId: string;
            notes?: string | null;
            createdById?: string | null;
            workflowMode?: string;
            overrideReason?: string | null;
            overrideComments?: string | null;
            totalInventoryValue?: number | null;
            permissionUsed?: string | null;
            initialStatus?: StoreTransferStatus;
            assortmentExpansionDecisions?: Array<{ productId: string; expandPermanently: boolean }>;
        },
    ): Promise<StoreTransfer> {
        const status = data.initialStatus ?? 'DRAFT';
        const result = await conn.query<StoreTransferDbRow>(
            `INSERT INTO store_transfers (
               transfer_number, source_store_id, transit_store_id,
               destination_store_id, notes, created_by_id, status,
               workflow_mode, override_reason, override_comments,
               total_inventory_value, permission_used, assortment_expansion_decisions
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                data.transferNumber,
                data.sourceStoreId,
                data.transitStoreId,
                data.destinationStoreId,
                data.notes ?? null,
                data.createdById ?? null,
                status,
                data.workflowMode ?? 'REQUEST',
                data.overrideReason ?? null,
                data.overrideComments ?? null,
                data.totalInventoryValue ?? null,
                data.permissionUsed ?? null,
                JSON.stringify(data.assortmentExpansionDecisions ?? []),
            ],
        );
        return normalizeStoreTransfer(result.rows[0]);
    },

    async addLines(
        conn: DbConn,
        transferId: string,
        lines: Array<{ productId: string; productLotId: string; quantity: number }>,
    ): Promise<StoreTransferLine[]> {
        const inserted: StoreTransferLine[] = [];
        let lineNumber = 1;
        for (const line of lines) {
            const lot = await productLotRepository.getById(conn, line.productLotId);
            if (!lot || lot.productId !== line.productId) {
                throw new Error(`Invalid product lot ${line.productLotId} for product ${line.productId}`);
            }

            const result = await conn.query<StoreTransferLineDbRow>(
                `INSERT INTO store_transfer_lines (
                   store_transfer_id, line_number, product_id, product_lot_id, quantity
                 ) VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [transferId, lineNumber++, line.productId, line.productLotId, line.quantity],
            );
            inserted.push(normalizeStoreTransferLine(result.rows[0]));
        }
        return inserted;
    },

    async getById(conn: DbConn, id: string): Promise<StoreTransfer | null> {
        const header = await conn.query<StoreTransferDbRow>(
            `SELECT st.*, u.full_name AS created_by_name
             FROM store_transfers st
             LEFT JOIN users u ON u.id = st.created_by_id
             WHERE st.id = $1`,
            [id],
        );
        if (header.rows.length === 0) return null;

        const lines = await conn.query<StoreTransferLineDbRow>(
            `SELECT stl.*,
                    p.name AS product_name,
                    p.sku,
                    pl.lot_number,
                    (
                      SELECT GREATEST(
                        ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
                        0
                      )
                      FROM inventory_balances ib
                      WHERE ib.store_location_id = st.source_store_id
                        AND ib.product_lot_id = stl.product_lot_id
                        AND NOT ib.blocked
                      LIMIT 1
                    ) AS available_at_source
             FROM store_transfer_lines stl
             INNER JOIN store_transfers st ON st.id = stl.store_transfer_id
             INNER JOIN products p ON p.id = stl.product_id
             INNER JOIN product_lots pl ON pl.id = stl.product_lot_id
             WHERE stl.store_transfer_id = $1
             ORDER BY stl.line_number ASC`,
            [id],
        );

        const transfer = normalizeStoreTransfer(header.rows[0]);
        transfer.lines = lines.rows.map(normalizeStoreTransferLine);
        transfer.auditEvents = await storeTransferRepository.listAuditEvents(conn, id);
        return transfer;
    },

    async getByIdForUpdate(conn: PoolClient, id: string): Promise<StoreTransfer | null> {
        const header = await conn.query<StoreTransferDbRow>(
            `SELECT st.*,
                    (SELECT u.full_name FROM users u WHERE u.id = st.created_by_id) AS created_by_name
             FROM store_transfers st
             WHERE st.id = $1 FOR UPDATE`,
            [id],
        );
        if (header.rows.length === 0) return null;

        const lines = await conn.query<StoreTransferLineDbRow>(
            `SELECT stl.*,
                    p.name AS product_name,
                    p.sku,
                    pl.lot_number,
                    (
                      SELECT GREATEST(
                        ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
                        0
                      )
                      FROM inventory_balances ib
                      WHERE ib.store_location_id = st.source_store_id
                        AND ib.product_lot_id = stl.product_lot_id
                        AND NOT ib.blocked
                      LIMIT 1
                    ) AS available_at_source
             FROM store_transfer_lines stl
             INNER JOIN store_transfers st ON st.id = stl.store_transfer_id
             INNER JOIN products p ON p.id = stl.product_id
             INNER JOIN product_lots pl ON pl.id = stl.product_lot_id
             WHERE stl.store_transfer_id = $1
             ORDER BY stl.line_number ASC`,
            [id],
        );

        const transfer = normalizeStoreTransfer(header.rows[0]);
        transfer.lines = lines.rows.map(normalizeStoreTransferLine);
        transfer.auditEvents = await storeTransferRepository.listAuditEvents(conn, id);
        return transfer;
    },

    async updateStatus(
        conn: PoolClient,
        id: string,
        status: StoreTransferStatus,
        actor: {
            approvedById?: string;
            dispatchedById?: string;
            receivedById?: string;
            executedById?: string;
            completedAt?: boolean;
        },
    ): Promise<StoreTransfer> {
        const sets = ['status = $2', 'updated_at = NOW()'];
        const params: unknown[] = [id, status];
        let idx = 3;

        if (actor.approvedById) {
            sets.push(`approved_by_id = $${idx++}`, 'approved_at = NOW()');
            params.push(actor.approvedById);
        }
        if (actor.dispatchedById) {
            sets.push(`dispatched_by_id = $${idx++}`, 'dispatched_at = NOW()');
            params.push(actor.dispatchedById);
        }
        if (actor.receivedById) {
            sets.push(`received_by_id = $${idx++}`, 'received_at = NOW()');
            params.push(actor.receivedById);
        }
        if (actor.executedById) {
            sets.push(`executed_by_id = $${idx++}`);
            params.push(actor.executedById);
        }
        if (actor.completedAt) {
            sets.push('completed_at = NOW()');
        }

        const result = await conn.query<StoreTransferDbRow>(
            `UPDATE store_transfers SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params,
        );
        return normalizeStoreTransfer(result.rows[0]);
    },

    async logAuditEvent(
        conn: DbConn,
        data: {
            storeTransferId: string;
            eventType: string;
            workflowMode: string;
            permissionUsed?: string | null;
            userId?: string | null;
            userRole?: string | null;
            payload?: Record<string, unknown>;
        },
    ): Promise<void> {
        await conn.query(
            `INSERT INTO store_transfer_audit_events (
               store_transfer_id, event_type, workflow_mode,
               permission_used, user_id, user_role, payload
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                data.storeTransferId,
                data.eventType,
                data.workflowMode,
                data.permissionUsed ?? null,
                data.userId ?? null,
                data.userRole ?? null,
                JSON.stringify(data.payload ?? {}),
            ],
        );
    },

    async listAuditEvents(conn: DbConn, transferId: string) {
        const result = await conn.query<{
            id: string;
            store_transfer_id: string;
            event_type: string;
            workflow_mode: string;
            permission_used: string | null;
            user_id: string | null;
            user_role: string | null;
            payload: Record<string, unknown>;
            created_at: string;
        }>(
            `SELECT * FROM store_transfer_audit_events
             WHERE store_transfer_id = $1
             ORDER BY created_at ASC`,
            [transferId],
        );
        return result.rows.map((row) => ({
            id: row.id,
            storeTransferId: row.store_transfer_id,
            eventType: row.event_type,
            workflowMode: row.workflow_mode as TransferWorkflowMode,
            permissionUsed: row.permission_used,
            userId: row.user_id,
            userRole: row.user_role,
            payload: row.payload ?? {},
            createdAt: row.created_at,
        }));
    },

    async markLineDispatched(
        conn: PoolClient,
        lineId: string,
        quantity: number,
    ): Promise<void> {
        await conn.query(
            `UPDATE store_transfer_lines
             SET quantity_dispatched = quantity_dispatched + $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [lineId, quantity],
        );
    },

    async markLineReceived(
        conn: PoolClient,
        lineId: string,
        quantity: number,
        options?: { receiveComment?: string | null; shortageDelta?: number },
    ): Promise<void> {
        const shortageDelta = options?.shortageDelta ?? 0;
        await conn.query(
            `UPDATE store_transfer_lines
             SET quantity_received = quantity_received + $2,
                 quantity_shortage = quantity_shortage + $3,
                 receive_comment = COALESCE($4, receive_comment),
                 updated_at = NOW()
             WHERE id = $1`,
            [lineId, quantity, shortageDelta, options?.receiveComment ?? null],
        );
    },

    async setLineApproval(
        conn: PoolClient,
        lineId: string,
        quantityApproved: number,
        approvalComment?: string | null,
    ): Promise<void> {
        await conn.query(
            `UPDATE store_transfer_lines
             SET quantity_approved = $2,
                 approval_comment = COALESCE($3, approval_comment),
                 updated_at = NOW()
             WHERE id = $1`,
            [lineId, quantityApproved, approvalComment ?? null],
        );
    },

    async setLineDispatchComment(
        conn: PoolClient,
        lineId: string,
        dispatchComment?: string | null,
    ): Promise<void> {
        if (!dispatchComment) return;
        await conn.query(
            `UPDATE store_transfer_lines
             SET dispatch_comment = $2, updated_at = NOW()
             WHERE id = $1`,
            [lineId, dispatchComment],
        );
    },

    async listTransfers(conn: DbConn, limit = 50): Promise<StoreTransfer[]> {
        const result = await conn.query<StoreTransferDbRow>(
            `SELECT * FROM store_transfers
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit],
        );
        return result.rows.map(normalizeStoreTransfer);
    },
};
