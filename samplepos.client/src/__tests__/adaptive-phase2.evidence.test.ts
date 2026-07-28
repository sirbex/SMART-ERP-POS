import { describe, expect, it } from 'vitest';
import {
  resolveActionBarPlacement,
  resolveDialogPresentation,
  resolveFieldColumnSpan,
  resolveFormColumns,
} from '../lib/adaptiveForms';

describe('adaptive forms / dialogs (Phase 2)', () => {
  it('maps tiers to form column density without dropping fields', () => {
    expect(resolveFormColumns('mobile')).toBe(1);
    expect(resolveFormColumns('compact')).toBe(2);
    expect(resolveFormColumns('desktop')).toBe(3);
    expect(resolveFormColumns('wide')).toBe(4);
  });

  it('clamps field span to available columns (never removes)', () => {
    expect(resolveFieldColumnSpan('full', 1)).toBe(1);
    expect(resolveFieldColumnSpan('full', 4)).toBe(4);
    expect(resolveFieldColumnSpan(2, 1)).toBe(1);
    expect(resolveFieldColumnSpan(3, 2)).toBe(2);
    expect(resolveFieldColumnSpan(2, 3)).toBe(2);
  });

  it('maps tiers to dialog presentation full / near-full / modal', () => {
    expect(resolveDialogPresentation('mobile')).toBe('full');
    expect(resolveDialogPresentation('compact')).toBe('near-full');
    expect(resolveDialogPresentation('desktop')).toBe('modal');
    expect(resolveDialogPresentation('wide')).toBe('modal');
  });

  it('uses sticky actions on mobile/compact and inline on desktop+', () => {
    expect(resolveActionBarPlacement('mobile')).toBe('sticky');
    expect(resolveActionBarPlacement('compact')).toBe('sticky');
    expect(resolveActionBarPlacement('desktop')).toBe('inline');
    expect(resolveActionBarPlacement('wide')).toBe('inline');
  });
});
