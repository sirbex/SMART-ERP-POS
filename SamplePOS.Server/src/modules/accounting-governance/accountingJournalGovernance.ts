/**
 * ACCOUNTING JOURNAL GOVERNANCE — single enforcement pipeline for AccountingCore.
 *
 * No SQL posting triggers: all journals flow through createJournalEntry() only.
 */
import type { GovernanceJournalContext } from './types.js';
import { validateApJournalPosting } from './apJournalGovernance.js';
import { validateArJournalPosting } from './arJournalGovernance.js';
import { validateInventoryJournalPosting } from './inventoryJournalGovernance.js';
import { validateCashJournalPosting } from './cashJournalGovernance.js';
import { validateBankJournalPosting } from './bankJournalGovernance.js';

export type { GovernanceJournalContext, GovernanceJournalLine } from './types.js';
export {
  validateApJournalPosting,
  AP_ACCOUNT_CODE,
} from './apJournalGovernance.js';
export {
  validateArJournalPosting,
  validateArJournalPostingAlways,
  validateArJournalPostingEntity,
  isArEntityAttributionEnforced,
  getArGovernanceMode,
  AR_ACCOUNT_CODE,
  inferArWorkflow,
} from './arJournalGovernance.js';
export type { ArGovernanceMode } from './arJournalGovernance.js';
export { customerArLine, requireCustomerIdForAr, CUSTOMER_ENTITY_TYPE } from './arPostingHelpers.js';

export function validateJournal(ctx: GovernanceJournalContext): void {
  validateApJournalPosting(ctx);
  validateArJournalPosting(ctx);
  validateInventoryJournalPosting(ctx);
  validateCashJournalPosting(ctx);
  validateBankJournalPosting(ctx);
}
