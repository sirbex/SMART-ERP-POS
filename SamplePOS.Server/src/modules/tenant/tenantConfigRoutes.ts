/**
 * Tenant Config Routes
 *
 * Public endpoint (no auth required) that returns the tenant's
 * branding, currency, locale, and feature flags.
 *
 * Resolution order:
 *   1. req.tenant (set by tenantMiddleware from DB)
 *   2. Fallback to config/tenants/<slug>.json file
 *   3. Fallback to config/tenants/default.json
 *
 * This allows the frontend to configure itself before the user
 * logs in (login page branding, currency display, etc.).
 */

import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TenantConfig } from '../../../../shared/types/tenantConfig.js';
import type { Request, Response } from 'express';
import logger from '../../utils/logger.js';

const router = express.Router();

// Cache loaded file configs in memory (they rarely change)
const fileConfigCache = new Map<string, TenantConfig>();

/**
 * Load a tenant config from the config/tenants/ directory.
 * Returns null if the file doesn't exist.
 */
function loadFileConfig(slug: string): TenantConfig | null {
  if (fileConfigCache.has(slug)) {
    return fileConfigCache.get(slug)!;
  }

  try {
    // Resolve relative to project root (3 levels up from dist/src/modules/)
    const configPath = join(process.cwd(), '..', 'config', 'tenants', `${slug}.json`);
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as TenantConfig;
    fileConfigCache.set(slug, config);
    return config;
  } catch {
    // File not found — try from CWD directly (for different working dirs)
    try {
      const altPath = join(process.cwd(), 'config', 'tenants', `${slug}.json`);
      const raw = readFileSync(altPath, 'utf-8');
      const config = JSON.parse(raw) as TenantConfig;
      fileConfigCache.set(slug, config);
      return config;
    } catch {
      return null;
    }
  }
}

/**
 * Build a TenantConfig from the Tenant DB row + system settings.
 * This is used when the tenant is resolved from the database.
 */
function buildConfigFromTenant(tenant: {
  slug: string;
  name: string;
  id: string;
  currency: string;
  timezone: string;
  country: string;
}): TenantConfig {
  // Start with defaults, override with tenant DB fields
  const fileConfig = loadFileConfig(tenant.slug) || loadFileConfig('default');

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    currency: fileConfig?.currency || {
      code: tenant.currency || 'UGX',
      symbol: tenant.currency || 'UGX',
      name: 'Currency',
      decimals: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      symbolPosition: 'before',
    },
    branding: fileConfig?.branding || {
      companyName: tenant.name,
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      logoUrl: null,
      primaryColor: '#2563eb',
      secondaryColor: '#10b981',
      footerText: 'Thank you for your business!',
    },
    locale: fileConfig?.locale || {
      country: tenant.country || 'UG',
      timezone: tenant.timezone || 'Africa/Kampala',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm',
    },
    tax: fileConfig?.tax || {
      enabled: true,
      defaultRate: 18,
      name: 'VAT',
      inclusive: false,
    },
    features: fileConfig?.features || {
      pharmacy_mode: false,
      restaurant_mode: false,
      offline_pos: true,
      credit_sales: true,
      quotations: true,
      purchase_orders: true,
      multi_currency: false,
      barcode_scanner: true,
    },
  };
}

// GET /api/tenant/config — public, no auth required
router.get('/config', (req: Request, res: Response) => {
  try {
    // If tenant middleware resolved a DB tenant, use it
    if (req.tenant) {
      const config = buildConfigFromTenant(
        req.tenant as {
          slug: string;
          name: string;
          id: string;
          currency: string;
          timezone: string;
          country: string;
        }
      );
      res.json({ success: true, data: config });
      return;
    }

    // Fallback: load from config file (single-tenant / dev mode)
    const slug = 'default';
    const config = loadFileConfig(slug);
    if (config) {
      res.json({ success: true, data: config });
      return;
    }

    // Absolute fallback — hardcoded defaults
    res.json({
      success: true,
      data: {
        tenantId: 'default',
        slug: 'default',
        name: 'SMART ERP',
        currency: {
          code: 'UGX',
          symbol: 'UGX',
          name: 'Ugandan Shillings',
          decimals: 2,
          thousandsSeparator: ',',
          decimalSeparator: '.',
          symbolPosition: 'before',
        },
        branding: {
          companyName: 'SMART ERP',
          companyAddress: '',
          companyPhone: '',
          companyEmail: '',
          logoUrl: null,
          primaryColor: '#2563eb',
          secondaryColor: '#10b981',
          footerText: '',
        },
        locale: {
          country: 'UG',
          timezone: 'Africa/Kampala',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
        },
        tax: { enabled: true, defaultRate: 18, name: 'VAT', inclusive: false },
        features: {
          pharmacy_mode: false,
          restaurant_mode: false,
          offline_pos: true,
          credit_sales: true,
          quotations: true,
          purchase_orders: true,
          multi_currency: false,
          barcode_scanner: true,
        },
      } satisfies TenantConfig,
    });
  } catch (err) {
    logger.error('Failed to load tenant config', { error: (err as Error).message });
    res.status(500).json({ success: false, error: 'Failed to load tenant configuration' });
  }
});

export const tenantConfigRoutes = router;
