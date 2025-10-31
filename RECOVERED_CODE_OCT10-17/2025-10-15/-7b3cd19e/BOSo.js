const { Decimal } = require('./uomUtils');

/**
 * Calculate effective cost per purchase unit after discounts and taxes
 * @param {number|string} unitCost - Base unit cost before adjustments
 * @param {Object} discount - Discount object { type: 'percent'|'amount', value: number }
 * @param {Array} taxes - Array of tax objects [{ type: string, percent?: number, amount?: number }]
 * @param {boolean} includeTaxesInCost - Whether to include taxes in the inventory cost (default false for recoverable VAT)
 * @returns {Decimal} Effective unit cost after adjustments
 */
function calcEffectiveCostPerPurchaseUnit(unitCost, discount = null, taxes = [], includeTaxesInCost = false) {
  let cost = new Decimal(unitCost);
  
  // Apply discount
  if (discount) {
    if (discount.type === 'percent') {
      // Reduce by percentage
      const discountAmount = cost.times(discount.value).dividedBy(100);
      cost = cost.minus(discountAmount);
    } else if (discount.type === 'amount') {
      // Reduce by absolute amount
      cost = cost.minus(discount.value);
    }
  }
  
  // Apply taxes if they should be included in cost (non-recoverable taxes)
  if (includeTaxesInCost && taxes && taxes.length > 0) {
    for (const tax of taxes) {
      if (tax.percent) {
        const taxAmount = cost.times(tax.percent).dividedBy(100);
        cost = cost.plus(taxAmount);
      } else if (tax.amount) {
        cost = cost.plus(tax.amount);
      }
    }
  }
  
  return cost;
}

/**
 * Calculate total landed cost from landed cost lines
 * @param {Array} landedCostLines - Array of landed cost objects [{ type: string, amount: number }]
 * @returns {Decimal} Total landed cost
 */
function calcTotalLandedCost(landedCostLines = []) {
  if (!landedCostLines || landedCostLines.length === 0) {
    return new Decimal(0);
  }
  
  return landedCostLines.reduce((total, line) => {
    return total.plus(line.amount || 0);
  }, new Decimal(0));
}

/**
 * Calculate unit cost in base UOM
 * @param {number|string} effectiveCostPerPurchaseUnit - Cost per purchase UOM after discounts/taxes
 * @param {number|string} conversionToBase - Conversion factor to base UOM
 * @returns {Decimal} Cost per base unit
 */
function calcUnitCostBase(effectiveCostPerPurchaseUnit, conversionToBase) {
  return new Decimal(effectiveCostPerPurchaseUnit).dividedBy(conversionToBase);
}

/**
 * Allocate landed costs to a batch based on quantity proportion
 * @param {number|string} batchQtyInBase - Quantity of this batch in base units
 * @param {number|string} totalQtyInReceipt - Total quantity in the receipt in base units
 * @param {number|string} totalLandedCost - Total landed cost to allocate
 * @returns {Decimal} Allocated landed cost for this batch
 */
function allocateLandedCostByQty(batchQtyInBase, totalQtyInReceipt, totalLandedCost) {
  const batchQty = new Decimal(batchQtyInBase);
  const totalQty = new Decimal(totalQtyInReceipt);
  const landedCost = new Decimal(totalLandedCost);
  
  if (totalQty.isZero()) {
    return new Decimal(0);
  }
  
  return batchQty.dividedBy(totalQty).times(landedCost);
}

/**
 * Allocate landed costs to a batch based on value proportion
 * @param {number|string} batchValue - Value of this batch (qty * unit_cost)
 * @param {number|string} totalValueInReceipt - Total value in the receipt
 * @param {number|string} totalLandedCost - Total landed cost to allocate
 * @returns {Decimal} Allocated landed cost for this batch
 */
function allocateLandedCostByValue(batchValue, totalValueInReceipt, totalLandedCost) {
  const value = new Decimal(batchValue);
  const totalValue = new Decimal(totalValueInReceipt);
  const landedCost = new Decimal(totalLandedCost);
  
  if (totalValue.isZero()) {
    return new Decimal(0);
  }
  
  return value.dividedBy(totalValue).times(landedCost);
}

/**
 * Adjust unit cost base after landed cost allocation
 * @param {number|string} originalUnitCostBase - Original unit cost per base unit
 * @param {number|string} allocatedLandedCost - Allocated landed cost for this batch
 * @param {number|string} qtyInBase - Quantity in base units
 * @returns {Object} { unitCostBase: Decimal, totalCostBase: Decimal }
 */
function adjustCostForLandedCost(originalUnitCostBase, allocatedLandedCost, qtyInBase) {
  const originalCost = new Decimal(originalUnitCostBase);
  const allocated = new Decimal(allocatedLandedCost);
  const qty = new Decimal(qtyInBase);
  
  const originalTotal = originalCost.times(qty);
  const newTotal = originalTotal.plus(allocated);
  const newUnitCost = qty.isZero() ? new Decimal(0) : newTotal.dividedBy(qty);
  
  return {
    unitCostBase: newUnitCost,
    totalCostBase: newTotal
  };
}

/**
 * Calculate COGS for a quantity taken from a batch
 * @param {number|string} qtyTaken - Quantity taken in base units
 * @param {number|string} unitCostBase - Unit cost per base unit from the batch
 * @returns {Decimal} COGS amount
 */
function calcCOGS(qtyTaken, unitCostBase) {
  return new Decimal(qtyTaken).times(unitCostBase);
}

/**
 * Calculate gross profit
 * @param {number|string} revenue - Sales revenue
 * @param {number|string} cogs - Cost of goods sold
 * @returns {Decimal} Gross profit
 */
function calcGrossProfit(revenue, cogs) {
  return new Decimal(revenue).minus(cogs);
}

/**
 * Calculate gross profit margin percentage
 * @param {number|string} revenue - Sales revenue
 * @param {number|string} cogs - Cost of goods sold
 * @returns {Decimal} Gross profit margin as percentage
 */
function calcGrossProfitMargin(revenue, cogs) {
  const revenueDecimal = new Decimal(revenue);
  
  if (revenueDecimal.isZero()) {
    return new Decimal(0);
  }
  
  const grossProfit = calcGrossProfit(revenue, cogs);
  return grossProfit.dividedBy(revenueDecimal).times(100);
}

/**
 * Convert currency using exchange rate
 * @param {number|string} amount - Amount in original currency
 * @param {number|string} exchangeRate - Exchange rate to base currency
 * @returns {Decimal} Amount in base currency
 */
function convertCurrency(amount, exchangeRate) {
  return new Decimal(amount).times(exchangeRate);
}

module.exports = {
  calcEffectiveCostPerPurchaseUnit,
  calcTotalLandedCost,
  calcUnitCostBase,
  allocateLandedCostByQty,
  allocateLandedCostByValue,
  adjustCostForLandedCost,
  calcCOGS,
  calcGrossProfit,
  calcGrossProfitMargin,
  convertCurrency
};
