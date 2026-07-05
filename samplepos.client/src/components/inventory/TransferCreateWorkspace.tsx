import SlideDrawer from '@/components/ui/SlideDrawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StoreLocationSelect } from './StoreLocationSelect';
import { TransferProductLinePicker } from './TransferProductLinePicker';
import { TransferStatusTimeline } from './TransferStatusTimeline';
import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';
import type { AssortmentGap } from '../../../../shared/types/transferAssortment';
import type { TransferWorkflowMode } from '../../../../shared/types/transferWorkflow';
import type { TransferDraftLineInput } from './TransferProductLinePicker';
import type { TransferLotSearchResult } from './TransferLotSearch';

export interface TransferCreateWorkspaceProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  workflowMode: TransferWorkflowMode;
  sourceLabel: string;
  mainStoreId?: string;
  sellingStores: StoreLocation[];
  destinationId: string;
  onDestinationChange: (id: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  pickerSessionKey: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onFetchProductLots: (productId: string) => Promise<TransferLotSearchResult[]>;
  onLinesChange: (lines: TransferDraftLineInput[]) => void;
  lineCount: number;
  totalQty: number;
  destLabel: string;
  disabled?: boolean;
  onSubmit: () => void;
  assortmentStep: boolean;
  assortmentGaps: AssortmentGap[];
  assortmentChoices: Record<string, boolean>;
  onAssortmentChoiceChange: (productId: string, expandPermanently: boolean) => void;
  onAssortmentConfirm: () => void;
  onAssortmentBack: () => void;
}

export function TransferCreateWorkspace({
  open,
  onClose,
  title,
  submitLabel,
  workflowMode,
  sourceLabel,
  mainStoreId,
  sellingStores,
  destinationId,
  onDestinationChange,
  notes,
  onNotesChange,
  pickerSessionKey,
  searchInputRef,
  onFetchProductLots,
  onLinesChange,
  lineCount,
  totalQty,
  destLabel,
  disabled = false,
  onSubmit,
  assortmentStep,
  assortmentGaps,
  assortmentChoices,
  onAssortmentChoiceChange,
  onAssortmentConfirm,
  onAssortmentBack,
}: TransferCreateWorkspaceProps) {
  const footer = assortmentStep ? (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-gray-600">
        {assortmentGaps.length} product{assortmentGaps.length !== 1 ? 's' : ''} need assortment
        decisions
      </p>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onAssortmentBack} disabled={disabled}>
          Back
        </Button>
        <Button type="button" onClick={onAssortmentConfirm} disabled={disabled}>
          Continue
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-gray-600">
        {lineCount > 0 ? (
          <>
            {lineCount} lot line{lineCount !== 1 ? 's' : ''} · {totalQty} base units
            {destinationId && (
              <>
                {' '}
                · {sourceLabel} → {destLabel}
              </>
            )}
          </>
        ) : (
          'Search and press Enter to add products — no blank rows.'
        )}
      </p>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={disabled}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!destinationId || lineCount === 0 || disabled}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {disabled ? 'Processing…' : `${submitLabel} (F9)`}
        </Button>
      </div>
    </div>
  );

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={assortmentStep ? 'Destination assortment' : 'Build request from source warehouse stock'}
      width="full"
      transactional
      footer={footer}
    >
      <div className="space-y-6">
        <header className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-gray-200">
          <div>
            <Label className="text-xs font-medium text-gray-500 uppercase">Supplying store</Label>
            <p className="mt-1 text-base font-semibold text-indigo-800">{sourceLabel}</p>
          </div>
          <div>
            <StoreLocationSelect
              id="transfer-dest-workspace"
              label="Requesting store"
              stores={sellingStores}
              value={destinationId}
              onChange={onDestinationChange}
              allowEmpty
              emptyLabel="Select destination shop…"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-medium text-gray-500 uppercase">Workflow</Label>
            <div className="mt-2">
              <TransferStatusTimeline status="DRAFT" workflowMode={workflowMode} />
            </div>
          </div>
        </header>

        {assortmentStep ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Some products are restricted or hidden at the destination. Choose per product whether
              to transfer once or expand the destination assortment permanently.
            </p>
            <ul className="space-y-3">
              {assortmentGaps.map((gap) => (
                <li key={gap.productId} className="border rounded-lg p-4 bg-white">
                  <p className="font-medium text-gray-900">{gap.productName}</p>
                  {gap.sku && <p className="text-xs text-gray-500 mt-0.5">SKU: {gap.sku}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {gap.distributionPolicy === 'RESTRICTED'
                      ? 'Restricted assortment'
                      : 'Hidden at destination'}
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`assortment-ws-${gap.productId}`}
                        checked={!assortmentChoices[gap.productId]}
                        onChange={() => onAssortmentChoiceChange(gap.productId, false)}
                      />
                      Transfer once — stock only
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`assortment-ws-${gap.productId}`}
                        checked={assortmentChoices[gap.productId] === true}
                        onChange={() => onAssortmentChoiceChange(gap.productId, true)}
                      />
                      Make available permanently at destination
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {mainStoreId && destinationId ? (
              <TransferProductLinePicker
                key={pickerSessionKey}
                storeLocationId={mainStoreId}
                storeLabel={sourceLabel}
                searchInputRef={searchInputRef}
                onFetchProductLots={onFetchProductLots}
                onLinesChange={onLinesChange}
                disabled={disabled}
              />
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center bg-gray-50 rounded-lg border border-dashed">
                Select a destination shop to search transferable products from {sourceLabel}.
              </p>
            )}

            <div>
              <Label htmlFor="transfer-notes-workspace">Notes (optional)</Label>
              <textarea
                id="transfer-notes-workspace"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm bg-background resize-y"
              />
            </div>
          </>
        )}
      </div>
    </SlideDrawer>
  );
}
