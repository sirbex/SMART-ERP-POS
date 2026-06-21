/**
 * Regression: POSModal must wrap its content in a Radix DialogPortal.
 *
 * Without the portal, the modal's DOM tree mounts inline at the
 * `<POSModal>` call site, so any <form> inside the modal becomes a
 * descendant of the page's <form> (e.g. NewQuotationPage). HTML forbids
 * nested forms — the inner submit bubbles to the outer form, the modal
 * mutation never fires, and the modal silently closes without saving.
 *
 * This was the cause of the "adding a new customer through quote silently
 * fails" bug. We don't have jsdom in this test runner so we lock the
 * structural invariant at source level — any future edit that removes the
 * DialogPortal wrapper will break this test before the bug reaches users.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const POSModalPath = resolve(here, '../components/pos/POSModal.tsx');
const source = readFileSync(POSModalPath, 'utf8');

describe('POSModal — DialogPortal invariant', () => {
  it('imports DialogPortal from @radix-ui/react-dialog', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bDialogPortal\b[^}]*\}\s*from\s*['"]@radix-ui\/react-dialog['"]/);
  });

  it('wraps the DialogContent in a DialogPortal so modals escape parent forms', () => {
    const portalOpen = source.indexOf('<DialogPortal>');
    const contentOpen = source.indexOf('<DialogContent');
    const contentClose = source.indexOf('</DialogContent>');
    const portalClose = source.indexOf('</DialogPortal>');
    expect(portalOpen).toBeGreaterThan(-1);
    expect(contentOpen).toBeGreaterThan(portalOpen);
    expect(contentClose).toBeGreaterThan(contentOpen);
    expect(portalClose).toBeGreaterThan(contentClose);
  });

  it('does not render DialogContent as a direct child of <Dialog> (would inline-mount inside parent form)', () => {
    expect(source).not.toMatch(/<Dialog\s+open=[^>]*>\s*<DialogOverlay/);
    expect(source).not.toMatch(/<Dialog\s+open=[^>]*>\s*<DialogContent/);
  });
});
