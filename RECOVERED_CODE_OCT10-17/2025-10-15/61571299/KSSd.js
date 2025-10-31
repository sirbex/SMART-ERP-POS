const { Decimal } = require('../utils/uomUtils');
const { 
  calcTotalLandedCost, 
  allocateLandedCostByQty, 
  allocateLandedCostByValue,
  adjustCostForLandedCost 
} = require('../utils/costUtils');

class LandedCostService {
  constructor(models) {
    this.models = models;
  }

  /**
   * Allocate landed costs across batches in a purchase receipt
   * @param {Array} batches - Array of batch objects with id, qtyInBase, unitCostBase
   * @param {Array} landedCostLines - Array of landed cost objects [{ type: string, amount: number, description?: string }]
   * @param {string} allocationMethod - 'quantity' or 'value' (default 'quantity')
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Array>} Updated batches with allocated landed costs
   */
  async allocateLandedCosts(batches, landedCostLines, allocationMethod = 'quantity', transaction = null) {
    if (!landedCostLines || landedCostLines.length === 0) {
      return batches;
    }

    if (!batches || batches.length === 0) {
      throw new Error('No batches provided for landed cost allocation');
    }

    const totalLandedCost = calcTotalLandedCost(landedCostLines);

    if (totalLandedCost.isZero()) {
      return batches;
    }

    // Calculate totals for allocation
    let totalForAllocation = new Decimal(0);
    
    if (allocationMethod === 'value') {
      // Allocate by value (qty * unit_cost)
      totalForAllocation = batches.reduce((sum, batch) => {
        const batchValue = new Decimal(batch.qtyInBase).times(batch.unitCostBase);
        return sum.plus(batchValue);
      }, new Decimal(0));
    } else {
      // Allocate by quantity (default)
      totalForAllocation = batches.reduce((sum, batch) => {
        return sum.plus(batch.qtyInBase);
      }, new Decimal(0));
    }

    if (totalForAllocation.isZero()) {
      throw new Error('Total for allocation is zero, cannot allocate landed costs');
    }

    // Allocate to each batch
    const updatedBatches = [];
    
    for (const batch of batches) {
      let allocatedCost;
      
      if (allocationMethod === 'value') {
        const batchValue = new Decimal(batch.qtyInBase).times(batch.unitCostBase);
        allocatedCost = allocateLandedCostByValue(
          batchValue,
          totalForAllocation,
          totalLandedCost
        );
      } else {
        allocatedCost = allocateLandedCostByQty(
          batch.qtyInBase,
          totalForAllocation,
          totalLandedCost
        );
      }

      // Adjust unit cost and total cost
      const adjusted = adjustCostForLandedCost(
        batch.unitCostBase,
        allocatedCost,
        batch.qtyInBase
      );

      // Update batch in database
      const batchRecord = await this.models.InventoryBatch.findByPk(batch.id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
      });

      if (!batchRecord) {
        throw new Error(`Batch ${batch.id} not found`);
      }

      // Update costs
      batchRecord.unitCostBase = adjusted.unitCostBase.toString();
      batchRecord.totalCostBase = adjusted.totalCostBase.toString();

      // Store landed cost allocation in metadata
      const currentMetadata = batchRecord.metadata || {};
      batchRecord.metadata = {
        ...currentMetadata,
        landedCostAllocation: {
          allocatedAmount: allocatedCost.toString(),
          allocationMethod,
          landedCostLines: landedCostLines.map(line => ({
            type: line.type,
            amount: line.amount,
            description: line.description
          })),
          originalUnitCostBase: batch.unitCostBase,
          adjustedUnitCostBase: adjusted.unitCostBase.toString()
        }
      };

      await batchRecord.save({ transaction });

      updatedBatches.push({
        ...batch,
        unitCostBase: adjusted.unitCostBase.toString(),
        totalCostBase: adjusted.totalCostBase.toString(),
        allocatedLandedCost: allocatedCost.toString(),
        metadata: batchRecord.metadata
      });
    }

    return updatedBatches;
  }

  /**
   * Calculate landed cost preview (without saving to database)
   * @param {Array} items - Array of item objects with qtyInBase and unitCostBase
   * @param {Array} landedCostLines - Array of landed cost objects
   * @param {string} allocationMethod - 'quantity' or 'value'
   * @returns {Object} Preview object with allocations for each item
   */
  calculateLandedCostPreview(items, landedCostLines, allocationMethod = 'quantity') {
    if (!landedCostLines || landedCostLines.length === 0) {
      return {
        totalLandedCost: '0',
        items: items.map(item => ({
          ...item,
          allocatedLandedCost: '0',
          adjustedUnitCostBase: item.unitCostBase,
          adjustedTotalCostBase: new Decimal(item.qtyInBase).times(item.unitCostBase).toString()
        }))
      };
    }

    const totalLandedCost = calcTotalLandedCost(landedCostLines);

    // Calculate totals for allocation
    let totalForAllocation = new Decimal(0);
    
    if (allocationMethod === 'value') {
      totalForAllocation = items.reduce((sum, item) => {
        const itemValue = new Decimal(item.qtyInBase).times(item.unitCostBase);
        return sum.plus(itemValue);
      }, new Decimal(0));
    } else {
      totalForAllocation = items.reduce((sum, item) => {
        return sum.plus(item.qtyInBase);
      }, new Decimal(0));
    }

    const previewItems = items.map(item => {
      let allocatedCost;
      
      if (allocationMethod === 'value') {
        const itemValue = new Decimal(item.qtyInBase).times(item.unitCostBase);
        allocatedCost = allocateLandedCostByValue(
          itemValue,
          totalForAllocation,
          totalLandedCost
        );
      } else {
        allocatedCost = allocateLandedCostByQty(
          item.qtyInBase,
          totalForAllocation,
          totalLandedCost
        );
      }

      const adjusted = adjustCostForLandedCost(
        item.unitCostBase,
        allocatedCost,
        item.qtyInBase
      );

      return {
        ...item,
        allocatedLandedCost: allocatedCost.toString(),
        adjustedUnitCostBase: adjusted.unitCostBase.toString(),
        adjustedTotalCostBase: adjusted.totalCostBase.toString()
      };
    });

    return {
      totalLandedCost: totalLandedCost.toString(),
      allocationMethod,
      items: previewItems
    };
  }

  /**
   * Validate landed cost lines
   * @param {Array} landedCostLines - Array of landed cost objects
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validateLandedCostLines(landedCostLines) {
    const errors = [];

    if (!Array.isArray(landedCostLines)) {
      return { valid: false, errors: ['Landed cost lines must be an array'] };
    }

    landedCostLines.forEach((line, index) => {
      if (!line.type) {
        errors.push(`Line ${index + 1}: type is required`);
      }

      if (line.amount === undefined || line.amount === null) {
        errors.push(`Line ${index + 1}: amount is required`);
      }

      if (line.amount && new Decimal(line.amount).lessThan(0)) {
        errors.push(`Line ${index + 1}: amount must be non-negative`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = LandedCostService;
