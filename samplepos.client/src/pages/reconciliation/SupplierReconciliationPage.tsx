import { DomainReconciliationWorkspace } from '../../components/reconciliation-workspace/DomainReconciliationWorkspace';
import { AP_WORKSPACE_CONFIG } from '../../lib/reconciliationWorkspaceConfig';

export default function SupplierReconciliationPage() {
    return <DomainReconciliationWorkspace config={AP_WORKSPACE_CONFIG} />;
}
