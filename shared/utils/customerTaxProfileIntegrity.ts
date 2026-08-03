/**
 * Customer VAT registration integrity helpers (UI + API).
 * VAT-registered status without a TIN is incomplete and must not be presented as fully registered.
 */

export type CustomerTaxLike = {
  vatRegistered?: boolean | null;
  taxExempt?: boolean | null;
  taxProfile?: string | null;
  tin?: string | null;
  defaultVatRate?: number | null;
  vatRegistrationDate?: string | null;
  taxEffectiveFrom?: string | null;
};

export function isTaxExemptCustomer(profile: CustomerTaxLike | null | undefined): boolean {
  if (!profile) return false;
  return profile.taxExempt === true || profile.taxProfile === 'EXEMPT';
}

/** True when status is VAT-registered (not exempt), regardless of TIN completeness. */
export function isVatRegisteredStatus(profile: CustomerTaxLike | null | undefined): boolean {
  if (!profile || isTaxExemptCustomer(profile)) return false;
  return profile.vatRegistered === true || profile.taxProfile === 'VAT_REGISTERED';
}

export function normalizeTin(tin: string | null | undefined): string {
  return String(tin ?? '').trim();
}

/**
 * VAT registered with no TIN — invalid operational profile (BPED-style incomplete data).
 * Optional fields (rate, dates) are recommended but TIN is the hard requirement.
 */
export function isIncompleteVatRegistration(profile: CustomerTaxLike | null | undefined): boolean {
  if (!isVatRegisteredStatus(profile)) return false;
  return normalizeTin(profile?.tin) === '';
}

export function describeCustomerTaxStatus(profile: CustomerTaxLike | null | undefined): {
  status: 'EXEMPT' | 'VAT_REGISTERED' | 'VAT_INCOMPLETE' | 'STANDARD';
  label: string;
} {
  if (isTaxExemptCustomer(profile)) {
    return { status: 'EXEMPT', label: 'Tax exempt' };
  }
  if (isIncompleteVatRegistration(profile)) {
    return { status: 'VAT_INCOMPLETE', label: 'VAT incomplete (TIN required)' };
  }
  if (isVatRegisteredStatus(profile)) {
    return { status: 'VAT_REGISTERED', label: 'VAT registered' };
  }
  return { status: 'STANDARD', label: 'Standard' };
}

export type VatProfileAssertInput = {
  vatRegistered?: boolean | null;
  taxExempt?: boolean | null;
  taxProfile?: string | null;
  tin?: string | null;
};

/**
 * @returns Error message if VAT-registered status is set without TIN; null if OK.
 */
export function vatRegistrationTinError(input: VatProfileAssertInput): string | null {
  if (!isVatRegisteredStatus(input)) return null;
  if (normalizeTin(input.tin) !== '') return null;
  return 'VAT-registered customers require a TIN. Enter the Tax Identification Number, or set tax status to Standard.';
}

/**
 * Merge partial update with existing row so we validate the resulting profile.
 */
export function mergeCustomerTaxForAssert(
  existing: CustomerTaxLike,
  patch: VatProfileAssertInput,
): VatProfileAssertInput {
  return {
    vatRegistered:
      patch.vatRegistered !== undefined ? patch.vatRegistered : existing.vatRegistered,
    taxExempt: patch.taxExempt !== undefined ? patch.taxExempt : existing.taxExempt,
    taxProfile: patch.taxProfile !== undefined ? patch.taxProfile : existing.taxProfile,
    tin: patch.tin !== undefined ? patch.tin : existing.tin,
  };
}
