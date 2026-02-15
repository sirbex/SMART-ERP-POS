// Product with UoM - Business Logic Container
// Encapsulates UoM conversion logic within the Product domain

import Decimal from 'decimal.js';
import type { Product } from '../../../../shared/zod/product.js';
import type { DbProductUom } from './uomRepository.js';

export interface ProductUomData {
  id: string;
  uomId: string;
  uomName: string;
  uomSymbol: string | null;
  conversionFactor: string; // decimal as string from DB
  barcode: string | null;
  isDefault: boolean;
  priceOverride: string | null;
  costOverride: string | null;
}

export class ProductWithUom {
  private product: Product;
  private uoms: ProductUomData[];
  private baseCost: Decimal;
  private basePrice: Decimal;

  constructor(product: Product, uoms: ProductUomData[] = []) {
    this.product = product;
    this.uoms = uoms;
    this.baseCost = new Decimal(product.costPrice || 0);
    this.basePrice = new Decimal(product.sellingPrice || 0);
  }

  // Get product data
  getProduct(): Product {
    return this.product;
  }

  // Get all UoMs for this product
  getUoms(): ProductUomData[] {
    return this.uoms;
  }

  // Find UoM by ID
  findUomById(uomId: string): ProductUomData | undefined {
    return this.uoms.find((u) => u.uomId === uomId);
  }

  // Get default UoM (or first available)
  getDefaultUom(): ProductUomData | undefined {
    return this.uoms.find((u) => u.isDefault) || this.uoms[0];
  }

  /**
   * Convert quantity from base units to target UoM
   * @param baseQuantity - Quantity in base units
   * @param targetUomId - Target UoM ID (optional, uses default if not provided)
   * @returns Quantity in target UoM units
   */
  convertFromBase(baseQuantity: number, targetUomId?: string): Decimal {
    if (!targetUomId && this.uoms.length === 0) {
      return new Decimal(baseQuantity);
    }

    const targetUom = targetUomId ? this.findUomById(targetUomId) : this.getDefaultUom();

    if (!targetUom) {
      return new Decimal(baseQuantity);
    }

    const factor = new Decimal(targetUom.conversionFactor);
    return new Decimal(baseQuantity).div(factor);
  }

  /**
   * Convert quantity from UoM to base units
   * @param quantity - Quantity in UoM units
   * @param fromUomId - Source UoM ID (optional, uses default if not provided)
   * @returns Quantity in base units
   */
  convertToBase(quantity: number, fromUomId?: string): Decimal {
    if (!fromUomId && this.uoms.length === 0) {
      return new Decimal(quantity);
    }

    const sourceUom = fromUomId ? this.findUomById(fromUomId) : this.getDefaultUom();

    if (!sourceUom) {
      return new Decimal(quantity);
    }

    const factor = new Decimal(sourceUom.conversionFactor);
    return new Decimal(quantity).mul(factor);
  }

  /**
   * Convert quantity between two UoMs
   * @param quantity - Quantity in source UoM
   * @param fromUomId - Source UoM ID
   * @param toUomId - Target UoM ID
   * @returns Quantity in target UoM
   */
  convertBetweenUoms(quantity: number, fromUomId: string, toUomId: string): Decimal {
    // First convert to base, then to target
    const baseQty = this.convertToBase(quantity, fromUomId);
    return this.convertFromBase(baseQty.toNumber(), toUomId);
  }

  /**
   * Get cost in specific UoM (respects cost overrides)
   * @param uomId - UoM ID (optional, uses default if not provided)
   * @returns Cost per UoM unit
   */
  getCostInUom(uomId?: string): Decimal {
    if (!uomId && this.uoms.length === 0) {
      return this.baseCost;
    }

    const targetUom = uomId ? this.findUomById(uomId) : this.getDefaultUom();

    if (!targetUom) {
      return this.baseCost;
    }

    // If override exists, use it
    if (targetUom.costOverride) {
      return new Decimal(targetUom.costOverride);
    }

    // Otherwise derive from base cost
    const factor = new Decimal(targetUom.conversionFactor);
    return this.baseCost.mul(factor);
  }

  /**
   * Get price in specific UoM (respects price overrides)
   * @param uomId - UoM ID (optional, uses default if not provided)
   * @returns Price per UoM unit
   */
  getPriceInUom(uomId?: string): Decimal {
    if (!uomId && this.uoms.length === 0) {
      return this.basePrice;
    }

    const targetUom = uomId ? this.findUomById(uomId) : this.getDefaultUom();

    if (!targetUom) {
      return this.basePrice;
    }

    // If override exists, use it
    if (targetUom.priceOverride) {
      return new Decimal(targetUom.priceOverride);
    }

    // Otherwise derive from base price
    const factor = new Decimal(targetUom.conversionFactor);
    return this.basePrice.mul(factor);
  }

  /**
   * Get margin percentage for specific UoM
   * @param uomId - UoM ID (optional, uses default if not provided)
   * @returns Margin percentage
   */
  getMarginInUom(uomId?: string): Decimal {
    const cost = this.getCostInUom(uomId);
    const price = this.getPriceInUom(uomId);

    if (price.eq(0)) {
      return new Decimal(0);
    }

    return price.minus(cost).div(price).mul(100);
  }

  /**
   * Get complete UoM details with computed values
   * @returns Array of UoMs with derived cost, price, and margin
   */
  getUomsWithDetails(): Array<
    ProductUomData & {
      factor: string;
      displayCost: string;
      displayPrice: string;
      marginPct: string;
    }
  > {
    return this.uoms.map((uom) => {
      const factor = new Decimal(uom.conversionFactor);
      const displayCost = this.getCostInUom(uom.uomId);
      const displayPrice = this.getPriceInUom(uom.uomId);
      const marginPct = this.getMarginInUom(uom.uomId);

      return {
        ...uom,
        factor: factor.toString(),
        displayCost: displayCost.toString(),
        displayPrice: displayPrice.toString(),
        marginPct: marginPct.toString(),
      };
    });
  }

  /**
   * Serialize to JSON for API response
   */
  toJSON() {
    return {
      ...this.product,
      uoms: this.getUomsWithDetails(),
    };
  }
}
