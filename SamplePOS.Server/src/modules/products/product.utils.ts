import type { Product, ProductType } from '../../../../shared/types/product.type.js';

/**
 * Check if a product is a service (non-inventory) item
 * @param product - Product object or product type string
 * @returns true if product is a service type
 */
export function isService(product: Product | { productType: ProductType } | ProductType): boolean {
    if (typeof product === 'string') {
        return product === 'service';
    }

    if ('productType' in product) {
        return product.productType === 'service';
    }

    return false;
}

/**
 * Check if a product requires inventory tracking
 * @param product - Product object or product type string
 * @returns true if product requires stock movements
 */
export function requiresInventoryTracking(product: Product | { productType: ProductType } | ProductType): boolean {
    if (typeof product === 'string') {
        return product === 'inventory' || product === 'consumable';
    }

    if ('productType' in product) {
        return product.productType === 'inventory' || product.productType === 'consumable';
    }

    return false;
}

/**
 * Check if a product is a consumable (expensed immediately)
 * @param product - Product object or product type string
 * @returns true if product is consumable type
 */
export function isConsumable(product: Product | { productType: ProductType } | ProductType): boolean {
    if (typeof product === 'string') {
        return product === 'consumable';
    }

    if ('productType' in product) {
        return product.productType === 'consumable';
    }

    return false;
}

/**
 * Check if a product is inventory type (capitalizable asset)
 * @param product - Product object or product type string
 * @returns true if product is inventory type
 */
export function isInventoryProduct(product: Product | { productType: ProductType } | ProductType): boolean {
    if (typeof product === 'string') {
        return product === 'inventory';
    }

    if ('productType' in product) {
        return product.productType === 'inventory';
    }

    return false;
}

/**
 * Get human-readable product type label
 * @param productType - Product type enum value
 * @returns Display label for the product type
 */
export function getProductTypeLabel(productType: ProductType): string {
    const labels: Record<ProductType, string> = {
        inventory: 'Inventory Item',
        consumable: 'Consumable',
        service: 'Service',
    };

    return labels[productType] || 'Unknown';
}

/**
 * Validate if a product type is valid
 * @param type - String to validate
 * @returns true if valid product type
 */
export function isValidProductType(type: string): type is ProductType {
    return ['inventory', 'consumable', 'service'].includes(type);
}
