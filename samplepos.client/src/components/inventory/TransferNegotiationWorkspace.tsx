import { useCallback, useEffect, useMemo, useState } from 'react';
import SlideDrawer from '@/components/ui/SlideDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import {
  useStoreLocations,
  useStoreTransfer,
  useApproveStoreTransfer,
  useSaveTransferApprovalDraft,
  useDispatchStoreTransfer,
  useReceiveStoreTransfer,
  useCancelStoreTransfer,
  useCompleteStoreTransfer,
  useTransferWorkflowCapabilities,
} from '../../hooks/useWarehouse';
import { useTransferProductUomMap } from '../../hooks/useTransferProductUomMap';
import { getDefaultUom } from '../../hooks/useProductWithUoms';
import { UomSelector } from './UomSelector';
import { TransferApprovalWorkspaceHeader } from './TransferApprovalWorkspaceHeader';
import { TransferApprovalToolbar } from './TransferApprovalToolbar';
import { buildStoreLabelMap, resolveStoreLabel } from './storeLocationUtils';
import type { StoreTransfer, StoreTransferLine } from '../../../../shared/types/storeTransfer';
import {
  effectiveApprovedQty,
  formatQtyRatio,
  lineApprovalStatus,
  lineDispatchStatus,
  lineReceiveStatus,
  remainingToDispatch,
  remainingToReceive,
} from '../../../../shared/utils/transferNegotiation';
import { convertPoLineQuantityForUomChange } from '../../../../shared/utils/po-line-uom';
import {
  baseQtyFromDisplay,
  combineApprovalLineComment,
  displayQtyFromBase,
  splitApprovalLineComment,
} from '../../utils/transferLineUomDisplay';
import toast from 'react-hot-toast';

export type TransferNegotiationStage = 'approve' | 'dispatch' | 'receive';

interface LineEdit {
  quantity: string;
  reason: string;
  warehouseNotes: string;
  selectedUomId: string | null;
  conversionFactor: string;
  uomName: string;
  requestedUomName: string;
}

interface TransferNegotiationWorkspaceProps {
  transferId: string | null;
  stage: TransferNegotiationStage;
  open: boolean;
  onClose: () => void;
}

const STAGE_META: Record<
  TransferNegotiationStage,
  { title: string; action: string; qtyLabel: string }
> = {
  approve: { title: 'Stock request approval', action: 'Save approval', qtyLabel: 'Approved' },
  dispatch: { title: 'Dispatch to transit', action: 'Confirm dispatch', qtyLabel: 'Dispatch now' },
  receive: { title: 'Verify inbound receipt', action: 'Confirm receipt', qtyLabel: 'Received' },
};

function fulfillmentBadge(
  stage: TransferNegotiationStage,
  line: StoreTransferLine,
  editBaseQty?: number,
) {
  const status =
    stage === 'approve'
      ? lineApprovalStatus({
          ...line,
          quantityApproved:
            editBaseQty != null ? editBaseQty : line.quantityApproved,
        })
      : stage === 'dispatch'
        ? lineDispatchStatus(line)
        : lineReceiveStatus(line);

  const map = {
    FULL: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-amber-100 text-amber-800',
    NONE: 'bg-red-100 text-red-800',
    PENDING: 'bg-slate-100 text-slate-600',
  } as const;

  const label =
    stage === 'approve'
      ? {
          FULL: 'Approved',
          PARTIAL: 'Partial',
          NONE: 'Rejected',
          PENDING: 'Pending',
        }[status]
      : {
          FULL: 'Full',
          PARTIAL: 'Partial',
          NONE: 'None',
          PENDING: 'Pending',
        }[status];

  return <Badge className={map[status]}>{label}</Badge>;
}

function defaultBaseQty(stage: TransferNegotiationStage, line: StoreTransferLine): number {
  if (stage === 'approve') {
    if (line.quantityApproved != null) return line.quantityApproved;
    return line.quantity;
  }
  if (stage === 'dispatch') return remainingToDispatch(line);
  return remainingToReceive(line);
}

export function TransferNegotiationWorkspace({
  transferId,
  stage,
  open,
  onClose,
}: TransferNegotiationWorkspaceProps) {
  const { data: transfer, isLoading } = useStoreTransfer(transferId ?? '');
  const { data: stores = [] } = useStoreLocations(open);
  const approve = useApproveStoreTransfer();
  const saveApprovalDraft = useSaveTransferApprovalDraft();
  const dispatch = useDispatchStoreTransfer();
  const receive = useReceiveStoreTransfer();
  const cancelTransfer = useCancelStoreTransfer();
  const completeTransfer = useCompleteStoreTransfer();
  const { data: capabilities } = useTransferWorkflowCapabilities(open);
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});

  const productIds = useMemo(
    () => (transfer?.lines ?? []).map((l) => l.productId),
    [transfer?.lines],
  );
  const { map: uomMap, isLoading: uomsLoading } = useTransferProductUomMap(
    productIds,
    open && stage === 'approve',
  );

  const storeLabelMap = useMemo(() => buildStoreLabelMap(stores), [stores]);

  useEffect(() => {
    if (!transfer?.lines) return;
    if (stage === 'approve' && uomsLoading) return;

    const next: Record<string, LineEdit> = {};
    for (const line of transfer.lines) {
      const defaultUom = getDefaultUom(uomMap.get(line.productId));
      const factor = defaultUom?.conversionFactor ?? '1';
      const uomName = defaultUom?.uomSymbol || defaultUom?.uomName || 'Base';
      const uomId = defaultUom?.uomId ?? null;

      const baseQty = defaultBaseQty(stage, line);
      const existingComment =
        stage === 'approve'
          ? line.approvalComment
          : stage === 'dispatch'
            ? line.dispatchComment
            : line.receiveComment;
      const { reason, warehouseNotes } =
        stage === 'approve'
          ? splitApprovalLineComment(existingComment)
          : { reason: '', warehouseNotes: existingComment ?? '' };

      next[line.id] = {
        quantity: displayQtyFromBase(baseQty, factor),
        reason,
        warehouseNotes,
        selectedUomId: uomId,
        conversionFactor: factor,
        uomName,
        requestedUomName: uomName,
      };
    }
    setEdits(next);
  }, [transfer?.id, transfer?.lines, stage, uomsLoading, uomMap]);

  const meta = STAGE_META[stage];
  const isPending =
    approve.isPending ||
    saveApprovalDraft.isPending ||
    dispatch.isPending ||
    receive.isPending ||
    cancelTransfer.isPending ||
    completeTransfer.isPending;

  const applyLinePatches = useCallback(
    (patcher: (line: StoreTransferLine, edit: LineEdit) => Partial<LineEdit>) => {
      if (!transfer?.lines) return;
      setEdits((prev) => {
        const next = { ...prev };
        for (const line of transfer.lines ?? []) {
          const edit = next[line.id];
          if (!edit) continue;
          next[line.id] = { ...edit, ...patcher(line, edit) };
        }
        return next;
      });
    },
    [transfer?.lines],
  );

  const handleApproveAll = useCallback(() => {
    applyLinePatches((line, edit) => ({
      quantity: displayQtyFromBase(line.quantity, edit.conversionFactor),
    }));
    toast.success('All lines set to full requested quantity');
  }, [applyLinePatches]);

  const handleApproveAvailable = useCallback(() => {
    applyLinePatches((line, edit) => {
      const baseApproved = Math.min(line.quantity, line.availableAtSource ?? 0);
      return {
        quantity: displayQtyFromBase(baseApproved, edit.conversionFactor),
        reason:
          baseApproved + 0.0001 < line.quantity
            ? edit.reason || 'Approved available stock only'
            : edit.reason,
      };
    });
    toast.success('Lines set to available warehouse quantity');
  }, [applyLinePatches]);

  const handleRejectAll = useCallback(async () => {
    if (!transfer?.lines) return;
    const lines = transfer.lines.map((line) => {
      const edit = edits[line.id];
      return {
        lineId: line.id,
        quantity: 0,
        comment:
          combineApprovalLineComment(
            edit?.reason?.trim() || 'Request rejected',
            edit?.warehouseNotes ?? '',
          ) ?? 'Request rejected',
      };
    });
    try {
      await approve.mutateAsync({ id: transfer.id, lines });
      toast.success('Request rejected');
      onClose();
    } catch {
      toast.error('Failed to reject request');
    }
  }, [approve, edits, onClose, transfer]);

  const updateEdit = useCallback((lineId: string, patch: Partial<LineEdit>) => {
    setEdits((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...patch },
    }));
  }, []);

  const setLineApproved = useCallback(
    (line: StoreTransferLine) => {
      const edit = edits[line.id];
      if (!edit) return;
      updateEdit(line.id, {
        quantity: displayQtyFromBase(line.quantity, edit.conversionFactor),
      });
    },
    [edits, updateEdit],
  );

  const setLineRejected = useCallback(
    (line: StoreTransferLine) => {
      updateEdit(line.id, { quantity: '0', reason: 'Line rejected' });
    },
    [updateEdit],
  );

  const summary = useMemo(() => {
    if (!transfer?.lines) return { items: 0, actionQty: 0 };
    let actionQty = 0;
    for (const line of transfer.lines) {
      const edit = edits[line.id];
      const q = parseFloat(edit?.quantity ?? '0');
      if (!Number.isNaN(q)) {
        actionQty +=
          stage === 'approve'
            ? baseQtyFromDisplay(q, edit?.conversionFactor ?? '1')
            : q;
      }
    }
    return { items: transfer.lines.length, actionQty };
  }, [transfer?.lines, edits, stage]);

  const buildPayload = (t: StoreTransfer) => {
    const lines = (t.lines ?? []).map((line) => {
      const edit = edits[line.id];
      const displayQty = parseFloat(edit?.quantity ?? '0') || 0;
      const quantity =
        stage === 'approve'
          ? baseQtyFromDisplay(displayQty, edit?.conversionFactor ?? '1')
          : displayQty;
      const comment =
        stage === 'approve'
          ? combineApprovalLineComment(edit?.reason ?? '', edit?.warehouseNotes ?? '')
          : (edit?.warehouseNotes?.trim() || edit?.reason?.trim() || null);
      return { lineId: line.id, quantity, comment };
    });
    return { id: t.id, lines };
  };

  const handleSubmit = async () => {
    if (!transfer) return;
    const payload = buildPayload(transfer);
    try {
      if (stage === 'approve') {
        await approve.mutateAsync(payload);
        toast.success('Transfer generated — ready for dispatch');
      } else if (stage === 'dispatch') {
        await dispatch.mutateAsync(payload);
        toast.success('Dispatch recorded');
      } else {
        await receive.mutateAsync(payload);
        toast.success('Receipt recorded');
      }
      onClose();
    } catch {
      toast.error(
        stage === 'approve' ? 'Failed to generate transfer' : `Failed to save ${stage}`,
      );
    }
  };

  const handleSaveDraft = async () => {
    if (!transfer) return;
    if (transfer.status !== 'DRAFT') {
      toast.error('Only pending requests can be saved as draft');
      return;
    }
    try {
      await saveApprovalDraft.mutateAsync(buildPayload(transfer));
      toast.success('Review saved — request still pending. Use Generate transfer when ready.');
    } catch {
      toast.error('Failed to save draft');
    }
  };

  const handleCancelRequest = async () => {
    if (!transfer) return;
    try {
      await cancelTransfer.mutateAsync({
        id: transfer.id,
        reason: 'Cancelled from approval workspace',
      });
      toast.success('Request cancelled');
      onClose();
    } catch {
      toast.error('Failed to cancel request');
    }
  };

  const handleCompleteTransfer = async () => {
    if (!transfer) return;
    try {
      await completeTransfer.mutateAsync(buildPayload(transfer));
      toast.success('Transfer completed end-to-end');
      onClose();
    } catch {
      toast.error('Failed to complete transfer');
    }
  };

  const approvalColumns = useMemo((): DataTableColumn<StoreTransferLine>[] => {
    return [
      {
        id: 'product',
        header: 'Product',
        cell: (line) => (
          <div className="min-w-[10rem]">
            <div className="font-medium text-gray-900">
              {line.productName ?? `Line ${line.lineNumber}`}
            </div>
            <div className="text-xs text-gray-500 break-words">
              {line.sku && <>SKU {line.sku}</>}
              {line.lotNumber && <> · Lot {line.lotNumber}</>}
            </div>
          </div>
        ),
      },
      {
        id: 'requestedQty',
        header: 'Requested Qty',
        align: 'right',
        cell: (line) => {
          const edit = edits[line.id];
          return (
            <span className="font-mono">
              {displayQtyFromBase(line.quantity, edit?.conversionFactor ?? '1')}
            </span>
          );
        },
      },
      {
        id: 'requestedUom',
        header: 'Requested UoM',
        cell: (line) => (
          <span className="text-gray-700">{edits[line.id]?.requestedUomName ?? '—'}</span>
        ),
      },
      {
        id: 'available',
        header: 'Available Qty',
        align: 'right',
        cell: (line) => {
          const edit = edits[line.id];
          const available = line.availableAtSource ?? 0;
          return (
            <span className="font-mono text-green-700">
              {displayQtyFromBase(available, edit?.conversionFactor ?? '1')}
            </span>
          );
        },
      },
      {
        id: 'approvedQty',
        header: 'Approved Qty',
        align: 'right',
        cellClassName: 'align-top',
        cell: (line) => (
          <Input
            type="number"
            min={0}
            step="any"
            value={edits[line.id]?.quantity ?? ''}
            onChange={(e) => updateEdit(line.id, { quantity: e.target.value })}
            className="h-9 w-full min-w-[5rem] max-w-[7rem] ml-auto text-right font-mono"
          />
        ),
      },
      {
        id: 'approvedUom',
        header: 'Approved UoM',
        cellClassName: 'align-top min-w-[8rem]',
        cell: (line) => {
          const edit = edits[line.id];
          const productUoms = uomMap.get(line.productId)?.uoms;
          return (
            <UomSelector
              productId={line.productId}
              baseCost={0}
              selectedUomId={edit?.selectedUomId}
              prefetchedUoms={productUoms}
              onChange={({ uomId, conversionFactor, uomName }) => {
                const oldFactor = edit?.conversionFactor ?? '1';
                const newQty = convertPoLineQuantityForUomChange(
                  edit?.quantity ?? '0',
                  oldFactor,
                  conversionFactor,
                );
                updateEdit(line.id, {
                  selectedUomId: uomId,
                  conversionFactor,
                  uomName,
                  quantity: newQty,
                });
              }}
              className="w-full min-w-[7rem]"
            />
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: (line) => {
          const edit = edits[line.id];
          const baseApproved = baseQtyFromDisplay(
            parseFloat(edit?.quantity ?? '0') || 0,
            edit?.conversionFactor ?? '1',
          );
          return fulfillmentBadge('approve', line, baseApproved);
        },
      },
      {
        id: 'reason',
        header: 'Reason',
        cellClassName: 'align-top min-w-[10rem]',
        cell: (line) => (
          <Textarea
            rows={2}
            value={edits[line.id]?.reason ?? ''}
            onChange={(e) => updateEdit(line.id, { reason: e.target.value })}
            placeholder="e.g. Insufficient stock"
            className="text-xs min-h-[3rem] resize-y w-full"
          />
        ),
      },
      {
        id: 'warehouseNotes',
        header: 'Warehouse notes',
        cellClassName: 'align-top min-w-[10rem]',
        cell: (line) => (
          <Textarea
            rows={2}
            value={edits[line.id]?.warehouseNotes ?? ''}
            onChange={(e) => updateEdit(line.id, { warehouseNotes: e.target.value })}
            placeholder="Internal notes for warehouse team"
            className="text-xs min-h-[3rem] resize-y w-full"
          />
        ),
      },
      {
        id: 'lineActions',
        header: 'Actions',
        cellClassName: 'align-top min-w-[6rem]',
        cell: (line) => (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={isPending}
              onClick={() => setLineApproved(line)}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-red-700"
              disabled={isPending}
              onClick={() => setLineRejected(line)}
            >
              Reject
            </Button>
          </div>
        ),
      },
    ];
  }, [edits, uomMap, updateEdit, isPending, setLineApproved, setLineRejected]);

  const operationalColumns = useMemo((): DataTableColumn<StoreTransferLine>[] => {
    const cols: DataTableColumn<StoreTransferLine>[] = [
      {
        id: 'product',
        header: 'Product',
        cell: (line) => (
          <div>
            <div className="font-medium">{line.productName ?? `Line ${line.lineNumber}`}</div>
            <div className="text-xs text-gray-500">
              {line.sku && <>SKU {line.sku} · </>}
              {line.lotNumber && <>Lot {line.lotNumber}</>}
            </div>
          </div>
        ),
      },
      {
        id: 'requested',
        header: 'Requested',
        align: 'right',
        cell: (line) => <span className="font-mono">{line.quantity}</span>,
      },
      {
        id: 'approved',
        header: 'Approved',
        align: 'right',
        cell: (line) => (
          <span className="font-mono">
            {formatQtyRatio(effectiveApprovedQty(line), line.quantity)}
          </span>
        ),
      },
    ];

    if (stage === 'dispatch' || stage === 'receive') {
      cols.push({
        id: 'inTransit',
        header: stage === 'dispatch' ? 'Dispatched' : 'In transit',
        align: 'right',
        cell: (line) => (
          <span className="font-mono">
            {stage === 'dispatch'
              ? formatQtyRatio(line.quantityDispatched, effectiveApprovedQty(line))
              : remainingToReceive(line)}
          </span>
        ),
      });
    }

    if (stage === 'receive') {
      cols.push({
        id: 'received',
        header: 'Received',
        align: 'right',
        cell: (line) => (
          <span className="font-mono">
            {formatQtyRatio(line.quantityReceived, line.quantityDispatched)}
          </span>
        ),
      });
    }

    cols.push(
      {
        id: 'actionQty',
        header: meta.qtyLabel,
        align: 'right',
        cellClassName: 'align-top',
        cell: (line) => {
          const edit = edits[line.id] ?? {
            quantity: '0',
            reason: '',
            warehouseNotes: '',
            selectedUomId: null,
            conversionFactor: '1',
            uomName: 'Base',
            requestedUomName: 'Base',
          };
          const qtyNum = parseFloat(edit.quantity) || 0;
          const inTransit = remainingToReceive(line);
          const diff = stage === 'receive' ? Math.max(0, inTransit - qtyNum) : 0;
          return (
            <div>
              <Input
                type="number"
                min={0}
                step="any"
                value={edit.quantity}
                onChange={(e) => updateEdit(line.id, { quantity: e.target.value })}
                className="h-9 w-full min-w-[5rem] max-w-[7rem] ml-auto text-right font-mono"
              />
              {stage === 'receive' && diff > 0 && (
                <p className="text-[10px] text-amber-700 text-right mt-1">Short {diff}</p>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: (line) => fulfillmentBadge(stage, line),
      },
      {
        id: 'comment',
        header: 'Comment',
        cellClassName: 'align-top min-w-[12rem]',
        cell: (line) => (
          <Textarea
            rows={2}
            value={edits[line.id]?.warehouseNotes ?? ''}
            onChange={(e) => updateEdit(line.id, { warehouseNotes: e.target.value })}
            placeholder={
              stage === 'dispatch' ? 'e.g. Damaged cartons' : 'e.g. Transit damage'
            }
            className="text-xs min-h-[3rem] resize-y w-full"
          />
        ),
      },
    );

    return cols;
  }, [edits, meta.qtyLabel, stage, updateEdit]);

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-gray-600">
        {summary.items} line{summary.items !== 1 ? 's' : ''} · {meta.qtyLabel}{' '}
        <span className="font-semibold text-gray-900">
          {stage === 'approve'
            ? summary.actionQty.toFixed(2).replace(/\.?0+$/, '')
            : summary.actionQty}
        </span>
        {stage === 'approve' && <span className="text-gray-400"> base units</span>}
      </p>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Close
        </Button>
        {stage !== 'approve' && (
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending || !transfer}>
            {isPending ? 'Saving…' : meta.action}
          </Button>
        )}
      </div>
    </div>
  );

  const requestingLabel = transfer
    ? resolveStoreLabel(storeLabelMap, transfer.destinationStoreId)
    : '—';
  const supplyingLabel = transfer
    ? resolveStoreLabel(storeLabelMap, transfer.sourceStoreId)
    : '—';

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={transfer?.transferNumber ?? 'Transfer'}
      subtitle={meta.title}
      width="full"
      transactional
      footer={footer}
    >
      {isLoading || !transfer ? (
        <p className="text-gray-500">Loading transfer…</p>
      ) : (
        <div className="space-y-6">
          {stage === 'approve' ? (
            <>
              <TransferApprovalWorkspaceHeader
                transfer={transfer}
                requestingStoreLabel={requestingLabel}
                supplyingStoreLabel={supplyingLabel}
              />
              <TransferApprovalToolbar
                capabilities={capabilities}
                isPending={isPending}
                canSaveDraft={transfer.status === 'DRAFT'}
                onApproveAll={handleApproveAll}
                onApproveAvailable={handleApproveAvailable}
                onRejectAll={handleRejectAll}
                onCancelRequest={() => void handleCancelRequest()}
                onSaveDraft={() => void handleSaveDraft()}
                onGenerateTransfer={() => void handleSubmit()}
                onCompleteTransfer={() => void handleCompleteTransfer()}
              />
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pb-4 border-b">
              <span className="text-sm text-gray-600">
                {supplyingLabel} → {requestingLabel}
              </span>
            </div>
          )}

          <div>
            <Label className="text-xs text-gray-500 uppercase mb-2 block">
              {stage === 'approve'
                ? 'Line items — edit all quantities on this screen'
                : 'Line items'}
            </Label>
            <DataTable
              columns={stage === 'approve' ? approvalColumns : operationalColumns}
              data={transfer.lines ?? []}
              getRowKey={(line) => line.id}
              stickyHeader
              emptyMessage="No lines on this request."
              className="shadow-none border rounded-lg"
            />
          </div>

          <div>
            <Label className="text-xs text-gray-500 uppercase">Audit trail</Label>
            <ul className="mt-2 space-y-1 text-xs text-gray-600 max-h-32 overflow-y-auto border rounded-md p-3 bg-slate-50">
              {(transfer.auditEvents ?? []).length === 0 ? (
                <li>No events yet</li>
              ) : (
                (transfer.auditEvents ?? []).map((ev) => (
                  <li key={ev.id}>
                    <span className="font-medium">{ev.eventType}</span>
                    {' · '}
                    {new Date(ev.createdAt).toLocaleString()}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </SlideDrawer>
  );
}
