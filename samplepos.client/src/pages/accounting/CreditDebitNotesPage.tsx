/**
 * Credit/Debit Notes Page
 *
 * List + actions only. Create/UX SSOT:
 *   samplepos.client/src/components/accounting/creditDebitNotes/*
 *   @shared/utils/creditDebitNoteSsot
 *   @shared/zod/creditDebitNote
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle } from '../../hooks/useTransactionGuard';
import { FileText, FileMinus, FilePlus } from 'lucide-react';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '../../components/ui/temp-ui-components';
import { formatCurrency } from '../../utils/currency';
import { formatScnApplySuccessMessage } from '@shared/utils/supplierBillSettlement';
import {
    isNoteDraftStatus,
    isReturnGrnCreditNote,
    supplierNoteStatusLabel,
} from '@shared/utils/creditDebitNoteSsot';
import { toast } from 'react-hot-toast';
import {
    creditDebitNoteService,
    type CreditDebitNote,
    type SupplierCreditDebitNote,
} from '../../services/creditDebitNoteService';
import { formatTimestampDate } from '../../utils/businessDate';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { AdjustCustomerInvoiceModal } from '../../components/shared/AdjustCustomerInvoiceModal';
import {
    CustomerNotesAdaptiveGrid,
    SupplierNotesAdaptiveGrid,
} from '../../components/accounting/CreditDebitNotesAdaptiveGrids';
import {
    CreateAmountNoteDialog,
    SelectCustomerInvoiceDialog,
} from '../../components/accounting/creditDebitNotes';
import {
    AdaptiveDialog,
    AdaptiveFormField,
    AdaptiveFormLayout,
    AdaptivePage,
    AdaptiveSearch,
    AdaptiveToolbar,
} from '../../components/adaptive';

const CreditDebitNotesPage: React.FC = () => {
    const location = useLocation();
    const initialTab = new URLSearchParams(location.search).get('tab') === 'supplier' ? 'supplier' : 'customer';
    const [activeTab, setActiveTab] = useState(initialTab);

    return (
        <AdaptivePage
            className="p-4 sm:p-6"
            title="Credit & Debit Notes"
            description="Customer (receivable) and supplier (payable) credit and debit notes"
        >
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full sm:w-auto flex overflow-x-auto">
                    <TabsTrigger value="customer" className="flex-shrink-0">
                        <FileText className="h-4 w-4 mr-1.5 sm:mr-2" />
                        <span className="whitespace-nowrap">Customer (AR)</span>
                    </TabsTrigger>
                    <TabsTrigger value="supplier" className="flex-shrink-0">
                        <FileText className="h-4 w-4 mr-1.5 sm:mr-2" />
                        <span className="whitespace-nowrap">Supplier (AP)</span>
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="customer">
                    <CustomerNotesTab />
                </TabsContent>
                <TabsContent value="supplier">
                    <SupplierNotesTab />
                </TabsContent>
            </Tabs>
        </AdaptivePage>
    );
}

function CustomerNotesTab() {
    const [notes, setNotes] = useState<CreditDebitNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT_NOTE' | 'DEBIT_NOTE'>('ALL');
    const [creditPickerOpen, setCreditPickerOpen] = useState(false);
    const [debitOpen, setDebitOpen] = useState(false);
    const [adjustInvoice, setAdjustInvoice] = useState<{
        id: string;
        invoiceNumber: string;
        customerId?: string;
    } | null>(null);
    const [selectedNote, setSelectedNote] = useState<CreditDebitNote | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const { openGuard, closeGuard } = useTransactionGuard();
    const detailGuardRef = useRef<GuardHandle | null>(null);

    useEffect(() => {
        if (isDetailOpen) {
            detailGuardRef.current = openGuard({ cancellable: true, label: 'View credit/debit note' });
            return () => {
                if (detailGuardRef.current) {
                    closeGuard(detailGuardRef.current.id);
                    detailGuardRef.current = null;
                }
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDetailOpen]);

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page: 1, limit: 100 };
            if (typeFilter !== 'ALL') params.documentType = typeFilter;
            const result = await creditDebitNoteService.listCustomerNotes(params);
            setNotes(result.data || []);
        } catch {
            toast.error('Failed to load customer notes');
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => { void fetchNotes(); }, [fetchNotes]);

    const handlePost = async (noteId: string) => {
        try {
            await creditDebitNoteService.postCustomerNote(noteId);
            toast.success('Note posted');
            void fetchNotes();
        } catch {
            toast.error('Failed to post note');
        }
    };

    const handleCancel = async (noteId: string) => {
        const reason = window.prompt('Enter cancellation reason:');
        if (!reason) return;
        try {
            await creditDebitNoteService.cancelCustomerNote(noteId, reason);
            toast.success('Note cancelled');
            void fetchNotes();
        } catch {
            toast.error('Failed to cancel note');
        }
    };

    const filteredNotes = notes.filter((n) =>
        !search
        || n.invoiceNumber.toLowerCase().includes(search.toLowerCase())
        || n.customerName.toLowerCase().includes(search.toLowerCase())
        || (n.reason || '').toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <div className="space-y-4">
            <div data-cdn-filters="customer">
                <AdaptiveToolbar
                    leading={
                        <AdaptiveSearch
                            value={search}
                            onChange={setSearch}
                            placeholder="Search notes..."
                            label="Search customer notes"
                        />
                    }
                    secondaryLabel="Type"
                    secondary={
                        <Select
                            value={typeFilter}
                            onValueChange={(v: string) => setTypeFilter(v as 'ALL' | 'CREDIT_NOTE' | 'DEBIT_NOTE')}
                        >
                            <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Types</SelectItem>
                                <SelectItem value="CREDIT_NOTE">Credit Notes</SelectItem>
                                <SelectItem value="DEBIT_NOTE">Debit Notes</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                >
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreditPickerOpen(true)}
                        className="flex items-center gap-1 min-h-[var(--layout-touch-target)]"
                    >
                        <FileMinus className="h-4 w-4" />
                        Credit Note
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDebitOpen(true)}
                        className="flex items-center gap-1 min-h-[var(--layout-touch-target)]"
                    >
                        <FilePlus className="h-4 w-4" />
                        Debit Note
                    </Button>
                </AdaptiveToolbar>
            </div>

            {loading ? (
                <div className="rounded-lg border border-gray-100 bg-white">
                    <ListSkeleton rows={5} />
                </div>
            ) : (
                <CustomerNotesAdaptiveGrid
                    notes={filteredNotes}
                    onView={(note) => { setSelectedNote(note); setIsDetailOpen(true); }}
                    onPost={handlePost}
                    onCancel={handleCancel}
                />
            )}

            <SelectCustomerInvoiceDialog
                open={creditPickerOpen}
                onClose={() => setCreditPickerOpen(false)}
                onInvoiceSelected={(inv) => {
                    setCreditPickerOpen(false);
                    setAdjustInvoice(inv);
                }}
            />

            {adjustInvoice && (
                <AdjustCustomerInvoiceModal
                    open={Boolean(adjustInvoice)}
                    invoiceId={adjustInvoice.id}
                    invoiceNumber={adjustInvoice.invoiceNumber}
                    customerId={adjustInvoice.customerId}
                    onClose={() => {
                        setAdjustInvoice(null);
                        void fetchNotes();
                    }}
                />
            )}

            <CreateAmountNoteDialog
                kind="CUSTOMER_DEBIT_NOTE"
                open={debitOpen}
                onClose={() => setDebitOpen(false)}
                onSuccess={() => void fetchNotes()}
            />

            <AdaptiveDialog
                open={isDetailOpen}
                onOpenChange={setIsDetailOpen}
                zIndex={detailGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}
                size="md"
                title={selectedNote?.invoiceNumber ?? 'Note details'}
                description={`${selectedNote?.documentType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} note`}
            >
                {selectedNote && (
                    <AdaptiveFormLayout>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Customer</span>
                            <div className="font-medium">{selectedNote.customerName}</div>
                        </AdaptiveFormField>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Status</span>
                            <div className="font-medium">{selectedNote.status}</div>
                        </AdaptiveFormField>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Subtotal</span>
                            <div>{formatCurrency(selectedNote.subtotal)}</div>
                        </AdaptiveFormField>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Tax</span>
                            <div>{formatCurrency(selectedNote.taxAmount)}</div>
                        </AdaptiveFormField>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Total</span>
                            <div className="font-semibold">{formatCurrency(selectedNote.totalAmount)}</div>
                        </AdaptiveFormField>
                        <AdaptiveFormField>
                            <span className="text-gray-500 text-sm">Date</span>
                            <div>{formatTimestampDate(selectedNote.issueDate)}</div>
                        </AdaptiveFormField>
                        {selectedNote.reason && (
                            <AdaptiveFormField span="full">
                                <span className="text-gray-500 text-sm">Reason</span>
                                <div>{selectedNote.reason}</div>
                            </AdaptiveFormField>
                        )}
                        {selectedNote.notes && (
                            <AdaptiveFormField span="full">
                                <span className="text-gray-500 text-sm">Notes</span>
                                <div>{selectedNote.notes}</div>
                            </AdaptiveFormField>
                        )}
                        <AdaptiveFormField span="full">
                            <DocumentFlowButton
                                entityType={selectedNote.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE'}
                                entityId={selectedNote.id}
                                size="sm"
                            />
                        </AdaptiveFormField>
                    </AdaptiveFormLayout>
                )}
            </AdaptiveDialog>
        </div>
    );
}

function SupplierNotesTab() {
    const [notes, setNotes] = useState<SupplierCreditDebitNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE'>('ALL');
    const [createKind, setCreateKind] = useState<'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE' | null>(null);
    const [selectedNote, setSelectedNote] = useState<SupplierCreditDebitNote | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [applyingNoteId, setApplyingNoteId] = useState<string | null>(null);
    const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);
    const [workflowFilter, setWorkflowFilter] = useState<'ALL' | 'DRAFT' | 'ON_ACCOUNT'>('ALL');

    const { openGuard: openGuardS, closeGuard: closeGuardS } = useTransactionGuard();
    const detailGuardRefS = useRef<GuardHandle | null>(null);

    useEffect(() => {
        if (isDetailOpen) {
            detailGuardRefS.current = openGuardS({ cancellable: true, label: 'View supplier credit/debit note' });
            return () => {
                if (detailGuardRefS.current) {
                    closeGuardS(detailGuardRefS.current.id);
                    detailGuardRefS.current = null;
                }
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDetailOpen]);

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page: 1, limit: 100 };
            if (typeFilter !== 'ALL') params.documentType = typeFilter;
            const result = await creditDebitNoteService.listSupplierNotes(params);
            setNotes(result.data || []);
        } catch {
            toast.error('Failed to load supplier notes');
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => { void fetchNotes(); }, [fetchNotes]);

    const handlePost = async (note: SupplierCreditDebitNote) => {
        try {
            await creditDebitNoteService.postSupplierNote(note.id);
            toast.success(`${note.invoiceNumber} posted`);
            void fetchNotes();
        } catch {
            toast.error('Failed to post supplier note');
        }
    };

    const handleCancel = async (noteId: string) => {
        const reason = window.prompt('Enter cancellation reason:');
        if (!reason) return;
        try {
            await creditDebitNoteService.cancelSupplierNote(noteId, reason);
            toast.success('Supplier note cancelled');
            void fetchNotes();
        } catch {
            toast.error('Failed to cancel supplier note');
        }
    };

    const draftNotes = notes.filter((n) => isNoteDraftStatus(n.status));
    const onAccountNotes = notes.filter((n) =>
        n.documentType === 'SUPPLIER_CREDIT_NOTE'
        && n.status === 'POSTED'
        && n.outstandingBalance > 0,
    );

    const handleApplyFIFO = async (noteId: string) => {
        setApplyingNoteId(noteId);
        try {
            const res = await creditDebitNoteService.applySupplierCreditNoteFIFO(noteId);
            const applied = res.data?.totalApplied ?? 0;
            const residual = res.data?.residual ?? 0;
            const count = res.data?.allocations?.length ?? 0;
            toast.success(
                formatScnApplySuccessMessage({
                    applied,
                    billCount: count,
                    residual,
                    formatMoney: formatCurrency,
                }),
            );
            void fetchNotes();
        } catch {
            toast.error('Failed to apply credit note to open bills');
        } finally {
            setApplyingNoteId(null);
        }
    };

    const filteredNotes = notes.filter((n) => {
        const matchesSearch = !search
            || n.invoiceNumber.toLowerCase().includes(search.toLowerCase())
            || (n.supplierName || '').toLowerCase().includes(search.toLowerCase())
            || (n.reason || '').toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (workflowFilter === 'DRAFT') return isNoteDraftStatus(n.status);
        if (workflowFilter === 'ON_ACCOUNT') {
            return n.documentType === 'SUPPLIER_CREDIT_NOTE'
                && n.status === 'POSTED'
                && n.outstandingBalance > 0;
        }
        return true;
    });

    return (
        <div className="space-y-4">
            {(draftNotes.length > 0 || onAccountNotes.length > 0) && (
                <div className="flex flex-wrap gap-2 text-sm">
                    {draftNotes.length > 0 && (
                        <span className="rounded-full bg-amber-50 text-amber-900 ring-1 ring-amber-200 px-3 py-1">
                            {draftNotes.length} draft
                        </span>
                    )}
                    {onAccountNotes.length > 0 && (
                        <span className="rounded-full bg-purple-50 text-purple-900 ring-1 ring-purple-200 px-3 py-1">
                            {onAccountNotes.length} on-account
                        </span>
                    )}
                </div>
            )}

            <div data-cdn-filters="supplier">
                <AdaptiveToolbar
                    leading={
                        <AdaptiveSearch
                            value={search}
                            onChange={setSearch}
                            placeholder="Search supplier notes..."
                            label="Search supplier notes"
                        />
                    }
                    secondaryLabel="Type"
                    secondary={
                        <Select
                            value={typeFilter}
                            onValueChange={(v: string) =>
                                setTypeFilter(v as 'ALL' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE')
                            }
                        >
                            <SelectTrigger className="w-full sm:w-52">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Types</SelectItem>
                                <SelectItem value="SUPPLIER_CREDIT_NOTE">Credit Notes</SelectItem>
                                <SelectItem value="SUPPLIER_DEBIT_NOTE">Debit Notes</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                >
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateKind('SUPPLIER_CREDIT_NOTE')}
                        className="flex items-center gap-1 min-h-[var(--layout-touch-target)]"
                    >
                        <FileMinus className="h-4 w-4" />
                        Credit Note
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateKind('SUPPLIER_DEBIT_NOTE')}
                        className="flex items-center gap-1 min-h-[var(--layout-touch-target)]"
                    >
                        <FilePlus className="h-4 w-4" />
                        Debit Note
                    </Button>
                </AdaptiveToolbar>
            </div>

            {(draftNotes.length > 0 || onAccountNotes.length > 0) && (
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setWorkflowFilter('ALL')}
                        className={`w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-full transition-colors text-center ${workflowFilter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100'}`}
                    >
                        All notes
                    </button>
                    {draftNotes.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setWorkflowFilter('DRAFT')}
                            className={`w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-full transition-colors text-center ${workflowFilter === 'DRAFT' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100'}`}
                        >
                            Needs posting ({draftNotes.length})
                        </button>
                    )}
                    {onAccountNotes.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setWorkflowFilter('ON_ACCOUNT')}
                            className={`w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-full transition-colors text-center ${workflowFilter === 'ON_ACCOUNT' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-800 ring-1 ring-purple-200 hover:bg-purple-100'}`}
                        >
                            On-account ({onAccountNotes.length})
                        </button>
                    )}
                </div>
            )}

            {loading ? (
                <div className="rounded-lg border border-gray-100 bg-white">
                    <ListSkeleton rows={5} />
                </div>
            ) : (
                <SupplierNotesAdaptiveGrid
                    notes={filteredNotes}
                    highlightNoteId={highlightNoteId}
                    applyingNoteId={applyingNoteId}
                    onView={(note) => { setSelectedNote(note); setIsDetailOpen(true); }}
                    onPost={handlePost}
                    onCancel={handleCancel}
                    onApplyFifo={handleApplyFIFO}
                />
            )}

            {createKind && (
                <CreateAmountNoteDialog
                    kind={createKind}
                    open={Boolean(createKind)}
                    onClose={() => setCreateKind(null)}
                    onSuccess={() => void fetchNotes()}
                    onCreated={(created) => {
                        setHighlightNoteId(created.id);
                        setTimeout(() => setHighlightNoteId(null), 12000);
                    }}
                />
            )}

            <AdaptiveDialog
                open={isDetailOpen}
                onOpenChange={setIsDetailOpen}
                zIndex={detailGuardRefS.current?.panelZIndex ?? ZINDEX.PANEL}
                size="md"
                title={selectedNote?.invoiceNumber ?? 'Note details'}
                description={`${selectedNote?.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} note`}
            >
                {selectedNote && (
                    <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <span className="text-gray-500">Supplier</span>
                                <div className="font-medium">{selectedNote.supplierName || '—'}</div>
                            </div>
                            <div>
                                <span className="text-gray-500">Status</span>
                                <div className="font-medium">
                                    {supplierNoteStatusLabel({
                                        status: selectedNote.status,
                                        referenceInvoiceNumber: selectedNote.referenceInvoiceNumber,
                                    })}
                                </div>
                            </div>
                            <div>
                                <span className="text-gray-500">Total</span>
                                <div className="font-semibold">{formatCurrency(selectedNote.totalAmount)}</div>
                            </div>
                            <div>
                                <span className="text-gray-500">Date</span>
                                <div>{formatTimestampDate(selectedNote.issueDate)}</div>
                            </div>
                        </div>
                        {selectedNote.reason && (
                            <div>
                                <span className="text-gray-500">Reason</span>
                                <div>{selectedNote.reason}</div>
                            </div>
                        )}
                        {isReturnGrnCreditNote(selectedNote) && (
                            <p className="text-xs text-slate-600">Linked to return goods receipt.</p>
                        )}
                        <DocumentFlowButton
                            entityType={selectedNote.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE'}
                            entityId={selectedNote.id}
                            size="sm"
                        />
                    </div>
                )}
            </AdaptiveDialog>
        </div>
    );
}

export default CreditDebitNotesPage;
