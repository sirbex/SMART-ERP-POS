import { useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StoreLocationSelect } from './StoreLocationSelect';
import { useFetchTransferProductLots } from '../../hooks/useAssortmentMatrix';
import {
  TransferProductLinePicker,
  type TransferDraftLineInput,
} from './TransferProductLinePicker';
import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';

interface EmergencyTransferPanelProps {
  sourceLabel: string;
  sellingStores: StoreLocation[];
  mainStoreId: string | undefined;
  destinationId: string;
  onDestinationChange: (id: string) => void;
  onLinesChange: (lines: TransferDraftLineInput[]) => void;
  hasTransferLines: boolean;
  justification: string;
  onJustificationChange: (value: string) => void;
  onExecute: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

/**
 * Phase 6 — streamlined emergency transfer (single screen, no wizard).
 */
export function EmergencyTransferPanel({
  sourceLabel,
  sellingStores,
  mainStoreId,
  destinationId,
  onDestinationChange,
  onLinesChange,
  hasTransferLines,
  justification,
  onJustificationChange,
  onExecute,
  onCancel,
  isProcessing,
}: EmergencyTransferPanelProps) {
  const fetchProductLots = useFetchTransferProductLots(mainStoreId ?? null);

  const fetchProductLotsForTransfer = useCallback(
    (productId: string) => fetchProductLots.mutateAsync(productId),
    [fetchProductLots],
  );

  const canExecute =
    !!destinationId &&
    hasTransferLines &&
    justification.trim().length >= 10 &&
    !isProcessing;

  return (
    <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-amber-950">Emergency Transfer</h3>
          <p className="text-sm text-amber-900/80 mt-1">
            Bypasses approval policy and completes immediately. All fields are recorded in the
            audit trail. Use only when normal workflow cannot meet operational needs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-gray-500 uppercase">Source Warehouse</Label>
              <p className="mt-1 font-semibold text-indigo-800">{sourceLabel}</p>
            </div>
            <StoreLocationSelect
              id="emergency-dest"
              label="Destination"
              stores={sellingStores}
              value={destinationId}
              onChange={onDestinationChange}
              allowEmpty
              emptyLabel="Select shop…"
            />
          </div>

          <div>
            <Label htmlFor="emergency-justification">Justification *</Label>
            <textarea
              id="emergency-justification"
              value={justification}
              onChange={(e) => onJustificationChange(e.target.value)}
              rows={3}
              placeholder="Why is this emergency override required? Include operational context for audit…"
              className="w-full mt-1 px-3 py-2 border border-amber-200 rounded-md text-sm bg-white"
            />
            <p className="text-xs text-amber-800/70 mt-1">Minimum 10 characters.</p>
          </div>
        </div>

        <div className="space-y-3">
          {mainStoreId && destinationId ? (
            <div className="bg-white/80 border border-amber-100 rounded-lg p-3">
              <TransferProductLinePicker
                storeLocationId={mainStoreId}
                storeLabel={sourceLabel}
                onFetchProductLots={fetchProductLotsForTransfer}
                onLinesChange={onLinesChange}
                disabled={isProcessing}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center bg-white/60 rounded-lg border border-dashed border-amber-200">
              {mainStoreId
                ? 'Select a destination to search transferable products.'
                : 'MAIN warehouse not configured.'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-amber-200">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-amber-700 hover:bg-amber-800"
          onClick={onExecute}
          disabled={!canExecute}
        >
          {isProcessing ? 'Processing…' : 'Execute Emergency Transfer (F9)'}
        </Button>
      </div>
    </div>
  );
}
