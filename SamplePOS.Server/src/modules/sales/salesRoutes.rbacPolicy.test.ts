import { describe, expect, it } from '@jest/globals';
import {
  canProcessRefundType,
  shouldRestrictSalesToOwnUser,
  sanitizeSaleFinancialFields,
  canViewSaleFinancials,
} from '@shared/authorization/salesPolicy.js';

describe('sales RBAC policy helpers', () => {
  describe('shouldRestrictSalesToOwnUser', () => {
    it('restricts legacy cashier sessions with no RBAC permissions', () => {
      expect(shouldRestrictSalesToOwnUser([], 'CASHIER')).toBe(true);
    });

    it('does not restrict when sales.read is granted', () => {
      expect(shouldRestrictSalesToOwnUser(['sales.read'], 'CASHIER')).toBe(false);
    });

    it('restricts transactional users without sales.read', () => {
      expect(shouldRestrictSalesToOwnUser(['pos.create'], 'STAFF')).toBe(true);
    });

    it('does not restrict viewers with sales.read regardless of legacy role', () => {
      expect(shouldRestrictSalesToOwnUser(['sales.read'], 'STAFF')).toBe(false);
    });
  });

  describe('canProcessRefundType', () => {
    it('allows refund when explicit refund permission exists', () => {
      expect(canProcessRefundType('REFUND', ['sales.refund'], 'CASHIER')).toBe(true);
    });

    it('blocks plain refund when only exchange permission exists', () => {
      expect(canProcessRefundType('REFUND', ['sales.exchange'], 'CASHIER')).toBe(false);
    });

    it('allows exchange when exchange permission exists', () => {
      expect(canProcessRefundType('EXCHANGE', ['sales.exchange'], 'CASHIER')).toBe(true);
    });

    it('falls back to legacy manager sales authority when no RBAC permissions exist', () => {
      expect(canProcessRefundType('REFUND', [], 'MANAGER')).toBe(true);
    });

    it('does not grant cashier refund authority without explicit RBAC permission', () => {
      expect(canProcessRefundType('REFUND', [], 'CASHIER')).toBe(false);
    });
  });

  describe('sanitizeSaleFinancialFields', () => {
    const sale = { id: '1', totalAmount: 100, profit: 20, totalCost: 80 };

    it('strips financial fields for cashiers without financial view permission', () => {
      const result = sanitizeSaleFinancialFields(sale, ['sales.read'], 'CASHIER');
      expect(result.profit).toBeUndefined();
      expect(result.totalCost).toBeUndefined();
    });

    it('keeps financial fields when reports.financial_view is granted', () => {
      const result = sanitizeSaleFinancialFields(sale, ['sales.read', 'reports.financial_view'], 'CASHIER');
      expect(result.profit).toBe(20);
    });

    it('keeps financial fields for legacy manager when RBAC not loaded', () => {
      expect(canViewSaleFinancials([], 'MANAGER')).toBe(true);
    });
  });
});
