import { Request, Response, Router } from 'express';

import { z } from 'zod';

import { pool as globalPool } from '../../../db/pool.js';

import { authenticate } from '../../../middleware/auth.js';

import { requireAnyPermission } from '../../../rbac/middleware.js';

import { asyncHandler } from '../../../middleware/errorHandler.js';

import { storeTransferService } from './storeTransferService.js';

import { buildTransferActor, resolveTransferPermissions } from './transferPermissionUtils.js';

import { TRANSFER_PERMISSION_KEYS } from '../../../../../shared/types/transferWorkflow.js';
import {
  WAREHOUSE_NETWORK_READ_PERMISSIONS,
  WAREHOUSE_TRANSFER_READ_PERMISSIONS,
} from '../../../../../shared/utils/warehouseRbac.js';



const CreateTransferSchema = z.object({

    destinationStoreId: z.string().uuid().optional(),

    notes: z.string().optional().nullable(),

    overrideReason: z.string().optional().nullable(),

    overrideComments: z.string().optional().nullable(),

    assortmentExpansions: z

        .array(

            z.object({

                productId: z.string().uuid(),

                expandPermanently: z.boolean(),

            }),

        )

        .optional(),

    lines: z

        .array(

            z.object({

                productLotId: z.string().uuid(),

                quantity: z.number().positive(),

            }),

        )

        .min(1),

});



const TransferStageLineSchema = z.object({
    lineId: z.string().uuid(),
    quantity: z.number().min(0),
    comment: z.string().optional().nullable(),
});

const ApproveTransferSchema = z.object({
    lines: z.array(TransferStageLineSchema).optional(),
});

const DispatchTransferSchema = z.object({
    lines: z.array(TransferStageLineSchema).optional(),
});

const ReceiveTransferSchema = z.object({
    lines: z.array(TransferStageLineSchema).optional(),
});

const CancelTransferSchema = z.object({
    reason: z.string().optional().nullable(),
});



const PreviewAssortmentSchema = z.object({

    destinationStoreId: z.string().uuid(),

    lines: z

        .array(

            z.object({

                productLotId: z.string().uuid(),

                quantity: z.number().positive(),

            }),

        )

        .min(1),

});



const CREATE_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.REQUEST,
  TRANSFER_PERMISSION_KEYS.DIRECT,
  TRANSFER_PERMISSION_KEYS.OVERRIDE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
];

const TRANSFER_READ_PERMISSIONS = [...WAREHOUSE_TRANSFER_READ_PERMISSIONS];



export const storeTransferController = {

    async workflowCapabilities(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const capabilities = await storeTransferService.getWorkflowCapabilities(pool, permissions);

        res.json({ success: true, data: capabilities });

    },



    async list(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const transfers = await storeTransferService.listTransfers(pool);

        res.json({ success: true, data: transfers });

    },



    async getById(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const transfer = await storeTransferService.getTransfer(pool, req.params.id);

        if (!transfer) {

            res.status(404).json({ success: false, error: 'Transfer not found' });

            return;

        }

        res.json({ success: true, data: transfer });

    },



    async create(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const body = CreateTransferSchema.parse(req.body);

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const transfer = await storeTransferService.createTransfer(pool, body, actor);

        res.status(201).json({ success: true, data: transfer });

    },



    async previewAssortment(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const body = PreviewAssortmentSchema.parse(req.body);

        const preview = await storeTransferService.previewTransferAssortment(

            pool,

            body.destinationStoreId,

            body.lines,

        );

        res.json({ success: true, data: preview });

    },



    async approve(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = ApproveTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.approveTransfer(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer });

    },



    async saveApprovalDraft(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = ApproveTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.saveApprovalDraft(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer });

    },



    async dispatch(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = DispatchTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.dispatchTransfer(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer, message: 'Stock moved MAIN → TRANSIT' });

    },



    async receive(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = ReceiveTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.receiveTransfer(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer, message: 'Stock moved TRANSIT → SELLING' });

    },



    async cancel(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = CancelTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.cancelTransfer(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer, message: 'Transfer cancelled' });

    },



    async complete(req: Request, res: Response): Promise<void> {

        const pool = req.tenantPool || globalPool;

        const permissions = await resolveTransferPermissions(req);

        const actor = buildTransferActor(req, permissions);

        const body = ApproveTransferSchema.parse(req.body ?? {});

        const transfer = await storeTransferService.completeRequestTransfer(

            pool,

            req.params.id,

            actor,

            body,

        );

        res.json({ success: true, data: transfer, message: 'Transfer completed end-to-end' });

    },

};



export const storeTransferRoutes = Router();



storeTransferRoutes.get(
    '/workflow-capabilities',
    authenticate,
    requireAnyPermission(TRANSFER_READ_PERMISSIONS),
    asyncHandler(storeTransferController.workflowCapabilities),
);

storeTransferRoutes.get(
    '/',
    authenticate,
    requireAnyPermission(TRANSFER_READ_PERMISSIONS),
    asyncHandler(storeTransferController.list),
);

storeTransferRoutes.post(

    '/preview-assortment',

    authenticate,

    requireAnyPermission(CREATE_PERMISSIONS),

    asyncHandler(storeTransferController.previewAssortment),

);

storeTransferRoutes.get(
    '/:id',
    authenticate,
    requireAnyPermission(TRANSFER_READ_PERMISSIONS),
    asyncHandler(storeTransferController.getById),
);

storeTransferRoutes.post(

    '/',

    authenticate,

    requireAnyPermission(CREATE_PERMISSIONS),

    asyncHandler(storeTransferController.create),

);

storeTransferRoutes.post(

    '/:id/approve',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.APPROVE,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.approve),

);

storeTransferRoutes.post(

    '/:id/approval-draft',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.APPROVE,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.saveApprovalDraft),

);

storeTransferRoutes.post(

    '/:id/dispatch',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.DISPATCH,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.dispatch),

);

storeTransferRoutes.post(

    '/:id/receive',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.RECEIVE,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.receive),

);

storeTransferRoutes.post(

    '/:id/cancel',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.REQUEST,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.cancel),

);

storeTransferRoutes.post(

    '/:id/complete',

    authenticate,

    requireAnyPermission([

        TRANSFER_PERMISSION_KEYS.OVERRIDE,

        TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,

    ]),

    asyncHandler(storeTransferController.complete),

);


