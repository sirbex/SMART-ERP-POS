/**
 * DocumentTaxService — canonical tax determination façade.
 *
 * Ownership:
 *   DocumentTaxService  → which TaxDefinition[] apply (business rules + SQL)
 *   TaxEngine.compute   → arithmetic only (no SQL, no customers/products)
 *
 * Hierarchy (per line) — keep in sync with shared/utils/documentTaxPreview.ts:
 *   0. Document OVERRIDE (FORCE_EXEMPT / FORCE_RATE)
 *   1. taxEnabled=false when applyTenantDefault (restaurant)
 *   2. Customer exemption / ZERO_RATED / vatOutputRequiresRegisteredCustomer
 *   3. preferLineTaxOverrides when it resolves
 *   4. Product is_taxable === false → NONE always (retail + restaurant; no tenant default)
 *   5. product_tax_mappings
 *   6. Product bridge (DB SSOT for UUID products) / line fields
 *   7. Customer defaultVatRate (never after explicit non-taxable)
 *   8. Tenant defaultTaxRate (restaurant unresolved only — not is_taxable=false)
 *   9. No tax
 *
 * taxInclusive: prices include tax — TaxEngine extracts VAT (does not add exclusive tax).
 */

import type pg from 'pg';
import { Money, Decimal } from '../utils/money.js';
import { getBusinessDate } from '../utils/dateRange.js';
import { systemSettingsRepository } from '../modules/system-settings/systemSettingsRepository.js';
import {
  TaxEngine,
  type TaxComputationResult,
  type TaxDefinition,
  type TaxScope,
} from './taxEngine.js';
import {
  isCustomerTaxExempt,
  loadActiveTaxDefinitions,
  loadCustomerTaxProfile,
  loadProductTaxBridge,
  loadProductTaxMappings,
  type CustomerTaxProfileRow,
  type DbConn,
} from './documentTaxRepository.js';
import {
  bridgeTaxDefinition,
  resolveCustomerTaxGate,
  resolvePreviewLineTaxes,
  taxesForPriceMode,
  type TaxDetermination,
} from '@shared/utils/documentTaxPreview.js';
import logger from '../utils/logger.js';

export interface DocumentTaxLineInput {
  lineIndex: number;
  productId: string | null;
  /** Net amount after line discounts, before document/cart discount. */
  lineNetAmount: number;
  quantity: number;
  /** Optional overrides for custom/service lines without a products row. */
  isTaxable?: boolean;
  taxRate?: number;
}

export interface DocumentTaxComputeInput {
  customerId?: string | null;
  documentDate?: string;
  scope?: TaxScope;
  lines: DocumentTaxLineInput[];
  /**
   * Restaurant: true — unresolved lines use system_settings.defaultTaxRate.
   * Retail POS / createSale: false — unresolved → no tax (match product.is_taxable).
   */
  applyTenantDefaultWhenUnresolved?: boolean;
  /**
   * Quotations / CN / DN: line isTaxable + taxRate win over product.is_taxable bridge
   * (after mappings + customer exemption). POS keeps product-bridge SSOT.
   */
  preferLineTaxOverrides?: boolean;
  /**
   * Phase 5 — privileged document override (RBAC checked by caller).
   * FORCE_EXEMPT / FORCE_RATE skip normal determination hierarchy.
   */
  taxOverride?: {
    mode: 'FORCE_EXEMPT' | 'FORCE_RATE';
    rate?: number;
    reason: string;
  } | null;
}

export interface PricedDocumentLineInput {
  productId?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  isTaxable?: boolean;
  taxRate?: number;
}

export interface PricedDocumentLineTax {
  lineNetAmount: number;
  taxAmount: number;
  lineTotal: number;
  isTaxable: boolean;
  taxRate: number;
  determination: DocumentTaxLineResult['determination'];
}

export interface PricedDocumentTaxResult {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: PricedDocumentLineTax[];
  raw: DocumentTaxResult;
}

export interface DocumentTaxLineResult {
  lineIndex: number;
  taxes: TaxDefinition[];
  determination: TaxDetermination;
  computation: TaxComputationResult;
}

export interface DocumentTaxResult {
  lineResults: DocumentTaxLineResult[];
  documentTotals: TaxComputationResult;
  customerExempt: boolean;
  taxEnabled: boolean;
  taxInclusive: boolean;
  taxOverrideApplied: boolean;
}

function emptyComputation(amount: number, isSale: boolean = true): TaxComputationResult {
  return TaxEngine.compute(amount, [], 1, isSale);
}

function isUuidProductId(productId: string | null): productId is string {
  if (!productId) return false;
  if (productId.startsWith('custom_')) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    productId,
  );
}

export const DocumentTaxService = {
  /**
   * Determine applicable taxes for one product/customer (admin + preview).
   * Uses the safe hierarchy — never stacks all active SALE taxes.
   */
  async determineApplicableTaxes(
    conn: DbConn,
    productId: string | null,
    customerId: string | null,
    scope: TaxScope = 'SALE',
    options?: {
      documentDate?: string;
      isTaxable?: boolean;
      taxRate?: number;
      applyTenantDefaultWhenUnresolved?: boolean;
    },
  ): Promise<TaxDefinition[]> {
    const result = await this.computeForLines(conn, {
      customerId,
      documentDate: options?.documentDate,
      scope,
      applyTenantDefaultWhenUnresolved: options?.applyTenantDefaultWhenUnresolved ?? false,
      lines: [
        {
          lineIndex: 0,
          productId,
          lineNetAmount: 100,
          quantity: 1,
          isTaxable: options?.isTaxable,
          taxRate: options?.taxRate,
        },
      ],
    });
    return result.lineResults[0]?.taxes ?? [];
  },

  /**
   * Canonical document tax determination + TaxEngine.compute per line.
   */
  async computeForLines(
    conn: DbConn,
    input: DocumentTaxComputeInput,
  ): Promise<DocumentTaxResult> {
    const scope: TaxScope = input.scope ?? 'SALE';
    const asOf = input.documentDate || getBusinessDate();
    const applyTenantDefault = input.applyTenantDefaultWhenUnresolved === true;
    const preferLineTaxOverrides = input.preferLineTaxOverrides === true;

    const settings = await systemSettingsRepository.getSettings(conn);
    // Restaurant tax master: taxEnabled false → no tax (DISABLED). Retail ignores taxEnabled and uses product/mapping.
    // taxInclusive extracts VAT from shelf price (does not add exclusive tax on top).
    const taxEnabled = Boolean(settings?.taxEnabled);
    const taxInclusive = Boolean(settings?.taxInclusive);
    const defaultTaxRate = Number(settings?.defaultTaxRate ?? 0);
    const vatOutputRequiresRegisteredCustomer = Boolean(
      settings?.vatOutputRequiresRegisteredCustomer,
    );

    if (input.taxOverride) {
      const ov = input.taxOverride;
      const catalog = await loadActiveTaxDefinitions(conn, scope);
      const lineResults: DocumentTaxLineResult[] = input.lines.map((line) => {
        if (ov.mode === 'FORCE_EXEMPT') {
          return {
            lineIndex: line.lineIndex,
            taxes: [],
            determination: 'OVERRIDE' as const,
            computation: emptyComputation(line.lineNetAmount),
          };
        }
        const rate = Number(ov.rate ?? 0);
        const rawTaxes =
          rate > 0
            ? ([bridgeTaxDefinition(rate, catalog)] as TaxDefinition[])
            : ([] as TaxDefinition[]);
        const taxes = taxesForPriceMode(rawTaxes, taxInclusive) as TaxDefinition[];
        const computation = TaxEngine.compute(
          line.lineNetAmount,
          taxes,
          line.quantity || 1,
          scope !== 'PURCHASE',
        );
        return {
          lineIndex: line.lineIndex,
          taxes,
          determination: 'OVERRIDE' as const,
          computation,
        };
      });
      return {
        lineResults,
        documentTotals: aggregateDocument(lineResults),
        customerExempt: false,
        taxEnabled,
        taxInclusive,
        taxOverrideApplied: true,
      };
    }

    // Restaurant tax master off only — tax_inclusive no longer zeroes product VAT.
    if (applyTenantDefault && !taxEnabled) {
      const lineResults: DocumentTaxLineResult[] = input.lines.map((line) => ({
        lineIndex: line.lineIndex,
        taxes: [],
        determination: 'DISABLED',
        computation: emptyComputation(line.lineNetAmount),
      }));
      return {
        lineResults,
        documentTotals: aggregateDocument(lineResults),
        customerExempt: false,
        taxEnabled,
        taxInclusive,
        taxOverrideApplied: false,
      };
    }

    let customerExempt = false;
    let customerProfile: CustomerTaxProfileRow | null = null;
    if (input.customerId) {
      const [exemptRow, profile] = await Promise.all([
        isCustomerTaxExempt(conn, input.customerId, asOf),
        loadCustomerTaxProfile(conn, input.customerId),
      ]);
      customerExempt = exemptRow;
      customerProfile = profile;
    }

    const customerGate = resolveCustomerTaxGate({
      customerExempt,
      customerProfile: customerProfile
        ? {
            vatRegistered: customerProfile.vatRegistered,
            taxExempt: customerProfile.taxExempt,
            taxProfile: customerProfile.taxProfile,
            defaultVatRate: customerProfile.defaultVatRate,
            taxEffectiveFrom: customerProfile.taxEffectiveFrom,
            vatRegistrationDate: customerProfile.vatRegistrationDate,
          }
        : null,
      vatOutputRequiresRegisteredCustomer,
      documentDate: asOf,
    });

    if (customerGate === 'EXEMPT' || customerExempt) {
      const lineResults: DocumentTaxLineResult[] = input.lines.map((line) => ({
        lineIndex: line.lineIndex,
        taxes: [],
        determination: 'EXEMPT',
        computation: emptyComputation(line.lineNetAmount),
      }));
      return {
        lineResults,
        documentTotals: aggregateDocument(lineResults),
        customerExempt: true,
        taxEnabled,
        taxInclusive,
        taxOverrideApplied: false,
      };
    }

    if (customerGate === 'NONE') {
      const lineResults: DocumentTaxLineResult[] = input.lines.map((line) => ({
        lineIndex: line.lineIndex,
        taxes: [],
        determination: 'NONE',
        computation: emptyComputation(line.lineNetAmount),
      }));
      return {
        lineResults,
        documentTotals: aggregateDocument(lineResults),
        customerExempt: false,
        taxEnabled,
        taxInclusive,
        taxOverrideApplied: false,
      };
    }

    const uuidIds = [
      ...new Set(
        input.lines
          .map((l) => l.productId)
          .filter((id): id is string => isUuidProductId(id)),
      ),
    ];

    const [catalog, mappings, bridges] = await Promise.all([
      loadActiveTaxDefinitions(conn, scope),
      loadProductTaxMappings(conn, uuidIds, scope),
      loadProductTaxBridge(conn, uuidIds),
    ]);

    const lineResults: DocumentTaxLineResult[] = input.lines.map((line) => {
      const { taxes, determination } = resolveLineTaxes(line, {
        catalog,
        mappings,
        bridges,
        defaultTaxRate,
        applyTenantDefault,
        preferLineTaxOverrides,
        customerProfile,
        documentDate: asOf,
        taxInclusive,
      });
      const computation = TaxEngine.compute(
        line.lineNetAmount,
        taxes,
        line.quantity || 1,
        scope !== 'PURCHASE',
      );
      return {
        lineIndex: line.lineIndex,
        taxes,
        determination,
        computation,
      };
    });

    return {
      lineResults,
      documentTotals: aggregateDocument(lineResults),
      customerExempt: false,
      taxEnabled,
      taxInclusive,
      taxOverrideApplied: false,
    };
  },

  /**
   * Price document lines: line nets + DocumentTaxService tax + line totals.
   * Used by quotations, credit/debit notes, and POS orders.
   */
  async priceDocumentLines(
    conn: DbConn,
    input: {
      customerId?: string | null;
      documentDate?: string;
      scope?: TaxScope;
      applyTenantDefaultWhenUnresolved?: boolean;
      preferLineTaxOverrides?: boolean;
      lines: PricedDocumentLineInput[];
    },
  ): Promise<PricedDocumentTaxResult> {
    const prepared = input.lines.map((line, lineIndex) => {
      const lineNet = new Decimal(line.quantity)
        .times(line.unitPrice)
        .minus(line.discountAmount || 0);
      const lineNetAmount = Money.toNumber(Money.round(lineNet, 2));
      return {
        lineIndex,
        productId: line.productId ?? null,
        lineNetAmount,
        quantity: line.quantity,
        isTaxable: line.isTaxable,
        taxRate: line.taxRate,
        _rawNet: lineNet,
      };
    });

    const raw = await this.computeForLines(conn, {
      customerId: input.customerId,
      documentDate: input.documentDate,
      scope: input.scope,
      applyTenantDefaultWhenUnresolved: input.applyTenantDefaultWhenUnresolved,
      preferLineTaxOverrides: input.preferLineTaxOverrides,
      lines: prepared.map(({ lineIndex, productId, lineNetAmount, quantity, isTaxable, taxRate }) => ({
        lineIndex,
        productId,
        lineNetAmount,
        quantity,
        isTaxable,
        taxRate,
      })),
    });

    let subtotal = Money.zero();
    const lines: PricedDocumentLineTax[] = prepared.map((p, idx) => {
      const lr = raw.lineResults[idx];
      const taxAmount = lr?.computation.totalTax ?? 0;
      const effectiveRate = effectiveTaxRate(lr, input.lines[idx]?.taxRate);
      const isTaxable = taxAmount > 0 || (input.lines[idx]?.isTaxable === true && effectiveRate > 0);
      subtotal = Money.add(subtotal, p.lineNetAmount);
      // Inclusive: line total stays net (tax extracted, not added).
      const lineTotal = raw.taxInclusive
        ? p.lineNetAmount
        : Money.toNumber(Money.round(new Decimal(p.lineNetAmount).plus(taxAmount), 2));
      return {
        lineNetAmount: p.lineNetAmount,
        taxAmount,
        lineTotal,
        isTaxable,
        taxRate: effectiveRate,
        determination: lr?.determination ?? 'NONE',
      };
    });

    const taxAmount = raw.documentTotals.totalTax;
    const subtotalNum = Money.toNumber(Money.round(subtotal, 2));
    return {
      subtotal: subtotalNum,
      taxAmount,
      totalAmount: raw.taxInclusive
        ? subtotalNum
        : Money.toNumber(Money.round(new Decimal(subtotalNum).plus(taxAmount), 2)),
      lines,
      raw,
    };
  },
};

/** Enrich from DB product bridge, then resolve via shared SSOT. */
function resolveLineTaxes(
  line: DocumentTaxLineInput,
  ctx: {
    catalog: TaxDefinition[];
    mappings: Map<string, TaxDefinition[]>;
    bridges: Map<string, { isTaxable: boolean; taxRate: number }>;
    defaultTaxRate: number;
    applyTenantDefault: boolean;
    preferLineTaxOverrides: boolean;
    customerProfile: CustomerTaxProfileRow | null;
    documentDate: string;
    taxInclusive?: boolean;
  },
): { taxes: TaxDefinition[]; determination: TaxDetermination } {
  const pid = line.productId;
  let isTaxable = line.isTaxable;
  let taxRate = line.taxRate;

  // UUID products: DB bridge is SSOT (ignore client isTaxable/taxRate) unless prefer-line.
  if (isUuidProductId(pid) && !ctx.preferLineTaxOverrides) {
    const bridge = ctx.bridges.get(pid);
    if (bridge) {
      isTaxable = bridge.isTaxable;
      taxRate = bridge.taxRate;
    }
  }

  // Product-master SSOT: is_taxable=false never maps tax (retail, restaurant, any path).
  if (isTaxable === false) {
    return { taxes: [], determination: 'NONE' };
  }

  const resolved = resolvePreviewLineTaxes(
    {
      productId: pid,
      lineNetAmount: line.lineNetAmount,
      quantity: line.quantity,
      isTaxable,
      taxRate,
    },
    {
      productMappings: ctx.mappings,
      taxCatalog: ctx.catalog,
      applyTenantDefaultWhenUnresolved: ctx.applyTenantDefault,
      preferLineTaxOverrides: ctx.preferLineTaxOverrides,
      // Restaurant DISABLED gate already applied; allow tenant-default branch here.
      taxEnabled: true,
      // Inclusive extract is applied via taxesForPriceMode in resolvePreviewLineTaxes.
      taxInclusive: ctx.taxInclusive === true,
      defaultTaxRate: ctx.defaultTaxRate,
      documentDate: ctx.documentDate,
      customerProfile: ctx.customerProfile
        ? {
            vatRegistered: ctx.customerProfile.vatRegistered,
            taxExempt: ctx.customerProfile.taxExempt,
            taxProfile: ctx.customerProfile.taxProfile,
            defaultVatRate: ctx.customerProfile.defaultVatRate,
            taxEffectiveFrom: ctx.customerProfile.taxEffectiveFrom,
            vatRegistrationDate: ctx.customerProfile.vatRegistrationDate,
          }
        : null,
      customerDefaultVatRate: ctx.customerProfile?.defaultVatRate,
    },
  );

  return {
    taxes: resolved.taxes as TaxDefinition[],
    determination: resolved.determination,
  };
}

function effectiveTaxRate(
  lineResult: DocumentTaxLineResult | undefined,
  fallbackRate?: number,
): number {
  const pct = lineResult?.taxes.find((t) => t.type === 'PERCENTAGE' && t.rate > 0);
  if (pct) return Number(pct.rate);
  if (lineResult && lineResult.computation.totalTax > 0 && fallbackRate) {
    return Number(fallbackRate);
  }
  return Number(fallbackRate || 0);
}

function aggregateDocument(lineResults: DocumentTaxLineResult[]): TaxComputationResult {
  let totalUntaxed = Money.zero();
  let totalTax = Money.zero();
  const aggregated = new Map<string, TaxComputationResult['taxLines'][number]>();

  for (const lr of lineResults) {
    totalUntaxed = Money.add(totalUntaxed, lr.computation.untaxedAmount);
    totalTax = Money.add(totalTax, lr.computation.totalTax);
    for (const tl of lr.computation.taxLines) {
      const existing = aggregated.get(tl.taxId);
      if (existing) {
        existing.baseAmount = Money.add(existing.baseAmount, tl.baseAmount).toNumber();
        existing.taxAmount = Money.add(existing.taxAmount, tl.taxAmount).toNumber();
      } else {
        aggregated.set(tl.taxId, { ...tl });
      }
    }
  }

  return {
    untaxedAmount: totalUntaxed.toNumber(),
    totalTax: Money.toNumber(Money.round(totalTax, 2)),
    totalAmount: Money.add(totalUntaxed, totalTax).toNumber(),
    taxLines: Array.from(aggregated.values()),
  };
}

/** Compare client preview tax to server authority; returns server amount. */
export function resolveAuthoritativeTaxAmount(
  serverTax: number,
  clientTax: number | undefined | null,
  context: { saleHint?: string },
): Decimal {
  const server = new Decimal(serverTax);
  if (clientTax === undefined || clientTax === null) {
    return server;
  }
  const client = new Decimal(clientTax);
  if (client.minus(server).abs().greaterThan(0.02)) {
    logger.warn('DocumentTaxService: client tax preview overridden by server', {
      clientTax: client.toFixed(2),
      serverTax: server.toFixed(2),
      ...context,
    });
  }
  return server;
}

export default DocumentTaxService;
