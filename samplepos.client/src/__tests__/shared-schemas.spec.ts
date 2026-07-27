/**
 * Shared Zod Schema Tests
 * 
 * Tests for customer, product, and other shared validation schemas.
 */

import { describe, it, expect } from 'vitest';
import {
    CustomerSchema,
    CreateCustomerSchema,
    CustomerGroupSchema,
    CreateCustomerGroupSchema,
} from '@shared/zod/customer';
import { POSSaleSchema, POSSaleLineItemSchema } from '@shared/zod/pos-sale';

describe('Shared Zod Schemas', () => {
    // -------------------------------------------------------------------
    // Customer Schema
    // -------------------------------------------------------------------
    describe('CustomerSchema', () => {
        const validCustomer = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+256700000000',
            address: '123 Main St',
            balance: 0,
            creditLimit: 50000,
            isActive: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
        };

        it('should validate a valid customer', () => {
            const result = CustomerSchema.safeParse(validCustomer);
            expect(result.success).toBe(true);
        });

        it('should reject invalid UUID', () => {
            const result = CustomerSchema.safeParse({
                ...validCustomer,
                id: 'not-a-uuid',
            });
            expect(result.success).toBe(false);
        });

        it('should reject empty name', () => {
            const result = CustomerSchema.safeParse({
                ...validCustomer,
                name: '',
            });
            expect(result.success).toBe(false);
        });

        it('should accept nullable email', () => {
            const result = CustomerSchema.safeParse({
                ...validCustomer,
                email: null,
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid email', () => {
            const result = CustomerSchema.safeParse({
                ...validCustomer,
                email: 'not-an-email',
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative credit limit', () => {
            const result = CustomerSchema.safeParse({
                ...validCustomer,
                creditLimit: -1000,
            });
            expect(result.success).toBe(false);
        });
    });

    describe('CreateCustomerSchema', () => {
        it('should accept minimal valid data', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test Customer',
            });
            expect(result.success).toBe(true);
        });

        it('should reject missing name', () => {
            const result = CreateCustomerSchema.safeParse({});
            expect(result.success).toBe(false);
        });

        it('should accept with all optional fields', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Full Customer',
                email: 'test@test.com',
                phone: '+256700000000',
                address: '123 Main St',
                creditLimit: 50000,
            });
            expect(result.success).toBe(true);
        });

        it('should reject extra fields (strict mode)', () => {
            const result = CreateCustomerSchema.safeParse({
                name: 'Test Customer',
                unknownField: 'value',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('CustomerGroupSchema', () => {
        it('should validate valid group', () => {
            const result = CustomerGroupSchema.safeParse({
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'VIP Customers',
                description: 'Priority customers',
                discountPercentage: 0.1,
                isActive: true,
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            });
            expect(result.success).toBe(true);
        });

        it('should reject discount above 100%', () => {
            const result = CreateCustomerGroupSchema.safeParse({
                name: 'Bad Group',
                discountPercentage: 1.5, // 150% - invalid
            });
            expect(result.success).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // POS Sale Schema
    // -------------------------------------------------------------------
    describe('POSSaleLineItemSchema', () => {
        const validLineItem = {
            productId: '123e4567-e89b-12d3-a456-426614174000',
            productName: 'Test Product',
            sku: 'TEST-001',
            uom: 'PIECE',
            quantity: 2,
            unitPrice: 1500,
            costPrice: 1200,
            subtotal: 3000,
            taxAmount: 540,
        };

        it('should validate valid line item', () => {
            const result = POSSaleLineItemSchema.safeParse(validLineItem);
            expect(result.success).toBe(true);
        });

        it('should reject zero quantity', () => {
            const result = POSSaleLineItemSchema.safeParse({
                ...validLineItem,
                quantity: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should reject negative unit price', () => {
            const result = POSSaleLineItemSchema.safeParse({
                ...validLineItem,
                unitPrice: -100,
            });
            expect(result.success).toBe(false);
        });

        it('EVIDENCE line item accepts productType (strict schema no longer unrecognized_keys)', () => {
            const result = POSSaleLineItemSchema.safeParse({
                ...validLineItem,
                productType: 'service',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.productType).toBe('service');
            }
        });
    });

    describe('POSSaleSchema', () => {
        const validSale = {
            lineItems: [
                {
                    productId: '123e4567-e89b-12d3-a456-426614174000',
                    productName: 'Test Product',
                    sku: 'TEST-001',
                    uom: 'PIECE',
                    quantity: 2,
                    unitPrice: 1500,
                    costPrice: 1200,
                    subtotal: 3000,
                    taxAmount: 540,
                },
            ],
            subtotal: 3000,
            taxAmount: 540,
            totalAmount: 3540,
            paymentMethod: 'CASH' as const,
            amountTendered: 4000,
            changeGiven: 460,
        };

        it('should validate valid sale', () => {
            const result = POSSaleSchema.safeParse(validSale);
            expect(result.success).toBe(true);
        });

        it('should reject empty line items', () => {
            const result = POSSaleSchema.safeParse({
                ...validSale,
                lineItems: [],
            });
            expect(result.success).toBe(false);
        });

        it('should reject mismatched subtotal', () => {
            const result = POSSaleSchema.safeParse({
                ...validSale,
                subtotal: 9999, // Wrong
            });
            expect(result.success).toBe(false);
        });

        it('EVIDENCE restaurant-enabled retail POSSaleSchema accepts lineItems.productType', () => {
            // Mirrors production failure: restaurant-enabled client stamps productType;
            // .strict() previously threw unrecognized_keys → VALIDATION STOPPED SALE.
            const sale = {
                customerId: 'cda73fcb-cf42-4fc2-94d0-8d8cdf21b2d3',
                quoteId: '23964646-d8f0-4b3f-81a7-92f03646f251',
                idempotencyKey: 'pos_proof_product_type',
                lineItems: [
                    {
                        productId: '123e4567-e89b-12d3-a456-426614174000',
                        productName: 'Service / menu item',
                        sku: '',
                        uom: 'PIECE',
                        quantity: 1,
                        unitPrice: 2000,
                        costPrice: 0,
                        subtotal: 2000,
                        taxAmount: 0,
                        productType: 'service' as const,
                    },
                ],
                subtotal: 2000,
                discountAmount: 0,
                taxAmount: 0,
                totalAmount: 2000,
                paymentLines: [{ paymentMethod: 'CASH' as const, amount: 2000 }],
            };
            const result = POSSaleSchema.safeParse(sale);
            expect(result.success).toBe(true);
            if (!result.success) {
                // Surface Zod issues in evidence output if this regresses.
                expect(result.error.issues).toEqual([]);
            }
        });
    });
});
