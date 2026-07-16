/**
 * Resolve WHT default from partner master data for payment screens.
 * Liable + valid default type → auto-select; liable without type → hint only.
 */

export type PartnerWhtSide = 'SUPPLIER' | 'CUSTOMER';

export type PartnerWhtFields = {
  whtLiable?: boolean | null;
  defaultWhtTypeId?: string | null;
};

export type WhtTypeOption = {
  id: string;
  appliesTo?: string | null;
  isActive?: boolean | null;
};

export type PartnerWhtResolution = {
  whtTypeId: string | undefined;
  /** Operator-facing hint under the WHT control */
  hint: string | null;
  /** True when master says liable */
  liable: boolean;
};

function typeApplies(type: WhtTypeOption, side: PartnerWhtSide): boolean {
  const a = String(type.appliesTo || '').toUpperCase();
  return a === side || a === 'BOTH';
}

export function resolvePartnerWhtDefault(
  partner: PartnerWhtFields | null | undefined,
  types: WhtTypeOption[],
  side: PartnerWhtSide,
): PartnerWhtResolution {
  const liable = Boolean(partner?.whtLiable);
  if (!liable) {
    return { whtTypeId: undefined, hint: null, liable: false };
  }

  const active = types.filter((t) => t.isActive !== false && typeApplies(t, side));
  const preferred = partner?.defaultWhtTypeId
    ? active.find((t) => t.id === partner.defaultWhtTypeId)
    : undefined;

  if (preferred) {
    return {
      whtTypeId: preferred.id,
      hint: 'Applied from partner master — you can change or clear.',
      liable: true,
    };
  }

  return {
    whtTypeId: undefined,
    hint: 'This partner is marked for withholding — select a WHT type (or leave none to skip).',
    liable: true,
  };
}
