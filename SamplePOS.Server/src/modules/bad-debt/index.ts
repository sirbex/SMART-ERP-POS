/**
 * Bad Debt module barrel — Phase 4A–4D.
 */

export { isBadDebtWriteoffEnabled } from './badDebtSettings.js';
export {
  BAD_DEBT_TOUCHPOINT_REGISTRY,
  BAD_DEBT_WRITE_GATEWAY,
  countBadDebtTouchpointsByStatus,
} from './badDebtTouchpointRegistry.js';
export type {
  BadDebtTouchpoint,
  BadDebtTouchpointStatus,
} from './badDebtTouchpointRegistry.js';
export { ensureBadDebtExpenseAccount } from './ensureBadDebtAccount.js';
export {
  createAndPostWriteoff,
  reverseWriteoff,
  getWriteoffDocument,
  getWriteoffWorkqueue,
  listRecentWriteoffs,
} from './badDebtService.js';
export type {
  CreateAndPostWriteoffInput,
  WriteoffLineInput,
} from './badDebtService.js';
export {
  scanOrphanArExpenseWriteoffs,
  AR_EXPENSE_CR_ALLOWLIST,
} from './badDebtOrphanScan.js';
export type { OrphanArExpenseWriteoffRow } from './badDebtOrphanScan.js';
export { badDebtRoutes } from './badDebtRoutes.js';
