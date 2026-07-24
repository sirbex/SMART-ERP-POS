import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { restaurantService } from './restaurantService.js';

const router = Router();
router.use(authenticate);

const TableCreateSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  zone: z.string().max(64).optional(),
  seats: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

const TableUpdateSchema = TableCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const AddItemsSchema = z.object({
  tableId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  taxAmount: z.number().nonnegative().optional(),
  waiterId: z.string().uuid().optional(),
  guestName: z.string().max(200).nullable().optional(),
  guestPhone: z.string().max(50).nullable().optional(),
  deliveryAddress: z.string().max(1000).nullable().optional(),
  pickupLabel: z.string().max(120).nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productName: z.string().optional(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
        discountAmount: z.number().nonnegative().optional(),
        lineNotes: z.string().nullable().optional(),
        uomId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1),
});

const GuestDetailsSchema = z.object({
  guestName: z.string().max(200).nullable().optional(),
  guestPhone: z.string().max(50).nullable().optional(),
  deliveryAddress: z.string().max(1000).nullable().optional(),
  pickupLabel: z.string().max(120).nullable().optional(),
});

const AssignWaiterSchema = z.object({
  waiterId: z.string().uuid(),
});

const ProductFlagsSchema = z.object({
  availableInRestaurant: z.boolean().optional(),
  kitchenStation: z.string().max(64).nullable().optional(),
});

/**
 * GET /api/restaurant/enabled
 * Readable without restaurant permissions so Layout can hide/show nav.
 */
router.get(
  '/enabled',
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const enabled = await restaurantService.isEnabled(pool);
    res.json({ success: true, data: { enabled } });
  }),
);

router.get(
  '/tables',
  requireAnyPermission(['restaurant.read', 'restaurant.order', 'restaurant.manage']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const includeInactive = req.query.includeInactive === 'true';
    const tables = await restaurantService.listTables(pool, includeInactive);
    res.json({ success: true, data: tables });
  }),
);

router.get(
  '/waiters',
  requireAnyPermission(['restaurant.read', 'restaurant.order', 'restaurant.manage']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const waiters = await restaurantService.listAssignableWaiters(pool);
    res.json({ success: true, data: waiters });
  }),
);

router.post(
  '/tables',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = TableCreateSchema.parse(req.body);
    const table = await restaurantService.createTable(pool, body);
    res.status(201).json({ success: true, data: table });
  }),
);

router.patch(
  '/tables/:id',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = TableUpdateSchema.parse(req.body);
    const table = await restaurantService.updateTable(pool, req.params.id, body);
    res.json({ success: true, data: table });
  }),
);

router.get(
  '/tables/:id/check',
  requireAnyPermission(['restaurant.read', 'restaurant.order']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const activeOrderId =
      typeof req.query.orderId === 'string' && req.query.orderId.length > 0
        ? req.query.orderId
        : null;
    const check = await restaurantService.getTableCheck(pool, req.params.id, activeOrderId);
    res.json({ success: true, data: check });
  }),
);

router.post(
  '/tables/:id/activate-check',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = z.object({ orderId: z.string().uuid() }).parse(req.body);
    const check = await restaurantService.activateCheck(pool, req.params.id, body.orderId);
    res.json({ success: true, data: check });
  }),
);

router.get(
  '/menu/categories',
  requireAnyPermission(['restaurant.read', 'restaurant.order']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const categories = await restaurantService.listMenuCategories(pool);
    res.json({ success: true, data: categories });
  }),
);

router.get(
  '/menu/products',
  requireAnyPermission(['restaurant.read', 'restaurant.order']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const categoryId =
      typeof req.query.categoryId === 'string' && req.query.categoryId.length > 0
        ? req.query.categoryId
        : null;
    const products = await restaurantService.listMenuProducts(pool, { categoryId });
    res.json({ success: true, data: products });
  }),
);

router.patch(
  '/menu/products/:id',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = ProductFlagsSchema.parse(req.body);
    const product = await restaurantService.setProductFlags(pool, req.params.id, body);
    res.json({ success: true, data: product });
  }),
);

router.post(
  '/checks/items',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = AddItemsSchema.parse(req.body);
    const result = await restaurantService.addItemsToTable(pool, {
      ...body,
      waiterId: body.waiterId ?? req.user!.id,
    });
    res.status(201).json({ success: true, data: result });
  }),
);

router.patch(
  '/checks/:orderId/guest',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = GuestDetailsSchema.parse(req.body ?? {});
    const result = await restaurantService.updateCheckGuest(pool, req.params.orderId, body);
    res.json({ success: true, data: result });
  }),
);

router.patch(
  '/checks/:orderId/waiter',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = AssignWaiterSchema.parse(req.body);
    const result = await restaurantService.assignWaiter(pool, req.params.orderId, body.waiterId);
    res.json({ success: true, data: result });
  }),
);

const TransferSchema = z.object({
  toTableId: z.string().uuid(),
});

const MergeSchema = z.object({
  secondaryOrderId: z.string().uuid(),
});

const SplitSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
  targetTableId: z.string().uuid(),
  sameTable: z.boolean().optional(),
});

router.post(
  '/checks/:orderId/transfer',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = TransferSchema.parse(req.body);
    const result = await restaurantService.transferCheck(
      pool,
      req.params.orderId,
      body.toTableId,
      req.user!.id,
    );
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/checks/:orderId/merge',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = MergeSchema.parse(req.body);
    const result = await restaurantService.mergeChecks(
      pool,
      req.params.orderId,
      body.secondaryOrderId,
      req.user!.id,
    );
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/checks/:orderId/split',
  requirePermission('restaurant.order'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = SplitSchema.parse(req.body);
    const result = await restaurantService.splitCheck(pool, req.params.orderId, {
      itemIds: body.itemIds,
      targetTableId: body.targetTableId,
      sameTable: body.sameTable,
      actorId: req.user!.id,
    });
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/checks/:orderId/kot',
  requireAnyPermission(['restaurant.kitchen', 'restaurant.order']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const kots = await restaurantService.sendKot(pool, req.params.orderId, req.user!.id);
    res.status(201).json({ success: true, data: kots });
  }),
);

const VoidItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
  reason: z.string().min(1).max(500),
});

/**
 * POST /api/restaurant/checks/:orderId/void-items
 * Void selected lines. Kitchen-sent lines emit VOID KOT tickets (no prices).
 */
router.post(
  '/checks/:orderId/void-items',
  requireAnyPermission(['restaurant.order', 'orders.cancel']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = VoidItemsSchema.parse(req.body);
    const result = await restaurantService.voidCheckItems(pool, req.params.orderId, {
      itemIds: body.itemIds,
      reason: body.reason,
      voidedBy: req.user!.id,
    });
    res.status(200).json({
      success: true,
      data: result,
      message: result.checkCancelled
        ? 'Check voided — table freed'
        : `Voided ${body.itemIds.length} line(s)`,
    });
  }),
);

/**
 * GET /api/restaurant/kitchen/board — active KDS tickets (no prices)
 */
router.get(
  '/kitchen/board',
  requireAnyPermission(['restaurant.kitchen', 'restaurant.read', 'restaurant.order']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const station =
      typeof req.query.station === 'string' && req.query.station.length > 0
        ? req.query.station
        : null;
    const tickets = await restaurantService.listKitchenBoard(pool, { station });
    res.json({ success: true, data: tickets });
  }),
);

const StationCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  printerName: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});

const StationUpdateSchema = StationCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const RecipeUpsertSchema = z.object({
  parentProductId: z.string().uuid(),
  name: z.string().min(1).max(120),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        componentProductId: z.string().uuid(),
        quantityBase: z.number().positive(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .min(1),
});

router.get(
  '/stations',
  requireAnyPermission(['restaurant.read', 'restaurant.order', 'restaurant.kitchen', 'restaurant.manage']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const includeInactive = req.query.includeInactive === 'true';
    const stations = await restaurantService.listStations(pool, includeInactive);
    res.json({ success: true, data: stations });
  }),
);

router.post(
  '/stations',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = StationCreateSchema.parse(req.body);
    const station = await restaurantService.createStation(pool, body);
    res.status(201).json({ success: true, data: station });
  }),
);

router.patch(
  '/stations/:id',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = StationUpdateSchema.parse(req.body);
    const station = await restaurantService.updateStation(pool, req.params.id, body);
    res.json({ success: true, data: station });
  }),
);

router.get(
  '/recipes',
  requireAnyPermission(['restaurant.read', 'restaurant.manage']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const recipes = await restaurantService.listRecipes(pool);
    res.json({ success: true, data: recipes });
  }),
);

router.get(
  '/recipes/by-product/:productId',
  requireAnyPermission(['restaurant.read', 'restaurant.manage']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const recipe = await restaurantService.getRecipeByProduct(pool, req.params.productId);
    res.json({ success: true, data: recipe });
  }),
);

router.put(
  '/recipes',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = RecipeUpsertSchema.parse(req.body);
    const recipe = await restaurantService.upsertRecipe(pool, body);
    res.json({ success: true, data: recipe });
  }),
);

router.delete(
  '/recipes/:id',
  requirePermission('restaurant.manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const result = await restaurantService.deleteRecipe(pool, req.params.id);
    res.json({ success: true, data: result });
  }),
);

const KotStatusSchema = z.object({
  status: z.enum(['SENT', 'PREPARING', 'READY', 'BUMPED']).optional(),
});

/**
 * POST /api/restaurant/kitchen/tickets/:kotId/advance
 * Advance ticket: SENT → PREPARING → READY → BUMPED
 */
router.post(
  '/kitchen/tickets/:kotId/advance',
  requirePermission('restaurant.kitchen'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = KotStatusSchema.parse(req.body ?? {});
    const result = await restaurantService.advanceKotStatus(
      pool,
      req.params.kotId,
      req.user!.id,
      body.status,
    );
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/checks/:orderId/bill',
  requireAnyPermission(['restaurant.pay', 'restaurant.order', 'restaurant.read']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const bill = await restaurantService.getBill(pool, req.params.orderId);
    res.json({ success: true, data: bill });
  }),
);

const CancelCheckSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

router.post(
  '/checks/:orderId/cancel',
  requireAnyPermission(['restaurant.order', 'orders.cancel']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = CancelCheckSchema.parse(req.body ?? {});
    const result = await restaurantService.cancelCheck(
      pool,
      req.params.orderId,
      req.user!.id,
      body.reason || 'Cancelled from restaurant POS',
    );
    res.json({
      success: true,
      data: result,
      message: `Check ${result.order.orderNumber} cancelled`,
    });
  }),
);

export default router;
