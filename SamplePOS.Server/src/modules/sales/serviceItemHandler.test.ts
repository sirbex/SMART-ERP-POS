import {
    validateSaleLineItem,
    separateSaleItems,
    hasServiceItems,
    calculateServiceRevenue,
    SaleLineItem,
} from './serviceItemHandler';

describe('Service Item Handler', () => {
    describe('validateSaleLineItem', () => {
        it('should correctly identify service items', () => {
            const serviceItem: SaleLineItem = {
                productId: '123',
                productType: 'service',
                quantity: 1,
                unitPrice: 100,
                costPrice: 0,
                taxable: true,
                taxRate: 18,
                incomeAccountId: 'acc-123',
            };

            const result = validateSaleLineItem(serviceItem);

            expect(result.isService).toBe(true);
            expect(result.requiresInventory).toBe(false);
            expect(result.shouldCreateStockMovement).toBe(false);
            expect(result.shouldValidateStock).toBe(false);
            expect(result.accountingAccount).toBe('acc-123');
        });

        it('should correctly identify inventory items', () => {
            const inventoryItem: SaleLineItem = {
                productId: '456',
                productType: 'inventory',
                quantity: 5,
                unitPrice: 50,
                costPrice: 30,
                taxable: true,
                taxRate: 18,
            };

            const result = validateSaleLineItem(inventoryItem);

            expect(result.isService).toBe(false);
            expect(result.requiresInventory).toBe(true);
            expect(result.shouldCreateStockMovement).toBe(true);
            expect(result.shouldValidateStock).toBe(true);
            expect(result.accountingAccount).toBeNull();
        });

        it('should correctly identify consumable items', () => {
            const consumableItem: SaleLineItem = {
                productId: '789',
                productType: 'consumable',
                quantity: 10,
                unitPrice: 20,
                costPrice: 15,
                taxable: true,
                taxRate: 18,
            };

            const result = validateSaleLineItem(consumableItem);

            expect(result.isService).toBe(false);
            expect(result.requiresInventory).toBe(true);
            expect(result.shouldCreateStockMovement).toBe(true);
            expect(result.shouldValidateStock).toBe(true);
        });
    });

    describe('separateSaleItems', () => {
        it('should correctly separate mixed item types', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
                {
                    productId: '2',
                    productType: 'service',
                    quantity: 1,
                    unitPrice: 200,
                    costPrice: 0,
                    taxable: true,
                    taxRate: 18,
                    incomeAccountId: 'acc-1',
                },
                {
                    productId: '3',
                    productType: 'consumable',
                    quantity: 5,
                    unitPrice: 50,
                    costPrice: 30,
                    taxable: true,
                    taxRate: 18,
                },
                {
                    productId: '4',
                    productType: 'service',
                    quantity: 1,
                    unitPrice: 150,
                    costPrice: 0,
                    taxable: false,
                    taxRate: 0,
                    incomeAccountId: 'acc-2',
                },
            ];

            const result = separateSaleItems(items);

            expect(result.inventoryItems).toHaveLength(1);
            expect(result.serviceItems).toHaveLength(2);
            expect(result.consumableItems).toHaveLength(1);
            expect(result.inventoryItems[0].productId).toBe('1');
            expect(result.serviceItems[0].productId).toBe('2');
            expect(result.serviceItems[1].productId).toBe('4');
            expect(result.consumableItems[0].productId).toBe('3');
        });

        it('should handle all inventory items', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
            ];

            const result = separateSaleItems(items);

            expect(result.inventoryItems).toHaveLength(1);
            expect(result.serviceItems).toHaveLength(0);
            expect(result.consumableItems).toHaveLength(0);
        });

        it('should handle all service items', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'service',
                    quantity: 1,
                    unitPrice: 200,
                    costPrice: 0,
                    taxable: true,
                    taxRate: 18,
                    incomeAccountId: 'acc-1',
                },
            ];

            const result = separateSaleItems(items);

            expect(result.inventoryItems).toHaveLength(0);
            expect(result.serviceItems).toHaveLength(1);
            expect(result.consumableItems).toHaveLength(0);
        });
    });

    describe('hasServiceItems', () => {
        it('should return true when service items present', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
                {
                    productId: '2',
                    productType: 'service',
                    quantity: 1,
                    unitPrice: 200,
                    costPrice: 0,
                    taxable: true,
                    taxRate: 18,
                },
            ];

            expect(hasServiceItems(items)).toBe(true);
        });

        it('should return false when no service items', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
            ];

            expect(hasServiceItems(items)).toBe(false);
        });
    });

    describe('calculateServiceRevenue', () => {
        it('should calculate total service revenue', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
                {
                    productId: '2',
                    productType: 'service',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 0,
                    taxable: true,
                    taxRate: 18,
                },
                {
                    productId: '3',
                    productType: 'service',
                    quantity: 1,
                    unitPrice: 150,
                    costPrice: 0,
                    taxable: true,
                    taxRate: 18,
                },
            ];

            const revenue = calculateServiceRevenue(items);

            expect(revenue).toBe(350); // (2 * 100) + (1 * 150)
        });

        it('should return 0 when no service items', () => {
            const items: SaleLineItem[] = [
                {
                    productId: '1',
                    productType: 'inventory',
                    quantity: 2,
                    unitPrice: 100,
                    costPrice: 60,
                    taxable: true,
                    taxRate: 18,
                },
            ];

            const revenue = calculateServiceRevenue(items);

            expect(revenue).toBe(0);
        });
    });
});
