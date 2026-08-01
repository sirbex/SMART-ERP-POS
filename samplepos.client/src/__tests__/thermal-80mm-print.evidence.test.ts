/**
 * Evidence: 80mm thermal print — readable fonts, fixed roll height (default 297mm).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THERMAL_ROLL_HEIGHT_MM,
  buildThermalPrintCss,
  ensureThermalPrintCss,
  htmlHasThermalPageSize,
  normalizeThermalPageSizeForPrint,
} from '../lib/thermalPrintCss';
import { buildThermalGuestDocumentHtml } from '../lib/thermalGuestDocument';

const here = dirname(fileURLToPath(import.meta.url));

describe('thermal 80mm continuous-roll print SSOT', () => {
  it('declares 80×297mm @page by default (readable; not auto / not 600mm)', () => {
    expect(THERMAL_ROLL_HEIGHT_MM).toBe(297);
    const css = buildThermalPrintCss(80);
    expect(css).toMatch(/@page\s*\{/);
    expect(css).toMatch(/size:\s*80mm\s+297mm/);
    expect(css).not.toMatch(/size:\s*80mm\s+auto/);
    expect(css).not.toMatch(/size:\s*80mm\s+600mm/);
  });

  it('normalizes auto / short / tall heights to SSOT 297mm', () => {
    expect(normalizeThermalPageSizeForPrint('@page { size: 80mm auto; }')).toMatch(
      /size:\s*80mm\s+297mm/,
    );
    expect(normalizeThermalPageSizeForPrint('@page { size: 80mm 60mm; }')).toMatch(
      /size:\s*80mm\s+297mm/,
    );
    expect(normalizeThermalPageSizeForPrint('@page { size: 80mm 600mm; }')).toMatch(
      /size:\s*80mm\s+297mm/,
    );
  });

  it('guest receipt HTML embeds thermal roll CSS', () => {
    const html = buildThermalGuestDocumentHtml({
      kind: 'RECEIPT',
      title: 'RECEIPT',
      documentNumber: 'S-1',
      printedAt: 'now',
      meta: [{ label: 'Cashier', value: 'Ada' }],
      items: Array.from({ length: 40 }, (_, i) => ({
        name: `Item ${i + 1}`,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
      })),
      totalAmount: 40000,
      footerLines: ['Thank you'],
      companyName: 'Test Cafe',
    });
    expect(htmlHasThermalPageSize(html)).toBe(true);
    expect(html).toMatch(/size:\s*80mm\s+297mm/);
    expect(html).toMatch(/font-size:\s*15px/);
    expect(html).toMatch(/font-weight:\s*700/);
  });

  it('ensureThermalPrintCss injects when missing; idempotent when present', () => {
    const bare = '<!DOCTYPE html><html><head></head><body>hi</body></html>';
    const once = ensureThermalPrintCss(bare, 80);
    expect(once).toContain('data-thermal-roll');
    expect(once).toMatch(/size:\s*80mm\s+297mm/);
    const twice = ensureThermalPrintCss(once, 80);
    expect(twice.match(/data-thermal-roll/g)?.length).toBe(1);
  });

  it('print.ts keeps iframe until afterprint; KOT uses shared path', () => {
    const print = readFileSync(resolve(here, '../lib/print.ts'), 'utf8');
    expect(print).toMatch(/ensureThermalPrintCss/);
    expect(print).toMatch(/width = '80mm'/);
    expect(print).toMatch(/afterprint/);

    const kot = readFileSync(resolve(here, '../lib/printRestaurant.ts'), 'utf8');
    expect(kot).toMatch(/buildThermalPrintCss/);
    expect(kot).toMatch(/renderThermalTicketEscPos/);
    expect(kot).toMatch(/try origins sequentially/);
  });
});
