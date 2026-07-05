import type { Pool, PoolClient } from 'pg';
import {
    DEFAULT_TRANSFER_POLICY,
    type TransferPolicy,
} from '../../../../../shared/types/transferWorkflow.js';

export type DbConn = Pool | PoolClient;

interface TransferPolicyRow {
    transfer_policy_require_approval_all: boolean;
    transfer_policy_allow_direct: boolean;
    transfer_policy_value_threshold: string | null;
    transfer_policy_qty_threshold: string | null;
    transfer_policy_special_stores_require_approval: boolean;
}

export const transferPolicyService = {
    async getPolicy(conn: DbConn): Promise<TransferPolicy> {
        const result = await conn.query<TransferPolicyRow>(
            `SELECT
               transfer_policy_require_approval_all,
               transfer_policy_allow_direct,
               transfer_policy_value_threshold,
               transfer_policy_qty_threshold,
               transfer_policy_special_stores_require_approval
             FROM system_settings
             LIMIT 1`,
        );

        const row = result.rows[0];
        if (!row) {
            return { ...DEFAULT_TRANSFER_POLICY };
        }

        return {
            requireApprovalAll: row.transfer_policy_require_approval_all ?? true,
            allowDirect: row.transfer_policy_allow_direct ?? true,
            valueThreshold:
                row.transfer_policy_value_threshold != null
                    ? parseFloat(row.transfer_policy_value_threshold)
                    : null,
            qtyThreshold:
                row.transfer_policy_qty_threshold != null
                    ? parseFloat(row.transfer_policy_qty_threshold)
                    : null,
            specialStoresRequireApproval:
                row.transfer_policy_special_stores_require_approval ?? true,
        };
    },
};
