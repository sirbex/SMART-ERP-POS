/**
 * POSTING GOVERNANCE SERVICE
 *
 * Enterprise-grade posting controls comparable to SAP FI and Odoo accounting.
 *
 * SAP analogy:
 *   - Account master "posting block" (AllowManualPosting = false)
 *   - Field status group validation (AllowedSources)
 *   - Normal balance enforcement via substitution rules
 *
 * Odoo analogy:
 *   - account.account.deprecated flag
 *   - journal type restrictions
 *   - account tag constraints
 *
 * ALL rules are HARD BLOCKS — no warnings, no overrides.
 * Once violated, the transaction is rejected with a descriptive error.
 *
 * Architecture note:
 *   This service is called from AccountingCore.createJournalEntry() BEFORE
 *   any database write. The governance check is the outermost guard.
 */

import type pg from 'pg';

// =============================================================================
// POSTING SOURCE TYPE
// =============================================================================

/**
 * Every journal entry must declare its source.
 * This is the single axis of control for posting governance.
 */
export type PostingSource =
    | 'SALES_INVOICE'           // POS sale / invoice posting
    | 'PAYMENT_RECEIPT'         // Customer payment → Dr Undeposited Funds / Cr AR
    | 'PAYMENT_DEPOSIT'         // Bank deposit → Dr Cash / Cr Undeposited Funds
    | 'PURCHASE_BILL'           // Supplier bill / goods receipt
    | 'INVENTORY_MOVE'          // Stock adjustment, damage, expiry, COGS
    | 'OPENING_BALANCE_WIZARD'  // One-time OBE setup — locked after completion
    | 'MANUAL_JOURNAL'          // Human-entered journal entry
    | 'SYSTEM_CORRECTION'       // Admin remediation scripts (e.g. data-fix)
    | 'PAYROLL'                 // Payroll disbursements
    | 'ASSET_DEPRECIATION'      // Fixed asset depreciation runs
    | 'PERIOD_CLOSE'            // Retained earnings close-out
    | 'FX_REVALUATION';         // Foreign currency revaluation

// =============================================================================
// GOVERNANCE ACCOUNT SHAPE
// (Extends the base Account with governance-specific columns)
// =============================================================================

export interface GovernanceAccount {
    id: string;
    accountCode: string;
    accountName: string;
    accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    normalBalance: 'DEBIT' | 'CREDIT';
    isPostingAccount: boolean;
    isActive: boolean;
    allowManualPosting: boolean;           // AllowManualPosting
    allowedSources: PostingSource[];       // AllowedSources
    systemAccountTag: string | null;       // SystemAccountTag
}

// =============================================================================
// GOVERNANCE JOURNAL LINE
// =============================================================================

export interface GovernanceJournalLine {
    accountCode: string;
    debitAmount: number;
    creditAmount: number;
}

export interface GovernanceJournalRequest {
    source: PostingSource;
    lines: GovernanceJournalLine[];
    accounts: GovernanceAccount[];   // Pre-fetched from DB — one entry per unique account used
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Standalone error class — does NOT extend AccountingError to avoid circular deps.
 * accountingCore imports this file; this file must NOT import accountingCore.
 */
export class PostingGovernanceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly context?: Record<string, unknown>
    ) {
        // Include code in message so Jest toThrow('CODE') assertions work
        super(`[${code}] ${message}`);
        this.name = 'PostingGovernanceError';
    }
}

// =============================================================================
// HELPER: find governance account by code
// =============================================================================

function findAccount(accounts: GovernanceAccount[], code: string): GovernanceAccount | undefined {
    return accounts.find((a) => a.accountCode === code);
}

// =============================================================================
// POSTING GOVERNANCE SERVICE
// =============================================================================

export class PostingGovernanceService {
    /**
     * Validate a proposed journal entry against all governance rules.
     * Throws PostingGovernanceError on any violation.
     *
     * Call this BEFORE any database write.
     */
    static validate(request: GovernanceJournalRequest): void {
        const { source, lines, accounts } = request;

        for (const line of lines) {
            const account = findAccount(accounts, line.accountCode);

            // Account not found — AccountingCore will handle the proper error upstream,
            // but governance should not crash on unknown account.
            if (!account) continue;

            const isDebit = line.debitAmount > 0;
            const isCredit = line.creditAmount > 0;

            // ------------------------------------------------------------------
            // Rule A: Normal balance violation — block reversals of normal side
            //         that would cause the account to go to the wrong side overall.
            //
            // We enforce that system-tagged accounts cannot be posted on the
            // WRONG side (e.g. Cash cannot go Credit) when source is MANUAL_JOURNAL.
            // For automated sources, the service itself is responsible for correct
            // posting direction; the governance service enforces structural rules.
            //
            // Implementation: For MANUAL_JOURNAL only — if account's normal balance
            // is DEBIT and a credit-only line is submitted, reject it for protected
            // accounts. And vice-versa for CREDIT-normal accounts.
            // ------------------------------------------------------------------
            if (source === 'MANUAL_JOURNAL' && account.systemAccountTag !== null) {
                const normalIsDebit = account.normalBalance === 'DEBIT';
                if (normalIsDebit && isCredit && !isDebit) {
                    throw new PostingGovernanceError(
                        `Account ${account.accountCode} (${account.accountName}) is a debit-normal system account. ` +
                        `Manual credit entries are not permitted. ` +
                        `Normal balance: DEBIT, tag: ${account.systemAccountTag}.`,
                        'GOV_RULE_A_NORMAL_BALANCE',
                        { accountCode: account.accountCode, normalBalance: account.normalBalance, source, tag: account.systemAccountTag }
                    );
                }
                const normalIsCredit = account.normalBalance === 'CREDIT';
                if (normalIsCredit && isDebit && !isCredit) {
                    throw new PostingGovernanceError(
                        `Account ${account.accountCode} (${account.accountName}) is a credit-normal system account. ` +
                        `Manual debit entries are not permitted. ` +
                        `Normal balance: CREDIT, tag: ${account.systemAccountTag}.`,
                        'GOV_RULE_A_NORMAL_BALANCE',
                        { accountCode: account.accountCode, normalBalance: account.normalBalance, source, tag: account.systemAccountTag }
                    );
                }
            }

            // ------------------------------------------------------------------
            // Rule B: Source not in account.allowedSources → block
            //         (only enforced when allowedSources is a non-empty list)
            //
            //  NOTE: For PAYMENT_RECEIPT and PAYMENT_DEPOSIT sources, Rule E performs
            //  a complete structural check of the entry. We skip per-line Rule B for
            //  these sources to avoid false positives (e.g. PAYMENT_DEPOSIT posting to
            //  AR temporarily before Rule E validates the overall structure).
            //  We also skip Rule B on CASH-tagged accounts — Rule D handles those explicitly.
            //  We also skip Rule B on accounts with allowManualPosting=false when source is
            //  MANUAL_JOURNAL — Rule C handles those and gives a more specific message.
            // ------------------------------------------------------------------
            const isPaymentSource = source === 'PAYMENT_RECEIPT' || source === 'PAYMENT_DEPOSIT';
            const isCashTaggedCreditLine = account.systemAccountTag === 'CASH' && line.creditAmount > 0;
            const deferToRuleC = !account.allowManualPosting && source === 'MANUAL_JOURNAL';
            if (!isPaymentSource && !isCashTaggedCreditLine && !deferToRuleC && account.allowedSources.length > 0) {
                if (!account.allowedSources.includes(source)) {
                    throw new PostingGovernanceError(
                        `Source '${source}' is not permitted to post to account ${account.accountCode} (${account.accountName}). ` +
                        `Allowed sources: [${account.allowedSources.join(', ')}].`,
                        'GOV_RULE_B_SOURCE_NOT_ALLOWED',
                        { accountCode: account.accountCode, source, allowedSources: account.allowedSources }
                    );
                }
            }

            // ------------------------------------------------------------------
            // Rule C: allowManualPosting = false + source = MANUAL_JOURNAL → block
            // ------------------------------------------------------------------
            if (!account.allowManualPosting && source === 'MANUAL_JOURNAL') {
                throw new PostingGovernanceError(
                    `Account ${account.accountCode} (${account.accountName}) does not allow manual journal entries. ` +
                    `This account is system-controlled. Use the appropriate module to post to it.`,
                    'GOV_RULE_C_NO_MANUAL_POSTING',
                    { accountCode: account.accountCode, systemAccountTag: account.systemAccountTag }
                );
            }
        }

        // ------------------------------------------------------------------
        // Rule D: Crediting a CASH-tagged account is only allowed from PAYMENT_DEPOSIT
        //         (cash can only leave via a deposit reversal or deposit itself)
        // ------------------------------------------------------------------
        for (const line of lines) {
            if (line.creditAmount > 0) {
                const account = findAccount(accounts, line.accountCode);
                if (account?.systemAccountTag === 'CASH') {
                    if (source !== 'PAYMENT_DEPOSIT' && source !== 'SYSTEM_CORRECTION') {
                        throw new PostingGovernanceError(
                            `Cannot credit Cash account ${account.accountCode} (${account.accountName}) from source '${source}'. ` +
                            `Cash may only be credited by a bank deposit (PAYMENT_DEPOSIT) or system correction.`,
                            'GOV_RULE_D_CASH_CREDIT',
                            { accountCode: account.accountCode, source }
                        );
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        // Rule E: Payment receipt must be Dr Undeposited Funds / Cr AR
        //         Payment deposit must be Dr Cash / Cr Undeposited Funds
        // ------------------------------------------------------------------
        if (source === 'PAYMENT_RECEIPT') {
            const hasDebitUndepositedFunds = lines.some((l) => {
                const acct = findAccount(accounts, l.accountCode);
                return l.debitAmount > 0 && acct?.systemAccountTag === 'UNDEPOSITED_FUNDS';
            });
            const hasCreditAR = lines.some((l) => {
                const acct = findAccount(accounts, l.accountCode);
                return l.creditAmount > 0 && acct?.systemAccountTag === 'ACCOUNTS_RECEIVABLE';
            });

            if (!hasDebitUndepositedFunds) {
                throw new PostingGovernanceError(
                    `PAYMENT_RECEIPT must debit Undeposited Funds (tag: UNDEPOSITED_FUNDS). ` +
                    `Payments must flow through the clearing account before reaching the bank.`,
                    'GOV_RULE_E_RECEIPT_STRUCTURE',
                    { source }
                );
            }
            if (!hasCreditAR) {
                throw new PostingGovernanceError(
                    `PAYMENT_RECEIPT must credit Accounts Receivable (tag: ACCOUNTS_RECEIVABLE). ` +
                    `Payment receipt reduces the AR balance.`,
                    'GOV_RULE_E_RECEIPT_STRUCTURE',
                    { source }
                );
            }
        }

        if (source === 'PAYMENT_DEPOSIT') {
            const hasDebitCash = lines.some((l) => {
                const acct = findAccount(accounts, l.accountCode);
                return l.debitAmount > 0 && acct?.systemAccountTag === 'CASH';
            });
            const hasCreditUndeposited = lines.some((l) => {
                const acct = findAccount(accounts, l.accountCode);
                return l.creditAmount > 0 && acct?.systemAccountTag === 'UNDEPOSITED_FUNDS';
            });

            if (!hasDebitCash) {
                throw new PostingGovernanceError(
                    `PAYMENT_DEPOSIT must debit a Cash account (tag: CASH). ` +
                    `Bank deposit moves money from Undeposited Funds to Cash.`,
                    'GOV_RULE_E_DEPOSIT_STRUCTURE',
                    { source }
                );
            }
            if (!hasCreditUndeposited) {
                throw new PostingGovernanceError(
                    `PAYMENT_DEPOSIT must credit Undeposited Funds (tag: UNDEPOSITED_FUNDS). ` +
                    `Bank deposit clears the Undeposited Funds balance.`,
                    'GOV_RULE_E_DEPOSIT_STRUCTURE',
                    { source }
                );
            }
        }

        // ------------------------------------------------------------------
        // Rule F: COGS-tagged account can only be touched by INVENTORY_MOVE or SALES_INVOICE
        // ------------------------------------------------------------------
        for (const line of lines) {
            if (line.debitAmount > 0 || line.creditAmount > 0) {
                const account = findAccount(accounts, line.accountCode);
                if (account?.systemAccountTag === 'COGS') {
                    if (source !== 'INVENTORY_MOVE' && source !== 'SALES_INVOICE' && source !== 'SYSTEM_CORRECTION') {
                        throw new PostingGovernanceError(
                            `Account ${account.accountCode} (${account.accountName}) is the Cost of Goods Sold account. ` +
                            `Only inventory movements (INVENTORY_MOVE, SALES_INVOICE) may post to COGS. ` +
                            `Received source: '${source}'.`,
                            'GOV_RULE_F_COGS_RESTRICTED',
                            { accountCode: account.accountCode, source }
                        );
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        // Rule G: Opening Balance Equity — only via OPENING_BALANCE_WIZARD
        //         (prevents manual back-door entries to equity)
        // ------------------------------------------------------------------
        for (const line of lines) {
            if (line.debitAmount > 0 || line.creditAmount > 0) {
                const account = findAccount(accounts, line.accountCode);
                if (account?.systemAccountTag === 'OPENING_BALANCE_EQUITY') {
                    if (source !== 'OPENING_BALANCE_WIZARD' && source !== 'SYSTEM_CORRECTION') {
                        throw new PostingGovernanceError(
                            `Account ${account.accountCode} (${account.accountName}) is the Opening Balance Equity account. ` +
                            `It can only be posted via the Opening Balance Wizard (OPENING_BALANCE_WIZARD). ` +
                            `Received source: '${source}'.`,
                            'GOV_RULE_G_OBE_RESTRICTED',
                            { accountCode: account.accountCode, source }
                        );
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        // Rule H: Inventory (tag = 'INVENTORY') — SAP-STRICT single source.
        //
        //   Any account tagged 'INVENTORY' (canonically 1300) may be posted
        //   to ONLY via the inventory movement engine (INVENTORY_MOVE),
        //   an auditor-controlled SYSTEM_CORRECTION, or the initial
        //   OPENING_BALANCE_WIZARD data load.
        //
        //   This defends the Inventory ↔ GL integrity invariant:
        //     SUM(cost_layers.remaining_quantity * unit_cost) == GL 1300
        //
        //   If a journal from any other source (SALES_INVOICE, PURCHASE_BILL,
        //   MANUAL_JOURNAL, etc.) attempts to touch 1300, throw immediately
        //   — this is a defense-in-depth check that runs even if an
        //   operator loosens the AllowedSources array in the DB.
        // ------------------------------------------------------------------
        const INVENTORY_ALLOWED_SOURCES: PostingSource[] = [
            'INVENTORY_MOVE',
            'SYSTEM_CORRECTION',
            'OPENING_BALANCE_WIZARD',
        ];
        for (const line of lines) {
            if (line.debitAmount > 0 || line.creditAmount > 0) {
                const account = findAccount(accounts, line.accountCode);
                if (account?.systemAccountTag === 'INVENTORY') {
                    if (!INVENTORY_ALLOWED_SOURCES.includes(source)) {
                        throw new PostingGovernanceError(
                            `Account ${account.accountCode} (${account.accountName}) is SAP-controlled Inventory. ` +
                            `Only the inventory movement engine (INVENTORY_MOVE), SYSTEM_CORRECTION, ` +
                            `or OPENING_BALANCE_WIZARD may post to it. Received source: '${source}'. ` +
                            `If this is a sale/GR/return flow, route the inventory leg through the ` +
                            `INVENTORY_MOVE engine instead of bundling it into a business-document journal.`,
                            'GOV_RULE_H_INVENTORY_STRICT',
                            { accountCode: account.accountCode, source }
                        );
                    }
                }
            }
        }
    }

    // ===========================================================================
    // DB HELPER — load governance accounts for a set of account codes
    // ===========================================================================

    /**
     * Fetch GovernanceAccount data for a set of account codes.
     * Used by callers that need to pre-load accounts before calling validate().
     */
    static async fetchGovernanceAccounts(
        client: pg.PoolClient,
        accountCodes: string[]
    ): Promise<GovernanceAccount[]> {
        if (accountCodes.length === 0) return [];

        const placeholders = accountCodes.map((_, i) => `$${i + 1}`).join(', ');
        const result = await client.query<{
            Id: string;
            AccountCode: string;
            AccountName: string;
            AccountType: string;
            NormalBalance: string;
            IsPostingAccount: boolean;
            IsActive: boolean;
            AllowManualPosting: boolean;
            AllowedSources: string[] | null;
            SystemAccountTag: string | null;
        }>(
            `SELECT
        "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
        "IsPostingAccount", "IsActive",
        "AllowManualPosting", "AllowedSources", "SystemAccountTag"
       FROM accounts
       WHERE "AccountCode" = ANY(ARRAY[${placeholders}])`,
            accountCodes
        );

        return result.rows.map((row) => ({
            id: row.Id,
            accountCode: row.AccountCode,
            accountName: row.AccountName,
            accountType: row.AccountType as GovernanceAccount['accountType'],
            normalBalance: row.NormalBalance as 'DEBIT' | 'CREDIT',
            isPostingAccount: row.IsPostingAccount,
            isActive: row.IsActive,
            allowManualPosting: row.AllowManualPosting ?? true,
            allowedSources: (row.AllowedSources ?? []) as PostingSource[],
            systemAccountTag: row.SystemAccountTag,
        }));
    }
}
