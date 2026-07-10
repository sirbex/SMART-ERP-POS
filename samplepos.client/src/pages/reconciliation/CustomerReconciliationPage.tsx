import { DomainReconciliationWorkspace } from '../../components/reconciliation-workspace/DomainReconciliationWorkspace';
import { AR_WORKSPACE_CONFIG } from '../../lib/reconciliationWorkspaceConfig';

export default function CustomerReconciliationPage() {
    return <DomainReconciliationWorkspace config={AR_WORKSPACE_CONFIG} />;
}
