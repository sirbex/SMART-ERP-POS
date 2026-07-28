import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Viewport fill only — progressive disclosure SSOT: adaptive-chrome.ssot.evidence.test.ts */
describe('restaurant ticket viewport (adaptive shell fill)', () => {
  it('Restaurant POS fills the AdaptiveAppShell scrollport instead of 100vh calc', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(page).toContain('data-fill-viewport="true"');
    expect(page).not.toMatch(/h-\[calc\(100vh-3rem\)\]/);
    expect(page).toContain('data-ticket-lines="true"');
    expect(page).toContain('lg:grid-rows-1');
    expect(page).toContain('data-fill-viewport="true"');
    expect(page).toContain('AdaptiveDialog');
  });

  it('page-container CSS reserves height for fill-viewport surfaces', () => {
    const css = readFileSync(resolve(here, '../index.css'), 'utf8');
    expect(css).toContain("[data-fill-viewport='true']");
    expect(css).toContain('overflow: hidden');
    expect(css).toMatch(
      /\.page-container-inner:has\(> \[data-fill-viewport='true'\]\)\s*>\s*\[data-fill-viewport='true'\]/,
    );
  });
});
