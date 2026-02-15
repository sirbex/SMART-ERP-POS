/**
 * BANKING MODULE - TypeScript Types
 * 
 * Following project conventions:
 * - camelCase in TypeScript
 * - snake_case in database
 * - Explicit DB row types with normalization functions
 */

// =============================================================================
// BANK ACCOUNT
// =============================================================================

export interface BankAccount {
    id: string;
    name: string;
    accountNumber?: string;
    bankName?: string;
    branch?: string;
    glAccountId: string;
    glAccountCode?: string;       // Joined from accounts table
    glAccountName?: string;       // Joined from accounts table
    currentBalance: number;
    lastReconciledBalance?: number;
    lastReconciledAt?: string;
    lowBalanceThreshold?: number;
    lowBalanceAlertEnabled?: boolean;
    isDefault: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface BankAccountDbRow {
    id: string;
    name?: string;              // New schema
    account_name?: string;      // Legacy schema
    account_code?: string;      // Legacy schema
    account_number?: string;
    bank_name?: string;
    branch?: string;
    gl_account_id: string;
    gl_account_code?: string;
    gl_account_name?: string;
    current_balance: string;
    last_reconciled_balance?: string;
    last_reconciled_at?: string;
    low_balance_threshold?: string;
    low_balance_alert_enabled?: boolean;
    is_default?: boolean;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

export function normalizeBankAccount(row: BankAccountDbRow): BankAccount {
    return {
        id: row.id,
        // Handle both legacy (account_name) and new (name) schemas
        name: row.name || row.account_name || '',
        accountNumber: row.account_number,
        bankName: row.bank_name,
        branch: row.branch,
        glAccountId: row.gl_account_id,
        glAccountCode: row.gl_account_code,
        glAccountName: row.gl_account_name,
        currentBalance: parseFloat(row.current_balance || '0'),
        lastReconciledBalance: row.last_reconciled_balance
            ? parseFloat(row.last_reconciled_balance)
            : undefined,
        lastReconciledAt: row.last_reconciled_at,
        lowBalanceThreshold: row.low_balance_threshold
            ? parseFloat(row.low_balance_threshold)
            : undefined,
        lowBalanceAlertEnabled: row.low_balance_alert_enabled ?? false,
        isDefault: row.is_default ?? false,
        isActive: row.is_active ?? true,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
    };
}

// =============================================================================
// BANK CATEGORY
// =============================================================================

export type CategoryDirection = 'IN' | 'OUT';

export interface BankCategory {
    id: string;
    code: string;
    name: string;
    direction: CategoryDirection;
    defaultAccountId?: string;
    defaultAccountCode?: string;
    defaultAccountName?: string;
    isSystem: boolean;
    isActive: boolean;
    displayOrder: number;
    createdAt: string;
}

export interface BankCategoryDbRow {
    id: string;
    code: string;
    name: string;
    direction: string;
    default_account_id?: string;
    default_account_code?: string;
    default_account_name?: string;
    is_system: boolean;
    is_active: boolean;
    display_order: number;
    created_at: string;
}

export function normalizeBankCategory(row: BankCategoryDbRow): BankCategory {
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        direction: row.direction as CategoryDirection,
        defaultAccountId: row.default_account_id,
        defaultAccountCode: row.default_account_code,
        defaultAccountName: row.default_account_name,
        isSystem: row.is_system,
        isActive: row.is_active,
        displayOrder: row.display_order,
        createdAt: row.created_at,
    };
}

// =============================================================================
// BANK TRANSACTION
// =============================================================================

export type BankTransactionType =
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'FEE'
    | 'INTEREST';

export type BankTransactionSource =
    | 'SALE'
    | 'EXPENSE'
    | 'CUSTOMER_PAYMENT'
    | 'SUPPLIER_PAYMENT'
    | 'STATEMENT_IMPORT'
    | 'MANUAL'
    | 'TRANSFER';

export interface BankTransaction {
    id: string;
    transactionNumber: string;
    bankAccountId: string;
    bankAccountName?: string;
    transactionDate: string;
    type: BankTransactionType;
    categoryId?: string;
    categoryCode?: string;
    categoryName?: string;
    description: string;
    reference?: string;
    amount: number;
    runningBalance?: number;
    contraAccountId?: string;
    contraAccountCode?: string;
    contraAccountName?: string;
    glTransactionId?: string;
    sourceType?: BankTransactionSource;
    sourceId?: string;
    sourceNumber?: string;          // e.g., SALE-2025-0001
    statementLineId?: string;
    matchedAt?: string;
    matchConfidence?: number;
    isReconciled: boolean;
    reconciledAt?: string;
    reconciledBy?: string;
    transferPairId?: string;
    isReversed: boolean;
    reversedAt?: string;
    reversedBy?: string;
    reversalReason?: string;
    reversalTransactionId?: string;
    createdBy?: string;
    createdAt: string;
}

export interface BankTransactionDbRow {
    id: string;
    transaction_number: string;
    bank_account_id: string;
    bank_account_name?: string;
    transaction_date: string;
    type: string;
    category_id?: string;
    category_code?: string;
    category_name?: string;
    description: string;
    reference?: string;
    amount: string;
    running_balance?: string;
    contra_account_id?: string;
    contra_account_code?: string;
    contra_account_name?: string;
    gl_transaction_id?: string;
    source_type?: string;
    source_id?: string;
    source_number?: string;
    statement_line_id?: string;
    matched_at?: string;
    match_confidence?: number;
    is_reconciled: boolean;
    reconciled_at?: string;
    reconciled_by?: string;
    transfer_pair_id?: string;
    is_reversed: boolean;
    reversed_at?: string;
    reversed_by?: string;
    reversal_reason?: string;
    reversal_transaction_id?: string;
    created_by?: string;
    created_at: string;
}

export function normalizeBankTransaction(row: BankTransactionDbRow): BankTransaction {
    return {
        id: row.id,
        transactionNumber: row.transaction_number,
        bankAccountId: row.bank_account_id,
        bankAccountName: row.bank_account_name,
        transactionDate: row.transaction_date,
        type: row.type as BankTransactionType,
        categoryId: row.category_id,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        description: row.description,
        reference: row.reference,
        amount: parseFloat(row.amount || '0'),
        runningBalance: row.running_balance ? parseFloat(row.running_balance) : undefined,
        contraAccountId: row.contra_account_id,
        contraAccountCode: row.contra_account_code,
        contraAccountName: row.contra_account_name,
        glTransactionId: row.gl_transaction_id,
        sourceType: row.source_type as BankTransactionSource | undefined,
        sourceId: row.source_id,
        sourceNumber: row.source_number,
        statementLineId: row.statement_line_id,
        matchedAt: row.matched_at,
        matchConfidence: row.match_confidence,
        isReconciled: row.is_reconciled,
        reconciledAt: row.reconciled_at,
        reconciledBy: row.reconciled_by,
        transferPairId: row.transfer_pair_id,
        isReversed: row.is_reversed,
        reversedAt: row.reversed_at,
        reversedBy: row.reversed_by,
        reversalReason: row.reversal_reason,
        reversalTransactionId: row.reversal_transaction_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

// =============================================================================
// BANK TEMPLATE (for CSV statement import)
// =============================================================================

export interface ColumnMappings {
    dateColumn: number;
    dateFormat: string;
    descriptionColumn: number;
    amountColumn?: number;
    debitColumn?: number;
    creditColumn?: number;
    balanceColumn?: number;
    referenceColumn?: number;
    negativeIsDebit?: boolean;
}

export interface BankTemplate {
    id: string;
    name: string;
    bankName?: string;
    columnMappings: ColumnMappings;
    skipHeaderRows: number;
    skipFooterRows: number;
    delimiter: string;
    isActive: boolean;
    createdAt: string;
    updatedAt?: string;
}

export interface BankTemplateDbRow {
    id: string;
    name: string;
    bank_name?: string;
    column_mappings: ColumnMappings | string;  // JSONB can be pre-parsed or string
    skip_header_rows: number;
    skip_footer_rows: number;
    delimiter: string;
    is_active: boolean;
    created_at: string;
    updated_at?: string;
}

export function normalizeBankTemplate(row: BankTemplateDbRow): BankTemplate {
    return {
        id: row.id,
        name: row.name,
        bankName: row.bank_name,
        columnMappings: typeof row.column_mappings === 'string'
            ? JSON.parse(row.column_mappings)
            : row.column_mappings,
        skipHeaderRows: row.skip_header_rows,
        skipFooterRows: row.skip_footer_rows,
        delimiter: row.delimiter,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// =============================================================================
// BANK STATEMENT
// =============================================================================

export type StatementStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BankStatement {
    id: string;
    statementNumber: string;
    bankAccountId: string;
    bankAccountName?: string;
    statementDate: string;
    periodStart?: string;
    periodEnd?: string;
    openingBalance?: number;
    closingBalance?: number;
    fileName?: string;
    templateId?: string;
    totalLines: number;
    matchedLines: number;
    createdLines: number;
    skippedLines: number;
    status: StatementStatus;
    importedBy?: string;
    importedAt: string;
    completedAt?: string;
}

export interface BankStatementDbRow {
    id: string;
    statement_number: string;
    bank_account_id: string;
    bank_account_name?: string;
    statement_date: string;
    period_start?: string;
    period_end?: string;
    opening_balance?: string;
    closing_balance?: string;
    file_name?: string;
    template_id?: string;
    total_lines: number;
    matched_lines: number;
    created_lines: number;
    skipped_lines: number;
    status: string;
    imported_by?: string;
    imported_at: string;
    completed_at?: string;
}

export function normalizeBankStatement(row: BankStatementDbRow): BankStatement {
    return {
        id: row.id,
        statementNumber: row.statement_number,
        bankAccountId: row.bank_account_id,
        bankAccountName: row.bank_account_name,
        statementDate: row.statement_date,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        openingBalance: row.opening_balance ? parseFloat(row.opening_balance) : undefined,
        closingBalance: row.closing_balance ? parseFloat(row.closing_balance) : undefined,
        fileName: row.file_name,
        templateId: row.template_id,
        totalLines: row.total_lines,
        matchedLines: row.matched_lines,
        createdLines: row.created_lines,
        skippedLines: row.skipped_lines,
        status: row.status as StatementStatus,
        importedBy: row.imported_by,
        importedAt: row.imported_at,
        completedAt: row.completed_at,
    };
}

// =============================================================================
// BANK STATEMENT LINE
// =============================================================================

export type MatchStatus = 'UNMATCHED' | 'MATCHED' | 'CREATED' | 'SKIPPED';

export interface BankStatementLine {
    id: string;
    statementId: string;
    lineNumber: number;
    transactionDate?: string;
    description?: string;
    reference?: string;
    amount: number;
    runningBalance?: number;
    matchStatus: MatchStatus;
    matchedTransactionId?: string;
    matchConfidence?: number;
    suggestedCategoryId?: string;
    suggestedCategoryName?: string;
    suggestedAccountId?: string;
    suggestedAccountName?: string;
    processedAt?: string;
    processedBy?: string;
    skipReason?: string;
    createdAt: string;
}

export interface BankStatementLineDbRow {
    id: string;
    statement_id: string;
    line_number: number;
    transaction_date?: string;
    description?: string;
    reference?: string;
    amount: string;
    running_balance?: string;
    match_status: string;
    matched_transaction_id?: string;
    match_confidence?: number;
    suggested_category_id?: string;
    suggested_category_name?: string;
    suggested_account_id?: string;
    suggested_account_name?: string;
    processed_at?: string;
    processed_by?: string;
    skip_reason?: string;
    created_at: string;
}

export function normalizeBankStatementLine(row: BankStatementLineDbRow): BankStatementLine {
    return {
        id: row.id,
        statementId: row.statement_id,
        lineNumber: row.line_number,
        transactionDate: row.transaction_date,
        description: row.description,
        reference: row.reference,
        amount: parseFloat(row.amount || '0'),
        runningBalance: row.running_balance ? parseFloat(row.running_balance) : undefined,
        matchStatus: row.match_status as MatchStatus,
        matchedTransactionId: row.matched_transaction_id,
        matchConfidence: row.match_confidence,
        suggestedCategoryId: row.suggested_category_id,
        suggestedCategoryName: row.suggested_category_name,
        suggestedAccountId: row.suggested_account_id,
        suggestedAccountName: row.suggested_account_name,
        processedAt: row.processed_at,
        processedBy: row.processed_by,
        skipReason: row.skip_reason,
        createdAt: row.created_at,
    };
}

// =============================================================================
// BANK PATTERN
// =============================================================================

export interface PatternMatchRules {
    descriptionContains?: string[];
    descriptionRegex?: string;
    amountMin?: number;
    amountMax?: number;
    direction?: 'IN' | 'OUT';
}

export interface BankPattern {
    id: string;
    name?: string;
    matchRules: PatternMatchRules;
    categoryId?: string;
    categoryName?: string;
    contraAccountId?: string;
    contraAccountName?: string;
    confidence: number;
    timesUsed: number;
    timesRejected: number;
    lastUsedAt?: string;
    autoApplyThreshold: number;
    isSystem: boolean;
    isActive: boolean;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface BankPatternDbRow {
    id: string;
    name?: string;
    match_rules: string;              // JSONB as string
    category_id?: string;
    category_name?: string;
    contra_account_id?: string;
    contra_account_name?: string;
    confidence: number;
    times_used: number;
    times_rejected: number;
    last_used_at?: string;
    auto_apply_threshold: number;
    is_system: boolean;
    is_active: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export function normalizeBankPattern(row: BankPatternDbRow): BankPattern {
    return {
        id: row.id,
        name: row.name,
        matchRules: typeof row.match_rules === 'string'
            ? JSON.parse(row.match_rules)
            : row.match_rules,
        categoryId: row.category_id,
        categoryName: row.category_name,
        contraAccountId: row.contra_account_id,
        contraAccountName: row.contra_account_name,
        confidence: row.confidence,
        timesUsed: row.times_used,
        timesRejected: row.times_rejected,
        lastUsedAt: row.last_used_at,
        autoApplyThreshold: row.auto_apply_threshold,
        isSystem: row.is_system,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// =============================================================================
// BANK ALERT
// =============================================================================

export type AlertType =
    | 'UNUSUAL_AMOUNT'
    | 'DUPLICATE_SUSPECTED'
    | 'UNRECOGNIZED'
    | 'LOW_BALANCE'
    | 'OVERDUE_RECURRING'
    | 'RECONCILIATION_DIFFERENCE';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'NEW' | 'REVIEWED' | 'DISMISSED' | 'RESOLVED';

export interface BankAlert {
    id: string;
    bankAccountId?: string;
    bankAccountName?: string;
    transactionId?: string;
    transactionNumber?: string;
    statementLineId?: string;
    alertType: AlertType;
    severity: AlertSeverity;
    message: string;
    details?: Record<string, unknown>;
    status: AlertStatus;
    resolutionNotes?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    createdAt: string;
}

export interface BankAlertDbRow {
    id: string;
    bank_account_id?: string;
    bank_account_name?: string;
    transaction_id?: string;
    transaction_number?: string;
    statement_line_id?: string;
    alert_type: string;
    severity: string;
    message: string;
    details?: string;
    status: string;
    resolution_notes?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    created_at: string;
}

export function normalizeBankAlert(row: BankAlertDbRow): BankAlert {
    return {
        id: row.id,
        bankAccountId: row.bank_account_id,
        bankAccountName: row.bank_account_name,
        transactionId: row.transaction_id,
        transactionNumber: row.transaction_number,
        statementLineId: row.statement_line_id,
        alertType: row.alert_type as AlertType,
        severity: row.severity as AlertSeverity,
        message: row.message,
        details: row.details
            ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details)
            : undefined,
        status: row.status as AlertStatus,
        resolutionNotes: row.resolution_notes,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
    };
}

// =============================================================================
// RECURRING TRANSACTION RULE
// =============================================================================

export type RecurringFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface RecurringMatchRules {
    descriptionContains?: string[];
    descriptionRegex?: string;
    amountMin?: number;
    amountMax?: number;
}

export interface BankRecurringRule {
    id: string;
    name: string;
    bankAccountId: string;
    bankAccountName?: string;
    matchRules: RecurringMatchRules;
    frequency: RecurringFrequency;
    expectedDay: number;               // Day of month (1-31) or day of week (1-7)
    expectedAmount: number;
    tolerancePercent: number;          // Allow ±X% variance
    categoryId?: string;
    categoryName?: string;
    contraAccountId?: string;
    contraAccountName?: string;
    lastMatchedAt?: string;
    lastMatchedAmount?: number;
    nextExpectedAt?: string;           // DATE
    missCount: number;                 // Times expected but not found
    isActive: boolean;
    createdBy?: string;
    createdAt: string;
}

export interface BankRecurringRuleDbRow {
    id: string;
    name: string;
    bank_account_id: string;
    bank_account_name?: string;
    match_rules: string;
    frequency: string;
    expected_day: number;
    expected_amount: string;
    tolerance_percent: number;
    category_id?: string;
    category_name?: string;
    contra_account_id?: string;
    contra_account_name?: string;
    last_matched_at?: string;
    last_matched_amount?: string;
    next_expected_at?: string;
    miss_count: number;
    is_active: boolean;
    created_by?: string;
    created_at: string;
}

export function normalizeBankRecurringRule(row: BankRecurringRuleDbRow): BankRecurringRule {
    return {
        id: row.id,
        name: row.name,
        bankAccountId: row.bank_account_id,
        bankAccountName: row.bank_account_name,
        matchRules: typeof row.match_rules === 'string'
            ? JSON.parse(row.match_rules)
            : row.match_rules,
        frequency: row.frequency as RecurringFrequency,
        expectedDay: row.expected_day,
        expectedAmount: parseFloat(row.expected_amount || '0'),
        tolerancePercent: row.tolerance_percent,
        categoryId: row.category_id,
        categoryName: row.category_name,
        contraAccountId: row.contra_account_id,
        contraAccountName: row.contra_account_name,
        lastMatchedAt: row.last_matched_at,
        lastMatchedAmount: row.last_matched_amount ? parseFloat(row.last_matched_amount) : undefined,
        nextExpectedAt: row.next_expected_at,
        missCount: row.miss_count,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

// =============================================================================
// BANK ACCOUNT SETTINGS (for low balance threshold)
// =============================================================================

export interface BankAccountSettings {
    id: string;
    bankAccountId: string;
    lowBalanceThreshold?: number;
    lowBalanceAlertEnabled: boolean;
}

// =============================================================================
// DTO TYPES (for API requests)
// =============================================================================

export interface CreateBankAccountDto {
    name: string;
    accountNumber?: string;
    bankName?: string;
    branch?: string;
    glAccountId: string;
    openingBalance?: number;
    isDefault?: boolean;
}

export interface CreateBankTransactionDto {
    bankAccountId: string;
    transactionDate: string;        // YYYY-MM-DD
    type: BankTransactionType;
    categoryId?: string;
    description: string;
    reference?: string;
    amount: number;
    contraAccountId?: string;
    sourceType?: BankTransactionSource;
    sourceId?: string;
}

export interface CreateTransferDto {
    fromAccountId: string;
    toAccountId: string;
    transactionDate: string;
    amount: number;
    description?: string;
    reference?: string;
}

export interface ImportStatementDto {
    bankAccountId: string;
    templateId: string;
    statementDate: string;
    periodStart?: string;
    periodEnd?: string;
    csvContent: string;
    fileName?: string;
}

export interface MatchStatementLineDto {
    lineId: string;
    action: 'MATCH' | 'CREATE' | 'SKIP';
    transactionId?: string;         // For MATCH action
    categoryId?: string;            // For CREATE action
    contraAccountId?: string;       // For CREATE action
    skipReason?: string;            // For SKIP action
}

export interface ReconcileDto {
    bankAccountId: string;
    reconcileDate: string;
    statementBalance: number;
    transactionIds: string[];       // Transactions to mark as reconciled
}

export interface ReverseBankTransactionDto {
    transactionId: string;
    reason: string;
}
export interface CreateRecurringRuleDto {
    name: string;
    bankAccountId: string;
    matchRules: RecurringMatchRules;
    frequency: RecurringFrequency;
    expectedDay: number;
    expectedAmount: number;
    tolerancePercent?: number;
    categoryId?: string;
    contraAccountId?: string;
}

export interface UpdateRecurringRuleDto {
    name?: string;
    matchRules?: RecurringMatchRules;
    frequency?: RecurringFrequency;
    expectedDay?: number;
    expectedAmount?: number;
    tolerancePercent?: number;
    categoryId?: string | null;
    contraAccountId?: string | null;
    isActive?: boolean;
}

export interface SetLowBalanceThresholdDto {
    bankAccountId: string;
    threshold: number;
    enabled: boolean;
}

// =============================================================================
// REPORT TYPES
// =============================================================================

export interface BankAccountSummary {
    id: string;
    name: string;
    bankName?: string;
    currentBalance: number;
    lastReconciledBalance?: number;
    lastReconciledAt?: string;
    unreconciledCount: number;
    totalDepositsThisMonth: number;
    totalWithdrawalsThisMonth: number;
}

export interface BankActivityReport {
    accountId: string;
    accountName: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    totalDeposits: number;
    totalWithdrawals: number;
    transactionCount: number;
    categories: Array<{
        categoryId: string;
        categoryName: string;
        categoryCode: string;
        direction: 'IN' | 'OUT';
        totalAmount: number;
        transactionCount: number;
    }>;
}

export interface CashPositionReport {
    asOfDate: string;
    accounts: Array<{
        id: string;
        name: string;
        bankName?: string;
        balance: number;
        lastReconciled?: string;
        unreconciledAmount: number;
    }>;
    totalCashBalance: number;
    totalUnreconciledAmount: number;
}