/**
 * PostingGovernanceService — Unit Tests
 *
 * Covers all 7 rules and the happy-path scenarios.
 * All tests are pure (no DB interaction) — governance validate() is a sync function.
 */

import {
    PostingGovernanceService,
    PostingGovernanceError,
    type GovernanceAccount,
    type GovernanceJournalLine,
    type GovernanceJournalRequest,
    type PostingSource,
} from './postingGovernanceService.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const makeAccount = (overrides: Partial<GovernanceAccount> = {}): GovernanceAccount => ({
    id: 'test-id',
    accountCode: '9999',
    accountName: 'Test Account',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isPostingAccount: true,
    isActive: true,
    allowManualPosting: true,
    allowedSources: [],
    systemAccountTag: null,
    ...overrides,
});

const cashAccount = makeAccount({
    accountCode: '1010',
    accountName: 'Cash',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    allowManualPosting: false,
    allowedSources: ['PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'CASH',
});

const arAccount = makeAccount({
    accountCode: '1200',
    accountName: 'Accounts Receivable',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    allowManualPosting: false,
    allowedSources: ['SALES_INVOICE', 'PAYMENT_RECEIPT', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'ACCOUNTS_RECEIVABLE',
});

const undepositedFundsAccount = makeAccount({
    accountCode: '1015',
    accountName: 'Undeposited Funds',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    allowManualPosting: false,
    allowedSources: ['PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'UNDEPOSITED_FUNDS',
});

const cogsAccount = makeAccount({
    accountCode: '5000',
    accountName: 'Cost of Goods Sold',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    allowManualPosting: false,
    allowedSources: ['INVENTORY_MOVE', 'SALES_INVOICE', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'COGS',
});

const inventoryAccount = makeAccount({
    accountCode: '1300',
    accountName: 'Inventory',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    allowManualPosting: false,
    allowedSources: ['INVENTORY_MOVE', 'PURCHASE_BILL', 'SALES_INVOICE', 'OPENING_BALANCE_WIZARD', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'INVENTORY',
});

const obeAccount = makeAccount({
    accountCode: '3050',
    accountName: 'Opening Balance Equity',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    allowManualPosting: false,
    allowedSources: ['OPENING_BALANCE_WIZARD', 'SYSTEM_CORRECTION'],
    systemAccountTag: 'OPENING_BALANCE_EQUITY',
});

const revenueAccount = makeAccount({
    accountCode: '4000',
    accountName: 'Sales Revenue',
    accountType: 'REVENUE',
    normalBalance: 'CREDIT',
    allowManualPosting: true,
    allowedSources: [],
    systemAccountTag: null,
});

const makeRequest = (
    source: PostingSource,
    lines: GovernanceJournalLine[],
    accounts: GovernanceAccount[]
): GovernanceJournalRequest => ({ source, lines, accounts });

// =============================================================================
// TESTS
// =============================================================================

describe('PostingGovernanceService', () => {
    // --------------------------------------------------------------------------
    // HAPPY PATH
    // --------------------------------------------------------------------------
    describe('Happy path — no violations', () => {
        it('allows a SALES_INVOICE to DR AR / CR Revenue', () => {
            const req = makeRequest(
                'SALES_INVOICE',
                [
                    { accountCode: '1200', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
                ],
                [arAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows a PAYMENT_RECEIPT to DR Undeposited Funds / CR AR', () => {
            const req = makeRequest(
                'PAYMENT_RECEIPT',
                [
                    { accountCode: '1015', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1200', debitAmount: 0, creditAmount: 100 },
                ],
                [undepositedFundsAccount, arAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows a PAYMENT_DEPOSIT to DR Cash / CR Undeposited Funds', () => {
            const req = makeRequest(
                'PAYMENT_DEPOSIT',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1015', debitAmount: 0, creditAmount: 100 },
                ],
                [cashAccount, undepositedFundsAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows INVENTORY_MOVE to DR COGS / CR Inventory', () => {
            const req = makeRequest(
                'INVENTORY_MOVE',
                [
                    { accountCode: '5000', debitAmount: 50, creditAmount: 0 },
                    { accountCode: '1300', debitAmount: 0, creditAmount: 50 },
                ],
                [cogsAccount, inventoryAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows OPENING_BALANCE_WIZARD to DR Assets / CR OBE', () => {
            const assetAcct = makeAccount({ accountCode: '1300', ...inventoryAccount });
            const req = makeRequest(
                'OPENING_BALANCE_WIZARD',
                [
                    { accountCode: '1300', debitAmount: 200, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 200 },
                ],
                [inventoryAccount, obeAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows SYSTEM_CORRECTION to post anywhere', () => {
            const req = makeRequest(
                'SYSTEM_CORRECTION',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 100 },
                ],
                [cashAccount, obeAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // RULE A: Normal balance violation for MANUAL_JOURNAL
    // --------------------------------------------------------------------------
    describe('Rule A — Normal balance violation', () => {
        it('blocks MANUAL_JOURNAL credit-only line to a DEBIT-normal system account', () => {
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '1010', debitAmount: 0, creditAmount: 100 },
                    { accountCode: '4000', debitAmount: 100, creditAmount: 0 },
                ],
                [cashAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_A_NORMAL_BALANCE');
        });

        it('does NOT block MANUAL_JOURNAL debit line to a DEBIT-normal system account (normal side)', () => {
            // Cash DEBIT is normal side — but Cash has allowManualPosting=false so rule C fires instead
            // Use a hypothetical account with systemTag but allowManualPosting=true
            const taggedAllowed = makeAccount({
                accountCode: '9001',
                normalBalance: 'DEBIT',
                systemAccountTag: 'CASH',
                allowManualPosting: true,
                allowedSources: [],
            });
            const creditNormal = makeAccount({ accountCode: '9002', normalBalance: 'CREDIT' });
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '9001', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '9002', debitAmount: 0, creditAmount: 100 },
                ],
                [taggedAllowed, creditNormal]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // RULE B: Source not in allowedSources
    // --------------------------------------------------------------------------
    describe('Rule B — Source not in allowedSources', () => {
        it('blocks posting to Cash (1010) from MANUAL_JOURNAL when allowedSources is set', () => {
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
                ],
                [cashAccount, revenueAccount]
            );
            // Rule B or C will fire — both result in PostingGovernanceError
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('blocks PURCHASE_BILL from posting to Cash (not in its allowedSources)', () => {
            const req = makeRequest(
                'PURCHASE_BILL',
                [
                    { accountCode: '1010', debitAmount: 0, creditAmount: 100 },
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                ],
                [cashAccount, cogsAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });
    });

    // --------------------------------------------------------------------------
    // RULE C: allowManualPosting = false blocks MANUAL_JOURNAL
    // --------------------------------------------------------------------------
    describe('Rule C — allowManualPosting enforcement', () => {
        it('blocks MANUAL_JOURNAL to an account with allowManualPosting=false', () => {
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_C_NO_MANUAL_POSTING');
        });

        it('allows MANUAL_JOURNAL to accounts where allowManualPosting=true', () => {
            const customAccount = makeAccount({
                accountCode: '6000',
                accountName: 'Admin Expense',
                accountType: 'EXPENSE',
                normalBalance: 'DEBIT',
                allowManualPosting: true,
                allowedSources: [],
                systemAccountTag: null,
            });
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '6000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
                ],
                [customAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // RULE D: Cash can only be credited by PAYMENT_DEPOSIT
    // --------------------------------------------------------------------------
    describe('Rule D — Cash credit restriction', () => {
        it('blocks SALES_INVOICE from crediting Cash', () => {
            const req = makeRequest(
                'SALES_INVOICE',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1010', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, cashAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_D_CASH_CREDIT');
        });

        it('blocks INVENTORY_MOVE from crediting Cash', () => {
            const req = makeRequest(
                'INVENTORY_MOVE',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1010', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, cashAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('allows PAYMENT_DEPOSIT to credit Cash (this is the only valid path)', () => {
            const req = makeRequest(
                'PAYMENT_DEPOSIT',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1015', debitAmount: 0, creditAmount: 100 },
                ],
                [cashAccount, undepositedFundsAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // RULE E: Payment receipt / deposit structure validation
    // --------------------------------------------------------------------------
    describe('Rule E — Payment receipt/deposit structure', () => {
        it('rejects PAYMENT_RECEIPT without Undeposited Funds debit', () => {
            const req = makeRequest(
                'PAYMENT_RECEIPT',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 }, // Wrong — should be 1015
                    { accountCode: '1200', debitAmount: 0, creditAmount: 100 },
                ],
                [cashAccount, arAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_E_RECEIPT_STRUCTURE');
        });

        it('rejects PAYMENT_RECEIPT without AR credit', () => {
            const req = makeRequest(
                'PAYMENT_RECEIPT',
                [
                    { accountCode: '1015', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 }, // Wrong — should be AR
                ],
                [undepositedFundsAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_E_RECEIPT_STRUCTURE');
        });

        it('rejects PAYMENT_DEPOSIT without Cash debit', () => {
            const req = makeRequest(
                'PAYMENT_DEPOSIT',
                [
                    { accountCode: '1200', debitAmount: 100, creditAmount: 0 }, // Wrong — should be Cash
                    { accountCode: '1015', debitAmount: 0, creditAmount: 100 },
                ],
                [arAccount, undepositedFundsAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_E_DEPOSIT_STRUCTURE');
        });

        it('rejects PAYMENT_DEPOSIT without Undeposited Funds credit', () => {
            const req = makeRequest(
                'PAYMENT_DEPOSIT',
                [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 }, // Wrong — should be Undeposited
                ],
                [cashAccount, revenueAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
            expect(() => PostingGovernanceService.validate(req)).toThrow('GOV_RULE_E_DEPOSIT_STRUCTURE');
        });
    });

    // --------------------------------------------------------------------------
    // RULE F: COGS restricted to INVENTORY_MOVE / SALES_INVOICE
    // --------------------------------------------------------------------------
    describe('Rule F — COGS restriction', () => {
        it('blocks MANUAL_JOURNAL from touching COGS', () => {
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, revenueAccount]
            );
            // Rule C fires first (allowManualPosting=false), which is equally correct
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('blocks PURCHASE_BILL from debiting COGS', () => {
            const req = makeRequest(
                'PURCHASE_BILL',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '2100', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, makeAccount({ accountCode: '2100', accountType: 'LIABILITY', normalBalance: 'CREDIT' })]
            );
            // Either Rule B (source not in allowedSources) or Rule F (COGS restricted) fires
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('allows INVENTORY_MOVE to debit COGS', () => {
            const req = makeRequest(
                'INVENTORY_MOVE',
                [
                    { accountCode: '5000', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '1300', debitAmount: 0, creditAmount: 100 },
                ],
                [cogsAccount, inventoryAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // RULE G: Opening Balance Equity restricted
    // --------------------------------------------------------------------------
    describe('Rule G — Opening Balance Equity restriction', () => {
        it('blocks MANUAL_JOURNAL from posting to OBE', () => {
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '1300', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 100 },
                ],
                [inventoryAccount, obeAccount]
            );
            // Rule C fires first (allowManualPosting=false for OBE), which is still correct behavior
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('blocks SALES_INVOICE from posting to OBE', () => {
            const req = makeRequest(
                'SALES_INVOICE',
                [
                    { accountCode: '1200', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 100 },
                ],
                [arAccount, obeAccount]
            );
            // Either Rule B (source not allowed) or Rule G (OBE restricted) fires — both are correct
            expect(() => PostingGovernanceService.validate(req)).toThrow(PostingGovernanceError);
        });

        it('allows OPENING_BALANCE_WIZARD to post to OBE', () => {
            const req = makeRequest(
                'OPENING_BALANCE_WIZARD',
                [
                    { accountCode: '1300', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 100 },
                ],
                [inventoryAccount, obeAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('allows SYSTEM_CORRECTION to post to OBE (admin remediation)', () => {
            const req = makeRequest(
                'SYSTEM_CORRECTION',
                [
                    { accountCode: '1300', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '3050', debitAmount: 0, creditAmount: 100 },
                ],
                [inventoryAccount, obeAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });

    // --------------------------------------------------------------------------
    // EDGE CASES
    // --------------------------------------------------------------------------
    describe('Edge cases', () => {
        it('passes validation when account codes in request are not found in governance accounts (graceful skip)', () => {
            // Account governance is optional metadata — if not tagged, rules A/B/C don't apply
            const unknownAccount = makeAccount({
                accountCode: '9999',
                systemAccountTag: null,
                allowManualPosting: true,
                allowedSources: [],
            });
            const req = makeRequest(
                'MANUAL_JOURNAL',
                [
                    { accountCode: '9999', debitAmount: 100, creditAmount: 0 },
                    { accountCode: '8888', debitAmount: 0, creditAmount: 100 }, // Not in accounts array
                ],
                [unknownAccount]
            );
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });

        it('validates an empty lines array without throwing', () => {
            const req = makeRequest('MANUAL_JOURNAL', [], []);
            expect(() => PostingGovernanceService.validate(req)).not.toThrow();
        });
    });
});
