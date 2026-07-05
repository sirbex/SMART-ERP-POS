/**
 * Credit/Debit Notes Page
 * 
 * Manages customer and supplier credit/debit notes.
 * Tabs: Customer Notes | Supplier Notes
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle } from '../../hooks/useTransactionGuard';
import { Plus, Search, Eye, Check, FileText, FileMinus, FilePlus, XCircle, Sparkles } from 'lucide-react';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import {
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    Badge,
    Textarea,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '../../components/ui/temp-ui-components';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'react-hot-toast';
import {
    creditDebitNoteService,
    type CreditDebitNote,
    type SupplierCreditDebitNote,
    type CreateDebitNoteRequest,
    type CreateSupplierCreditNoteRequest,
    type CreateSupplierDebitNoteRequest,
    type CreateNoteLineInput,
} from '../../services/creditDebitNoteService';
import { api } from '../../services/api';
import { formatTimestampDate } from '../../utils/businessDate';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { ResponsiveActionBar, ResponsiveToolbar, ResponsiveToolbarActions } from '../../components/ui/ResponsiveActionBar';
import { AdjustCustomerInvoiceModal } from '../../components/shared/AdjustCustomerInvoiceModal';

/** Supplier notes use DRAFT/POSTED/APPLIED; customer notes use Draft/Posted. */
function isNoteDraft(status: string): boolean {
    return status === 'DRAFT' || status === 'Draft';
}
function isSupplierPosted(status: string): boolean {
    return status === 'POSTED' || status === 'APPLIED';
}

/** APPLIED = user allocated credit to bill(s) via Apply to Open Bills. */
function supplierNoteStatusLabel(note: SupplierCreditDebitNote): string {
    if (note.status === 'APPLIED' && note.referenceInvoiceNumber) {
        return `Allocated → ${note.referenceInvoiceNumber}`;
    }
    if (note.status === 'APPLIED') return 'Fully allocated';
    return note.status;
}

function isReturnGrnCreditNote(note: SupplierCreditDebitNote): boolean {
    return (
        note.documentType === 'SUPPLIER_CREDIT_NOTE'
        && (note.reason?.includes('RGRN-') === true || note.notes?.toLowerCase().includes('return grn') === true)
    );
}

// ============================================================
// Main Page
// ============================================================

const CreditDebitNotesPage: React.FC = () => {
    const location = useLocation();
    // Auto-select supplier tab when navigated via ?tab=supplier (e.g. from Supplier Payments page)
    const initialTab = new URLSearchParams(location.search).get('tab') === 'supplier' ? 'supplier' : 'customer';
    const [activeTab, setActiveTab] = useState(initialTab);

    return (
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Credit & Debit Notes</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Manage credit notes (returns/allowances) and debit notes (additional charges)
                </p>
            </div>

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
        </div>
    );
};

// ============================================================
// Customer Notes Tab
// ============================================================

function CustomerNotesTab() {
    const [notes, setNotes] = useState<CreditDebitNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT_NOTE' | 'DEBIT_NOTE'>('ALL');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSmartCreditOpen, setIsSmartCreditOpen] = useState(false);
    const [adjustInvoice, setAdjustInvoice] = useState<{
        id: string;
        invoiceNumber: string;
        customerId?: string;
    } | null>(null);
    const [createType, setCreateType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE'>('CREDIT_NOTE');
    const [selectedNote, setSelectedNote] = useState<CreditDebitNote | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // ── Transaction Guard ──────────────────────────────────────────────────
    const { openGuard, closeGuard } = useTransactionGuard();
    const detailGuardRef = useRef<GuardHandle | null>(null);

    useEffect(() => {
        if (isDetailOpen) {
            detailGuardRef.current = openGuard({ cancellable: true, label: 'View credit/debit note' });
            return () => { if (detailGuardRef.current) { closeGuard(detailGuardRef.current.id); detailGuardRef.current = null; } };
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

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    const handlePost = async (noteId: string) => {
        try {
            await creditDebitNoteService.postCustomerNote(noteId);
            toast.success('Note posted successfully');
            fetchNotes();
        } catch {
            toast.error('Failed to post note');
        }
    };

    const handleCancel = async (noteId: string) => {
        const reason = window.prompt('Enter cancellation reason:');
        if (!reason) return;
        try {
            await creditDebitNoteService.cancelCustomerNote(noteId, reason);
            toast.success('Note cancelled with GL reversal');
            fetchNotes();
        } catch {
            toast.error('Failed to cancel note');
        }
    };

    const filteredNotes = notes.filter(n =>
        !search || n.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        n.customerName.toLowerCase().includes(search.toLowerCase()) ||
        (n.reason || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4 text-sm text-blue-900 space-y-2">
                <p className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    Credit notes from invoice
                </p>
                <p>
                    Credit notes must be created <strong>from the original customer invoice</strong>, not as free-form lines.
                    Pick an invoice, then choose <strong>Price correction</strong> (overcharge, no stock change) or{' '}
                    <strong>Return goods</strong> (physical return → stock + COGS reversal).
                </p>
                <p className="text-xs text-blue-800">
                    Walk-in POS exchanges without an invoice: use <strong>Sales → Exchange</strong>. Full cash refunds: use <strong>Return</strong>.
                </p>
            </div>

            <ResponsiveToolbar>
                <div className="relative flex-1 min-w-0 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search notes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v as 'ALL' | 'CREDIT_NOTE' | 'DEBIT_NOTE')}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="CREDIT_NOTE">Credit Notes</SelectItem>
                        <SelectItem value="DEBIT_NOTE">Debit Notes</SelectItem>
                    </SelectContent>
                </Select>

                <ResponsiveToolbarActions>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsSmartCreditOpen(true)}
                        className="flex items-center gap-1"
                    >
                        <Sparkles className="h-4 w-4" />
                        Credit Note
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCreateType('DEBIT_NOTE'); setIsCreateModalOpen(true); }}
                        className="flex items-center gap-1"
                    >
                        <FilePlus className="h-4 w-4" />
                        Debit Note
                    </Button>
                </ResponsiveToolbarActions>
            </ResponsiveToolbar>

            {loading ? (
                <div className="rounded-lg border border-gray-100 bg-white">
                    <ListSkeleton rows={5} />
                </div>
            ) : filteredNotes.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">No notes found</div>
            ) : (
                <div className="space-y-2">
                    {filteredNotes.map(note => (
                        <Card key={note.id}>
                            <CardContent className="p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="font-semibold text-base sm:text-lg break-all">{note.invoiceNumber}</span>
                                            <Badge variant={note.documentType === 'CREDIT_NOTE' ? 'destructive' : 'default'}>
                                                {note.documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
                                            </Badge>
                                            <Badge variant={note.status === 'Posted' ? 'default' : 'secondary'}>
                                                {note.status}
                                            </Badge>
                                        </div>
                                        <div className="mt-1.5 text-sm text-gray-600 break-words">
                                            <span className="font-medium">{note.customerName}</span>
                                            {note.referenceInvoiceNumber && (
                                                <span className="block sm:inline sm:ml-2">Ref: {note.referenceInvoiceNumber}</span>
                                            )}
                                            {note.reason && <span className="block sm:inline sm:ml-2 text-gray-500">{note.reason}</span>}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                                            <div>
                                                <span className="text-gray-500">Total:</span>{' '}
                                                <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Tax:</span> {formatCurrency(note.taxAmount)}
                                            </div>
                                            <div className="col-span-2 sm:col-span-1">
                                                <span className="text-gray-500">Date:</span>{' '}
                                                {formatTimestampDate(note.issueDate)}
                                            </div>
                                        </div>
                                    </div>

                                    <ResponsiveActionBar className="sm:shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setSelectedNote(note); setIsDetailOpen(true); }}
                                        >
                                            <Eye className="h-4 w-4 shrink-0" />
                                            <span className="ml-2 sm:hidden">View</span>
                                        </Button>
                                        {note.status === 'Draft' && (
                                            <Button
                                                size="sm"
                                                onClick={() => handlePost(note.id)}
                                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                            >
                                                <Check className="h-4 w-4 shrink-0" />
                                                Post
                                            </Button>
                                        )}
                                        {note.status === 'Posted' && (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleCancel(note.id)}
                                                className="flex items-center gap-1"
                                            >
                                                <XCircle className="h-4 w-4 shrink-0" />
                                                Cancel
                                            </Button>
                                        )}
                                    </ResponsiveActionBar>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Smart credit note: invoice → adjustment wizard (posted CN) */}
            <SmartCustomerCreditNotePicker
                open={isSmartCreditOpen}
                onClose={() => setIsSmartCreditOpen(false)}
                onInvoiceSelected={(inv) => {
                    setIsSmartCreditOpen(false);
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
                        fetchNotes();
                    }}
                />
            )}

            {/* Debit notes still use manual draft form */}
            {isCreateModalOpen && createType === 'DEBIT_NOTE' && (
            <CreateCustomerNoteModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                noteType="DEBIT_NOTE"
                onSuccess={fetchNotes}
            />
            )}

            {/* Detail View */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen} zIndex={detailGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
                <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedNote?.invoiceNumber}</DialogTitle>
                        <DialogDescription>
                            {selectedNote?.documentType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} Note Details
                        </DialogDescription>
                    </DialogHeader>
                    {selectedNote && (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div><span className="text-gray-500">Customer:</span> {selectedNote.customerName}</div>
                                <div><span className="text-gray-500">Status:</span> {selectedNote.status}</div>
                                <div><span className="text-gray-500">Subtotal:</span> {formatCurrency(selectedNote.subtotal)}</div>
                                <div><span className="text-gray-500">Tax:</span> {formatCurrency(selectedNote.taxAmount)}</div>
                                <div><span className="text-gray-500">Total:</span> {formatCurrency(selectedNote.totalAmount)}</div>
                                <div><span className="text-gray-500">Date:</span> {formatTimestampDate(selectedNote.issueDate)}</div>
                            </div>
                            {selectedNote.reason && (
                                <div><span className="text-gray-500">Reason:</span> {selectedNote.reason}</div>
                            )}
                            {selectedNote.notes && (
                                <div><span className="text-gray-500">Notes:</span> {selectedNote.notes}</div>
                            )}
                            <DocumentFlowButton
                                entityType={selectedNote.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE'}
                                entityId={selectedNote.id}
                                size="sm"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ============================================================
// Supplier Notes Tab
// ============================================================

function SupplierNotesTab() {
    const [notes, setNotes] = useState<SupplierCreditDebitNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE'>('ALL');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createType, setCreateType] = useState<'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE'>('SUPPLIER_CREDIT_NOTE');
    const [selectedNote, setSelectedNote] = useState<SupplierCreditDebitNote | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // ── Transaction Guard ──────────────────────────────────────────────────
    const { openGuard: openGuardS, closeGuard: closeGuardS } = useTransactionGuard();
    const detailGuardRefS = useRef<GuardHandle | null>(null);

    useEffect(() => {
        if (isDetailOpen) {
            detailGuardRefS.current = openGuardS({ cancellable: true, label: 'View supplier credit/debit note' });
            return () => { if (detailGuardRefS.current) { closeGuardS(detailGuardRefS.current.id); detailGuardRefS.current = null; } };
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

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    const handlePost = async (note: SupplierCreditDebitNote) => {
        try {
            await creditDebitNoteService.postSupplierNote(note.id);
            if (note.documentType === 'SUPPLIER_CREDIT_NOTE' && note.referenceInvoiceId) {
                toast.success(
                    `${note.invoiceNumber} posted to GL and applied to bill ${note.referenceInvoiceNumber || 'reference'}.`,
                    { duration: 6000 },
                );
            } else if (note.documentType === 'SUPPLIER_CREDIT_NOTE') {
                toast.success(
                    `${note.invoiceNumber} posted. Click "Apply to Open Bills" if this credit is not tied to one bill.`,
                    { duration: 7000 },
                );
            } else {
                toast.success('Supplier debit note posted successfully');
            }
            fetchNotes();
        } catch {
            toast.error('Failed to post supplier note');
        }
    };

    const handleCancel = async (noteId: string) => {
        const reason = window.prompt('Enter cancellation reason:');
        if (!reason) return;
        try {
            await creditDebitNoteService.cancelSupplierNote(noteId, reason);
            toast.success('Supplier note cancelled with GL reversal');
            fetchNotes();
        } catch {
            toast.error('Failed to cancel supplier note');
        }
    };

    /**
     * Apply a posted, standalone (unreferenced) Supplier Credit Note against
     * the supplier's open bills using FIFO. Mirrors the SAP/Odoo "Apply to
     * Open Bills" action: one-click, residual stays on-account.
     */
    const [applyingNoteId, setApplyingNoteId] = useState<string | null>(null);
    const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);
    const [workflowFilter, setWorkflowFilter] = useState<'ALL' | 'DRAFT' | 'ON_ACCOUNT'>('ALL');

    const draftNotes = notes.filter(n => isNoteDraft(n.status));
    const onAccountNotes = notes.filter(n =>
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
            if (applied > 0) {
                toast.success(
                    `Applied ${formatCurrency(applied)} across ${count} bill${count === 1 ? '' : 's'}.` +
                    (residual > 0 ? ` ${formatCurrency(residual)} remains on-account.` : '')
                );
            } else {
                toast('No open bills available — credit note remains on-account.');
            }
            fetchNotes();
        } catch {
            toast.error('Failed to apply credit note to open bills');
        } finally {
            setApplyingNoteId(null);
        }
    };

    const filteredNotes = notes.filter(n => {
        const matchesSearch = !search || n.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
            (n.supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
            (n.reason || '').toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (workflowFilter === 'DRAFT') return isNoteDraft(n.status);
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 text-sm text-amber-900 space-y-2">
                    <p className="font-semibold">Supplier credit notes — action required</p>
                    {draftNotes.length > 0 && (
                        <p>
                            <span className="font-medium">{draftNotes.length} draft note{draftNotes.length === 1 ? '' : 's'}</span>
                            {' '}— not in GL yet. Use the green <strong>Post to GL</strong> button on each row.
                        </p>
                    )}
                    {onAccountNotes.length > 0 && (
                        <p>
                            <span className="font-medium">{onAccountNotes.length} on-account credit note{onAccountNotes.length === 1 ? '' : 's'}</span>
                            {' '}— posted to GL but AP not reduced. Use <strong>Apply to Open Bills</strong>.
                        </p>
                    )}
                </div>
            )}

            <ResponsiveToolbar>
                <div className="relative flex-1 min-w-0 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search supplier notes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v as 'ALL' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE')}>
                    <SelectTrigger className="w-full sm:w-52">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="SUPPLIER_CREDIT_NOTE">Credit Notes</SelectItem>
                        <SelectItem value="SUPPLIER_DEBIT_NOTE">Debit Notes</SelectItem>
                    </SelectContent>
                </Select>

                <ResponsiveToolbarActions>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCreateType('SUPPLIER_CREDIT_NOTE'); setIsCreateModalOpen(true); }}
                        className="flex items-center gap-1"
                    >
                        <FileMinus className="h-4 w-4" />
                        Credit Note
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCreateType('SUPPLIER_DEBIT_NOTE'); setIsCreateModalOpen(true); }}
                        className="flex items-center gap-1"
                    >
                        <FilePlus className="h-4 w-4" />
                        Debit Note
                    </Button>
                </ResponsiveToolbarActions>
            </ResponsiveToolbar>

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
            ) : filteredNotes.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">No supplier notes found</div>
            ) : (
                <div className="space-y-2">
                    {filteredNotes.map(note => (
                        <Card
                            key={note.id}
                            className={highlightNoteId === note.id ? 'ring-2 ring-amber-400' : undefined}
                        >
                            <CardContent className="p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="font-semibold text-base sm:text-lg break-all">{note.invoiceNumber}</span>
                                            <Badge variant={note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'destructive' : 'default'}>
                                                {note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
                                            </Badge>
                                            <Badge variant={
                                                note.status === 'APPLIED' ? 'default'
                                                    : isSupplierPosted(note.status) ? 'default'
                                                        : 'secondary'
                                            }>
                                                {supplierNoteStatusLabel(note)}
                                            </Badge>
                                            {note.documentType === 'SUPPLIER_CREDIT_NOTE'
                                                && note.status === 'POSTED'
                                                && note.outstandingBalance > 0
                                                && isReturnGrnCreditNote(note) && (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                                                    Apply to bill required
                                                </Badge>
                                            )}
                                            {isNoteDraft(note.status) && (
                                                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                                                    Needs posting
                                                </Badge>
                                            )}
                                            {note.documentType === 'SUPPLIER_CREDIT_NOTE'
                                                && note.status === 'POSTED'
                                                && note.outstandingBalance > 0 && (
                                                    <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
                                                        On-account: {formatCurrency(note.outstandingBalance)}
                                                    </Badge>
                                                )}
                                        </div>
                                        <div className="mt-1.5 text-sm text-gray-600 break-words">
                                            <span className="font-medium">{note.supplierName || 'Unknown supplier'}</span>
                                            {note.referenceInvoiceNumber && (
                                                <span className="block sm:inline sm:ml-2">Ref: {note.referenceInvoiceNumber}</span>
                                            )}
                                            {note.reason && <span className="block sm:inline sm:ml-2 text-gray-500">{note.reason}</span>}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                                            <div>
                                                <span className="text-gray-500">Total:</span>{' '}
                                                <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Tax:</span> {formatCurrency(note.taxAmount)}
                                            </div>
                                            <div className="col-span-2 sm:col-span-1">
                                                <span className="text-gray-500">Date:</span>{' '}
                                                {formatTimestampDate(note.issueDate)}
                                            </div>
                                        </div>
                                    </div>

                                    <ResponsiveActionBar className="sm:shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setSelectedNote(note); setIsDetailOpen(true); }}
                                        >
                                            <Eye className="h-4 w-4 shrink-0" />
                                            <span className="ml-2 sm:hidden">View</span>
                                        </Button>
                                        {isNoteDraft(note.status) && (
                                            <Button
                                                size="sm"
                                                onClick={() => handlePost(note)}
                                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                            >
                                                <Check className="h-4 w-4 shrink-0" />
                                                Post to GL
                                            </Button>
                                        )}
                                        {(note.status === 'POSTED' || note.status === 'APPLIED') && (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleCancel(note.id)}
                                                className="flex items-center gap-1"
                                            >
                                                <XCircle className="h-4 w-4 shrink-0" />
                                                Cancel
                                            </Button>
                                        )}
                                        {note.documentType === 'SUPPLIER_CREDIT_NOTE'
                                            && note.status === 'POSTED'
                                            && note.outstandingBalance > 0 && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleApplyFIFO(note.id)}
                                                    disabled={applyingNoteId === note.id}
                                                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                >
                                                    <Sparkles className="h-4 w-4 shrink-0" />
                                                    {applyingNoteId === note.id ? 'Applying…' : 'Apply to Open Bills'}
                                                </Button>
                                            )}
                                    </ResponsiveActionBar>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Supplier Note Modal */}
            <CreateSupplierNoteModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                noteType={createType}
                onSuccess={fetchNotes}
                onCreated={(created) => {
                    setHighlightNoteId(created.id);
                    setTimeout(() => setHighlightNoteId(null), 12000);
                }}
            />

            {/* Detail View */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen} zIndex={detailGuardRefS.current?.panelZIndex ?? ZINDEX.PANEL}>
                <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedNote?.invoiceNumber}</DialogTitle>
                        <DialogDescription>
                            Supplier {selectedNote?.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} Note Details
                        </DialogDescription>
                    </DialogHeader>
                    {selectedNote && (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div><span className="text-gray-500">Supplier:</span> {selectedNote.supplierName}</div>
                                <div><span className="text-gray-500">Status:</span> {supplierNoteStatusLabel(selectedNote)}</div>
                                <div><span className="text-gray-500">Subtotal:</span> {formatCurrency(selectedNote.subtotal)}</div>
                                <div><span className="text-gray-500">Tax:</span> {formatCurrency(selectedNote.taxAmount)}</div>
                                <div><span className="text-gray-500">Total:</span> {formatCurrency(selectedNote.totalAmount)}</div>
                                <div><span className="text-gray-500">Date:</span> {formatTimestampDate(selectedNote.issueDate)}</div>
                            </div>
                            {selectedNote.reason && (
                                <div><span className="text-gray-500">Reason:</span> {selectedNote.reason}</div>
                            )}
                            {selectedNote.notes && (
                                <div><span className="text-gray-500">Notes:</span> {selectedNote.notes}</div>
                            )}
                            {isNoteDraft(selectedNote.status) && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                                    <p className="font-medium">Next step: Post to GL</p>
                                    <p className="mt-1 text-xs">
                                        Draft notes do not affect GL or supplier balance. Close this dialog and click
                                        {' '}<strong>Post to GL</strong> on the list (or use Create &amp; Post when creating).
                                    </p>
                                </div>
                            )}
                            {selectedNote.documentType === 'SUPPLIER_CREDIT_NOTE'
                                && selectedNote.status === 'APPLIED'
                                && selectedNote.referenceInvoiceNumber && (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                                    <p className="font-medium">Credit allocated to {selectedNote.referenceInvoiceNumber}</p>
                                    <p className="mt-1 text-xs">
                                        This credit note&apos;s full amount ({formatCurrency(selectedNote.totalAmount)}) was
                                        applied to the referenced bill. The bill&apos;s outstanding balance is reduced in
                                        Supplier Payments.
                                    </p>
                                </div>
                            )}
                            {selectedNote.documentType === 'SUPPLIER_CREDIT_NOTE'
                                && selectedNote.status === 'POSTED'
                                && selectedNote.outstandingBalance > 0 && (
                                <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-purple-900">
                                    <p className="font-medium">Next step: Apply to open bills</p>
                                    <p className="mt-1 text-xs">
                                        On-account balance {formatCurrency(selectedNote.outstandingBalance)} —
                                        use <strong>Apply to Open Bills</strong> on the list.
                                        {isReturnGrnCreditNote(selectedNote) && selectedNote.referenceInvoiceNumber && (
                                            <>
                                                {' '}Return credits target <strong>{selectedNote.referenceInvoiceNumber}</strong> first,
                                                then any remaining amount goes to other open bills (FIFO).
                                            </>
                                        )}
                                    </p>
                                </div>
                            )}
                            <DocumentFlowButton
                                entityType={selectedNote.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE'}
                                entityId={selectedNote.id}
                                size="sm"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ============================================================
// Smart Customer Credit Note — invoice picker (step 1 of wizard)
// ============================================================

interface SmartCustomerCreditNotePickerProps {
    open: boolean;
    onClose: () => void;
    onInvoiceSelected: (invoice: { id: string; invoiceNumber: string; customerId?: string }) => void;
}

function SmartCustomerCreditNotePicker({
    open,
    onClose,
    onInvoiceSelected,
}: SmartCustomerCreditNotePickerProps) {
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<Array<{
        id: string;
        invoiceNumber: string;
        customerName: string;
        customerId?: string;
        totalAmount: string;
        amountDue?: string;
        status?: string;
    }>>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!open) {
            setInvoiceSearch('');
            setInvoiceResults([]);
        }
    }, [open]);

    const searchInvoices = async (q: string) => {
        if (q.length < 2) {
            setInvoiceResults([]);
            return;
        }
        setSearching(true);
        try {
            const res = await api.get('/accounting/comprehensive/invoices', {
                params: { search: q, limit: 15, documentType: 'INVOICE' },
            });
            const rows = (res.data?.data?.data || res.data?.data || []) as Array<Record<string, unknown>>;
            setInvoiceResults(
                rows
                    .filter((inv) => {
                        const docType = String(inv.documentType ?? inv.document_type ?? 'INVOICE');
                        const status = String(inv.status ?? '');
                        return docType === 'INVOICE' && !['CANCELLED', 'Cancelled', 'VOIDED', 'VOID'].includes(status);
                    })
                    .map((inv) => ({
                        id: String(inv.id),
                        invoiceNumber: String(inv.invoiceNumber ?? inv.invoice_number ?? ''),
                        customerName: String(inv.customerName ?? inv.customer_name ?? 'Customer'),
                        customerId: inv.customerId ? String(inv.customerId) : inv.customer_id ? String(inv.customer_id) : undefined,
                        totalAmount: String(inv.totalAmount ?? inv.total_amount ?? 0),
                        amountDue: String(inv.amountDue ?? inv.amount_due ?? inv.balance ?? ''),
                        status: String(inv.status ?? ''),
                    })),
            );
        } catch {
            setInvoiceResults([]);
            toast.error('Failed to search invoices');
        } finally {
            setSearching(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600" />
                        Create Credit Note
                    </DialogTitle>
                    <DialogDescription>
                        Select the original customer invoice. Lines, amounts, and GL posting are driven from that invoice — no manual entry.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-1">
                        <p className="font-medium">What happens next</p>
                        <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                            <li>Choose <strong>Price correction</strong> or <strong>Return goods</strong></li>
                            <li>Pick lines from the invoice (system suggests correct amounts)</li>
                            <li>Credit note is created and <strong>posted immediately</strong> — AR and GL update automatically</li>
                        </ol>
                    </div>

                    <div>
                        <Label>Original customer invoice *</Label>
                        <div className="relative mt-1">
                            <Input
                                placeholder="Search invoice # or customer name (e.g. mire)..."
                                value={invoiceSearch}
                                onChange={(e) => {
                                    setInvoiceSearch(e.target.value);
                                    void searchInvoices(e.target.value);
                                }}
                            />
                            {searching && (
                                <p className="text-xs text-gray-500 mt-1">Searching…</p>
                            )}
                            {invoiceResults.length > 0 && (
                                <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-56 overflow-y-auto">
                                    {invoiceResults.map((inv) => (
                                        <button
                                            key={inv.id}
                                            type="button"
                                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm border-b last:border-b-0"
                                            onClick={() => {
                                                onInvoiceSelected({
                                                    id: inv.id,
                                                    invoiceNumber: inv.invoiceNumber,
                                                    customerId: inv.customerId,
                                                });
                                            }}
                                        >
                                            <div className="font-medium">{inv.invoiceNumber}</div>
                                            <div className="text-gray-600">{inv.customerName}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                Total {formatCurrency(parseFloat(inv.totalAmount || '0'))}
                                                {inv.amountDue && parseFloat(inv.amountDue) > 0 && (
                                                    <> · Outstanding {formatCurrency(parseFloat(inv.amountDue))}</>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {invoiceSearch.length >= 2 && !searching && invoiceResults.length === 0 && (
                                <p className="text-xs text-gray-500 mt-2">No open customer invoices match.</p>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// Create Customer Debit Note Modal (manual draft — credit uses smart wizard)
// ============================================================

interface CreateCustomerNoteModalProps {
    open: boolean;
    onClose: () => void;
    noteType: 'DEBIT_NOTE';
    onSuccess: () => void;
}

function CreateCustomerNoteModal({ open, onClose, onSuccess }: CreateCustomerNoteModalProps) {
    const [invoiceId, setInvoiceId] = useState('');
    const [reason, setReason] = useState('');
    const [additionalNotes, setAdditionalNotes] = useState('');
    const [lines, setLines] = useState<CreateNoteLineInput[]>([
        { productName: '', quantity: 1, unitPrice: 0, taxRate: 0 },
    ]);
    const [submitting, setSubmitting] = useState(false);

    // ── Transaction Guard ──────────────────────────────────────────────────
    const { openGuard: openCNGuard, closeGuard: closeCNGuard } = useTransactionGuard();
    const cnGuardRef = useRef<GuardHandle | null>(null);
    useEffect(() => {
        if (open) {
            cnGuardRef.current = openCNGuard({ cancellable: false, label: 'Create customer credit/debit note' });
            return () => { if (cnGuardRef.current) { closeCNGuard(cnGuardRef.current.id); cnGuardRef.current = null; } };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Invoice search
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<Array<{ id: string; invoiceNumber: string; customerName: string; totalAmount: string }>>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<{ id: string; invoiceNumber: string; customerName: string; totalAmount: string } | null>(null);

    const searchInvoices = async (q: string) => {
        if (q.length < 2) { setInvoiceResults([]); return; }
        try {
            const res = await api.get('/accounting/comprehensive/invoices', { params: { search: q, limit: 10 } });
            setInvoiceResults(res.data?.data?.data || res.data?.data || []);
        } catch {
            setInvoiceResults([]);
        }
    };

    const addLine = () => {
        setLines([...lines, { productName: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
    };

    const removeLine = (index: number) => {
        if (lines.length <= 1) return;
        setLines(lines.filter((_, i) => i !== index));
    };

    const updateLine = (index: number, field: keyof CreateNoteLineInput, value: string | number) => {
        setLines(lines.map((l, i) => i === index ? { ...l, [field]: value } : l));
    };

    const lineTotal = (line: CreateNoteLineInput) => {
        const sub = line.quantity * line.unitPrice;
        const tax = sub * (line.taxRate / 100);
        return sub + tax;
    };

    const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

    const handleSubmit = async () => {
        if (!invoiceId) { toast.error('Please select an invoice'); return; }
        if (!reason.trim()) { toast.error('Reason is required'); return; }
        if (lines.some(l => !l.productName.trim())) { toast.error('All line items need a product name'); return; }

        setSubmitting(true);
        try {
            const data: CreateDebitNoteRequest = {
                invoiceId,
                reason,
                lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
                notes: additionalNotes || undefined,
            };
            await creditDebitNoteService.createCustomerDebitNote(data);
            toast.success('Debit note created (Draft)');
            onSuccess();
            resetForm();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to create note';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setInvoiceId('');
        setReason('');
        setAdditionalNotes('');
        setLines([{ productName: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
        setInvoiceSearch('');
        setInvoiceResults([]);
        setSelectedInvoice(null);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} zIndex={cnGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Debit Note</DialogTitle>
                    <DialogDescription>
                        Increase customer balance (additional charges, corrections)
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Invoice Search */}
                    <div>
                        <Label>Original Invoice *</Label>
                        {selectedInvoice ? (
                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                                <span className="font-medium">{selectedInvoice.invoiceNumber}</span>
                                <span className="text-gray-500">—</span>
                                <span>{selectedInvoice.customerName}</span>
                                <span className="text-gray-500">({formatCurrency(parseFloat(selectedInvoice.totalAmount))})</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setSelectedInvoice(null); setInvoiceId(''); }}
                                    className="ml-auto"
                                >
                                    Change
                                </Button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Input
                                    placeholder="Search by invoice number or customer..."
                                    value={invoiceSearch}
                                    onChange={e => { setInvoiceSearch(e.target.value); searchInvoices(e.target.value); }}
                                />
                                {invoiceResults.length > 0 && (
                                    <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                                        {invoiceResults.map(inv => (
                                            <button
                                                key={inv.id}
                                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                                onClick={() => {
                                                    setInvoiceId(inv.id);
                                                    setSelectedInvoice(inv);
                                                    setInvoiceResults([]);
                                                }}
                                            >
                                                <span className="font-medium">{inv.invoiceNumber}</span>
                                                <span className="text-gray-500 ml-2">{inv.customerName}</span>
                                                <span className="text-gray-400 ml-2">{formatCurrency(parseFloat(inv.totalAmount))}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <Label>Reason *</Label>
                        <Textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Reason for this note..."
                            rows={2}
                        />
                    </div>

                    {/* Line Items — debit notes only; credit notes use invoice-linked wizard */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label>Line Items</Label>
                            <Button variant="outline" size="sm" onClick={addLine}>
                                <Plus className="h-3 w-3 mr-1" /> Add Line
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {lines.map((line, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-4">
                                        {idx === 0 && <Label className="text-xs">Product</Label>}
                                        <Input
                                            value={line.productName}
                                            onChange={e => updateLine(idx, 'productName', e.target.value)}
                                            placeholder="Product name"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        {idx === 0 && <Label className="text-xs">Qty</Label>}
                                        <Input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={String(line.quantity)}
                                            onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        {idx === 0 && <Label className="text-xs">Unit Price</Label>}
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={String(line.unitPrice)}
                                            onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        {idx === 0 && <Label className="text-xs">Tax %</Label>}
                                        <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            value={String(line.taxRate)}
                                            onChange={e => updateLine(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="col-span-1 text-right text-sm font-medium pt-1">
                                        {formatCurrency(lineTotal(line))}
                                    </div>
                                    <div className="col-span-1">
                                        {lines.length > 1 && (
                                            <Button variant="outline" size="sm" onClick={() => removeLine(idx)} className="text-red-500">
                                                ×
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="text-right mt-2 font-semibold">
                            Grand Total: {formatCurrency(grandTotal)}
                        </div>
                    </div>

                    {/* Additional Notes */}
                    <div>
                        <Label>Additional Notes</Label>
                        <Textarea
                            value={additionalNotes}
                            onChange={e => setAdditionalNotes(e.target.value)}
                            placeholder="Optional notes..."
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Creating...' : 'Create Debit Note'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// Create Supplier Credit/Debit Note Modal
// ============================================================

interface CreateSupplierNoteModalProps {
    open: boolean;
    onClose: () => void;
    noteType: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
    onSuccess: () => void;
    onCreated?: (note: { id: string; invoiceNumber: string }) => void;
}

function CreateSupplierNoteModal({ open, onClose, noteType, onSuccess, onCreated }: CreateSupplierNoteModalProps) {
    const [invoiceId, setInvoiceId] = useState('');
    const [reason, setReason] = useState('');
    const [amount, setAmount] = useState('');
    const [additionalNotes, setAdditionalNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Transaction Guard ──────────────────────────────────────────────────
    const { openGuard: openSNGuard, closeGuard: closeSNGuard } = useTransactionGuard();
    const snGuardRef = useRef<GuardHandle | null>(null);
    useEffect(() => {
        if (open) {
            snGuardRef.current = openSNGuard({ cancellable: false, label: 'Create supplier credit/debit note' });
            return () => { if (snGuardRef.current) { closeSNGuard(snGuardRef.current.id); snGuardRef.current = null; } };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Invoice search
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<Array<{ id: string; invoiceNumber: string; supplierName: string; totalAmount: string }>>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<{ id: string; invoiceNumber: string; supplierName: string; totalAmount: string } | null>(null);

    const searchInvoices = async (q: string) => {
        if (q.length < 2) { setInvoiceResults([]); return; }
        try {
            const res = await api.get('/supplier-payments/invoices', { params: { search: q, limit: 10 } });
            const data = res.data?.data?.items || res.data?.data?.data || res.data?.data || [];
            setInvoiceResults(data.map((inv: Record<string, unknown>) => ({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber || inv.supplierInvoiceNumber,
                supplierName: inv.supplierName || '',
                totalAmount: String(inv.totalAmount || 0),
            })));
        } catch {
            setInvoiceResults([]);
        }
    };

    const handleSubmit = async (postAfterCreate: boolean) => {
        if (!invoiceId) { toast.error('Please select a supplier invoice'); return; }
        if (!reason.trim()) { toast.error('Reason is required'); return; }
        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { toast.error('Amount must be a positive number'); return; }

        setSubmitting(true);
        try {
            let noteId: string | undefined;
            let noteNumber: string | undefined;

            if (noteType === 'SUPPLIER_CREDIT_NOTE') {
                const data: CreateSupplierCreditNoteRequest = {
                    invoiceId,
                    reason,
                    noteType: 'PRICE_CORRECTION',
                    amount: parsedAmount,
                    notes: additionalNotes || undefined,
                };
                const res = await creditDebitNoteService.createSupplierCreditNote(data);
                const note = res.data?.note ?? res.data;
                noteId = note?.id as string | undefined;
                noteNumber = note?.invoiceNumber as string | undefined;
            } else {
                const data: CreateSupplierDebitNoteRequest = {
                    invoiceId,
                    reason,
                    amount: parsedAmount,
                    notes: additionalNotes || undefined,
                };
                const res = await creditDebitNoteService.createSupplierDebitNote(data);
                const note = res.data?.note ?? res.data;
                noteId = note?.id as string | undefined;
                noteNumber = note?.invoiceNumber as string | undefined;
            }

            if (postAfterCreate && noteId) {
                await creditDebitNoteService.postSupplierNote(noteId);
                if (noteType === 'SUPPLIER_CREDIT_NOTE') {
                    toast.success(
                        `${noteNumber ?? 'Credit note'} posted to GL and applied to the selected bill.`,
                        { duration: 6000 },
                    );
                } else {
                    toast.success(`${noteNumber ?? 'Debit note'} posted to GL.`);
                }
            } else {
                toast.success(
                    `${noteNumber ?? 'Note'} saved as Draft — use Post to GL on the list to complete accounting.`,
                    { duration: 7000 },
                );
            }

            if (noteId && noteNumber) {
                onCreated?.({ id: noteId, invoiceNumber: noteNumber });
            }
            onSuccess();
            resetForm();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to create note';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setInvoiceId('');
        setReason('');
        setAmount('');
        setAdditionalNotes('');
        setInvoiceSearch('');
        setInvoiceResults([]);
        setSelectedInvoice(null);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} zIndex={snGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Create Supplier {noteType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} Note
                    </DialogTitle>
                    <DialogDescription>
                        {noteType === 'SUPPLIER_CREDIT_NOTE'
                            ? 'Price correction or allowance — reduces amount owed to supplier'
                            : 'Additional charge — increases amount owed to supplier'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        <p className="font-medium">Workflow</p>
                        <ol className="mt-1 list-decimal list-inside space-y-0.5 text-xs">
                            <li><strong>Create</strong> — saves a draft (no GL yet)</li>
                            <li><strong>Post to GL</strong> — records accounting; linked credits auto-apply to the bill you selected</li>
                            <li><strong>Apply to Open Bills</strong> — only if posted and still shows on-account balance</li>
                        </ol>
                    </div>

                    {/* Return Goods Banner (credit notes only) */}
                    {noteType === 'SUPPLIER_CREDIT_NOTE' && (
                        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
                            <FileMinus className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <span className="font-medium text-amber-800">Returning physical goods?</span>
                                <span className="text-amber-700 ml-1">
                                    Use the{' '}
                                    <a href="/inventory/goods-receipts" className="underline font-medium">Return to Supplier</a>
                                    {' '}flow from Goods Receipts. That path automatically adjusts stock, cost, and posts accounting.
                                    This form is for <span className="font-medium">price corrections and allowances only</span> (no stock movement).
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Supplier Invoice Search */}
                    <div>
                        <Label>Original Supplier Invoice *</Label>
                        {selectedInvoice ? (
                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                                <span className="font-medium">{selectedInvoice.invoiceNumber}</span>
                                <span className="text-gray-500">—</span>
                                <span>{selectedInvoice.supplierName}</span>
                                <span className="text-gray-500">({formatCurrency(parseFloat(selectedInvoice.totalAmount))})</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setSelectedInvoice(null); setInvoiceId(''); }}
                                    className="ml-auto"
                                >
                                    Change
                                </Button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Input
                                    placeholder="Search by invoice number or supplier..."
                                    value={invoiceSearch}
                                    onChange={e => { setInvoiceSearch(e.target.value); searchInvoices(e.target.value); }}
                                />
                                {invoiceResults.length > 0 && (
                                    <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                                        {invoiceResults.map(inv => (
                                            <button
                                                key={inv.id}
                                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                                onClick={() => {
                                                    setInvoiceId(inv.id);
                                                    setSelectedInvoice(inv);
                                                    setInvoiceResults([]);
                                                }}
                                            >
                                                <span className="font-medium">{inv.invoiceNumber}</span>
                                                <span className="text-gray-500 ml-2">{inv.supplierName}</span>
                                                <span className="text-gray-400 ml-2">{formatCurrency(parseFloat(inv.totalAmount))}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <Label>Reason *</Label>
                        <Textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={noteType === 'SUPPLIER_CREDIT_NOTE'
                                ? 'e.g. Supplier overcharged on invoice, price correction for item X'
                                : 'e.g. Additional freight charge not in original invoice'}
                            rows={2}
                        />
                    </div>

                    {/* Amount */}
                    <div>
                        <Label>Amount (UGX) *</Label>
                        <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                        />
                    </div>

                    {/* Additional Notes */}
                    <div>
                        <Label>Additional Notes</Label>
                        <Textarea
                            value={additionalNotes}
                            onChange={e => setAdditionalNotes(e.target.value)}
                            placeholder="Optional notes..."
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                    >
                        {submitting ? 'Saving...' : 'Save as Draft'}
                    </Button>
                    <Button
                        onClick={() => handleSubmit(true)}
                        disabled={submitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {submitting ? 'Posting...' : 'Create & Post to GL'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CreditDebitNotesPage;
