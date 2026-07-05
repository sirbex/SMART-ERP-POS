import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StoreNetworkLayout } from '../../components/inventory/StoreNetworkLayout';
import { TransferPolicySettingsPanel } from '../../components/inventory/TransferPolicySettingsPanel';
import { ExpiryAutomationPanel } from '../../components/inventory/ExpiryAutomationPanel';
import { api, ApiResponse } from '../../services/api';
import type { SystemSettings } from '../../../../shared/types/systemSettings';
import { invalidateMultistoreModeQueries } from '../../hooks/useMultistore';
import {
  useExpiryAutomationPreview,
  useRunExpiryAutomation,
} from '../../hooks/useStockCounts';
import toast from 'react-hot-toast';

async function fetchSettings(): Promise<SystemSettings> {
  const response = await api.get<ApiResponse<SystemSettings>>('/system-settings');
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data!;
}

export default function StoreNetworkSettingsPage() {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: fetchSettings,
  });

  const { data: expiryPreview, refetch: refetchExpiryPreview } = useExpiryAutomationPreview(
    !!settings?.isMultistoreEnabled,
  );
  const runExpiry = useRunExpiryAutomation();

  const mutation = useMutation({
    mutationFn: async (updates: Partial<SystemSettings>) => {
      const response = await api.patch<ApiResponse<SystemSettings>>('/system-settings', updates);
      if (!response.data.success) throw new Error(response.data.error);
      return response.data.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      invalidateMultistoreModeQueries(queryClient);
      setIsSaving(false);
      toast.success('Network settings saved');
    },
    onError: () => {
      setIsSaving(false);
      toast.error('Failed to save settings');
    },
  });

  const save = (updates: Partial<SystemSettings>) => {
    setIsSaving(true);
    mutation.mutate(updates);
  };

  if (isLoading || !settings) {
    return (
      <StoreNetworkLayout>
        <div className="p-6 text-gray-500">Loading settings…</div>
      </StoreNetworkLayout>
    );
  }

  return (
    <StoreNetworkLayout>
      <div className="p-6 max-w-2xl">
        <p className="text-sm text-gray-600 mb-6">
          Network-wide policies for transfers and approvals. Company-wide settings are under{' '}
          <Link to="/settings?tab=system" className="text-blue-600 hover:underline">
            Settings → System
          </Link>
          .
        </p>

        <TransferPolicySettingsPanel
          requireApprovalAll={settings.transferPolicyRequireApprovalAll ?? true}
          allowDirect={settings.transferPolicyAllowDirect ?? true}
          valueThreshold={settings.transferPolicyValueThreshold ?? null}
          qtyThreshold={settings.transferPolicyQtyThreshold ?? null}
          specialStoresRequireApproval={settings.transferPolicySpecialStoresRequireApproval ?? true}
          assortmentExpansionPolicy={settings.transferAssortmentExpansionPolicy ?? 'PROMPT'}
          onChange={save}
          isSaving={isSaving}
        />

        <ExpiryAutomationPanel
          enabled={settings.expiryAutomationEnabled ?? false}
          onChange={save}
          isSaving={isSaving}
          isRunning={runExpiry.isPending}
          previewCount={expiryPreview?.candidates?.length ?? 0}
          previewQuantity={expiryPreview?.totalQuantity ?? 0}
          onPreview={() => {
            void refetchExpiryPreview();
            toast.success('Preview refreshed');
          }}
          onRun={async () => {
            try {
              const res = await runExpiry.mutateAsync(false);
              const data = res.data?.data as { linesProcessed?: number; totalQuantityMoved?: number };
              toast.success(
                `Moved ${data?.totalQuantityMoved ?? 0} units across ${data?.linesProcessed ?? 0} lot(s)`,
              );
              void refetchExpiryPreview();
            } catch {
              toast.error('Expiry processing failed');
            }
          }}
        />
      </div>
    </StoreNetworkLayout>
  );
}
