/**
 * Evidence: 80mm thermal print declares paper width (not A4) and keeps the
 * print iframe alive until afterprint so Windows drivers can read the job.
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
} from '../lib/thermalPrintCss';
import { buildThermalGuestDocumentHtml } from '../lib/thermalGuestDocument';

const here = dirname(fileURLToPath(import.meta.url));

describe('thermal 80mm continuous-roll print SSOT', () => {
  it('declares 80mm @page with sane roll height (not A4 / not 3000mm)', () => {
    const css = buildThermalPrintCss(80);
    expect(css).toMatch(/@page\s*\{/);
    expect(css).toContain('80mm');
    expect(css).toMatch(new RegExp(`size:\\s*80mm\\s+${THERMAL_ROLL_HEIGHT_MM}mm`));
    expect(THERMAL_ROLL_HEIGHT_MM).toBeGreaterThanOrEqual(400);
    expect(THERMAL_ROLL_HEIGHT_MM).toBeLessThanOrEqual(1000);
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
    expect(html).toContain('80mm');
    expect(html).toContain(`${THERMAL_ROLL_HEIGHT_MM}mm`);
    expect(html).toMatch(/page-break-inside:\s*avoid/);
    expect(html).toMatch(/font-size:\s*15px/);
    expect(html).toMatch(/font-weight:\s*700/);
    expect(html).toMatch(/color:\s*#000/);
  });

  it('ensureThermalPrintCss injects when missing; idempotent when present', () => {
    const bare = '<!DOCTYPE html><html><head></head><body>hi</body></html>';
    const once = ensureThermalPrintCss(bare, 80);
    expect(once).toContain('data-thermal-roll');
    expect(once).toMatch(new RegExp(`size:\\s*80mm\\s+${THERMAL_ROLL_HEIGHT_MM}mm`));
    const twice = ensureThermalPrintCss(once, 80);
    expect(twice.match(/data-thermal-roll/g)?.length).toBe(1);
  });

  it('print.ts keeps iframe until afterprint; not 0×0; KOT uses shared path', () => {
    const print = readFileSync(resolve(here, '../lib/print.ts'), 'utf8');
    expect(print).toMatch(/ensureThermalPrintCss/);
    expect(print).toMatch(/width = '80mm'/);
    expect(print).toMatch(/afterprint/);
    expect(print).not.toMatch(/style\.width = '0'/);
    expect(print).toMatch(/scrollHeight/);

    const kot = readFileSync(resolve(here, '../lib/printRestaurant.ts'), 'utf8');
    expect(kot).toMatch(/printHtmlDocument/);
    expect(kot).toMatch(/buildThermalPrintCss/);
  });
});
