// Invoice Settings Service

import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as invoiceSettingsRepository from './invoiceSettingsRepository.js';
import type { InvoiceSettings } from './invoiceSettingsRepository.js';
import { normalizePaymentAccounts } from '../../../../shared/utils/paymentAccountsVisibility.js';

function withNormalizedPaymentAccounts(settings: InvoiceSettings): InvoiceSettings {
  const normalized = normalizePaymentAccounts(settings.paymentAccounts || []).map((a) => ({
    id: a.id || randomUUID(),
    type: (a.type === 'BANK' || a.type === 'WALLET' ? a.type : 'MOBILE_MONEY') as
      | 'BANK'
      | 'MOBILE_MONEY'
      | 'WALLET',
    provider: a.provider,
    accountName: a.accountName,
    accountNumber: a.accountNumber,
    branchOrCode: a.branchOrCode,
    isActive: a.isActive,
    showOnReceipt: a.showOnReceipt,
    showOnInvoice: a.showOnInvoice,
    sortOrder: a.sortOrder,
  }));
  return { ...settings, paymentAccounts: normalized };
}

export async function getSettings(pool: Pool): Promise<InvoiceSettings> {
  let settings = await invoiceSettingsRepository.getInvoiceSettings(pool);

  if (!settings) {
    // Auto-initialize with defaults if not exists
    settings = await invoiceSettingsRepository.initializeDefaults(pool);
  }

  return withNormalizedPaymentAccounts(settings);
}

export async function updateSettings(
  pool: Pool,
  data: Partial<Omit<InvoiceSettings, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<InvoiceSettings> {
  // Validate template type
  const validTemplates = ['modern', 'classic', 'minimal', 'professional'];
  if (data.templateType && !validTemplates.includes(data.templateType)) {
    throw new Error(`Invalid template type. Must be one of: ${validTemplates.join(', ')}`);
  }

  // Validate color format
  const colorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (data.primaryColor && !colorRegex.test(data.primaryColor)) {
    throw new Error('Primary color must be in hex format (#RRGGBB)');
  }
  if (data.secondaryColor && !colorRegex.test(data.secondaryColor)) {
    throw new Error('Secondary color must be in hex format (#RRGGBB)');
  }

  // Persist normalized flags so Settings UI and PDF always agree (no silent default skew).
  const writeData = { ...data };
  if (writeData.paymentAccounts !== undefined) {
    writeData.paymentAccounts = withNormalizedPaymentAccounts({
      ...(writeData as InvoiceSettings),
      paymentAccounts: writeData.paymentAccounts,
    } as InvoiceSettings).paymentAccounts;
  }

  const updated = await invoiceSettingsRepository.updateInvoiceSettings(pool, writeData);
  return withNormalizedPaymentAccounts(updated);
}
