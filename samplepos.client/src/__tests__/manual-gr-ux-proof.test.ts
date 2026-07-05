/**
 * Proof tests for Manual GR UX remediation deliverables.
 * Run: npm test -- --run src/__tests__/manual-gr-ux-proof.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Manual GR UX remediation — static proof', () => {
  it('ManualGRModal uses ModalContainer (SSOT with PO workspace)', () => {
    const src = readSrc('components/inventory/ManualGRModal.tsx');
    expect(src).toContain('ModalContainer');
    expect(src).not.toContain('DialogContent');
    expect(src).toContain('BusinessRulesInfo');
    expect(src).toContain('footer={');
  });

  it('QuickCreateProductModal stacks above transaction guard (nested panel z-index)', () => {
    const src = readSrc('components/inventory/shared/QuickCreateProductModal.tsx');
    expect(src).toContain('ZINDEX.NESTED_PANEL');
    expect(src).toContain('createPortal');
    expect(src).not.toContain('z-[60]');
    // Babel/Vite rejects mixing ?? and || without parentheses — caused browser 500 on module load
    expect(src).not.toMatch(/purchaseUomId:\s*created\.purchaseUomId\s*\?\?\s*values\.purchaseUomId\s*\|\|/);
  });

  it('QuickCreateProductModal has sticky header, scroll body, sticky footer', () => {
    const src = readSrc('components/inventory/shared/QuickCreateProductModal.tsx');
    expect(src).toContain('flex min-h-0 flex-1 flex-col');
    expect(src).toContain('overflow-y-auto overscroll-contain');
    expect(src).toContain('shrink-0');
    expect(src).toContain('focusFirstProductValidationError');
  });

  it('shared DatePicker uses responsive viewport-scaled layout', () => {
    const src = readSrc('components/ui/date-picker.tsx');
    expect(src).toContain('md:flex-row');
    expect(src).toContain('lg:w-[min(42rem');
    expect(src).toContain('align="center"');
    expect(src).toContain('collisionPadding');
  });

  it('shared Popover has viewport collision defaults', () => {
    const src = readSrc('components/ui/popover.tsx');
    expect(src).toContain('collisionPadding');
    expect(src).toContain('avoidCollisions');
    expect(src).toContain('z-[3500]');
  });

  it('Dialog reserves space for close button and supports compound layout', () => {
    const src = readSrc('components/ui/dialog.tsx');
    expect(src).toContain('pr-12 sm:pr-14');
    expect(src).toContain('DialogBody');
    expect(src).toContain('DialogFooter');
    expect(src).toContain('usesCompoundDialogLayout');
  });

  it('GoodsReceiptsPage wires draft cancel hook and permission gate', () => {
    const src = readSrc('pages/inventory/GoodsReceiptsPage.tsx');
    expect(src).toContain('useCancelGoodsReceipt');
    expect(src).toContain('canUpdateGR');
    expect(src).toContain('handleCancelDraft');
    expect(src).toContain('Cancel Draft');
  });

  it('InventoryLayout uses shared nav overflow + portaled More menu', () => {
    const src = readSrc('components/InventoryLayout.tsx');
    expect(src).toContain('useNavOverflow');
    expect(src).toContain('PopoverContent');
    expect(src).not.toContain('overflow-x-auto');
  });
});
