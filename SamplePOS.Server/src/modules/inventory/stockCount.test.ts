/**
 * @module StockCountIntegrationTests
 * @description Comprehensive integration tests for Physical Counting (Stocktake) API
 * @architecture E2E tests covering full workflow: create → count → validate → reconcile
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { pool } from '../../db/pool.js';
import app from '../../server.js';

describe('Stock Count API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let testProductId: string;
  let testBatchId: string;
  let stockCountId: string;

  // Setup: Create test user, product, and batch
  beforeAll(async () => {
    // Register and login test user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `stockcount_test_${Date.now()}@test.com`,
        password: 'Test123!@#',
        name: 'Stock Count Tester',
        role: 'ADMIN',
      });

    expect(registerRes.status).toBe(201);
    userId = registerRes.body.data.user.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: registerRes.body.data.user.email,
        password: 'Test123!@#',
      });

    expect(loginRes.status).toBe(200);
    authToken = loginRes.body.data.token;

    // Create test product
    const productRes = await pool.query(
      `INSERT INTO products (name, sku, category_id, unit_price, cost_price, reorder_level, is_active)
       VALUES ($1, $2, NULL, $3, $4, $5, true)
       RETURNING id`,
      [`Test Product ${Date.now()}`, `SKU-TEST-${Date.now()}`, 100, 50, 10]
    );
    testProductId = productRes.rows[0].id;

    // Create test batch with initial stock
    const batchRes = await pool.query(
      `INSERT INTO inventory_batches 
       (product_id, batch_number, received_quantity, remaining_quantity, cost_per_unit, expiry_date, is_active)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + INTERVAL '30 days', true)
       RETURNING id`,
      [testProductId, `BATCH-TEST-${Date.now()}`, 100, 100, 50]
    );
    testBatchId = batchRes.rows[0].id;
  });

  // Cleanup
  afterAll(async () => {
    // Delete test data
    if (stockCountId) {
      await pool.query('DELETE FROM stock_count_lines WHERE stock_count_id = $1', [stockCountId]);
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [stockCountId]);
    }
    if (testBatchId) {
      await pool.query('DELETE FROM inventory_batches WHERE id = $1', [testBatchId]);
    }
    if (testProductId) {
      await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
    }
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  describe('POST /api/inventory/stockcounts - Create Stock Count', () => {
    it('should create stock count with all products', async () => {
      const res = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Year End Stocktake 2025',
          notes: 'Annual physical inventory count',
          includeAllProducts: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stockCount).toHaveProperty('id');
      expect(res.body.data.stockCount.name).toBe('Year End Stocktake 2025');
      expect(res.body.data.stockCount.state).toBe('counting');
      expect(res.body.data.linesCreated).toBeGreaterThan(0);

      stockCountId = res.body.data.stockCount.id;
    });

    it('should create stock count with specific products', async () => {
      const res = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Partial Count - Test Products',
          productIds: [testProductId],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stockCount.state).toBe('counting');

      // Cleanup this count
      const tempCountId = res.body.data.stockCount.id;
      await pool.query('DELETE FROM stock_count_lines WHERE stock_count_id = $1', [tempCountId]);
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [tempCountId]);
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post('/api/inventory/stockcounts')
        .send({
          name: 'Unauthorized Count',
          includeAllProducts: true,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid data', async () => {
      const res = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '', // Empty name should fail
          includeAllProducts: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });
  });

  describe('GET /api/inventory/stockcounts - List Stock Counts', () => {
    it('should list stock counts with pagination', async () => {
      const res = await request(app)
        .get('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('counts');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.counts)).toBe(true);
    });

    it('should filter by state', async () => {
      const res = await request(app)
        .get('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ state: 'counting' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.counts.forEach((count: Record<string, unknown>) => {
        expect(count.state).toBe('counting');
      });
    });

    it('should filter by creator', async () => {
      const res = await request(app)
        .get('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ createdById: userId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/inventory/stockcounts/:id - Get Stock Count', () => {
    it('should get stock count with lines', async () => {
      const res = await request(app)
        .get(`/api/inventory/stockcounts/${stockCountId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stockCount.id).toBe(stockCountId);
      expect(res.body.data).toHaveProperty('lines');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.lines)).toBe(true);

      // Verify difference calculation
      res.body.data.lines.forEach((line: Record<string, unknown>) => {
        expect(line).toHaveProperty('expected_qty_base');
        expect(line).toHaveProperty('difference');
        expect(line).toHaveProperty('differencePercentage');
      });
    });

    it('should return 404 for non-existent count', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/inventory/stockcounts/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should support pagination for lines', async () => {
      const res = await request(app)
        .get(`/api/inventory/stockcounts/${stockCountId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(5);
    });
  });

  describe('POST /api/inventory/stockcounts/:id/lines - Update Count Line', () => {
    it('should add/update count line', async () => {
      const res = await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          batchId: testBatchId,
          countedQty: 95,
          uom: 'BASE',
          notes: 'Counted during night shift',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.counted_qty_base).toBe(95);
    });

    it('should handle UOM conversion', async () => {
      // First, create a UOM for the product (if not exists)
      await pool.query(
        `INSERT INTO uoms (name, symbol, is_base_unit, created_at, updated_at)
         VALUES ('Box', 'BOX', false, NOW(), NOW())
         ON CONFLICT (symbol) DO NOTHING`
      );

      const uomRes = await pool.query(`SELECT id FROM uoms WHERE symbol = 'BOX'`);
      const uomId = uomRes.rows[0]?.id;

      if (uomId) {
        // Create product UOM mapping
        await pool.query(
          `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default, created_at, updated_at)
           VALUES ($1, $2, 12, false, NOW(), NOW())
           ON CONFLICT (product_id, uom_id) DO NOTHING`,
          [testProductId, uomId]
        );

        const res = await request(app)
          .post(`/api/inventory/stockcounts/${stockCountId}/lines`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            productId: testProductId,
            batchId: testBatchId,
            countedQty: 8, // 8 boxes
            uom: 'BOX', // Should convert to 96 base units (8 * 12)
            notes: 'Counted in boxes',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.counted_qty_base).toBe(96);
      }
    });

    it('should fail for non-counting state', async () => {
      // Create a count in 'done' state
      const doneCountRes = await pool.query(
        `INSERT INTO stock_counts (name, state, created_by_id, created_at, updated_at)
         VALUES ($1, 'done', $2, NOW(), NOW())
         RETURNING id`,
        [`Done Count ${Date.now()}`, userId]
      );
      const doneCountId = doneCountRes.rows[0].id;

      const res = await request(app)
        .post(`/api/inventory/stockcounts/${doneCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          countedQty: 100,
          uom: 'BASE',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('state');

      // Cleanup
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [doneCountId]);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          // Missing countedQty and uom
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/inventory/stockcounts/:id/validate - Validate & Reconcile', () => {
    beforeAll(async () => {
      // Ensure we have a counted line with difference
      await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          batchId: testBatchId,
          countedQty: 95, // Expected: 100, Counted: 95, Diff: -5
          uom: 'BASE',
        });
    });

    it('should validate and create adjustments', async () => {
      const res = await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Reconciliation completed',
          allowNegativeAdjustments: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.linesProcessed).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('adjustmentsCreated');
      expect(res.body.data).toHaveProperty('movementIds');
      expect(Array.isArray(res.body.data.warnings)).toBe(true);

      // Verify stock movements were created
      const movementsRes = await pool.query(
        `SELECT * FROM stock_movements WHERE reference_id = $1 AND reference_type = 'STOCK_COUNT'`,
        [stockCountId]
      );
      expect(movementsRes.rows.length).toBeGreaterThan(0);

      // Verify state changed to 'done'
      const countRes = await pool.query('SELECT state FROM stock_counts WHERE id = $1', [
        stockCountId,
      ]);
      expect(countRes.rows[0].state).toBe('done');
    });

    it('should fail to validate already completed count', async () => {
      const res = await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Attempting duplicate validation',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('state');
    });

    it('should prevent negative stock without flag', async () => {
      // Create new count for this test
      const newCountRes = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `Negative Test ${Date.now()}`,
          productIds: [testProductId],
        });

      const newCountId = newCountRes.body.data.stockCount.id;

      // Set counted qty to cause negative stock
      await request(app)
        .post(`/api/inventory/stockcounts/${newCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          batchId: testBatchId,
          countedQty: 0, // Will cause large negative adjustment
          uom: 'BASE',
        });

      const res = await request(app)
        .post(`/api/inventory/stockcounts/${newCountId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          allowNegativeAdjustments: false, // Strict mode
        });

      // Should either fail or report errors
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Cleanup
      await pool.query('DELETE FROM stock_count_lines WHERE stock_count_id = $1', [newCountId]);
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [newCountId]);
    });
  });

  describe('POST /api/inventory/stockcounts/:id/cancel - Cancel Stock Count', () => {
    it('should cancel counting stock count', async () => {
      // Create new count for cancellation
      const newCountRes = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `Cancel Test ${Date.now()}`,
          includeAllProducts: true,
        });

      const newCountId = newCountRes.body.data.stockCount.id;

      const res = await request(app)
        .post(`/api/inventory/stockcounts/${newCountId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Cancelled due to incorrect setup',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify state changed to 'cancelled'
      const countRes = await pool.query('SELECT state FROM stock_counts WHERE id = $1', [
        newCountId,
      ]);
      expect(countRes.rows[0].state).toBe('cancelled');

      // Cleanup
      await pool.query('DELETE FROM stock_count_lines WHERE stock_count_id = $1', [newCountId]);
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [newCountId]);
    });

    it('should fail to cancel completed count', async () => {
      const res = await request(app)
        .post(`/api/inventory/stockcounts/${stockCountId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Attempting to cancel done count',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('cancel');
    });
  });

  describe('DELETE /api/inventory/stockcounts/:id - Delete Stock Count', () => {
    it('should delete draft stock count', async () => {
      // Create draft count
      const draftRes = await pool.query(
        `INSERT INTO stock_counts (name, state, created_by_id, created_at, updated_at)
         VALUES ($1, 'draft', $2, NOW(), NOW())
         RETURNING id`,
        [`Draft Delete Test ${Date.now()}`, userId]
      );
      const draftId = draftRes.rows[0].id;

      const res = await request(app)
        .delete(`/api/inventory/stockcounts/${draftId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deleted
      const checkRes = await pool.query('SELECT * FROM stock_counts WHERE id = $1', [draftId]);
      expect(checkRes.rows.length).toBe(0);
    });

    it('should delete cancelled stock count', async () => {
      // Create cancelled count
      const cancelledRes = await pool.query(
        `INSERT INTO stock_counts (name, state, created_by_id, created_at, updated_at)
         VALUES ($1, 'cancelled', $2, NOW(), NOW())
         RETURNING id`,
        [`Cancelled Delete Test ${Date.now()}`, userId]
      );
      const cancelledId = cancelledRes.rows[0].id;

      const res = await request(app)
        .delete(`/api/inventory/stockcounts/${cancelledId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should fail to delete completed count', async () => {
      const res = await request(app)
        .delete(`/api/inventory/stockcounts/${stockCountId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('delete');
    });

    it('should return 404 for non-existent count', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api/inventory/stockcounts/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('E2E Workflow Test', () => {
    it('should complete full stocktake workflow', async () => {
      // Step 1: Create count
      const createRes = await request(app)
        .post('/api/inventory/stockcounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `E2E Workflow Test ${Date.now()}`,
          productIds: [testProductId],
        });

      expect(createRes.status).toBe(201);
      const e2eCountId = createRes.body.data.stockCount.id;

      // Step 2: Update count lines
      const updateRes = await request(app)
        .post(`/api/inventory/stockcounts/${e2eCountId}/lines`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: testProductId,
          batchId: testBatchId,
          countedQty: 98,
          uom: 'BASE',
          notes: 'E2E test count',
        });

      expect(updateRes.status).toBe(200);

      // Step 3: Get count with lines to verify
      const getRes = await request(app)
        .get(`/api/inventory/stockcounts/${e2eCountId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.lines.length).toBeGreaterThan(0);

      // Step 4: Validate and reconcile
      const validateRes = await request(app)
        .post(`/api/inventory/stockcounts/${e2eCountId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'E2E workflow validation',
          allowNegativeAdjustments: true,
        });

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.data.linesProcessed).toBeGreaterThan(0);

      // Step 5: Verify final state
      const finalRes = await request(app)
        .get(`/api/inventory/stockcounts/${e2eCountId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalRes.body.data.stockCount.state).toBe('done');
      expect(finalRes.body.data.stockCount.validated_at).not.toBeNull();

      // Cleanup
      await pool.query('DELETE FROM stock_count_lines WHERE stock_count_id = $1', [e2eCountId]);
      await pool.query('DELETE FROM stock_counts WHERE id = $1', [e2eCountId]);
    });
  });
});
