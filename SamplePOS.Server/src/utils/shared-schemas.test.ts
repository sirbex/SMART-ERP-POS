/**
 * Shared Zod Schema Tests (Backend)
 * 
 * Tests for customer and product shared validation schemas.
 * These schemas are used by both frontend and backend.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
    CustomerSchema,
    CreateCustomerSchema,
    CustomerGroupSchema,
    CreateCustomerGroupSchema,
} from '../../../shared/zod/customer.js';
import {
    ProductCreateSchema,
    ProductUpdateSchema,
    UnitOfMeasureEnum,
    CostingMethodEnum,
} from '../../../shared/zod/product.js';

describe('Customer Zod Schemas', () => {
    describe('CreateCustomerSchema', () => {
        it('should accept valid customer', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test Customer',
                email: 'test@test.com',
                phone: '+256700000000',
            });
            expect(result.success).toBe(true);
        });

        it('should accept minimal valid data', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test Customer',
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty name', () => {
            const result = CreateCustomerSchema.safeParse({
                name: '',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].path).toContain('name');
            }
        });

        it('should reject invalid email', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test',
                email: 'not-an-email',
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative credit limit', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test',
                creditLimit: -1000,
            });
            expect(result.success).toBe(false);
        });

        it('should default creditLimit to 0', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.creditLimit).toBe(0);
            }
        });

        it('should reject unknown fields (strict mode)', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test',
                unknownField: 'value',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('CustomerSchema (full)', () => {
        it('should accept valid full customer', () => {
            const result = CustomerSchema.safeParse({
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Test Customer',
                email: 'test@test.com',
                phone: '+256700000000',
                address: '123 Main St',
                balance: 50000,
                creditLimit: 100000,
                isActive: true,
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid UUID id', () => {
            const result = CustomerSchema.safeParse({
                id: 'not-a-uuid',
                name: 'Test',
                balance: 0,
                creditLimit: 0,
                isActive: true,
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('CreateCustomerGroupSchema', () => {
        it('should accept valid group', () => {
            const result = CreateCustomerGroupSchema.safeParse({
                name: 'VIP',
                description: 'VIP customers',
                discountPercentage: 0.1,
            });
            expect(result.success).toBe(true);
        });

        it('should reject discount > 1 (100%)', () => {
            const result = CreateCustomerGroupSchema.safeParse({
                name: 'Bad Group',
                discountPercentage: 1.5,
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative discount', () => {
            const result = CreateCustomerGroupSchema.safeParse({
                name: 'Bad Group',
                discountPercentage: -0.1,
            });
            expect(result.success).toBe(false);
        });
    });
});

describe('Product Zod Schemas', () => {
    const validProduct = {
        name: 'Test Product',
        sku: 'TEST-001',
        unitOfMeasure: 'PIECE' as const,
        costPrice: 1000,
        sellingPrice: 1500,
        costingMethod: 'FIFO' as const,
        isTaxable: false,
        taxRate: 0,
    };

    describe('ProductCreateSchema', () => {
        it('should accept valid product', () => {
            const result = ProductCreateSchema.safeParse(validProduct);
            expect(result.success).toBe(true);
        });

        it('should reject empty name', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                name: '',
            });
            expect(result.success).toBe(false);
        });

        it('should reject empty SKU', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                sku: '',
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative cost price', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                costPrice: -100,
            });
            expect(result.success).toBe(false);
        });

        it('should reject selling price below cost price', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                costPrice: 1500,
                sellingPrice: 1000,
            });
            expect(result.success).toBe(false);
        });

        it('should reject taxable product with 0 tax rate', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                isTaxable: true,
                taxRate: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should accept taxable product with valid tax rate', () => {
            const result = ProductCreateSchema.safeParse({
                ...validProduct,
                isTaxable: true,
                taxRate: 18,
            });
            expect(result.success).toBe(true);
        });

        it('should default unitOfMeasure to EACH', () => {
            const result = ProductCreateSchema.safeParse({
                name: 'Minimal Product',
                sku: 'MIN-001',
                costingMethod: 'FIFO',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.unitOfMeasure).toBe('EACH');
            }
        });
    });

    describe('ProductUpdateSchema', () => {
        it('should accept partial updates', () => {
            const result = ProductUpdateSchema.safeParse({
                name: 'Updated Name',
            });
            expect(result.success).toBe(true);
        });

        it('should accept empty object (no changes)', () => {
            const result = ProductUpdateSchema.safeParse({});
            expect(result.success).toBe(true);
        });
    });

    describe('UnitOfMeasureEnum', () => {
        it('should accept valid UoM values', () => {
            const validValues = ['PIECE', 'BOX', 'CARTON', 'KG', 'LITER', 'METER'];
            for (const v of validValues) {
                expect(UnitOfMeasureEnum.safeParse(v).success).toBe(true);
            }
        });

        it('should reject invalid UoM', () => {
            expect(UnitOfMeasureEnum.safeParse('BARREL').success).toBe(false);
        });
    });

    describe('CostingMethodEnum', () => {
        it('should accept valid costing methods', () => {
            const validValues = ['FIFO', 'AVCO', 'STANDARD'];
            for (const v of validValues) {
                expect(CostingMethodEnum.safeParse(v).success).toBe(true);
            }
        });

        it('should reject LIFO', () => {
            expect(CostingMethodEnum.safeParse('LIFO').success).toBe(false);
        });
    });
});
