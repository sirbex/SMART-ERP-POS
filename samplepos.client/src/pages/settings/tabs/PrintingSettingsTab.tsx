/**
 * Settings → Printing — POS receipt thermal configuration only.
 * Restaurant station / KOT printers live under Restaurant → Stations
 * (hidden when restaurant mode is off).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiResponse } from '../../../services/api';
import ReceiptPrintingSettings, {
  type ReceiptPrintingFields,
} from './ReceiptPrintingSettings';

type SystemSettingsSlice = ReceiptPrintingFields & { id?: string };

async function fetchSettings(): Promise<SystemSettingsSlice> {
  const response = await api.get<ApiResponse<SystemSettingsSlice>>('/system-settings');
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data!;
}

async function updateSettings(
  updates: Partial<ReceiptPrintingFields>,
): Promise<SystemSettingsSlice> {
  const response = await api.patch<ApiResponse<SystemSettingsSlice>>(
    '/system-settings',
    updates,
  );
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data!;
}

export default function PrintingSettingsTab() {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: fetchSettings,
  });

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(['systemSettings'], (prev: SystemSettingsSlice | undefined) =>
        prev ? { ...prev, ...next } : next,
      );
      setIsSaving(false);
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 5000);
    },
    onError: (error: Error) => {
      setIsSaving(false);
      setSaveMessage(`Error: ${error.message}`);
      setTimeout(() => setSaveMessage(''), 5000);
    },
  });

  const handleSave = (updates: Partial<ReceiptPrintingFields>) => {
    setIsSaving(true);
    mutation.mutate(updates);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6" data-settings-tab="printing">
      {isLoading ? (
        <p className="text-gray-600">Loading receipt settings...</p>
      ) : isError || !settings ? (
        <p className="text-red-600">Failed to load receipt settings</p>
      ) : (
        <>
          {saveMessage ? (
            <div
              className={`mb-4 p-3 rounded-md text-sm ${
                saveMessage.startsWith('Error')
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {saveMessage}
            </div>
          ) : null}
          <ReceiptPrintingSettings
            settings={settings}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </>
      )}
    </div>
  );
}
