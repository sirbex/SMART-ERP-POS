const { Decimal } = require('../utils/uomUtils');
const { calcCOGS } = require('../utils/costUtils');
const { Op } = require('sequelize');

class FifoService {
  constructor(models) {
    this.models = models;
  }

  /**
   * Deduct stock from inventory using FIFO method
   * @param {number} productId - Product ID
   * @param {Decimal|number|string} qtyInBase - Quantity to deduct in base units
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Object>} { cogsTotal: Decimal, batchBreakdown: Array, success: boolean }
   */
  async deductFromStock(productId, qtyInBase, transaction = null) {
    let qtyToTake = new Decimal(qtyInBase);
    let cogsTotal = new Decimal(0);
    const batchBreakdown = [];

    // Fetch all batches with remaining stock for this product, ordered by FIFO (oldest first)
    const fifoBatches = await this.models.InventoryBatch.findAll({
      where: {
        productId,
        remainingQtyInBase: {
          [Op.gt]: 0
        }
      },
      order: [['receivedAt', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    if (fifoBatches.length === 0) {
      return {
        success: false,
        cogsTotal: new Decimal(0),
        batchBreakdown: [],
        error: 'No inventory batches available'
      };
    }

    // Calculate total available stock
    const totalAvailable = fifoBatches.reduce((sum, batch) => {
      return sum.plus(batch.remainingQtyInBase);
    }, new Decimal(0));

    if (totalAvailable.lessThan(qtyToTake)) {
      return {
        success: false,
        cogsTotal: new Decimal(0),
        batchBreakdown: [],
        error: `Insufficient stock. Required: ${qtyToTake.toString()}, Available: ${totalAvailable.toString()}`
      };
    }

    // Process batches in FIFO order
    for (const batch of fifoBatches) {
      if (qtyToTake.lessThanOrEqualTo(0)) {
        break;
      }

      const batchRemaining = new Decimal(batch.remainingQtyInBase);
      const takeQty = Decimal.min(batchRemaining, qtyToTake);
      const costThis = calcCOGS(takeQty, batch.unitCostBase);

      // Update batch remaining quantity
      batch.remainingQtyInBase = batchRemaining.minus(takeQty).toString();
      await batch.save({ transaction });

      // Update totals
      qtyToTake = qtyToTake.minus(takeQty);
      cogsTotal = cogsTotal.plus(costThis);

      // Record batch breakdown
      batchBreakdown.push({
        batchId: batch.id.toString(),
        batchReference: batch.batchReference,
        takenQty: takeQty.toString(),
        unitCostBase: batch.unitCostBase.toString(),
        cost: costThis.toString(),
        receivedAt: batch.receivedAt
      });
    }

    return {
      success: true,
      cogsTotal,
      batchBreakdown,
      remainingQty: qtyToTake
    };
  }

  /**
   * Get total available stock for a product in base units
   * @param {number} productId - Product ID
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Decimal>} Total available stock in base units
   */
  async getAvailableStock(productId, transaction = null) {
    const batches = await this.models.InventoryBatch.findAll({
      where: {
        productId,
        remainingQtyInBase: {
          [Op.gt]: 0
        }
      },
      attributes: ['remainingQtyInBase'],
      transaction
    });

    return batches.reduce((total, batch) => {
      return total.plus(batch.remainingQtyInBase);
    }, new Decimal(0));
  }

  /**
   * Get inventory valuation for a product (sum of remaining stock * unit cost)
   * @param {number} productId - Product ID
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Decimal>} Total inventory value
   */
  async getInventoryValuation(productId, transaction = null) {
    const batches = await this.models.InventoryBatch.findAll({
      where: {
        productId,
        remainingQtyInBase: {
          [Op.gt]: 0
        }
      },
      attributes: ['remainingQtyInBase', 'unitCostBase'],
      transaction
    });

    return batches.reduce((total, batch) => {
      const batchValue = new Decimal(batch.remainingQtyInBase).times(batch.unitCostBase);
      return total.plus(batchValue);
    }, new Decimal(0));
  }

  /**
   * Get average cost per base unit for a product (weighted average)
   * @param {number} productId - Product ID
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Decimal>} Average unit cost
   */
  async getAverageUnitCost(productId, transaction = null) {
    const totalStock = await this.getAvailableStock(productId, transaction);
    
    if (totalStock.isZero()) {
      return new Decimal(0);
    }

    const totalValue = await this.getInventoryValuation(productId, transaction);
    return totalValue.dividedBy(totalStock);
  }

  /**
   * Get batch details for a product
   * @param {number} productId - Product ID
   * @param {boolean} includeEmpty - Include batches with zero remaining quantity
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Array>} Array of batch details
   */
  async getBatchDetails(productId, includeEmpty = false, transaction = null) {
    const where = { productId };
    
    if (!includeEmpty) {
      where.remainingQtyInBase = {
        [Op.gt]: 0
      };
    }

    const batches = await this.models.InventoryBatch.findAll({
      where,
      order: [['receivedAt', 'ASC']],
      transaction
    });

    return batches.map(batch => ({
      id: batch.id.toString(),
      batchReference: batch.batchReference,
      qtyInBase: batch.qtyInBase,
      remainingQtyInBase: batch.remainingQtyInBase,
      unitCostBase: batch.unitCostBase,
      totalCostBase: batch.totalCostBase,
      currency: batch.currency,
      receivedAt: batch.receivedAt,
      metadata: batch.metadata
    }));
  }

  /**
   * Restore stock to a batch (for returns or adjustments)
   * @param {number} batchId - Batch ID
   * @param {Decimal|number|string} qtyToRestore - Quantity to restore in base units
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Object>} Updated batch
   */
  async restoreStock(batchId, qtyToRestore, transaction = null) {
    const batch = await this.models.InventoryBatch.findByPk(batchId, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const currentRemaining = new Decimal(batch.remainingQtyInBase);
    const originalQty = new Decimal(batch.qtyInBase);
    const restore = new Decimal(qtyToRestore);
    const newRemaining = currentRemaining.plus(restore);

    // Ensure we don't restore more than the original quantity
    if (newRemaining.greaterThan(originalQty)) {
      throw new Error(`Cannot restore more than original quantity. Original: ${originalQty.toString()}, Attempting: ${newRemaining.toString()}`);
    }

    batch.remainingQtyInBase = newRemaining.toString();
    await batch.save({ transaction });

    return batch;
  }
}

module.exports = FifoService;
