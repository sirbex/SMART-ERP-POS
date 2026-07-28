import { describe, expect, it } from 'vitest';
import { resolveLayoutShellTokens, resolveLayoutTier } from '../lib/layoutTiers';
import {
  resolveGridPresentation,
  selectCardColumns,
  selectDetailColumns,
  selectTableColumns,
  type AdaptiveColumnPolicy,
} from '../lib/adaptiveDataGrid';

describe('adaptive navigation modes (Phase 1)', () => {
  it('maps each tier to drawer / rail / sidebar', () => {
    expect(resolveLayoutShellTokens(resolveLayoutTier(375)).navMode).toBe('drawer');
    expect(resolveLayoutShellTokens(resolveLayoutTier(800)).navMode).toBe('rail');
    expect(resolveLayoutShellTokens(resolveLayoutTier(1280)).navMode).toBe('sidebar');
    expect(resolveLayoutShellTokens(resolveLayoutTier(1800)).navMode).toBe('sidebar');
  });
});

describe('adaptive data grid column policy (Phase 1)', () => {
  const columns: AdaptiveColumnPolicy[] = [
    { id: 'invoice', priority: 'primary', cardRole: 'title' },
    { id: 'status', priority: 'primary', cardRole: 'status' },
    { id: 'balance', priority: 'primary', cardRole: 'amount' },
    { id: 'date', priority: 'secondary', cardRole: 'meta' },
    { id: 'payments', priority: 'secondary', cardRole: 'meta' },
    { id: 'ref', priority: 'detail', cardRole: 'hidden' },
    { id: 'due', priority: 'detail', cardRole: 'meta' },
  ];

  it('resolves cards / reduced / full from layout tier', () => {
    expect(resolveGridPresentation('mobile')).toBe('cards');
    expect(resolveGridPresentation('compact')).toBe('reduced');
    expect(resolveGridPresentation('desktop')).toBe('full');
    expect(resolveGridPresentation('wide')).toBe('full');
  });

  it('hides detail columns in reduced table, keeps primary+secondary', () => {
    const reduced = selectTableColumns(columns, 'reduced').map((c) => c.id);
    expect(reduced).toEqual(['invoice', 'status', 'balance', 'date', 'payments']);
    expect(selectTableColumns(columns, 'full').map((c) => c.id)).toHaveLength(7);
    expect(selectTableColumns(columns, 'cards')).toEqual([]);
  });

  it('builds card surface from cardRole (excluding hidden)', () => {
    const cardIds = selectCardColumns(columns).map((c) => c.id);
    expect(cardIds).toEqual(['invoice', 'status', 'balance', 'date', 'payments', 'due']);
    expect(selectDetailColumns(columns).map((c) => c.id)).toEqual(['ref', 'due']);
  });
});
