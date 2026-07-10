import { DomainReconciliationWorkspace } from '../../components/reconciliation-workspace/DomainReconciliationWorkspace';
import { INVENTORY_WORKSPACE_CONFIG } from '../../lib/reconciliationWorkspaceConfig';

export default function InventoryReconciliationPage() {
    return <DomainReconciliationWorkspace config={INVENTORY_WORKSPACE_CONFIG} />;
}
