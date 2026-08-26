/**
 * Soft quarantine SSOT — single-store mode adapter (ADR-004 / LQ13).
 * Quarantine = status + audit only; disposal uses existing LOSS_DISPOSAL map.
 */

export type SoftQuarantineReason = 'EXPIRED' | 'DAMAGE';

export type SoftQuarantineLotStatus = 'EXPIRED' | 'QUARANTINED';

/** Aging / dispose bucket — same filter vocabulary as hard quarantine stores. */
export type SoftQuarantineBucket = 'EXPIRED' | 'DAMAGE';

export function softQuarantineStatusForReason(reason: SoftQuarantineReason): SoftQuarantineLotStatus {
  return reason === 'EXPIRED' ? 'EXPIRED' : 'QUARANTINED';
}

export function softQuarantineBucketForStatus(status: string | null | undefined): SoftQuarantineBucket {
  const s = String(status || '').toUpperCase();
  if (s === 'EXPIRED') return 'EXPIRED';
  return 'DAMAGE';
}

export function softQuarantineReasonForBucket(bucket: SoftQuarantineBucket): 'EXPIRY' | 'DAMAGE' {
  return bucket === 'EXPIRED' ? 'EXPIRY' : 'DAMAGE';
}

export const LOT_SPLIT_REFERENCE_TYPE = 'LOT_SPLIT' as const;

export const SOFT_QUARANTINE_REFERENCE_TYPE = 'SOFT_QUARANTINE' as const;

/** P4 — auto-dispose only EXPIRED bucket (DAMAGE/RETURN stay manual). */
export const QUARANTINE_AUTO_DISPOSE_BUCKET = 'EXPIRED' as const;

/** Default aging floor when tenant has not customized settings. */
export const QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS = 30;

/** Cap per scheduled/manual run to avoid unbounded P&L dumps. */
export const QUARANTINE_AUTO_DISPOSE_MAX_LINES_PER_RUN = 100;
