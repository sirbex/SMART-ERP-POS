/**
 * Pure DocumentTax determination + compute for client preview / offline.
 * Mirrors SamplePOS.Server DocumentTaxService hierarchy (no SQL).
 *
 * Hierarchy (per line):
 *   0. Document OVERRIDE (FORCE_EXEMPT / FORCE_RATE) — handled in previewDocumentTax
 *   1. Restaurant gates (taxEnabled / taxInclusive) when tenant-default mode;
 *      taxInclusive always disables added exclusive tax
 *   2. Customer exemption / ZERO_RATED / vatOutputRequiresRegisteredCustomer
 *   3. preferLineTaxOverrides (when it resolves: explicit false, or true+rate>0)
 *   4. product_tax_mappings
 *   5. Product bridge (is_taxable + tax_rate) / line fields
 *   6. Customer defaultVatRate (VAT-registered only; never after explicit non-taxable)
 *   7. Tenant defaultTaxRate (optional)
 *   8. No tax
 */
import Decimal from 'decimal.js';
import {
  computeTaxes,
  type TaxComputationResultLike,
  type TaxDefinitionLike,
} from './taxCompute.js';

export type TaxDetermination =
  | 'EXEMPT'
  | 'MAPPING'
  | 'BRIDGE'
  | 'TENANT_DEFAULT'
  | 'NONE'
  | 'DISABLED'
  | 'OVERRIDE';

export type DocumentTaxOverrideMode = 'FORCE_EXEMPT' | 'FORCE_RATE';

/** Privileged document-level tax override (RBAC enforced on server). */
export interface DocumentTaxOverrideInput {
  mode: DocumentTaxOverrideMode;
  /** Percent rate when mode is FORCE_RATE */
  rate?: number;
  reason: string;
}

export interface DocumentTaxPreviewLineInput {
  productId?: string | null;
  /** Net after line discounts (cart discount excluded — matches createSale). */
  lineNetAmount: number;
  quantity?: number;
  isTaxable?: boolean;
  taxRate?: number;
}

export interface CustomerTaxProfilePreview {
  vatRegistered?: boolean;
  taxExempt?: boolean;
  taxProfile?: string;
  defaultVatRate?: number | null;
  /** YYYY-MM-DD — profile not active before this date */
  taxEffectiveFrom?: string | null;
  vatRegistrationDate?: string | null;
}

export interface DocumentTaxPreviewContext {
  customerExempt?: boolean;
  /** Phase 4 — structured customer VAT profile */
  customerProfile?: CustomerTaxProfilePreview | null;
  /**
   * When true: walk-in (no profile) and non-VAT-registered customers get no output VAT.
   * Default false for backwards compatibility.
   */
  vatOutputRequiresRegisteredCustomer?: boolean;
  /** Document date YYYY-MM-DD for effective-from checks */
  documentDate?: string;
  /** productId → mapped tax definitions */
  productMappings?: Map<string, TaxDefinitionLike[]> | Record<string, TaxDefinitionLike[]>;
  /** Active tax catalog (for rate → VAT18 match) */
  taxCatalog?: TaxDefinitionLike[];
  /**
   * Restaurant: true + taxEnabled/taxInclusive gates.
   * Retail POS: false (product bridge works even when tax_enabled defaults false).
   */
  applyTenantDefaultWhenUnresolved?: boolean;
  preferLineTaxOverrides?: boolean;
  taxEnabled?: boolean;
  taxInclusive?: boolean;
  defaultTaxRate?: number;
  scopeIsSale?: boolean;
  /** Optional customer default rate when product unresolved (VAT-registered). */
  customerDefaultVatRate?: number | null;
  /** Phase 5 — document-level override (skips normal determination). */
  taxOverride?: DocumentTaxOverrideInput | null;
}

export interface DocumentTaxPreviewLineResult {
  lineIndex: number;
  determination: TaxDetermination;
  taxes: TaxDefinitionLike[];
  computation: TaxComputationResultLike;
}

export interface DocumentTaxPreviewResult {
  lineResults: DocumentTaxPreviewLineResult[];
  totalTax: number;
  untaxedAmount: number;
  totalAmount: number;
  customerExempt: boolean;
}

function asMappingMap(
  input?: Map<string, TaxDefinitionLike[]> | Record<string, TaxDefinitionLike[]>,
): Map<string, TaxDefinitionLike[]> {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

function isUuidProductId(productId: string | null | undefined): productId is string {
  if (!productId) return false;
  if (productId.startsWith('custom_')) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    productId,
  );
}

export function bridgeTaxDefinition(
  rate: number,
  catalog: TaxDefinitionLike[] = [],
): TaxDefinitionLike {
  const match = catalog.find(
    (t) =>
      t.type === 'PERCENTAGE' &&
      !t.isInclusive &&
      !t.isCompound &&
      Number(t.rate) === Number(rate) &&
      t.code !== 'EXEMPT' &&
      t.isActive,
  );
  if (match) return match;
  return {
    id: `bridge:rate:${rate}`,
    code: `BRIDGE_${rate}`,
    name: `VAT ${rate}%`,
    type: 'PERCENTAGE',
    rate,
    isInclusive: false,
    isCompound: false,
    sequence: 10,
    scope: 'SALE',
    taxPayableAccountCode: '2300',
    taxReceivableAccountCode: '2300',
    isActive: true,
  };
}

function profileIsVatRegisteredActive(
  profile: CustomerTaxProfilePreview | null | undefined,
  documentDate?: string,
): boolean {
  if (!profile) return false;
  const registered =
    profile.vatRegistered === true || profile.taxProfile === 'VAT_REGISTERED';
  if (!registered) return false;
  const asOf = documentDate || new Date().toISOString().slice(0, 10);
  const effective = profile.taxEffectiveFrom || profile.vatRegistrationDate;
  if (effective && effective > asOf) return false;
  return true;
}

export function resolveCustomerTaxGate(
  ctx: DocumentTaxPreviewContext,
): TaxDetermination | null {
  const profile = ctx.customerProfile;
  if (
    ctx.customerExempt ||
    profile?.taxExempt === true ||
    profile?.taxProfile === 'EXEMPT'
  ) {
    return 'EXEMPT';
  }
  if (profile?.taxProfile === 'ZERO_RATED') {
    return 'NONE'; // zero-rated → no output VAT amount
  }
  if (ctx.vatOutputRequiresRegisteredCustomer) {
    if (!profileIsVatRegisteredActive(profile, ctx.documentDate)) {
      return 'NONE';
    }
  }
  return null;
}

/**
 * Prefer-line resolves only when the caller made an explicit line decision:
 * - isTaxable === false → NONE
 * - isTaxable === true && taxRate > 0 → BRIDGE at that rate
 * Otherwise fall through so mappings / product bridge can apply (quotes with rate 0).
 */
function resolvePreferLineTaxes(
  line: DocumentTaxPreviewLineInput,
  catalog: TaxDefinitionLike[],
): { taxes: TaxDefinitionLike[]; determination: TaxDetermination } | null {
  if (line.isTaxable === undefined) return null;
  if (line.isTaxable === false) {
    return { taxes: [], determination: 'NONE' };
  }
  if (Number(line.taxRate) > 0) {
    return {
      taxes: [bridgeTaxDefinition(Number(line.taxRate), catalog)],
      determination: 'BRIDGE',
    };
  }
  return null;
}

export function resolvePreviewLineTaxes(
  line: DocumentTaxPreviewLineInput,
  ctx: DocumentTaxPreviewContext,
): { taxes: TaxDefinitionLike[]; determination: TaxDetermination } {
  const catalog = ctx.taxCatalog ?? [];
  const mappings = asMappingMap(ctx.productMappings);
  const applyTenantDefault = ctx.applyTenantDefaultWhenUnresolved === true;
  const preferLine = ctx.preferLineTaxOverrides === true;

  // Inclusive prices: never add exclusive DocumentTax on top (retail + restaurant).
  if (ctx.taxInclusive === true) {
    return { taxes: [], determination: 'DISABLED' };
  }

  if (applyTenantDefault && ctx.taxEnabled === false) {
    return { taxes: [], determination: 'DISABLED' };
  }

  const customerGate = resolveCustomerTaxGate(ctx);
  if (customerGate) {
    return { taxes: [], determination: customerGate };
  }

  if (ctx.customerExempt) {
    return { taxes: [], determination: 'EXEMPT' };
  }

  // CN/DN / quote line rates must beat product mappings when preferLine resolves.
  if (preferLine) {
    const preferred = resolvePreferLineTaxes(line, catalog);
    if (preferred) return preferred;
  }

  const pid = line.productId ?? null;

  if (isUuidProductId(pid)) {
    const mapped = mappings.get(pid);
    if (mapped && mapped.length > 0) {
      return { taxes: mapped, determination: 'MAPPING' };
    }
  }

  // Product bridge from line fields (server fills from DB for UUID products)
  if (line.isTaxable === true && Number(line.taxRate) > 0) {
    return {
      taxes: [bridgeTaxDefinition(Number(line.taxRate), catalog)],
      determination: 'BRIDGE',
    };
  }

  // Explicit non-taxable: never apply customer defaultVatRate.
  // Restaurant (applyTenantDefault) may still fall through to tenant default.
  const explicitlyNonTaxable = line.isTaxable === false;

  // Customer default VAT rate (VAT-registered) before tenant default
  if (!explicitlyNonTaxable) {
    const customerRate =
      ctx.customerDefaultVatRate ?? ctx.customerProfile?.defaultVatRate;
    if (
      Number(customerRate) > 0 &&
      profileIsVatRegisteredActive(ctx.customerProfile, ctx.documentDate)
    ) {
      return {
        taxes: [bridgeTaxDefinition(Number(customerRate), catalog)],
        determination: 'BRIDGE',
      };
    }
  }

  if (applyTenantDefault && Number(ctx.defaultTaxRate) > 0) {
    return {
      taxes: [bridgeTaxDefinition(Number(ctx.defaultTaxRate), catalog)],
      determination: 'TENANT_DEFAULT',
    };
  }

  return { taxes: [], determination: 'NONE' };
}

function applyDocumentTaxOverride(
  lines: DocumentTaxPreviewLineInput[],
  override: DocumentTaxOverrideInput,
  ctx: DocumentTaxPreviewContext,
): DocumentTaxPreviewResult {
  const catalog = ctx.taxCatalog ?? [];
  const scopeIsSale = ctx.scopeIsSale !== false;
  const lineResults = lines.map((line, lineIndex) => {
    if (override.mode === 'FORCE_EXEMPT') {
      return {
        lineIndex,
        determination: 'OVERRIDE' as const,
        taxes: [] as TaxDefinitionLike[],
        computation: computeTaxes(line.lineNetAmount, [], line.quantity || 1, scopeIsSale),
      };
    }
    const rate = Number(override.rate ?? 0);
    const taxes = rate > 0 ? [bridgeTaxDefinition(rate, catalog)] : [];
    return {
      lineIndex,
      determination: 'OVERRIDE' as const,
      taxes,
      computation: computeTaxes(line.lineNetAmount, taxes, line.quantity || 1, scopeIsSale),
    };
  });
  return aggregate(lineResults, false);
}

export function previewDocumentTax(
  lines: DocumentTaxPreviewLineInput[],
  ctx: DocumentTaxPreviewContext = {},
): DocumentTaxPreviewResult {
  if (ctx.taxOverride) {
    return applyDocumentTaxOverride(lines, ctx.taxOverride, ctx);
  }

  const applyTenantDefault = ctx.applyTenantDefaultWhenUnresolved === true;

  // Inclusive always disables added exclusive tax; taxEnabled=false only in restaurant mode.
  if (ctx.taxInclusive === true || (applyTenantDefault && ctx.taxEnabled === false)) {
    const lineResults = lines.map((line, lineIndex) => ({
      lineIndex,
      determination: 'DISABLED' as const,
      taxes: [] as TaxDefinitionLike[],
      computation: computeTaxes(line.lineNetAmount, [], line.quantity || 1, ctx.scopeIsSale !== false),
    }));
    return aggregate(lineResults, false);
  }

  const customerGate = resolveCustomerTaxGate(ctx);
  if (customerGate === 'EXEMPT' || ctx.customerExempt) {
    const lineResults = lines.map((line, lineIndex) => ({
      lineIndex,
      determination: 'EXEMPT' as const,
      taxes: [] as TaxDefinitionLike[],
      computation: computeTaxes(line.lineNetAmount, [], line.quantity || 1, ctx.scopeIsSale !== false),
    }));
    return aggregate(lineResults, true);
  }
  if (customerGate === 'NONE') {
    const lineResults = lines.map((line, lineIndex) => ({
      lineIndex,
      determination: 'NONE' as const,
      taxes: [] as TaxDefinitionLike[],
      computation: computeTaxes(line.lineNetAmount, [], line.quantity || 1, ctx.scopeIsSale !== false),
    }));
    return aggregate(lineResults, false);
  }

  const lineResults = lines.map((line, lineIndex) => {
    const { taxes, determination } = resolvePreviewLineTaxes(line, ctx);
    return {
      lineIndex,
      determination,
      taxes,
      computation: computeTaxes(
        line.lineNetAmount,
        taxes,
        line.quantity || 1,
        ctx.scopeIsSale !== false,
      ),
    };
  });

  return aggregate(lineResults, false);
}

function aggregate(
  lineResults: DocumentTaxPreviewLineResult[],
  customerExempt: boolean,
): DocumentTaxPreviewResult {
  let untaxed = new Decimal(0);
  let tax = new Decimal(0);
  for (const lr of lineResults) {
    untaxed = untaxed.plus(lr.computation.untaxedAmount);
    tax = tax.plus(lr.computation.totalTax);
  }
  const totalTax = tax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return {
    lineResults,
    untaxedAmount: untaxed.toNumber(),
    totalTax,
    totalAmount: untaxed.plus(totalTax).toNumber(),
    customerExempt,
  };
}

/** Convenience for Retail POS cart lines (product bridge / custom overrides). */
export function previewPosCartTax(
  items: Array<{
    productId?: string | null;
    subtotal: number;
    quantity?: number;
    isTaxable?: boolean;
    taxRate?: number;
  }>,
  ctx: Omit<DocumentTaxPreviewContext, 'preferLineTaxOverrides' | 'applyTenantDefaultWhenUnresolved'> = {},
): number {
  const result = previewDocumentTax(
    items.map((item) => ({
      productId: item.productId,
      lineNetAmount: item.subtotal,
      quantity: item.quantity ?? 1,
      isTaxable: item.isTaxable,
      taxRate: item.taxRate,
    })),
    {
      ...ctx,
      preferLineTaxOverrides: false,
      applyTenantDefaultWhenUnresolved: false,
    },
  );
  return result.totalTax;
}
