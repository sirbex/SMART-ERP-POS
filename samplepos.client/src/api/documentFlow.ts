/**
 * Document Flow API client
 * Fetches the full document chain for any entity.
 */

import { apiClient } from '../utils/api';

export interface DocumentFlowNode {
  entityType: string;
  entityId: string;
  documentNumber: string;
  status: string | null;
  date: string | null;
  amount: number | null;
  relationType: string | null;
  direction: 'root' | 'child' | 'parent';
}

export async function fetchDocumentFlow(
  entityType: string,
  entityId: string,
): Promise<DocumentFlowNode[]> {
  const res = await apiClient.get<{ success: boolean; data: DocumentFlowNode[] }>(
    `/document-flow/${entityType}/${entityId}`,
  );
  return res.data.data ?? [];
}
