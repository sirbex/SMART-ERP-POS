import {
    isService,
    requiresInventoryTracking,
    isConsumable,
    isInventoryProduct,
    getProductTypeLabel,
    isValidProductType,
} from './product.utils';
import { Product, ProductType } from '../../../../shared/types/product.type';

describe('Product Utilities', () => {
    describe('isService', () => {
        it('should return true for service product type string', () => {
            expect(isService('service')).toBe(true);
        });

        it('should return false for inventory product type string', () => {
            expect(isService('inventory')).toBe(false);
        });

        it('should return false for consumable product type string', () => {
            expect(isService('consumable')).toBe(false);
        });

        it('should return true for service product object', () => {
            const product: Partial<Product> = { productType: 'service' };
            expect(isService(product as Product)).toBe(true);
        });

        it('should return false for inventory product object', () => {
            const product: Partial<Product> = { productType: 'inventory' };
            expect(isService(product as Product)).toBe(false);
        });
    });

    describe('requiresInventoryTracking', () => {
        it('should return true for inventory type', () => {
            expect(requiresInventoryTracking('inventory')).toBe(true);
        });

        it('should return true for consumable type', () => {
            expect(requiresInventoryTracking('consumable')).toBe(true);
        });

        it('should return false for service type', () => {
            expect(requiresInventoryTracking('service')).toBe(false);
        });

        it('should return true for inventory product object', () => {
            const product: Partial<Product> = { productType: 'inventory' };
            expect(requiresInventoryTracking(product as Product)).toBe(true);
        });

        it('should return false for service product object', () => {
            const product: Partial<Product> = { productType: 'service' };
            expect(requiresInventoryTracking(product as Product)).toBe(false);
        });
    });

    describe('isConsumable', () => {
        it('should return true for consumable type', () => {
            expect(isConsumable('consumable')).toBe(true);
        });

        it('should return false for inventory type', () => {
            expect(isConsumable('inventory')).toBe(false);
        });

        it('should return false for service type', () => {
            expect(isConsumable('service')).toBe(false);
        });
    });

    describe('isInventoryProduct', () => {
        it('should return true for inventory type', () => {
            expect(isInventoryProduct('inventory')).toBe(true);
        });

        it('should return false for consumable type', () => {
            expect(isInventoryProduct('consumable')).toBe(false);
        });

        it('should return false for service type', () => {
            expect(isInventoryProduct('service')).toBe(false);
        });
    });

    describe('getProductTypeLabel', () => {
        it('should return correct label for inventory', () => {
            expect(getProductTypeLabel('inventory')).toBe('Inventory Item');
        });

        it('should return correct label for consumable', () => {
            expect(getProductTypeLabel('consumable')).toBe('Consumable');
        });

        it('should return correct label for service', () => {
            expect(getProductTypeLabel('service')).toBe('Service');
        });
    });

    describe('isValidProductType', () => {
        it('should return true for valid product types', () => {
            expect(isValidProductType('inventory')).toBe(true);
            expect(isValidProductType('consumable')).toBe(true);
            expect(isValidProductType('service')).toBe(true);
        });

        it('should return false for invalid product types', () => {
            expect(isValidProductType('invalid')).toBe(false);
            expect(isValidProductType('')).toBe(false);
            expect(isValidProductType('SERVICE')).toBe(false); // case sensitive
        });
    });
});
