import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../../db/pool.js';
import { authenticate } from '../../../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../../../rbac/middleware.js';
import { WAREHOUSE_NETWORK_READ_PERMISSIONS } from '../../../../../shared/utils/warehouseRbac.js';
import { asyncHandler, ValidationError } from '../../../middleware/errorHandler.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import type { StoreType } from '../../../../../shared/types/warehouseNetwork.js';

const CreateStoreSchema = z.object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    storeType: z.enum(['MAIN', 'SELLING', 'TRANSIT', 'DAMAGE', 'EXPIRED', 'RETURN']),
    isDefaultReceiving: z.boolean().optional(),
    isPosSelling: z.boolean().optional(),
    parentStoreId: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
});

const UpdateStoreSchema = CreateStoreSchema.partial().refine(
    (d) => Object.keys(d).length > 0,
    { message: 'At least one field required' },
);

async function assertMultistore(pool: typeof globalPool): Promise<void> {
    if (!(await isMultistoreEnabled(pool))) {
        throw new ValidationError('Multi-store mode is not enabled for this tenant');
    }
}

export const storeLocationController = {
    async list(req: Request, res: Response): Promise<void> {
        const pool = req.tenantPool || globalPool;
        await assertMultistore(pool);
        const stores = await storeLocationRepository.listActive(pool);
        res.json({ success: true, data: stores });
    },

    async ensureDefaults(req: Request, res: Response): Promise<void> {
        const pool = req.tenantPool || globalPool;
        await assertMultistore(pool);
        const network = await storeLocationRepository.ensureDefaultNetworkStores(pool);
        res.json({ success: true, data: network });
    },

    async create(req: Request, res: Response): Promise<void> {
        const pool = req.tenantPool || globalPool;
        await assertMultistore(pool);
        const body = CreateStoreSchema.parse(req.body);
        const store = await storeLocationRepository.create(pool, {
            code: body.code,
            name: body.name,
            storeType: body.storeType as StoreType,
            isDefaultReceiving: body.isDefaultReceiving,
            isPosSelling: body.isPosSelling,
            parentStoreId: body.parentStoreId,
            notes: body.notes,
        });
        res.status(201).json({ success: true, data: store });
    },

    async update(req: Request, res: Response): Promise<void> {
        const pool = req.tenantPool || globalPool;
        await assertMultistore(pool);
        const body = UpdateStoreSchema.parse(req.body);
        const existing = await storeLocationRepository.getById(pool, req.params.id);
        if (!existing) {
            res.status(404).json({ success: false, error: 'Store not found' });
            return;
        }
        const result = await pool.query(
            `UPDATE store_locations SET
               name = COALESCE($2, name),
               store_type = COALESCE($3::store_type, store_type),
               is_default_receiving = COALESCE($4, is_default_receiving),
               is_pos_selling = COALESCE($5, is_pos_selling),
               parent_store_id = COALESCE($6, parent_store_id),
               notes = COALESCE($7, notes),
               updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                req.params.id,
                body.name ?? null,
                body.storeType ?? null,
                body.isDefaultReceiving ?? null,
                body.isPosSelling ?? null,
                body.parentStoreId !== undefined ? body.parentStoreId : null,
                body.notes !== undefined ? body.notes : null,
            ],
        );
        const row = result.rows[0];
        res.json({
            success: true,
            data: {
                id: row.id,
                code: row.code,
                name: row.name,
                storeType: row.store_type,
                isActive: row.is_active,
                isDefaultReceiving: row.is_default_receiving,
                isPosSelling: row.is_pos_selling,
                parentStoreId: row.parent_store_id,
                notes: row.notes,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    },
};

export const storeLocationRoutes = Router();

storeLocationRoutes.get(
    '/',
    authenticate,
    requireAnyPermission([...WAREHOUSE_NETWORK_READ_PERMISSIONS]),
    asyncHandler(storeLocationController.list),
);
storeLocationRoutes.post(
    '/ensure-defaults',
    authenticate,
    requirePermission('inventory.approve'),
    asyncHandler(storeLocationController.ensureDefaults),
);
storeLocationRoutes.post(
    '/',
    authenticate,
    requirePermission('inventory.approve'),
    asyncHandler(storeLocationController.create),
);
storeLocationRoutes.patch(
    '/:id',
    authenticate,
    requirePermission('inventory.approve'),
    asyncHandler(storeLocationController.update),
);
