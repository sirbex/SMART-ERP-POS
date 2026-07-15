/**
 * Proof: admins can enable Treasury Documents via Settings → Tax UI
 * (not API/SQL-only). Wired end-to-end to system_settings.treasury_document_enabled.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSystemSettings } from '../../../../shared/types/systemSettings.js';
import type { SystemSettingsDbRow } from '../../../../shared/types/systemSettings.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function baseDbRow(overrides: Partial<SystemSettingsDbRow> = {}): SystemSettingsDbRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    business_name: 'Test Co',
    currency_code: 'USD',
    currency_symbol: '$',
    date_format: 'MM/DD/YYYY',
    time_format: '12h',
    timezone: 'UTC',
    tax_enabled: true,
    default_tax_rate: '15',
    tax_name: 'VAT',
    tax_number: null,
    tax_inclusive: false,
    tax_rates: [],
    receipt_printer_enabled: false,
    receipt_printer_name: null,
    receipt_paper_width: 80,
    receipt_auto_print: false,
    receipt_show_logo: false,
    receipt_logo_url: null,
    receipt_header_text: null,
    receipt_footer_text: null,
    receipt_show_tax_breakdown: false,
    receipt_show_qr_code: false,
    invoice_printer_enabled: false,
    invoice_printer_name: null,
    invoice_paper_size: 'A4',
    invoice_template: 'default',
    invoice_show_logo: false,
    invoice_show_payment_terms: false,
    invoice_default_payment_terms: null,
    pos_session_policy: 'DISABLED',
    pos_transaction_mode: 'DirectSale',
    low_stock_alerts_enabled: false,
    low_stock_threshold: 0,
    is_multistore_enabled: false,
    treasury_document_enabled: false,
    loss_quarantine_document_enabled: false,
    transfer_policy_require_approval_all: true,
    transfer_policy_allow_direct: true,
    transfer_policy_value_threshold: null,
    transfer_policy_qty_threshold: null,
    transfer_policy_special_stores_require_approval: true,
    transfer_assortment_expansion_policy: 'PROMPT',
    expiry_automation_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as SystemSettingsDbRow;
}

describe('Treasury Settings admin enablement proof', () => {
  it('Settings → Tax UI exposes Enable Treasury Documents checkbox', () => {
    const tab = readRepo('samplepos.client/src/pages/settings/tabs/SystemSettingsTab.tsx');
    expect(tab).toMatch(/id="treasuryDocumentEnabled"/);
    expect(tab).toMatch(/Enable Treasury Documents/);
    expect(tab).toMatch(/treasuryDocumentEnabled:\s*settings\.treasuryDocumentEnabled/);
    expect(tab).toMatch(/onSave\(formData\)/);
    // Lives under TaxSettings (tax enable tab), not a separate orphan page
    expect(tab).toMatch(/function TaxSettings/);
    const taxFnStart = tab.indexOf('function TaxSettings');
    const flagId = tab.indexOf('id="treasuryDocumentEnabled"');
    expect(taxFnStart).toBeGreaterThan(-1);
    expect(flagId).toBeGreaterThan(taxFnStart);
  });

  it('Treasury disabled notice directs admins to Settings → Tax (no raw column / API copy)', () => {
    const notice = readRepo(
      'samplepos.client/src/components/treasury/TreasuryFeatureDisabledNotice.tsx',
    );
    expect(notice).toMatch(/Settings → Tax → Enable Treasury Documents/);
    expect(notice).not.toMatch(/treasury_document_enabled/);
    expect(notice).not.toMatch(/POST \/api\/treasury\/documents/);

    const page = readRepo(
      'samplepos.client/src/pages/accounting/TreasuryDocumentsPage.tsx',
    );
    expect(page).toMatch(/TreasuryFeatureDisabledNotice/);
    expect(page).not.toMatch(/treasury_document_enabled/);
  });

  it('liquidity workflows are merged into Banking (no duplicate Advanced nav)', () => {
    const layout = readRepo('samplepos.client/src/components/AccountingLayout.tsx');
    expect(layout).not.toMatch(/path:\s*'\/accounting\/deposit-worksheet'/);
    expect(layout).not.toMatch(/path:\s*'\/accounting\/treasury-transfer'/);
    expect(layout).not.toMatch(/path:\s*'\/accounting\/petty-cash'/);
    expect(layout).not.toMatch(/path:\s*'\/accounting\/treasury'/);
    expect(layout).toMatch(/path:\s*'\/accounting\/banking'/);

    const banking = readRepo('samplepos.client/src/pages/accounting/BankingPage.tsx');
    expect(banking).toMatch(/value="undeposited"/);
    expect(banking).toMatch(/value="move-money"/);
    expect(banking).toMatch(/value="petty-cash"/);
    expect(banking).toMatch(/value="documents"/);
    expect(banking).toMatch(/embedded/);
  });

  it('PATCH /system-settings requires admin.update and persists treasuryDocumentEnabled', () => {
    const routes = readRepo(
      'SamplePOS.Server/src/modules/system-settings/systemSettingsRoutes.ts',
    );
    expect(routes).toMatch(/requirePermission\('admin\.update'\)/);
    expect(routes).toMatch(/\.patch\('/);

    const repo = readRepo(
      'SamplePOS.Server/src/modules/system-settings/systemSettingsRepository.ts',
    );
    expect(repo).toMatch(/updates\.treasuryDocumentEnabled/);
    expect(repo).toMatch(/treasury_document_enabled\s*=\s*\$/);
  });

  it('GET /treasury/enabled reads system_settings.treasury_document_enabled', () => {
    const settings = readRepo(
      'SamplePOS.Server/src/modules/treasury/treasurySettings.ts',
    );
    expect(settings).toMatch(/treasury_document_enabled/);
    const routes = readRepo('SamplePOS.Server/src/modules/treasury/treasuryRoutes.ts');
    expect(routes).toMatch(/\/enabled/);
    expect(existsSync(path.join(repoRoot, 'shared/sql/541_treasury_document_foundation.sql'))).toBe(
      true,
    );
  });

  it('normalizeSystemSettings maps DB flag (default false, true when set)', () => {
    const off = normalizeSystemSettings(baseDbRow({ treasury_document_enabled: false }));
    expect(off.treasuryDocumentEnabled).toBe(false);

    const on = normalizeSystemSettings(baseDbRow({ treasury_document_enabled: true }));
    expect(on.treasuryDocumentEnabled).toBe(true);

    const missing = normalizeSystemSettings(
      baseDbRow({ treasury_document_enabled: undefined as unknown as boolean }),
    );
    expect(missing.treasuryDocumentEnabled).toBe(false);
  });

  it('shared UpdateSystemSettingsDto includes treasuryDocumentEnabled', () => {
    const types = readRepo('shared/types/systemSettings.ts');
    expect(types).toMatch(/treasuryDocumentEnabled\?: boolean/);
    expect(types).toMatch(/treasury_document_enabled/);
  });
});
