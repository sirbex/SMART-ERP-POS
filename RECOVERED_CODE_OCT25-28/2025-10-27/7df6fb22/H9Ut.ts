/**
 * Held Sales API Routes
 * Manage temporarily held POS carts
 */

import { Router, Request, Response } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { HoldSaleSchema } from '../validation/pos.js';
import { Prisma } from '@prisma/client';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

/**
 * Hold a sale (PUT ON HOLD)
 * POST /api/pos/hold
 */
router.post('/hold', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    // Validate request body
    const validationResult = HoldSaleSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { customerId, items, subtotal, taxAmount, discount, total, notes } = validationResult.data;

    // Generate hold number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Find the last hold with the correct format
    const prefix = `HOLD-${dateStr}-`;
    const allHolds = await prisma.heldSale.findMany({
      where: { holdNumber: { startsWith: prefix } },
      select: { holdNumber: true },
      orderBy: { heldAt: 'desc' }
    });
    
    let maxSequence = 0;
    for (const hold of allHolds) {
      const parts = hold.holdNumber.split('-');
      if (parts.length === 3 && parts[0] === 'HOLD' && parts[1] === dateStr) {
        const seqNum = parseInt(parts[2], 10);
        if (!isNaN(seqNum) && seqNum > maxSequence) {
          maxSequence = seqNum;
        }
      }
    }
    
    const sequence = maxSequence + 1;
    const holdNumber = `HOLD-${dateStr}-${sequence.toString().padStart(4, '0')}`;

    // Set expiry to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create held sale
    const heldSale = await prisma.heldSale.create({
      data: {
        holdNumber,
        customerId: customerId || null,
        items: items as any, // Store as JSON
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        discount: new Prisma.Decimal(discount),
        total: new Prisma.Decimal(total),
        notes: notes || null,
        heldBy: userId,
        expiresAt,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    res.status(201).json(heldSale);
  } catch (error: any) {
    console.error('Error holding sale:', error);
    res.status(500).json({ error: 'Failed to hold sale', details: error.message });
  }
});

/**
 * Get all held sales (for current user or all)
 * GET /api/pos/held
 */
router.get('/held', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const showAll = req.query.all === 'true' && (userRole === 'ADMIN' || userRole === 'MANAGER');

    const where: any = {
      expiresAt: { gt: new Date() }, // Only non-expired
    };

    if (!showAll) {
      where.heldBy = userId;
    }

    const heldSales = await prisma.heldSale.findMany({
      where,
      orderBy: { heldAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    res.json(heldSales);
  } catch (error: any) {
    console.error('Error fetching held sales:', error);
    res.status(500).json({ error: 'Failed to fetch held sales', details: error.message });
  }
});

/**
 * Get count of held sales
 * GET /api/pos/held/count
 */
router.get('/held/count', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const showAll = req.query.all === 'true' && (userRole === 'ADMIN' || userRole === 'MANAGER');

    const where: any = {
      expiresAt: { gt: new Date() },
    };

    if (!showAll) {
      where.heldBy = userId;
    }

    const count = await prisma.heldSale.count({ where });

    res.json({ count });
  } catch (error: any) {
    console.error('Error counting held sales:', error);
    res.status(500).json({ error: 'Failed to count held sales', details: error.message });
  }
});

/**
 * Get a specific held sale by ID
 * GET /api/pos/held/:id
 */
router.get('/held/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const heldSale = await prisma.heldSale.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    if (!heldSale) {
      return res.status(404).json({ error: 'Held sale not found' });
    }

    // Check if expired
    if (heldSale.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Held sale has expired' });
    }

    res.json(heldSale);
  } catch (error: any) {
    console.error('Error fetching held sale:', error);
    res.status(500).json({ error: 'Failed to fetch held sale', details: error.message });
  }
});

/**
 * Delete a held sale (remove from hold)
 * DELETE /api/pos/held/:id
 */
router.delete('/held/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    const heldSale = await prisma.heldSale.findUnique({
      where: { id },
      select: { heldBy: true }
    });

    if (!heldSale) {
      return res.status(404).json({ error: 'Held sale not found' });
    }

    // Only owner or admin/manager can delete
    if (heldSale.heldBy !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return res.status(403).json({ error: 'Unauthorized to delete this held sale' });
    }

    await prisma.heldSale.delete({ where: { id } });

    res.json({ message: 'Held sale deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting held sale:', error);
    res.status(500).json({ error: 'Failed to delete held sale', details: error.message });
  }
});

/**
 * Clean up expired held sales (cron job or manual trigger)
 * DELETE /api/pos/held/cleanup/expired
 */
router.delete('/held/cleanup/expired', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user.role;

    // Only admin/manager can run cleanup
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await prisma.heldSale.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    res.json({ message: `Deleted ${result.count} expired held sales` });
  } catch (error: any) {
    console.error('Error cleaning up expired held sales:', error);
    res.status(500).json({ error: 'Failed to clean up expired held sales', details: error.message });
  }
});

export default router;
