/**
 * Regression: nested modals inside transactional SlideDrawer must sit above
 * the transaction guard (ZINDEX.PANEL = 975), not at legacy z-[60].
 */
import { describe, it, expect } from 'vitest';
import { ZINDEX } from '@/hooks/useTransactionGuard';

describe('transaction guard z-index stacking', () => {
  it('nested panels render above transactional drawer panels', () => {
    expect(ZINDEX.NESTED_PANEL).toBeGreaterThan(ZINDEX.PANEL);
    expect(ZINDEX.PANEL).toBeGreaterThan(ZINDEX.OVERLAY);
    expect(ZINDEX.OVERLAY).toBeGreaterThan(60);
  });
});
