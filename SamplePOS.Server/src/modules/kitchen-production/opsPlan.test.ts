/**
 * Pure kitchen ops hub next-action rules (Phase 6).
 */

import {
  canQuickProduce,
  canStartService,
  recommendKitchenOpsAction,
} from '../../../../shared/kitchen-production/opsPlan.js';

describe('kitchen opsPlan', () => {
  it('recommends PRODUCE when no stock and no open service', () => {
    const a = recommendKitchenOpsAction({
      postedBatchCount: 0,
      preparedStockLines: 0,
      openSessionCount: 0,
      openSessions: [],
      postedWasteCount: 0,
    });
    expect(a.code).toBe('PRODUCE');
    expect(a.primary).toBe(true);
  });

  it('recommends START_SERVICE when FG ready but no session', () => {
    const a = recommendKitchenOpsAction({
      postedBatchCount: 1,
      preparedStockLines: 2,
      openSessionCount: 0,
      openSessions: [],
      postedWasteCount: 0,
    });
    expect(a.code).toBe('START_SERVICE');
  });

  it('recommends SELL_COVERS while open session under capacity', () => {
    const a = recommendKitchenOpsAction({
      postedBatchCount: 1,
      preparedStockLines: 1,
      openSessionCount: 1,
      openSessions: [{ soldCovers: 10, expectedCovers: 50 }],
      postedWasteCount: 0,
    });
    expect(a.code).toBe('SELL_COVERS');
  });

  it('recommends END_SERVICE when capacity met', () => {
    const a = recommendKitchenOpsAction({
      postedBatchCount: 1,
      preparedStockLines: 1,
      openSessionCount: 1,
      openSessions: [{ soldCovers: 50, expectedCovers: 50 }],
      postedWasteCount: 0,
    });
    expect(a.code).toBe('END_SERVICE');
  });

  it('validates one-shot produce / start service inputs', () => {
    expect(canQuickProduce({ outputProductId: 'x', outputQtyBase: 10 })).toBe(true);
    expect(canQuickProduce({ outputProductId: '', outputQtyBase: 10 })).toBe(false);
    expect(canStartService({ name: 'Lunch', coverProductId: 'c', expectedCovers: 40 })).toBe(
      true,
    );
    expect(canStartService({ name: ' ', coverProductId: 'c', expectedCovers: 40 })).toBe(false);
  });
});
