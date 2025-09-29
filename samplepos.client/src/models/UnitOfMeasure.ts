/**
 * Unit of Measure (UoM) model and utilities
 * 
 * This file defines the data structures and utilities for handling
 * different units of measure in the inventory system, including
 * conversions between units and pricing calculations.
 */

/**
 * Base unit of measure type
 */
export type UnitOfMeasureType = 
  | 'piece'   // Individual items
  | 'weight'  // Weight-based units (kg, g, lb, oz)
  | 'volume'  // Volume-based units (L, ml, gal, etc)
  | 'length'  // Length-based units (m, cm, in, etc)
  | 'area'    // Area-based units (m², ft², etc)
  | 'time'    // Time-based units (hour, day, etc)
  | 'custom'; // Custom unit types

/**
 * Common unit groups for different measurement types
 */
export const UnitGroups: Record<string, string[]> = {
  // Count/Quantity units
  count: ['piece', 'dozen', 'half-dozen', 'quarter-dozen', 'box', 'case', 'pack', 'set', 'bundle'],
  
  // Weight units
  weight: ['kg', 'g', 'mg', 'lb', 'oz', 'ton'],
  
  // Volume units
  volume: ['l', 'ml', 'gal', 'qt', 'pt', 'fl-oz', 'cup'],
  
  // Length units
  length: ['m', 'cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi'],
  
  // Area units
  area: ['sq-m', 'sq-cm', 'sq-ft', 'sq-in', 'acre', 'hectare'],
  
  // Time units
  time: ['second', 'minute', 'hour', 'day', 'week', 'month', 'year']
};

/**
 * Unit of Measure definition
 */
export interface UnitOfMeasure {
  id: string;           // Unique identifier
  name: string;         // Display name (e.g., "Dozen", "Half Dozen")
  abbreviation: string; // Short form (e.g., "dz", "1/2 dz")
  type: UnitOfMeasureType; 
  baseUnit?: string;    // Reference to the base unit (null if this is a base unit)
  conversionFactor: number; // Multiplier to convert to the base unit
  isBaseUnit: boolean;  // Whether this is the base unit for its type
  sortOrder?: number;   // Optional display order
}

/**
 * Unit of Measure with pricing information for a specific product
 */
export interface ProductUoM {
  uomId: string;        // Reference to the UoM definition
  price: number;        // Price for this unit
  isDefault: boolean;   // Whether this is the default unit for the product
  conversionFactor: number; // Conversion factor to the product's base unit
  barcode?: string;     // Optional specific barcode for this UoM
}

/**
 * Group of related units of measure (e.g., "pieces", "dozen", "half-dozen")
 */
export interface UoMGroup {
  id: string;           // Unique identifier for the group
  name: string;         // Display name (e.g., "Counting Units")
  type: UnitOfMeasureType;
  baseUnitId: string;   // ID of the base unit in this group
  units: UnitOfMeasure[]; // All units in this group
}

/**
 * Predefined UoM groups for common scenarios
 */
export const CommonUoMGroups: UoMGroup[] = [
  {
    id: 'counting',
    name: 'Counting Units',
    type: 'piece',
    baseUnitId: 'piece',
    units: [
      {
        id: 'piece',
        name: 'Piece',
        abbreviation: 'pc',
        type: 'piece',
        conversionFactor: 1,
        isBaseUnit: true,
        sortOrder: 1
      },
      {
        id: 'quarter-dozen',
        name: '¼ Dozen',
        abbreviation: '¼ dz',
        type: 'piece',
        baseUnit: 'piece',
        conversionFactor: 3, // 3 pieces
        isBaseUnit: false,
        sortOrder: 2
      },
      {
        id: 'half-dozen',
        name: '½ Dozen',
        abbreviation: '½ dz',
        type: 'piece',
        baseUnit: 'piece',
        conversionFactor: 6, // 6 pieces
        isBaseUnit: false,
        sortOrder: 3
      },
      {
        id: 'dozen',
        name: 'Dozen',
        abbreviation: 'dz',
        type: 'piece',
        baseUnit: 'piece',
        conversionFactor: 12, // 12 pieces
        isBaseUnit: false,
        sortOrder: 4
      },
      {
        id: 'box',
        name: 'Box',
        abbreviation: 'box',
        type: 'piece',
        baseUnit: 'piece',
        conversionFactor: 24, // Example: 24 pieces per box
        isBaseUnit: false,
        sortOrder: 5
      },
      {
        id: 'half-box',
        name: '½ Box',
        abbreviation: '½ box',
        type: 'piece',
        baseUnit: 'piece',
        conversionFactor: 12, // Example: 12 pieces per half box
        isBaseUnit: false,
        sortOrder: 6
      }
    ]
  },
  {
    id: 'weight',
    name: 'Weight Units',
    type: 'weight',
    baseUnitId: 'kg',
    units: [
      {
        id: 'kg',
        name: 'Kilogram',
        abbreviation: 'kg',
        type: 'weight',
        conversionFactor: 1,
        isBaseUnit: true,
        sortOrder: 1
      },
      {
        id: 'g',
        name: 'Gram',
        abbreviation: 'g',
        type: 'weight',
        baseUnit: 'kg',
        conversionFactor: 0.001, // 0.001 kg
        isBaseUnit: false,
        sortOrder: 2
      },
      {
        id: 'lb',
        name: 'Pound',
        abbreviation: 'lb',
        type: 'weight',
        baseUnit: 'kg',
        conversionFactor: 0.45359237, // 0.45359237 kg
        isBaseUnit: false,
        sortOrder: 3
      }
    ]
  }
];

/**
 * Convert between units of measure
 * @param value The value to convert
 * @param fromUnit The source unit
 * @param toUnit The target unit
 * @returns The converted value or null if conversion is not possible
 */
export function convertUoM(
  value: number, 
  fromUnit: UnitOfMeasure, 
  toUnit: UnitOfMeasure
): number | null {
  // Units must be of the same type for conversion
  if (fromUnit.type !== toUnit.type) {
    return null;
  }
  
  // Convert to the base unit first, then to the target unit
  const valueInBaseUnit = value * fromUnit.conversionFactor;
  return valueInBaseUnit / toUnit.conversionFactor;
}

/**
 * Calculate price for a different unit of measure
 * @param basePrice The price in the base unit
 * @param baseUnit The base unit
 * @param targetUnit The target unit to calculate price for
 * @returns The calculated price for the target unit
 */
export function calculatePriceForUoM(
  basePrice: number,
  baseUnit: UnitOfMeasure,
  targetUnit: UnitOfMeasure
): number {
  // Simple direct conversion - price scales with the conversion factor
  return basePrice * (targetUnit.conversionFactor / baseUnit.conversionFactor);
}

/**
 * Format a unit of measure for display
 * @param value The numeric value
 * @param uom The unit of measure
 * @returns Formatted string (e.g., "12 pcs" or "1 dz")
 */
export function formatUoM(value: number, uom: UnitOfMeasure): string {
  return `${value} ${uom.abbreviation}`;
}

/**
 * Find a UoM by ID in a UoM group
 * @param uomId The ID of the UoM to find
 * @param group The UoM group to search in
 * @returns The found UoM or undefined
 */
export function findUoMById(uomId: string, group: UoMGroup): UnitOfMeasure | undefined {
  return group.units.find(unit => unit.id === uomId);
}

/**
 * Get the base unit from a UoM group
 * @param group The UoM group
 * @returns The base unit
 */
export function getBaseUnit(group: UoMGroup): UnitOfMeasure | undefined {
  return group.units.find(unit => unit.isBaseUnit);
}