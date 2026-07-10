import { useBackendPermission } from './useBackendPermission';
export interface FinancialControlAccess {
    /** Period close header and close action */
    showPeriodClose: boolean;
    /** Domain health cards grid */
    showHealthCards: boolean;
    /** Blocking issues that prevent close */
    showBlockingIssues: boolean;
    /** Non-blocking warnings */
    showWarnings: boolean;
    /** Task-oriented workflow list */
    showTasks: boolean;
    /** Recent activity timeline */
    showRecentActivity: boolean;
    /** Audit workspace: snapshots, evidence, sign-off */
    showAuditWorkspace: boolean;
    /** Link to admin diagnostics page */
    showDiagnosticsLink: boolean;
    canClosePeriod: boolean;
    canRequestSignoff: boolean;
    canApproveSignoff: boolean;
    canCaptureSnapshot: boolean;
    canDownloadEvidence: boolean;
    isAuditorView: boolean;
    isAdministrator: boolean;
}

/**
 * Role-aware visibility for the Financial Control Center.
 * One page adapts based on permissions instead of showing everything to everyone.
 */
export function useFinancialControlAccess(): FinancialControlAccess {
    const canReconcile = useBackendPermission('accounting.reconcile');
    const canRead = useBackendPermission('accounting.read');
    const canPeriodManage = useBackendPermission('accounting.period_manage');
    const canApprove = useBackendPermission('accounting.approve');
    const canManage = useBackendPermission('accounting.manage');
    const canAuditRead = useBackendPermission('system.audit_read');

    const isAdministrator = canManage;
    const isAuditorView =
        canAuditRead && !canReconcile && !canPeriodManage && !canManage;
    const isFinanceManager = canPeriodManage || canApprove;
    const isAccountant = canReconcile && !isFinanceManager && !isAdministrator;

    const hasAnyAccess = canReconcile || canRead || canAuditRead || isAdministrator;

    if (!hasAnyAccess) {
        return {
            showPeriodClose: false,
            showHealthCards: false,
            showBlockingIssues: false,
            showWarnings: false,
            showTasks: false,
            showRecentActivity: false,
            showAuditWorkspace: false,
            showDiagnosticsLink: false,
            canClosePeriod: false,
            canRequestSignoff: false,
            canApproveSignoff: false,
            canCaptureSnapshot: false,
            canDownloadEvidence: false,
            isAuditorView: false,
            isAdministrator: false,
        };
    }

    if (isAuditorView) {
        return {
            showPeriodClose: false,
            showHealthCards: false,
            showBlockingIssues: false,
            showWarnings: false,
            showTasks: false,
            showRecentActivity: true,
            showAuditWorkspace: true,
            showDiagnosticsLink: false,
            canClosePeriod: false,
            canRequestSignoff: false,
            canApproveSignoff: false,
            canCaptureSnapshot: false,
            canDownloadEvidence: true,
            isAuditorView: true,
            isAdministrator: false,
        };
    }

    if (isAdministrator) {
        return {
            showPeriodClose: true,
            showHealthCards: true,
            showBlockingIssues: true,
            showWarnings: true,
            showTasks: true,
            showRecentActivity: true,
            showAuditWorkspace: true,
            showDiagnosticsLink: true,
            canClosePeriod: canPeriodManage,
            canRequestSignoff: canPeriodManage,
            canApproveSignoff: canApprove,
            canCaptureSnapshot: true,
            canDownloadEvidence: true,
            isAuditorView: false,
            isAdministrator: true,
        };
    }

    if (isFinanceManager) {
        return {
            showPeriodClose: true,
            showHealthCards: true,
            showBlockingIssues: true,
            showWarnings: true,
            showTasks: true,
            showRecentActivity: true,
            showAuditWorkspace: true,
            showDiagnosticsLink: false,
            canClosePeriod: canPeriodManage,
            canRequestSignoff: canPeriodManage,
            canApproveSignoff: canApprove,
            canCaptureSnapshot: canPeriodManage,
            canDownloadEvidence: true,
            isAuditorView: false,
            isAdministrator: false,
        };
    }

    // Accountant / default reconcile user
    return {
        showPeriodClose: canPeriodManage,
        showHealthCards: true,
        showBlockingIssues: true,
        showWarnings: isAccountant || canReconcile,
        showTasks: true,
        showRecentActivity: false,
        showAuditWorkspace: canRead,
        showDiagnosticsLink: false,
        canClosePeriod: canPeriodManage,
        canRequestSignoff: false,
        canApproveSignoff: false,
        canCaptureSnapshot: false,
        canDownloadEvidence: canRead,
        isAuditorView: false,
        isAdministrator: false,
    };
}
