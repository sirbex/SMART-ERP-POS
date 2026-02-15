// Invoice Settings Service

import { Pool } from 'pg';
import * as invoiceSettingsRepository from './invoiceSettingsRepository.js';
import type { InvoiceSettings } from './invoiceSettingsRepository.js';

export async function getSettings(pool: Pool): Promise<InvoiceSettings> {
  let settings = await invoiceSettingsRepository.getInvoiceSettings(pool);

  if (!settings) {
    // Auto-initialize with defaults if not exists
    settings = await invoiceSettingsRepository.initializeDefaults(pool);
  }

  return settings;
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

  const updated = await invoiceSettingsRepository.updateInvoiceSettings(pool, data);
  return updated;
}
