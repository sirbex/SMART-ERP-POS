/**
 * Inter-store transfers (spec: StoreTransfers.tsx) — route `/inventory/store-transfers`
 * Multi-step wizard + timeline tracking Draft → Approved → Dispatched → Transit → Received.
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import {
  useStoreLocations,
  useStoreTransfers,
  useCreateStoreTransfer,
  useTransferWorkflowCapabilities,
  usePreviewTransferAssortment,
} from '../../hooks/useWarehouse';
import { useFetchTransferProductLots } from '../../hooks/useAssortmentMatrix';
import {
  type TransferDraftLineInput,
} from '../../components/inventory/TransferProductLinePicker';
import { EmergencyTransferPanel } from '../../components/inventory/EmergencyTransferPanel';
import {
  buildStoreLabelMap,
  resolveStoreLabel,
} from '../../components/inventory/storeLocationUtils';
import { TransferStatusTimeline } from '../../components/inventory/TransferStatusTimeline';
import { TransferRequestDetailDrawer } from '../../components/inventory/TransferRequestDetailDrawer';
import { TransferCreateWorkspace } from '../../components/inventory/TransferCreateWorkspace';
import { DataTable } from '../../components/shared/DataTable';
import type { DataTableColumn } from '../../components/shared/DataTable';
import { Button } from '@/components/ui/button';
import type { StoreTransfer, StoreTransferStatus } from '../../../../shared/types/storeTransfer';
import type { TransferWorkflowMode } from '../../../../shared/types/transferWorkflow';
import type {
  AssortmentExpansionDecision,
  AssortmentGap,
  PreviewTransferAssortmentResult,
} from '../../../../shared/types/transferAssortment';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTransferHubLabels } from '../../utils/transferWorkflowUx';

interface DraftLine {
  productLotId: string;
  productId: string;
  label: string;
  quantity: number;
  maxQty: number;
}

interface TransferTableRow {
  id: string;
  transferNumber: string;
  routePrimary: string;
  routeVia: string;
  status: StoreTransferStatus;
  workflowMode: TransferWorkflowMode;
  createdDisplay: string;
}

export default function StoreTransfersPage() {
  const { isMultistoreEnabled, isLoading: flagLoading } = useMultistoreEnabled();
  const { data: stores = [] } = useStoreLocations(isMultistoreEnabled);
  const { data: transfers = [], isLoading } = useStoreTransfers(isMultistoreEnabled);
  const { data: capabilities } = useTransferWorkflowCapabilities(isMultistoreEnabled);
  const createTransfer = useCreateStoreTransfer();
  const previewAssortment = usePreviewTransferAssortment();

  const mainStore = useMemo(
    () => stores.find((s) => s.storeType === 'MAIN') ?? stores.find((s) => s.isDefaultReceiving),
    [stores],
  );

  const fetchTransferProductLots = useFetchTransferProductLots(mainStore?.id ?? null);

  const canCreate =
    capabilities?.canRequest || capabilities?.canDirect || capabilities?.canOverride;
  const labels = getTransferHubLabels(capabilities);
  const { isDirectMode, pageTitle, pageDescription, createLabel, submitLabel, listNumberHeader, workflowHint } =
    labels;

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [transferMode, setTransferMode] = useState<'standard' | 'emergency' | null>(null);
  const [destinationId, setDestinationId] = useState('');
  const [pickerSessionKey, setPickerSessionKey] = useState(0);
  const [notes, setNotes] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [emergencyJustification, setEmergencyJustification] = useState('');
  const [showAssortmentStep, setShowAssortmentStep] = useState(false);
  const [assortmentGaps, setAssortmentGaps] = useState<AssortmentGap[]>([]);
  const [assortmentChoices, setAssortmentChoices] = useState<Record<string, boolean>>({});
  const [pendingEmergency, setPendingEmergency] = useState(false);
  const transferSearchRef = useRef<HTMLInputElement>(null);
  const [detailTransferId, setDetailTransferId] = useState<string | null>(null);

  const sellingStores = stores.filter((s) => s.storeType === 'SELLING' && s.isActive);
  const storeLabelMap = useMemo(() => buildStoreLabelMap(stores), [stores]);

  const transferTableRows = useMemo((): TransferTableRow[] => {
    return (transfers as StoreTransfer[]).map((t) => ({
      id: t.id,
      transferNumber: t.transferNumber,
      routePrimary: `${resolveStoreLabel(storeLabelMap, t.sourceStoreId)} → ${resolveStoreLabel(storeLabelMap, t.destinationStoreId)}`,
      routeVia: `via ${resolveStoreLabel(storeLabelMap, t.transitStoreId)}`,
      status: t.status,
      workflowMode: t.workflowMode ?? 'REQUEST',
      createdDisplay: new Date(t.createdAt).toLocaleDateString(),
    }));
  }, [transfers, storeLabelMap]);

  const transferColumns = useMemo((): DataTableColumn<TransferTableRow>[] => [
    {
      id: 'number',
      header: listNumberHeader,
      cell: (row) => <span className="font-medium">{row.transferNumber}</span>,
    },
    {
      id: 'route',
      header: 'Route',
      cell: (row) => (
        <>
          <div className="text-gray-600">{row.routePrimary}</div>
          <div className="text-xs text-gray-400">{row.routeVia}</div>
        </>
      ),
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: (row) => (
        <TransferStatusTimeline
          status={row.status}
          workflowMode={row.workflowMode}
          compact
        />
      ),
    },
    {
      id: 'created',
      header: 'Created',
      cellClassName: 'text-gray-500',
      cell: (row) => row.createdDisplay,
    },
    {
      id: 'view',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-indigo-600 hover:text-indigo-800"
          onClick={() => setDetailTransferId(row.id)}
        >
          View
        </Button>
      ),
    },
  ], [listNumberHeader]);

  const resetCreateForm = () => {
    setDestinationId('');
    setNotes('');
    setDraftLines([]);
    setEmergencyJustification('');
    setShowAssortmentStep(false);
    setAssortmentGaps([]);
    setAssortmentChoices({});
    setPendingEmergency(false);
    setPickerSessionKey((k) => k + 1);
    transferSearchFocusedRef.current = false;
  };

  const draftSummary = useMemo(
    () => ({
      lineCount: draftLines.length,
      totalQty: draftLines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    [draftLines],
  );

  const handleLinesChange = useCallback((lines: TransferDraftLineInput[]) => {
    setDraftLines((prev) => {
      if (prev.length === 0 && lines.length === 0) return prev;
      const next = lines.map((l) => ({
        productLotId: l.productLotId,
        productId: l.productId,
        label: l.label,
        quantity: l.quantity,
        maxQty: l.maxQty,
      }));
      if (
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.productLotId === next[i].productLotId &&
            p.quantity === next[i].quantity &&
            p.productId === next[i].productId,
        )
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const fetchProductLotsForTransfer = useCallback(
    (productId: string) => fetchTransferProductLots.mutateAsync(productId),
    [fetchTransferProductLots],
  );

  const transferSearchFocusedRef = useRef(false);

  const submitTransfer = async (
    emergency: boolean,
    expansions?: AssortmentExpansionDecision[],
    justification?: string,
  ) => {
    const auditText = (justification ?? emergencyJustification).trim();
    const result = await createTransfer.mutateAsync({
      destinationStoreId: destinationId,
      notes: notes.trim() || null,
      overrideReason: emergency ? auditText : null,
      overrideComments: emergency ? auditText : null,
      assortmentExpansions: expansions,
      lines: draftLines.map((l) => ({ productLotId: l.productLotId, quantity: l.quantity })),
    });
    const mode = (result?.data?.data as StoreTransfer | undefined)?.workflowMode;
    if (mode === 'DIRECT' || mode === 'EMERGENCY_OVERRIDE') {
      toast.success('Transfer completed — stock moved to destination');
    } else {
      toast.success('Transfer request submitted — pending approval');
    }
    setShowAssortmentStep(false);
    setTransferMode(null);
    setShowCreatePanel(false);
    resetCreateForm();
  };

  const handleCreate = async (emergency = false) => {
    if (!destinationId || draftLines.length === 0) {
      toast.error('Select destination and add at least one line');
      return;
    }
    if (emergency) {
      const text = emergencyJustification.trim();
      if (text.length < 10) {
        toast.error('Emergency transfer requires a justification (min 10 characters)');
        return;
      }
    }
    try {
      const previewRes = await previewAssortment.mutateAsync({
        destinationStoreId: destinationId,
        lines: draftLines.map((l) => ({ productLotId: l.productLotId, quantity: l.quantity })),
      });
      const preview = previewRes.data?.data as PreviewTransferAssortmentResult | undefined;
      if (preview?.requiresPrompt && preview.gaps.length > 0) {
        setAssortmentGaps(preview.gaps);
        setAssortmentChoices(
          Object.fromEntries(preview.gaps.map((gap) => [gap.productId, false])),
        );
        setPendingEmergency(emergency);
        setShowAssortmentStep(true);
        return;
      }
      await submitTransfer(emergency);
    } catch {
      toast.error('Failed to create transfer');
    }
  };

  const handleCreateRef = useRef(handleCreate);
  handleCreateRef.current = handleCreate;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n' && canCreate) {
        e.preventDefault();
        setTransferMode('standard');
        setShowCreatePanel(true);
        setShowAssortmentStep(false);
      }
      if (e.key === 'F9') {
        if (
          showCreatePanel &&
          transferMode === 'standard' &&
          !showAssortmentStep &&
          destinationId &&
          draftLines.length > 0
        ) {
          e.preventDefault();
          void handleCreateRef.current(false);
        }
        if (
          transferMode === 'emergency' &&
          destinationId &&
          draftLines.length > 0 &&
          emergencyJustification.trim().length >= 10
        ) {
          e.preventDefault();
          void handleCreateRef.current(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    canCreate,
    showCreatePanel,
    transferMode,
    destinationId,
    draftLines.length,
    emergencyJustification,
    showAssortmentStep,
  ]);

  useEffect(() => {
    if (!showCreatePanel || transferMode !== 'standard' || !destinationId || !mainStore?.id) {
      return;
    }
    if (transferSearchFocusedRef.current) return;
    transferSearchFocusedRef.current = true;
    const timer = setTimeout(() => transferSearchRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [showCreatePanel, transferMode, destinationId, mainStore?.id]);

  const handleAssortmentConfirm = async () => {
    const expansions: AssortmentExpansionDecision[] = assortmentGaps.map((gap) => ({
      productId: gap.productId,
      expandPermanently: assortmentChoices[gap.productId] ?? false,
    }));
    try {
      await submitTransfer(pendingEmergency, expansions);
    } catch {
      toast.error('Failed to create transfer');
    }
  };

  if (flagLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  if (!isMultistoreEnabled) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-600">
          Multi-store mode is not enabled.
        </div>
      </div>
    );
  }

  const destLabel = resolveStoreLabel(storeLabelMap, destinationId);
  const sourceLabel = mainStore?.name ?? 'MAIN';

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{pageTitle}</h2>
          <p className="text-gray-600 mt-1">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button
              type="button"
              onClick={() => {
                if (transferMode === 'standard') {
                  setTransferMode(null);
                  setShowCreatePanel(false);
                  resetCreateForm();
                } else {
                  setTransferMode('standard');
                  setShowCreatePanel(true);
                }
              }}
            >
              {transferMode === 'standard' ? 'Cancel' : `+ ${createLabel}`}
            </Button>
          )}
          {capabilities?.canOverride && (
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-50"
              onClick={() => {
                if (transferMode === 'emergency') {
                  setTransferMode(null);
                  resetCreateForm();
                } else {
                  resetCreateForm();
                  setTransferMode('emergency');
                  setShowCreatePanel(false);
                }
              }}
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              {transferMode === 'emergency' ? 'Cancel Emergency' : 'Emergency Transfer'}
            </Button>
          )}
        </div>
      </div>

      {transferMode === 'emergency' && capabilities?.canOverride && (
        <EmergencyTransferPanel
          key={pickerSessionKey}
          sourceLabel={sourceLabel}
          sellingStores={sellingStores}
          mainStoreId={mainStore?.id}
          destinationId={destinationId}
          onDestinationChange={setDestinationId}
          onLinesChange={handleLinesChange}
          hasTransferLines={draftLines.length > 0}
          justification={emergencyJustification}
          onJustificationChange={setEmergencyJustification}
          onExecute={() => void handleCreate(true)}
          onCancel={() => {
            setTransferMode(null);
            resetCreateForm();
          }}
          isProcessing={createTransfer.isPending || previewAssortment.isPending}
        />
      )}

      {showCreatePanel && canCreate && transferMode === 'standard' && (
        <TransferCreateWorkspace
          open={showCreatePanel}
          onClose={() => {
            setShowCreatePanel(false);
            setTransferMode(null);
            resetCreateForm();
          }}
          title={createLabel}
          submitLabel={submitLabel}
          workflowMode={capabilities?.primaryCreateMode ?? 'REQUEST'}
          sourceLabel={sourceLabel}
          mainStoreId={mainStore?.id}
          sellingStores={sellingStores}
          destinationId={destinationId}
          onDestinationChange={setDestinationId}
          notes={notes}
          onNotesChange={setNotes}
          pickerSessionKey={pickerSessionKey}
          searchInputRef={transferSearchRef}
          onFetchProductLots={fetchProductLotsForTransfer}
          onLinesChange={handleLinesChange}
          lineCount={draftSummary.lineCount}
          totalQty={draftSummary.totalQty}
          destLabel={destLabel}
          disabled={createTransfer.isPending || previewAssortment.isPending}
          onSubmit={() => void handleCreate(false)}
          assortmentStep={showAssortmentStep}
          assortmentGaps={assortmentGaps}
          assortmentChoices={assortmentChoices}
          onAssortmentChoiceChange={(productId, expand) =>
            setAssortmentChoices((prev) => ({ ...prev, [productId]: expand }))
          }
          onAssortmentConfirm={() => void handleAssortmentConfirm()}
          onAssortmentBack={() => setShowAssortmentStep(false)}
        />
      )}

      <div className="mb-4 p-3 bg-slate-50 border rounded-lg text-xs text-slate-600">
        <TransferStatusTimeline
          status={isDirectMode ? 'RECEIVED' : 'DRAFT'}
          workflowMode={capabilities?.primaryCreateMode ?? 'REQUEST'}
        />
        <p className="mt-2 text-slate-500">{workflowHint}</p>
      </div>

      <DataTable
        columns={transferColumns}
        data={transferTableRows}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        emptyMessage="No transfers yet. Start a new transfer to dispatch stock."
      />

      <TransferRequestDetailDrawer
        transferId={detailTransferId}
        storeLabelMap={storeLabelMap}
        open={!!detailTransferId}
        onClose={() => setDetailTransferId(null)}
      />
    </div>
  );
}
