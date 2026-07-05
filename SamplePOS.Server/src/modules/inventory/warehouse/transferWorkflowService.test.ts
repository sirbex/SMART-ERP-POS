/**
 * Store transfer workflow resolution — unit regression (Phase 14).
 * Run: npm run test:warehouse-network
 */
import { describe, it, expect } from '@jest/globals';
import {
    buildWorkflowCapabilities,
    expandLegacyTransferPermissions,
    permissionForWorkflowMode,
    policyRequiresApproval,
    resolveCreateWorkflowMode,
    type TransferWorkflowContext,
} from './transferWorkflowService.js';
import { TRANSFER_PERMISSION_KEYS } from '../../../../../shared/types/transferWorkflow.js';
import type { StoreLocation } from '../../../../../shared/types/warehouseNetwork.js';

function store(overrides: Partial<StoreLocation> = {}): StoreLocation {
    return {
        id: 'store-1',
        code: 'MAIN',
        name: 'Main',
        storeType: 'MAIN',
        isDefaultReceiving: true,
        isPosSelling: false,
        isActive: true,
        parentStoreId: null,
        notes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function ctx(overrides: Partial<TransferWorkflowContext> = {}): TransferWorkflowContext {
    return {
        permissions: new Set([TRANSFER_PERMISSION_KEYS.DIRECT]),
        policy: {
            requireApprovalAll: false,
            allowDirect: true,
            valueThreshold: null,
            qtyThreshold: null,
            specialStoresRequireApproval: true,
        },
        dto: { lines: [{ productLotId: 'lot-1', quantity: 1 }] },
        sourceStore: store({ storeType: 'MAIN' }),
        destinationStore: store({ id: 'sell-1', code: 'SELL', storeType: 'SELLING', isPosSelling: true }),
        totalQty: 1,
        totalInventoryValue: 100,
        ...overrides,
    };
}

describe('transferWorkflowService', () => {
    describe('expandLegacyTransferPermissions', () => {
        it('grants all transfer keys when legacy approve is present', () => {
            const expanded = expandLegacyTransferPermissions(
                new Set([TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE]),
            );
            expect(expanded.has(TRANSFER_PERMISSION_KEYS.DIRECT)).toBe(true);
            expect(expanded.has(TRANSFER_PERMISSION_KEYS.RECEIVE)).toBe(true);
        });
    });

    describe('policyRequiresApproval', () => {
        it('returns true when requireApprovalAll is set', () => {
            expect(
                policyRequiresApproval({
                    policy: { ...ctx().policy, requireApprovalAll: true },
                    sourceStore: store(),
                    destinationStore: store({ storeType: 'SELLING' }),
                    totalQty: 1,
                    totalInventoryValue: 1,
                }),
            ).toBe(true);
        });

        it('returns true when value exceeds threshold', () => {
            expect(
                policyRequiresApproval({
                    policy: { ...ctx().policy, valueThreshold: 50 },
                    sourceStore: store(),
                    destinationStore: store({ storeType: 'SELLING' }),
                    totalQty: 1,
                    totalInventoryValue: 51,
                }),
            ).toBe(true);
        });

        it('returns false for MAIN → SELLING under open policy', () => {
            expect(
                policyRequiresApproval({
                    policy: ctx().policy,
                    sourceStore: store({ storeType: 'MAIN' }),
                    destinationStore: store({ storeType: 'SELLING' }),
                    totalQty: 5,
                    totalInventoryValue: 500,
                }),
            ).toBe(false);
        });
    });

    describe('resolveCreateWorkflowMode', () => {
        it('selects DIRECT when permitted and policy allows', () => {
            expect(resolveCreateWorkflowMode(ctx())).toBe('DIRECT');
        });

        it('selects REQUEST when direct is blocked by approval policy', () => {
            expect(
                resolveCreateWorkflowMode(
                    ctx({
                        policy: { ...ctx().policy, requireApprovalAll: true },
                        permissions: new Set([
                            TRANSFER_PERMISSION_KEYS.DIRECT,
                            TRANSFER_PERMISSION_KEYS.REQUEST,
                        ]),
                    }),
                ),
            ).toBe('REQUEST');
        });

        it('selects EMERGENCY_OVERRIDE when override reason and permission exist', () => {
            expect(
                resolveCreateWorkflowMode(
                    ctx({
                        dto: {
                            lines: [{ productLotId: 'lot-1', quantity: 1 }],
                            overrideReason: 'Emergency restock',
                        },
                        permissions: new Set([TRANSFER_PERMISSION_KEYS.OVERRIDE]),
                    }),
                ),
            ).toBe('EMERGENCY_OVERRIDE');
        });

        it('throws when caller lacks create permissions', () => {
            expect(() =>
                resolveCreateWorkflowMode(ctx({ permissions: new Set() })),
            ).toThrow(/Insufficient permissions/);
        });
    });

    describe('buildWorkflowCapabilities', () => {
        it('exposes DIRECT as primary when allowed', () => {
            const caps = buildWorkflowCapabilities(
                new Set([TRANSFER_PERMISSION_KEYS.DIRECT]),
                ctx().policy,
            );
            expect(caps.primaryCreateMode).toBe('DIRECT');
            expect(caps.canDirect).toBe(true);
        });
    });

    describe('permissionForWorkflowMode', () => {
        it('maps modes to permission keys', () => {
            expect(permissionForWorkflowMode('DIRECT')).toBe(TRANSFER_PERMISSION_KEYS.DIRECT);
            expect(permissionForWorkflowMode('REQUEST')).toBe(TRANSFER_PERMISSION_KEYS.REQUEST);
            expect(permissionForWorkflowMode('EMERGENCY_OVERRIDE')).toBe(
                TRANSFER_PERMISSION_KEYS.OVERRIDE,
            );
        });
    });
});
