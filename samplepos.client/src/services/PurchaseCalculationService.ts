/**
 * Enhanced Purchase Calculation Service
 * Provides high-precision calculations for purchase orders with detailed audit trails
 */

import type { 
  EnhancedPurchaseOrderItem,
  PurchaseCalculationSettings
} from '../models/SupplierCatalog';

interface CalculationStep {
  step: string;
  description: string;
  input: number;
  calculation: string;
  output: number;
  precision: number;
}

interface PurchaseCalculationResult {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  totalTax: number;
  shippingCost: number;
  finalTotal: number;
  
  // Detailed breakdowns
  itemCalculations: ItemCalculationDetail[];
  calculationSteps: CalculationStep[];
  
  // Validation
  isValid: boolean;
  warnings: string[];
  errors: string[];
  
  // Audit information
  calculatedAt: string;
  calculatedBy: string;
  calculationMethod: string;
  settings: PurchaseCalculationSettings;
}

interface ItemCalculationDetail {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  
  // Line calculations
  lineSubtotal: number;
  lineDiscount: number;
  lineDiscountedAmount: number;
  lineTaxableAmount: number;
  lineTax: number;
  lineTotal: number;
  
  // Breakdown details
  discountBreakdown: {
    itemDiscount: number;
    volumeDiscount: number;
    orderDiscount: number;
    totalDiscount: number;
  };
  
  taxBreakdown: {
    taxRate: number;
    taxableBase: number;
    calculatedTax: number;
    roundedTax: number;
    taxMethod: string;
  };
}

class PurchaseCalculationService {
  private static instance: PurchaseCalculationService;
  
  private defaultSettings: PurchaseCalculationSettings = {
    priceDecimalPlaces: 4,
    quantityDecimalPlaces: 3,
    taxDecimalPlaces: 2,
    totalDecimalPlaces: 2,
    taxCalculationMethod: 'line-item',
    taxRoundingMethod: 'round',
    discountApplicationOrder: ['line-discount', 'volume-discount', 'order-discount'],
    currencyCode: 'USD',
    exchangeRateSource: 'manual',
    exchangeRateUpdateFrequency: 'daily',
    minimumOrderValue: 0,
    maximumOrderValue: 1000000,
    requireApprovalThreshold: 5000,
    priceVarianceWarningThreshold: 10,
    enableCalculationAudit: true,
    auditDetailLevel: 'detailed'
  };

  static getInstance(): PurchaseCalculationService {
    if (!PurchaseCalculationService.instance) {
      PurchaseCalculationService.instance = new PurchaseCalculationService();
    }
    return PurchaseCalculationService.instance;
  }

  /**
   * Calculate purchase order with enhanced precision and audit trail
   */
  calculatePurchaseOrder(
    items: EnhancedPurchaseOrderItem[],
    shippingCost: number = 0,
    orderDiscountRate: number = 0,
    settings?: Partial<PurchaseCalculationSettings>
  ): PurchaseCalculationResult {
    const calcSettings = { ...this.defaultSettings, ...settings };
    const calculationSteps: CalculationStep[] = [];
    const itemCalculations: ItemCalculationDetail[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    // Process each item
    for (const item of items) {
      try {
        const itemCalc = this.calculateLineItem(item, calcSettings);
        itemCalculations.push(itemCalc);
        
        subtotal = this.preciseAdd(subtotal, itemCalc.lineSubtotal);
        totalDiscount = this.preciseAdd(totalDiscount, itemCalc.lineDiscount);
        totalTax = this.preciseAdd(totalTax, itemCalc.lineTax);
      } catch (error) {
        errors.push(`Error calculating item ${item.productName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Apply order-level discount
    let orderDiscount = 0;
    if (orderDiscountRate > 0) {
      orderDiscount = this.preciseMultiply(subtotal, orderDiscountRate / 100);
      orderDiscount = this.roundToPrecision(orderDiscount, calcSettings.totalDecimalPlaces);
      totalDiscount = this.preciseAdd(totalDiscount, orderDiscount);
      
      calculationSteps.push({
        step: 'order_discount',
        description: 'Order-level discount calculation',
        input: subtotal,
        calculation: `${subtotal} × ${orderDiscountRate}% = ${orderDiscount}`,
        output: orderDiscount,
        precision: calcSettings.totalDecimalPlaces
      });
    }

    // Calculate taxable amount (after discounts)
    const taxableAmount = this.preciseSubtract(subtotal, totalDiscount);

    // Recalculate tax if using subtotal method
    if (calcSettings.taxCalculationMethod === 'subtotal') {
      totalTax = this.calculateSubtotalTax(taxableAmount, items, calcSettings);
    }

    // Add shipping cost
    const finalShipping = this.roundToPrecision(shippingCost, calcSettings.totalDecimalPlaces);

    // Calculate final total
    const finalTotal = this.preciseAdd(
      this.preciseSubtract(subtotal, totalDiscount),
      this.preciseAdd(totalTax, finalShipping)
    );

    // Add validation warnings
    this.addValidationWarnings(warnings, items, finalTotal, calcSettings);

    return {
      subtotal: this.roundToPrecision(subtotal, calcSettings.totalDecimalPlaces),
      totalDiscount: this.roundToPrecision(totalDiscount, calcSettings.totalDecimalPlaces),
      taxableAmount: this.roundToPrecision(taxableAmount, calcSettings.totalDecimalPlaces),
      totalTax: this.roundToPrecision(totalTax, calcSettings.taxDecimalPlaces),
      shippingCost: finalShipping,
      finalTotal: this.roundToPrecision(finalTotal, calcSettings.totalDecimalPlaces),
      itemCalculations,
      calculationSteps,
      isValid: errors.length === 0,
      warnings,
      errors,
      calculatedAt: new Date().toISOString(),
      calculatedBy: 'system',
      calculationMethod: 'enhanced-precision',
      settings: calcSettings
    };
  }

  /**
   * Calculate individual line item with full breakdown
   */
  private calculateLineItem(
    item: EnhancedPurchaseOrderItem, 
    settings: PurchaseCalculationSettings
  ): ItemCalculationDetail {
    // Base calculations
    const quantity = this.roundToPrecision(item.quantityOrdered, settings.quantityDecimalPlaces);
    const unitPrice = this.roundToPrecision(item.unitCost, settings.priceDecimalPlaces);
    const lineSubtotal = this.preciseMultiply(quantity, unitPrice);

    // Calculate discounts
    const itemDiscount = item.unitDiscount ? 
      this.preciseMultiply(quantity, item.unitDiscount) : 0;
    
    const percentageDiscount = item.discountPercentage ? 
      this.preciseMultiply(lineSubtotal, item.discountPercentage / 100) : 0;
    
    const totalLineDiscount = this.preciseAdd(itemDiscount, percentageDiscount);
    const discountedAmount = this.preciseSubtract(lineSubtotal, totalLineDiscount);

    // Calculate tax
    const taxRate = item.taxRate || 0;
    const taxableBase = discountedAmount;
    let calculatedTax = this.preciseMultiply(taxableBase, taxRate / 100);
    
    // Apply tax rounding
    const roundedTax = this.applyTaxRounding(calculatedTax, settings.taxRoundingMethod, settings.taxDecimalPlaces);

    const lineTotal = this.preciseAdd(discountedAmount, roundedTax);

    return {
      productId: item.productId,
      productName: item.productName,
      quantity,
      unitPrice,
      lineSubtotal: this.roundToPrecision(lineSubtotal, settings.totalDecimalPlaces),
      lineDiscount: this.roundToPrecision(totalLineDiscount, settings.totalDecimalPlaces),
      lineDiscountedAmount: this.roundToPrecision(discountedAmount, settings.totalDecimalPlaces),
      lineTaxableAmount: this.roundToPrecision(taxableBase, settings.totalDecimalPlaces),
      lineTax: roundedTax,
      lineTotal: this.roundToPrecision(lineTotal, settings.totalDecimalPlaces),
      
      discountBreakdown: {
        itemDiscount: this.roundToPrecision(itemDiscount, settings.totalDecimalPlaces),
        volumeDiscount: 0, // TODO: Implement volume discount logic
        orderDiscount: 0, // Applied at order level
        totalDiscount: this.roundToPrecision(totalLineDiscount, settings.totalDecimalPlaces)
      },
      
      taxBreakdown: {
        taxRate,
        taxableBase: this.roundToPrecision(taxableBase, settings.totalDecimalPlaces),
        calculatedTax: this.roundToPrecision(calculatedTax, 6), // High precision for audit
        roundedTax,
        taxMethod: settings.taxCalculationMethod
      }
    };
  }

  /**
   * High-precision arithmetic operations to avoid floating-point errors
   */
  private preciseAdd(a: number, b: number): number {
    return Math.round((a + b) * 1000000) / 1000000;
  }

  private preciseSubtract(a: number, b: number): number {
    return Math.round((a - b) * 1000000) / 1000000;
  }

  private preciseMultiply(a: number, b: number): number {
    return Math.round((a * b) * 1000000) / 1000000;
  }

  private preciseDivide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return Math.round((a / b) * 1000000) / 1000000;
  }

  /**
   * Round to specified decimal places
   */
  private roundToPrecision(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Apply different tax rounding methods
   */
  private applyTaxRounding(tax: number, method: string, decimals: number): number {
    const factor = Math.pow(10, decimals);
    
    switch (method) {
      case 'ceil':
        return Math.ceil(tax * factor) / factor;
      case 'floor':
        return Math.floor(tax * factor) / factor;
      case 'round':
      default:
        return Math.round(tax * factor) / factor;
    }
  }

  /**
   * Calculate tax at subtotal level
   */
  private calculateSubtotalTax(
    taxableAmount: number, 
    items: EnhancedPurchaseOrderItem[], 
    settings: PurchaseCalculationSettings
  ): number {
    // Get weighted average tax rate
    let totalItemValue = 0;
    let totalTaxableValue = 0;
    
    for (const item of items) {
      const itemValue = item.quantityOrdered * item.unitCost;
      totalItemValue += itemValue;
      
      if (item.taxRate && item.taxRate > 0) {
        totalTaxableValue += itemValue;
      }
    }
    
    const averageTaxRate = totalItemValue > 0 ? 
      (totalTaxableValue / totalItemValue) * this.getAverageTaxRate(items) : 0;
    
    const calculatedTax = this.preciseMultiply(taxableAmount, averageTaxRate / 100);
    return this.applyTaxRounding(calculatedTax, settings.taxRoundingMethod, settings.taxDecimalPlaces);
  }

  /**
   * Get average tax rate from items
   */
  private getAverageTaxRate(items: EnhancedPurchaseOrderItem[]): number {
    const taxableItems = items.filter(item => item.taxRate && item.taxRate > 0);
    if (taxableItems.length === 0) return 0;
    
    const totalTaxRate = taxableItems.reduce((sum, item) => sum + (item.taxRate || 0), 0);
    return totalTaxRate / taxableItems.length;
  }

  /**
   * Add validation warnings
   */
  private addValidationWarnings(
    warnings: string[], 
    items: EnhancedPurchaseOrderItem[], 
    finalTotal: number, 
    settings: PurchaseCalculationSettings
  ): void {
    // Check order value thresholds
    if (finalTotal < settings.minimumOrderValue) {
      warnings.push(`Order total ${finalTotal} is below minimum order value ${settings.minimumOrderValue}`);
    }
    
    if (finalTotal > settings.maximumOrderValue) {
      warnings.push(`Order total ${finalTotal} exceeds maximum order value ${settings.maximumOrderValue}`);
    }
    
    if (finalTotal > settings.requireApprovalThreshold) {
      warnings.push(`Order total ${finalTotal} requires approval (threshold: ${settings.requireApprovalThreshold})`);
    }

    // Check for unusual discounts
    for (const item of items) {
      if (item.discountPercentage && item.discountPercentage > 50) {
        warnings.push(`High discount rate (${item.discountPercentage}%) on ${item.productName}`);
      }
    }
  }

  /**
   * Calculate price variance compared to historical data
   */
  calculatePriceVariance(
    currentPrice: number, 
    historicalPrices: number[]
  ): { variance: number; percentageVariance: number; trend: 'increasing' | 'decreasing' | 'stable' } {
    if (historicalPrices.length === 0) {
      return { variance: 0, percentageVariance: 0, trend: 'stable' };
    }

    const averageHistoricalPrice = historicalPrices.reduce((sum, price) => sum + price, 0) / historicalPrices.length;
    const variance = this.preciseSubtract(currentPrice, averageHistoricalPrice);
    const percentageVariance = averageHistoricalPrice > 0 ? 
      this.preciseDivide(variance, averageHistoricalPrice) * 100 : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(percentageVariance) > 5) {
      trend = percentageVariance > 0 ? 'increasing' : 'decreasing';
    }

    return {
      variance: this.roundToPrecision(variance, 4),
      percentageVariance: this.roundToPrecision(percentageVariance, 2),
      trend
    };
  }

  /**
   * Generate calculation audit report
   */
  generateAuditReport(calculation: PurchaseCalculationResult): string {
    let report = `Purchase Order Calculation Audit Report\n`;
    report += `Generated: ${calculation.calculatedAt}\n`;
    report += `Method: ${calculation.calculationMethod}\n\n`;

    report += `ORDER SUMMARY\n`;
    report += `Subtotal: ${calculation.subtotal}\n`;
    report += `Total Discount: ${calculation.totalDiscount}\n`;
    report += `Taxable Amount: ${calculation.taxableAmount}\n`;
    report += `Total Tax: ${calculation.totalTax}\n`;
    report += `Shipping: ${calculation.shippingCost}\n`;
    report += `Final Total: ${calculation.finalTotal}\n\n`;

    report += `ITEM DETAILS\n`;
    calculation.itemCalculations.forEach((item, index) => {
      report += `${index + 1}. ${item.productName}\n`;
      report += `   Quantity: ${item.quantity} × Unit Price: ${item.unitPrice}\n`;
      report += `   Line Subtotal: ${item.lineSubtotal}\n`;
      report += `   Line Discount: ${item.lineDiscount}\n`;
      report += `   Line Tax: ${item.lineTax} (Rate: ${item.taxBreakdown.taxRate}%)\n`;
      report += `   Line Total: ${item.lineTotal}\n\n`;
    });

    if (calculation.warnings.length > 0) {
      report += `WARNINGS\n`;
      calculation.warnings.forEach(warning => report += `- ${warning}\n`);
      report += `\n`;
    }

    if (calculation.errors.length > 0) {
      report += `ERRORS\n`;
      calculation.errors.forEach(error => report += `- ${error}\n`);
    }

    return report;
  }
}

export default PurchaseCalculationService;