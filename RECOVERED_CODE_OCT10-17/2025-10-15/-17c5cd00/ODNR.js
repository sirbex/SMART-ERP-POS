/**
 * Inventory Controller
 */

const { pool } = require('../db/pool');

/**
 * Get all inventory items
 */
const getAllInventoryItems = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id, i.sku, i.name, i.description, i.category, 
        i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
        i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
        i.updated_at as "updatedAt"
      FROM inventory_items i
      WHERE i.is_active = true
      ORDER BY i.name
    `);

    // Format the metadata field
    const items = result.rows.map(item => {
      return {
        ...item,
        metadata: item.metadata || {},
        batch: item.metadata?.batch || '',
        hasExpiry: item.metadata?.hasExpiry || false,
        expiryAlertDays: item.metadata?.expiryAlertDays || 30,
        unit: item.metadata?.unit || 'piece'
      };
    });

    res.json(items);
  } catch (error) {
    console.error('Error getting inventory items:', error);
    res.status(500).json({ error: 'Failed to get inventory items' });
  }
};

/**
 * Get an inventory item by ID
 */
const getInventoryItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        i.id, i.sku, i.name, i.description, i.category, 
        i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
        i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
        i.updated_at as "updatedAt"
      FROM inventory_items i
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const item = result.rows[0];
    
    // Format the metadata field
    const formattedItem = {
      ...item,
      metadata: item.metadata || {},
      batch: item.metadata?.batch || '',
      hasExpiry: item.metadata?.hasExpiry || false,
      expiryAlertDays: item.metadata?.expiryAlertDays || 30,
      unit: item.metadata?.unit || 'piece'
    };

    res.json(formattedItem);
  } catch (error) {
    console.error(`Error getting inventory item with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get inventory item' });
  }
};

/**
 * Create a new inventory item
 */
const createInventoryItem = async (req, res) => {
  try {
    const {
      sku, name, description, category, price, taxRate, reorderLevel,
      isActive, batch, hasExpiry, expiryAlertDays, unit, ...otherProps
    } = req.body;

    // Prepare metadata
    const metadata = {
      batch,
      hasExpiry,
      expiryAlertDays,
      unit,
      ...otherProps
    };

    const result = await pool.query(`
      INSERT INTO inventory_items (
        sku, name, description, category, base_price, tax_rate, reorder_level, 
        is_active, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [sku, name, description, category, price, taxRate, reorderLevel, isActive !== false, JSON.stringify(metadata)]);

    res.status(201).json({ 
      id: result.rows[0].id,
      message: 'Inventory item created successfully' 
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.constraint === 'inventory_items_sku_key') {
        return res.status(409).json({ 
          error: 'Duplicate SKU',
          message: `A product with SKU '${error.detail.match(/\(([^)]+)\)/)[1]}' already exists. Please use a different SKU.`,
          field: 'sku'
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to create inventory item',
      message: error.message 
    });
  }
};

/**
 * Update an inventory item
 */
const updateInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      sku, name, description, category, price, taxRate, reorderLevel,
      isActive, batch, hasExpiry, expiryAlertDays, unit, ...otherProps
    } = req.body;

    // Get current item to merge metadata
    const currentItem = await pool.query(
      'SELECT metadata FROM inventory_items WHERE id = $1',
      [id]
    );

    if (currentItem.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Prepare updated metadata
    const currentMetadata = currentItem.rows[0].metadata || {};
    const metadata = {
      ...currentMetadata,
      batch,
      hasExpiry,
      expiryAlertDays,
      unit,
      ...otherProps
    };

    await pool.query(`
      UPDATE inventory_items SET
        sku = $1,
        name = $2,
        description = $3,
        category = $4,
        base_price = $5,
        tax_rate = $6,
        reorder_level = $7,
        is_active = $8,
        metadata = $9,
        updated_at = NOW()
      WHERE id = $10
    `, [sku, name, description, category, price, taxRate, reorderLevel, 
        isActive !== false, JSON.stringify(metadata), id]);

    res.json({ 
      id: parseInt(id),
      message: 'Inventory item updated successfully' 
    });
  } catch (error) {
    console.error(`Error updating inventory item with ID ${req.params.id}:`, error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.constraint === 'inventory_items_sku_key') {
        return res.status(409).json({ 
          error: 'Duplicate SKU',
          message: `A product with this SKU already exists. Please use a different SKU.`,
          field: 'sku'
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to update inventory item',
      message: error.message 
    });
  }
};

/**
 * Delete an inventory item
 */
const deleteInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete by setting is_active = false
    const result = await pool.query(`
      UPDATE inventory_items
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ 
      id: parseInt(id),
      message: 'Inventory item deleted successfully' 
    });
  } catch (error) {
    console.error(`Error deleting inventory item with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
};

/**
 * Search inventory items
 */
const searchInventoryItems = async (req, res) => {
  try {
    const { query } = req.params;
    const searchPattern = `%${query}%`;

    const result = await pool.query(`
      SELECT 
        i.id, i.sku, i.name, i.description, i.category, 
        i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
        i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
        i.updated_at as "updatedAt"
      FROM inventory_items i
      WHERE 
        (i.name ILIKE $1 OR i.sku ILIKE $1 OR i.description ILIKE $1) 
        AND i.is_active = true
      ORDER BY i.name
      LIMIT 50
    `, [searchPattern]);

    // Format the metadata field
    const items = result.rows.map(item => {
      return {
        ...item,
        metadata: item.metadata || {},
        batch: item.metadata?.batch || '',
        hasExpiry: item.metadata?.hasExpiry || false,
        expiryAlertDays: item.metadata?.expiryAlertDays || 30,
        unit: item.metadata?.unit || 'piece'
      };
    });

    res.json(items);
  } catch (error) {
    console.error(`Error searching inventory items for "${req.params.query}":`, error);
    res.status(500).json({ error: 'Failed to search inventory items' });
  }
};

/**
 * Get all batches for an inventory item
 */
const getInventoryItemBatches = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        b.id, b.batch_number as "batchNumber", b.inventory_item_id as "productId",
        i.name as "productName", b.quantity, b.remaining_quantity as "remainingQuantity",
        b.unit_cost as "costPrice", b.expiry_date as "expiryDate", 
        b.received_date as "receivedDate", b.supplier, b.metadata,
        b.created_at as "createdAt", b.updated_at as "updatedAt"
      FROM inventory_batches b
      JOIN inventory_items i ON b.inventory_item_id = i.id
      WHERE b.inventory_item_id = $1
      ORDER BY 
        CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, 
        b.expiry_date, 
        b.received_date
    `, [id]);

    // Format batches and add status
    const batches = result.rows.map(batch => {
      const now = new Date();
      const expiryDate = batch.expiryDate ? new Date(batch.expiryDate) : null;
      
      let status = 'active';
      if (batch.remainingQuantity <= 0) {
        status = 'depleted';
      } else if (expiryDate && expiryDate < now) {
        status = 'expired';
      }

      return {
        ...batch,
        status,
        sellingPrice: batch.metadata?.sellingPrice || 0,
        originalQuantity: batch.metadata?.originalQuantity || batch.quantity,
        manufacturingDate: batch.metadata?.manufacturingDate,
        location: batch.metadata?.location,
        notes: batch.metadata?.notes
      };
    });

    res.json(batches);
  } catch (error) {
    console.error(`Error getting batches for inventory item with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get inventory batches' });
  }
};

/**
 * Create a new batch for an inventory item
 */
const createInventoryBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      batchNumber, quantity, costPrice, expiryDate, receivedDate,
      supplier, sellingPrice, manufacturingDate, location, notes
    } = req.body;

    // Verify the inventory item exists
    const itemCheck = await pool.query(
      'SELECT id FROM inventory_items WHERE id = $1',
      [id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Prepare metadata
    const metadata = {
      sellingPrice,
      originalQuantity: quantity,
      manufacturingDate,
      location,
      notes
    };

    const result = await pool.query(`
      INSERT INTO inventory_batches (
        inventory_item_id, batch_number, quantity, remaining_quantity,
        unit_cost, expiry_date, received_date, supplier,
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [
      id,
      batchNumber,
      quantity,
      quantity, // initially remaining = total
      costPrice,
      expiryDate,
      receivedDate || new Date(),
      supplier,
      JSON.stringify(metadata)
    ]);

    res.status(201).json({
      id: result.rows[0].id,
      message: 'Inventory batch created successfully'
    });
  } catch (error) {
    console.error(`Error creating batch for inventory item with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to create inventory batch' });
  }
};

/**
 * Get a batch by ID
 */
const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        b.id, b.batch_number as "batchNumber", b.inventory_item_id as "productId",
        i.name as "productName", b.quantity, b.remaining_quantity as "remainingQuantity",
        b.unit_cost as "costPrice", b.expiry_date as "expiryDate", 
        b.received_date as "receivedDate", b.supplier, b.metadata,
        b.created_at as "createdAt", b.updated_at as "updatedAt"
      FROM inventory_batches b
      JOIN inventory_items i ON b.inventory_item_id = i.id
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const batch = result.rows[0];
    
    // Determine status
    const now = new Date();
    const expiryDate = batch.expiryDate ? new Date(batch.expiryDate) : null;
    
    let status = 'active';
    if (batch.remainingQuantity <= 0) {
      status = 'depleted';
    } else if (expiryDate && expiryDate < now) {
      status = 'expired';
    }

    const formattedBatch = {
      ...batch,
      status,
      sellingPrice: batch.metadata?.sellingPrice || 0,
      originalQuantity: batch.metadata?.originalQuantity || batch.quantity,
      manufacturingDate: batch.metadata?.manufacturingDate,
      location: batch.metadata?.location,
      notes: batch.metadata?.notes
    };

    res.json(formattedBatch);
  } catch (error) {
    console.error(`Error getting batch with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get batch' });
  }
};

/**
 * Update a batch
 */
const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      batchNumber, quantity, remainingQuantity, costPrice, expiryDate,
      receivedDate, supplier, sellingPrice, manufacturingDate, location, notes
    } = req.body;

    // Get current batch to merge metadata
    const currentBatch = await pool.query(
      'SELECT metadata FROM inventory_batches WHERE id = $1',
      [id]
    );

    if (currentBatch.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Prepare updated metadata
    const currentMetadata = currentBatch.rows[0].metadata || {};
    const metadata = {
      ...currentMetadata,
      sellingPrice,
      originalQuantity: currentMetadata.originalQuantity,
      manufacturingDate,
      location,
      notes
    };

    await pool.query(`
      UPDATE inventory_batches SET
        batch_number = $1,
        quantity = $2,
        remaining_quantity = $3,
        unit_cost = $4,
        expiry_date = $5,
        received_date = $6,
        supplier = $7,
        metadata = $8,
        updated_at = NOW()
      WHERE id = $9
    `, [
      batchNumber,
      quantity,
      remainingQuantity,
      costPrice,
      expiryDate,
      receivedDate,
      supplier,
      JSON.stringify(metadata),
      id
    ]);

    res.json({
      id: parseInt(id),
      message: 'Batch updated successfully'
    });
  } catch (error) {
    console.error(`Error updating batch with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update batch' });
  }
};

/**
 * Delete a batch
 */
const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM inventory_batches
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json({
      id: parseInt(id),
      message: 'Batch deleted successfully'
    });
  } catch (error) {
    console.error(`Error deleting batch with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete batch' });
  }
};

/**
 * Get stock summary for an inventory item
 */
const getInventoryItemStock = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get inventory item details
    const itemResult = await pool.query(`
      SELECT 
        i.id, i.sku, i.name, i.description, i.category, 
        i.base_price as price, i.tax_rate as "taxRate", i.reorder_level as "reorderLevel",
        i.is_active as "isActive", i.metadata, i.created_at as "createdAt", 
        i.updated_at as "updatedAt"
      FROM inventory_items i
      WHERE i.id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Get stock summary from batches
    const stockResult = await pool.query(`
      SELECT 
        COALESCE(SUM(b.remaining_quantity), 0) as "totalStock",
        COUNT(b.id) as "batchCount",
        MIN(b.expiry_date) as "nextExpiryDate",
        COALESCE(AVG(b.unit_cost), 0) as "averageCost"
      FROM inventory_batches b
      WHERE b.inventory_item_id = $1 AND b.remaining_quantity > 0
    `, [id]);

    const item = itemResult.rows[0];
    const stock = stockResult.rows[0];

    // Determine stock status
    let stockStatus = 'normal';
    if (stock.totalStock <= 0) {
      stockStatus = 'out_of_stock';
    } else if (stock.totalStock <= item.reorderLevel) {
      stockStatus = 'low_stock';
    }

    const stockSummary = {
      productId: parseInt(id),
      productName: item.name,
      sku: item.sku,
      totalStock: parseInt(stock.totalStock),
      batchCount: parseInt(stock.batchCount),
      reorderLevel: item.reorderLevel,
      stockStatus: stockStatus,
      nextExpiryDate: stock.nextExpiryDate,
      averageCost: parseFloat(stock.averageCost) || 0,
      lastUpdated: new Date().toISOString()
    };

    res.json(stockSummary);
  } catch (error) {
    console.error(`Error getting stock summary for inventory item with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get stock summary' });
  }
};

/**
 * Receive inventory batches (bulk receive)
 */
const receiveBatches = async (req, res) => {
  try {
    const { batches } = req.body;

    if (!batches || !Array.isArray(batches) || batches.length === 0) {
      return res.status(400).json({ error: 'Batches array is required' });
    }

    const results = [];
    
    // Process each batch
    for (const batch of batches) {
      const {
        productId, batchNumber, quantity, costPrice, expiryDate, receivedDate,
        supplier, sellingPrice, manufacturingDate, location, notes
      } = batch;

      // Verify the inventory item exists
      const itemCheck = await pool.query(
        'SELECT id FROM inventory_items WHERE id = $1',
        [productId]
      );

      if (itemCheck.rows.length === 0) {
        results.push({
          productId,
          success: false,
          error: 'Inventory item not found'
        });
        continue;
      }

      try {
        // Prepare metadata
        const metadata = {
          sellingPrice,
          originalQuantity: quantity,
          manufacturingDate,
          location,
          notes
        };

        const result = await pool.query(`
          INSERT INTO inventory_batches (
            inventory_item_id, batch_number, quantity, remaining_quantity,
            unit_cost, expiry_date, received_date, supplier,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id
        `, [
          productId,
          batchNumber,
          quantity,
          quantity, // initially remaining = total
          costPrice,
          expiryDate,
          receivedDate || new Date(),
          supplier,
          JSON.stringify(metadata)
        ]);

        results.push({
          productId,
          batchId: result.rows[0].id,
          success: true,
          message: 'Batch received successfully'
        });
      } catch (batchError) {
        console.error(`Error receiving batch for product ${productId}:`, batchError);
        results.push({
          productId,
          success: false,
          error: `Failed to receive batch: ${batchError.message}`
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    res.status(201).json({
      message: `Received ${successCount} of ${totalCount} batches`,
      results: results,
      summary: {
        total: totalCount,
        successful: successCount,
        failed: totalCount - successCount
      }
    });
  } catch (error) {
    console.error('Error receiving batches:', error);
    res.status(500).json({ error: 'Failed to receive batches' });
  }
};

/**
 * Check stock availability for a specific quantity
 */
const checkStockAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.query;

    if (!quantity || isNaN(quantity)) {
      return res.status(400).json({ 
        success: false,
        available: 0, 
        message: 'Valid quantity parameter is required' 
      });
    }

    const requestedQuantity = parseInt(quantity);

    // Get total available stock from batches
    const stockResult = await pool.query(`
      SELECT 
        COALESCE(SUM(b.remaining_quantity), 0) as "totalStock"
      FROM inventory_batches b
      WHERE b.inventory_item_id = $1 AND b.remaining_quantity > 0
    `, [id]);

    const totalStock = parseInt(stockResult.rows[0].totalStock);
    const hasEnoughStock = totalStock >= requestedQuantity;

    res.json({
      success: hasEnoughStock,
      available: totalStock,
      requestedQuantity,
      shortfall: hasEnoughStock ? 0 : requestedQuantity - totalStock,
      message: hasEnoughStock 
        ? `${totalStock} units available`
        : `Insufficient stock. Available: ${totalStock}, Requested: ${requestedQuantity}`
    });
  } catch (error) {
    console.error(`Error checking stock availability for item ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false,
      available: 0, 
      message: 'Failed to check stock availability' 
    });
  }
};

/**
 * Get unified inventory data (price + quantity in one response)
 */
const getUnifiedInventory = async (req, res) => {
  try {
    console.log('Getting unified inventory data...');
    
    const result = await pool.query(`
      SELECT 
        i.id,
        i.sku,
        i.name,
        i.description,
        i.category,
        i.base_price as price,
        i.tax_rate as "taxRate",
        i.reorder_level as "reorderLevel",
        i.is_active as "isActive",
        i.metadata,
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        COALESCE(SUM(b.remaining_quantity), 0) as "totalStock",
        COUNT(CASE WHEN b.remaining_quantity > 0 THEN b.id END) as "batchCount",
        AVG(CASE WHEN b.remaining_quantity > 0 THEN b.unit_cost END) as "averageCost",
        MAX(b.expiry_date) as "nextExpiryDate",
        CASE 
          WHEN COALESCE(SUM(b.remaining_quantity), 0) = 0 THEN 'out_of_stock'
          WHEN COALESCE(SUM(b.remaining_quantity), 0) <= i.reorder_level THEN 'low_stock'
          ELSE 'normal'
        END as "stockStatus"
      FROM inventory_items i
      LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
      WHERE i.is_active = true
      GROUP BY i.id, i.sku, i.name, i.description, i.category, i.base_price, 
               i.tax_rate, i.reorder_level, i.is_active, i.metadata, i.created_at, i.updated_at
      ORDER BY i.name
    `);

    const unifiedInventory = result.rows.map(item => ({
      ...item,
      // Ensure numeric fields are properly formatted
      price: parseFloat(item.price) || 0,
      totalStock: parseInt(item.totalStock) || 0,
      batchCount: parseInt(item.batchCount) || 0,
      averageCost: item.averageCost ? parseFloat(item.averageCost) : 0,
      // Add convenience fields for frontend
      inStock: (parseInt(item.totalStock) || 0) > 0,
      needsReorder: (parseInt(item.totalStock) || 0) <= item.reorderLevel
    }));

    res.json(unifiedInventory);
  } catch (error) {
    console.error('Error getting unified inventory:', error);
    res.status(500).json({ error: 'Failed to get unified inventory data' });
  }
};

module.exports = {
  getAllInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  searchInventoryItems,
  getInventoryItemBatches,
  createInventoryBatch,
  getBatchById,
  updateBatch,
  deleteBatch,
  getInventoryItemStock,
  receiveBatches,
  checkStockAvailability,
  getUnifiedInventory
};