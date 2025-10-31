const Decimal = require('decimal.js');

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
});

/**
 * Convert quantity from a specific UOM to base UOM
 * @param {number|string} quantity - Quantity in the specific UOM
 * @param {number|string} conversionToBase - Conversion factor (how many base units in 1 of this UOM)
 * @returns {Decimal} Quantity in base units
 */
function toBaseQty(quantity, conversionToBase) {
  return new Decimal(quantity).times(conversionToBase);
}

/**
 * Convert quantity from base UOM to a specific UOM
 * @param {number|string} qtyInBase - Quantity in base UOM
 * @param {number|string} conversionToBase - Conversion factor
 * @returns {Decimal} Quantity in the specific UOM
 */
function fromBaseQty(qtyInBase, conversionToBase) {
  return new Decimal(qtyInBase).dividedBy(conversionToBase);
}

/**
 * Get available stock in a specific UOM
 * @param {number|string} stockInBase - Available stock in base UOM
 * @param {number|string} conversionToBase - Conversion factor
 * @returns {Decimal} Available stock in the requested UOM
 */
function getAvailableInUOM(stockInBase, conversionToBase) {
  return fromBaseQty(stockInBase, conversionToBase);
}

/**
 * Round a decimal value to specified decimal places
 * @param {Decimal|number|string} value - Value to round
 * @param {number} decimalPlaces - Number of decimal places (default 6)
 * @returns {Decimal} Rounded value
 */
function roundDecimal(value, decimalPlaces = 6) {
  return new Decimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Format a decimal value for display
 * @param {Decimal|number|string} value - Value to format
 * @param {number} decimalPlaces - Number of decimal places (default 2)
 * @returns {string} Formatted string
 */
function formatDecimal(value, decimalPlaces = 2) {
  return new Decimal(value).toFixed(decimalPlaces);
}

/**
 * Validate UOM conversion factor
 * @param {number|string} conversionToBase - Conversion factor to validate
 * @returns {boolean} True if valid
 */
function isValidConversion(conversionToBase) {
  try {
    const conversion = new Decimal(conversionToBase);
    return conversion.greaterThan(0);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate proportional allocation
 * @param {number|string} itemValue - Value of the item (qty or cost)
 * @param {number|string} totalValue - Total value for all items
 * @param {number|string} amountToAllocate - Total amount to allocate
 * @returns {Decimal} Allocated amount for this item
 */
function calculateProportionalAllocation(itemValue, totalValue, amountToAllocate) {
  const item = new Decimal(itemValue);
  const total = new Decimal(totalValue);
  const allocate = new Decimal(amountToAllocate);
  
  if (total.isZero()) {
    return new Decimal(0);
  }
  
  return item.dividedBy(total).times(allocate);
}

module.exports = {
  Decimal,
  toBaseQty,
  fromBaseQty,
  getAvailableInUOM,
  roundDecimal,
  formatDecimal,
  isValidConversion,
  calculateProportionalAllocation
};
