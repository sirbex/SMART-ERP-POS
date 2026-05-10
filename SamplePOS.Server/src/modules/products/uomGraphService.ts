import Decimal from 'decimal.js';
import { ValidationError } from '../../middleware/errorHandler.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface ItemUomConversion {
  id?: string;
  itemId: string;
  fromUomId: string;
  toUomId: string;
  factor: number | string;
  isCanonical?: boolean;
}

export interface ResolvedUomConversion {
  baseUomId: string;
  factorToBase: Decimal;
  path: string[];
}

export interface CanonicalGraphValidationResult {
  isValid: boolean;
  issues: string[];
}

const CANONICAL_UOM_ALIASES: Record<string, string> = {
  TAB: 'TABLET',
  TABS: 'TABLET',
  TABLETS: 'TABLET',
  PK: 'PACK',
  PKT: 'PACKET',
  PACKS: 'PACK',
  PACKETS: 'PACKET',
  PCS: 'PIECE',
  EA: 'EACH',
  EACHES: 'EACH',
};

function parseFactor(value: number | string): Decimal {
  const factor = new Decimal(value);
  if (!factor.isFinite() || factor.lt(1)) {
    throw new ValidationError(`UoM conversion factor must be >= 1. Received ${value}.`);
  }
  return factor;
}

export function canonicalizeUomName(name: string): string {
  const normalized = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return CANONICAL_UOM_ALIASES[normalized] ?? normalized;
}

export function validateCanonicalUomGraph(
  baseUomId: string,
  conversions: ItemUomConversion[],
): CanonicalGraphValidationResult {
  const issues: string[] = [];
  const outgoing = new Map<string, ItemUomConversion>();
  const directionlessPairs = new Set<string>();

  for (const conversion of conversions) {
    if (conversion.fromUomId === conversion.toUomId) {
      issues.push(`UoM ${conversion.fromUomId} cannot convert to itself.`);
      continue;
    }

    try {
      parseFactor(conversion.factor);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Invalid conversion factor.');
    }

    if (conversion.fromUomId === baseUomId) {
      issues.push(`Base UoM ${baseUomId} cannot be a source unit in canonical larger-to-smaller edges.`);
    }

    const pairKey = [conversion.fromUomId, conversion.toUomId].sort().join('::');
    if (directionlessPairs.has(pairKey)) {
      issues.push(`Duplicate or reverse conversion detected for pair ${pairKey}.`);
    } else {
      directionlessPairs.add(pairKey);
    }

    const existing = outgoing.get(conversion.fromUomId);
    if (existing) {
      issues.push(
        `UoM ${conversion.fromUomId} already has a canonical path to ${existing.toUomId}; parallel paths are not allowed.`,
      );
    } else {
      outgoing.set(conversion.fromUomId, conversion);
    }
  }

  const nodes = new Set<string>([baseUomId]);
  for (const conversion of conversions) {
    nodes.add(conversion.fromUomId);
    nodes.add(conversion.toUomId);
  }

  for (const node of nodes) {
    if (node === baseUomId) continue;
    const seen = new Set<string>();
    let current = node;
    let resolved = false;

    while (!resolved) {
      if (seen.has(current)) {
        issues.push(`Loop detected in item UoM graph involving ${current}.`);
        break;
      }
      seen.add(current);

      const edge = outgoing.get(current);
      if (!edge) {
        issues.push(`UoM ${node} does not resolve to base UoM ${baseUomId}.`);
        break;
      }

      current = edge.toUomId;
      if (current === baseUomId) {
        resolved = true;
      }
    }
  }

  return { isValid: issues.length === 0, issues };
}

export function assertCanonicalUomGraph(baseUomId: string, conversions: ItemUomConversion[]): void {
  const result = validateCanonicalUomGraph(baseUomId, conversions);
  if (!result.isValid) {
    throw new ValidationError(result.issues.join(' '));
  }
}

export function resolveFactorToBase(
  baseUomId: string,
  sourceUomId: string | null | undefined,
  conversions: ItemUomConversion[],
): ResolvedUomConversion {
  if (!sourceUomId || sourceUomId === baseUomId) {
    return {
      baseUomId,
      factorToBase: new Decimal(1),
      path: [baseUomId],
    };
  }

  assertCanonicalUomGraph(baseUomId, conversions);

  const outgoing = new Map(conversions.map((conversion) => [conversion.fromUomId, conversion]));
  const seen = new Set<string>();
  const path = [sourceUomId];
  let current = sourceUomId;
  let factorToBase = new Decimal(1);

  while (current !== baseUomId) {
    if (seen.has(current)) {
      throw new ValidationError(`Loop detected while resolving UoM ${sourceUomId} to base ${baseUomId}.`);
    }
    seen.add(current);

    const edge = outgoing.get(current);
    if (!edge) {
      throw new ValidationError(`No canonical conversion path from UoM ${sourceUomId} to base ${baseUomId}.`);
    }

    factorToBase = factorToBase.times(parseFactor(edge.factor));
    current = edge.toUomId;
    path.push(current);
  }

  return {
    baseUomId,
    factorToBase,
    path,
  };
}

export function convertQuantityToBase(
  quantity: number | string,
  factorToBase: Decimal | number | string,
): Decimal {
  return new Decimal(quantity).times(new Decimal(factorToBase));
}

export function normalizeEnteredUnitPriceToBase(
  enteredUnitPrice: number | string,
  factorToBase: Decimal | number | string,
): Decimal {
  const factor = new Decimal(factorToBase);
  if (!factor.isFinite() || factor.lt(1)) {
    throw new ValidationError(`Factor to base must be >= 1. Received ${factorToBase}.`);
  }
  return new Decimal(enteredUnitPrice).div(factor);
}

export function denormalizeBaseUnitPrice(
  baseUnitPrice: number | string,
  factorToBase: Decimal | number | string,
): Decimal {
  return new Decimal(baseUnitPrice).times(new Decimal(factorToBase));
}

export function formatCanonicalConversionLabel(
  fromUomName: string,
  toUomName: string,
  factor: number | string,
): string {
  return `1 ${fromUomName} = ${new Decimal(factor).toString()} ${toUomName}`;
}