/**
 * Credit/Debit Notes Page
 * 
 * Manages customer and supplier credit/debit notes.
 * Tabs: Customer Notes | Supplier Notes
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Eye, Check, FileText, FileMinus, FilePlus, XCircle } from 'lucide-react';
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
    type CreateCreditNoteRequest,
    type CreateDebitNoteRequest,
    type CreateSupplierCreditNoteRequest,
    type CreateSupplierDebitNoteRequest,
    type CreateNoteLineInput,
    type CreateSupplierNoteLineInput,
} from '../../services/creditDebitNoteService';
import { api } from '../../services/api';

// ============================================================
// Main Page
// ============================================================

const CreditDebitNotesPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('customer');

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Credit & Debit Notes</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Manage credit notes (returns/allowances) and debit notes (additional charges)
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="customer">
                        <FileText className="h-4 w-4 mr-2" />
                        Customer Notes (AR)
                    </TabsTrigger>
                    <TabsTrigger value="supplier">
                        <FileText className="h-4 w-4 mr-2" />
                        Supplier Notes (AP)
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
    const [createType, setCreateType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE'>('CREDIT_NOTE');
    const [selectedNote, setSelectedNote] = useState<CreditDebitNote | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

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
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search notes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v as 'ALL' | 'CREDIT_NOTE' | 'DEBIT_NOTE')}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="CREDIT_NOTE">Credit Notes</SelectItem>
                        <SelectItem value="DEBIT_NOTE">Debit Notes</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCreateType('CREDIT_NOTE'); setIsCreateModalOpen(true); }}
                    className="flex items-center gap-1"
                >
                    <FileMinus className="h-4 w-4" />
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
            </div>

            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : filteredNotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No notes found</div>
            ) : (
                <div className="space-y-2">
                    {filteredNotes.map(note => (
                        <Card key={note.id}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-lg">{note.invoiceNumber}</span>
                                            <Badge variant={note.documentType === 'CREDIT_NOTE' ? 'destructive' : 'default'}>
                                                {note.documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
                                            </Badge>
                                            <Badge variant={note.status === 'Posted' ? 'default' : 'secondary'}>
                                                {note.status}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 text-sm text-gray-600">
                                            <span className="font-medium">{note.customerName}</span>
                                            {note.referenceInvoiceNumber && (
                                                <span className="ml-2">• Ref: {note.referenceInvoiceNumber}</span>
                                            )}
                                            {note.reason && <span className="ml-2">• {note.reason}</span>}
                                        </div>
                                        <div className="mt-1 grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-500">Total:</span>{' '}
                                                <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Tax:</span> {formatCurrency(note.taxAmount)}
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Date:</span>{' '}
                                                {new Date(note.issueDate).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ml-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setSelectedNote(note); setIsDetailOpen(true); }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        {note.status === 'Draft' && (
                                            <Button
                                                size="sm"
                                                onClick={() => handlePost(note.id)}
                                                className="flex items-center gap-1"
                                            >
                                                <Check className="h-4 w-4" />
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
                                                <XCircle className="h-4 w-4" />
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Note Modal */}
            <CreateCustomerNoteModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                noteType={createType}
                onSuccess={fetchNotes}
            />

            {/* Detail View */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{selectedNote?.invoiceNumber}</DialogTitle>
                        <DialogDescription>
                            {selectedNote?.documentType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} Note Details
                        </DialogDescription>
                    </DialogHeader>
                    {selectedNote && (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                                <div><span className="text-gray-500">Customer:</span> {selectedNote.customerName}</div>
                                <div><span className="text-gray-500">Status:</span> {selectedNote.status}</div>
                                <div><span className="text-gray-500">Subtotal:</span> {formatCurrency(selectedNote.subtotal)}</div>
                                <div><span className="text-gray-500">Tax:</span> {formatCurrency(selectedNote.taxAmount)}</div>
                                <div><span className="text-gray-500">Total:</span> {formatCurrency(selectedNote.totalAmount)}</div>
                                <div><span className="text-gray-500">Date:</span> {new Date(selectedNote.issueDate).toLocaleDateString()}</div>
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

    const handlePost = async (noteId: string) => {
        try {
            await creditDebitNoteService.postSupplierNote(noteId);
            toast.success('Supplier note posted successfully');
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

    const filteredNotes = notes.filter(n =>
        !search || n.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (n.supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.reason || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search supplier notes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v as 'ALL' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE')}>
                    <SelectTrigger className="w-52">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="SUPPLIER_CREDIT_NOTE">Credit Notes</SelectItem>
                        <SelectItem value="SUPPLIER_DEBIT_NOTE">Debit Notes</SelectItem>
                    </SelectContent>
                </Select>

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
            </div>

            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : filteredNotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No supplier notes found</div>
            ) : (
                <div className="space-y-2">
                    {filteredNotes.map(note => (
                        <Card key={note.id}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-lg">{note.invoiceNumber}</span>
                                            <Badge variant={note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'destructive' : 'default'}>
                                                {note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
                                            </Badge>
                                            <Badge variant={note.status === 'POSTED' ? 'default' : 'secondary'}>
                                                {note.status}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 text-sm text-gray-600">
                                            <span className="font-medium">{note.supplierName || 'Unknown supplier'}</span>
                                            {note.referenceInvoiceNumber && (
                                                <span className="ml-2">• Ref: {note.referenceInvoiceNumber}</span>
                                            )}
                                            {note.reason && <span className="ml-2">• {note.reason}</span>}
                                        </div>
                                        <div className="mt-1 grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-500">Total:</span>{' '}
                                                <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Tax:</span> {formatCurrency(note.taxAmount)}
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Date:</span>{' '}
                                                {new Date(note.issueDate).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ml-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setSelectedNote(note); setIsDetailOpen(true); }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        {note.status === 'DRAFT' && (
                                            <Button
                                                size="sm"
                                                onClick={() => handlePost(note.id)}
                                                className="flex items-center gap-1"
                                            >
                                                <Check className="h-4 w-4" />
                                                Post
                                            </Button>
                                        )}
                                        {note.status === 'POSTED' && (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleCancel(note.id)}
                                                className="flex items-center gap-1"
                                            >
                                                <XCircle className="h-4 w-4" />
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
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
            />

            {/* Detail View */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{selectedNote?.invoiceNumber}</DialogTitle>
                        <DialogDescription>
                            Supplier {selectedNote?.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} Note Details
                        </DialogDescription>
                    </DialogHeader>
                    {selectedNote && (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                                <div><span className="text-gray-500">Supplier:</span> {selectedNote.supplierName}</div>
                                <div><span className="text-gray-500">Status:</span> {selectedNote.status}</div>
                                <div><span className="text-gray-500">Subtotal:</span> {formatCurrency(selectedNote.subtotal)}</div>
                                <div><span className="text-gray-500">Tax:</span> {formatCurrency(selectedNote.taxAmount)}</div>
                                <div><span className="text-gray-500">Total:</span> {formatCurrency(selectedNote.totalAmount)}</div>
                                <div><span className="text-gray-500">Date:</span> {new Date(selectedNote.issueDate).toLocaleDateString()}</div>
                            </div>
                            {selectedNote.reason && (
                                <div><span className="text-gray-500">Reason:</span> {selectedNote.reason}</div>
                            )}
                            {selectedNote.notes && (
                                <div><span className="text-gray-500">Notes:</span> {selectedNote.notes}</div>
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
// Create Customer Credit/Debit Note Modal
// ============================================================

interface CreateCustomerNoteModalProps {
    open: boolean;
    onClose: () => void;
    noteType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
    onSuccess: () => void;
}

function CreateCustomerNoteModal({ open, onClose, noteType, onSuccess }: CreateCustomerNoteModalProps) {
    const [invoiceId, setInvoiceId] = useState('');
    const [reason, setReason] = useState('');
    const [cnType, setCnType] = useState<'FULL' | 'PARTIAL' | 'PRICE_CORRECTION'>('PARTIAL');
    const [additionalNotes, setAdditionalNotes] = useState('');
    const [lines, setLines] = useState<CreateNoteLineInput[]>([
        { productName: '', quantity: 1, unitPrice: 0, taxRate: 0 },
    ]);
    const [submitting, setSubmitting] = useState(false);

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
            if (noteType === 'CREDIT_NOTE') {
                const data: CreateCreditNoteRequest = {
                    invoiceId,
                    reason,
                    noteType: cnType,
                    lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
                    notes: additionalNotes || undefined,
                };
                await creditDebitNoteService.createCustomerCreditNote(data);
                toast.success('Credit note created (Draft)');
            } else {
                const data: CreateDebitNoteRequest = {
                    invoiceId,
                    reason,
                    lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
                    notes: additionalNotes || undefined,
                };
                await creditDebitNoteService.createCustomerDebitNote(data);
                toast.success('Debit note created (Draft)');
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
        setAdditionalNotes('');
        setLines([{ productName: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
        setInvoiceSearch('');
        setInvoiceResults([]);
        setSelectedInvoice(null);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Create {noteType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} Note
                    </DialogTitle>
                    <DialogDescription>
                        {noteType === 'CREDIT_NOTE'
                            ? 'Reduce customer balance (returns, allowances, corrections)'
                            : 'Increase customer balance (additional charges, corrections)'}
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

                    {/* Note Type (credit only) */}
                    {noteType === 'CREDIT_NOTE' && (
                        <div>
                            <Label>Credit Note Type</Label>
                            <Select value={cnType} onValueChange={(v: string) => setCnType(v as 'FULL' | 'PARTIAL' | 'PRICE_CORRECTION')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FULL">Full Reversal</SelectItem>
                                    <SelectItem value="PARTIAL">Partial</SelectItem>
                                    <SelectItem value="PRICE_CORRECTION">Price Correction</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Line Items */}
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
                        {submitting ? 'Creating...' : `Create ${noteType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} Note`}
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
}

function CreateSupplierNoteModal({ open, onClose, noteType, onSuccess }: CreateSupplierNoteModalProps) {
    const [invoiceId, setInvoiceId] = useState('');
    const [reason, setReason] = useState('');
    const [cnType, setCnType] = useState<'FULL' | 'PARTIAL' | 'PRICE_CORRECTION'>('PARTIAL');
    const [additionalNotes, setAdditionalNotes] = useState('');
    const [lines, setLines] = useState<CreateSupplierNoteLineInput[]>([
        { productName: '', quantity: 1, unitCost: 0, taxRate: 0 },
    ]);
    const [submitting, setSubmitting] = useState(false);

    // Invoice search
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<Array<{ id: string; invoiceNumber: string; supplierName: string; totalAmount: string }>>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<{ id: string; invoiceNumber: string; supplierName: string; totalAmount: string } | null>(null);

    const searchInvoices = async (q: string) => {
        if (q.length < 2) { setInvoiceResults([]); return; }
        try {
            const res = await api.get('/supplier-payments/invoices', { params: { search: q, limit: 10 } });
            const data = res.data?.data?.data || res.data?.data || [];
            setInvoiceResults(data.map((inv: Record<string, unknown>) => ({
                id: inv.id,
                invoiceNumber: inv.supplierInvoiceNumber || inv.invoiceNumber,
                supplierName: inv.supplierName || '',
                totalAmount: String(inv.totalAmount || 0),
            })));
        } catch {
            setInvoiceResults([]);
        }
    };

    const addLine = () => {
        setLines([...lines, { productName: '', quantity: 1, unitCost: 0, taxRate: 0 }]);
    };

    const removeLine = (index: number) => {
        if (lines.length <= 1) return;
        setLines(lines.filter((_, i) => i !== index));
    };

    const updateLine = (index: number, field: keyof CreateSupplierNoteLineInput, value: string | number) => {
        setLines(lines.map((l, i) => i === index ? { ...l, [field]: value } : l));
    };

    const lineTotal = (line: CreateSupplierNoteLineInput) => {
        const sub = line.quantity * line.unitCost;
        const tax = sub * (line.taxRate / 100);
        return sub + tax;
    };

    const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

    const handleSubmit = async () => {
        if (!invoiceId) { toast.error('Please select a supplier invoice'); return; }
        if (!reason.trim()) { toast.error('Reason is required'); return; }
        if (lines.some(l => !l.productName.trim())) { toast.error('All line items need a product name'); return; }

        setSubmitting(true);
        try {
            if (noteType === 'SUPPLIER_CREDIT_NOTE') {
                const data: CreateSupplierCreditNoteRequest = {
                    invoiceId,
                    reason,
                    noteType: cnType,
                    lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitCost: Number(l.unitCost), taxRate: Number(l.taxRate) })),
                    notes: additionalNotes || undefined,
                };
                await creditDebitNoteService.createSupplierCreditNote(data);
                toast.success('Supplier credit note created (Draft)');
            } else {
                const data: CreateSupplierDebitNoteRequest = {
                    invoiceId,
                    reason,
                    lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitCost: Number(l.unitCost), taxRate: Number(l.taxRate) })),
                    notes: additionalNotes || undefined,
                };
                await creditDebitNoteService.createSupplierDebitNote(data);
                toast.success('Supplier debit note created (Draft)');
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
        setAdditionalNotes('');
        setLines([{ productName: '', quantity: 1, unitCost: 0, taxRate: 0 }]);
        setInvoiceSearch('');
        setInvoiceResults([]);
        setSelectedInvoice(null);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Create Supplier {noteType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} Note
                    </DialogTitle>
                    <DialogDescription>
                        {noteType === 'SUPPLIER_CREDIT_NOTE'
                            ? 'Reduce amount owed to supplier (returns, allowances)'
                            : 'Increase amount owed to supplier (additional charges)'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
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
                            placeholder="Reason for this note..."
                            rows={2}
                        />
                    </div>

                    {/* Note Type (credit only) */}
                    {noteType === 'SUPPLIER_CREDIT_NOTE' && (
                        <div>
                            <Label>Credit Note Type</Label>
                            <Select value={cnType} onValueChange={(v: string) => setCnType(v as 'FULL' | 'PARTIAL' | 'PRICE_CORRECTION')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FULL">Full Reversal</SelectItem>
                                    <SelectItem value="PARTIAL">Partial</SelectItem>
                                    <SelectItem value="PRICE_CORRECTION">Price Correction</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Line Items */}
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
                                        {idx === 0 && <Label className="text-xs">Unit Cost</Label>}
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={String(line.unitCost)}
                                            onChange={e => updateLine(idx, 'unitCost', parseFloat(e.target.value) || 0)}
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
                        {submitting ? 'Creating...' : `Create ${noteType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit' : 'Debit'} Note`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CreditDebitNotesPage;
