/**
 * Supplier Payments Page
 * 
 * Comprehensive supplier payment management - bills, payments, allocations
 * Integrates with existing supplier system
 * 
 * SINGLE SOURCE OF TRUTH: Uses useSuppliers hook (same as SuppliersPage)
 * 
 * FEATURES:
 * - Auto-allocation of payments to oldest invoices (FIFO)
 * - Payment receipt/voucher printing
 * - Partial payment support
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Decimal from 'decimal.js';
import { AxiosError } from 'axios';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle } from '../../hooks/useTransactionGuard';
import { Plus, Search, FileText, DollarSign, ArrowUpRight, Trash2, AlertCircle, Building2, Printer, CheckCircle, ChevronDown, ChevronRight, Download, Wallet, ListChecks, FileMinus, User } from 'lucide-react';
import { OpeningBalancePanel } from '../../components/accounting/OpeningBalancePanel';
import { useNavigate } from 'react-router-dom';
import { downloadFile } from '../../utils/download';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import { AdjustSupplierInvoiceModal } from '../../components/shared/AdjustSupplierInvoiceModal';
import { api } from '../../utils/api';
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
    TabsTrigger
} from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { BUSINESS_TIMEZONE } from '../../utils/businessDate';
import { toast } from 'react-hot-toast';
import { ERROR_MESSAGES } from '../../constants/errorMessages';
import { SUPPLIER_PAYMENT_METHODS as PAYMENT_METHODS } from '../../constants/paymentMethods';
import { useCanAccess } from '../../components/auth/ProtectedRoute';
// SINGLE SOURCE OF TRUTH: Use the same useSuppliers hook as SuppliersPage
import { useSuppliers } from '../../hooks/useSuppliers';
import {
    supplierPaymentService,
    supplierInvoiceService,
    supplierPaymentAllocationService
} from '../../services/comprehensive-accounting';
import { formatTimestampDate } from '../../utils/businessDate';
import { useSubmitOnEnter } from '../../hooks/useSubmitOnEnter';
import type {
    SupplierPayment,
    SupplierInvoice,
    CreateSupplierPaymentRequest,
    CreateSupplierInvoiceRequest,
    SupplierPaymentReceipt
} from '../../types/comprehensive-accounting';

/** Unified Supplier interface matching backend response */
interface Supplier {
    id: string;
    supplierNumber?: string;
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    paymentTerms?: number | string;
    creditLimit?: string | number;
    outstandingBalance?: string | number;
    taxId?: string;
    notes?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

// Helper function to safely parse numeric values that might be strings, numbers, Decimal objects, or undefined
const safeParseFloat = (value: unknown): number => {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    // Handle Decimal.js objects - they have toString()
    if (typeof value === 'object' && value !== null && 'toString' in value) {
        return parseFloat(String(value)) || 0;
    }
    return 0;
};

const SupplierPaymentsPage: React.FC = () => {
    const navigate = useNavigate();
    // Permission checks (hide actions user cannot perform)
    const canCreatePayment = useCanAccess([], ['suppliers.create']);
    const canCreateBill = useCanAccess([], ['purchasing.create']);
    const canManageOpeningBalance = useCanAccess([], ['accounting.opening_balance']);
    const [showObPanel, setShowObPanel] = useState(false);

    const [activeTab, setActiveTab] = useState('payments');
    const [payments, setPayments] = useState<SupplierPayment[]>([]);
    const [bills, setBills] = useState<SupplierInvoice[]>([]);
    const [invoiceSummary, setInvoiceSummary] = useState<{
        totalInvoices: number;
        unpaidInvoices: number;
        totalOutstanding: number;
        totalCreditBalance: number;
    }>({ totalInvoices: 0, unpaidInvoices: 0, totalOutstanding: 0, totalCreditBalance: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // SINGLE SOURCE OF TRUTH: Use the same useSuppliers hook as SuppliersPage
    const { data: suppliersData, isLoading: suppliersLoading, error: suppliersError, refetch: refetchSuppliers } = useSuppliers({ page: 1, limit: 500 });

    // Extract suppliers from response (same pattern as SuppliersPage)
    const suppliers: Supplier[] = useMemo(() => {
        if (!suppliersData) return [];
        if (suppliersData.data && Array.isArray(suppliersData.data)) return suppliersData.data;
        return Array.isArray(suppliersData) ? suppliersData : [];
    }, [suppliersData]);

    const [loading, setLoading] = useState(false);

    // Modal states
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isBillModalOpen, setIsBillModalOpen] = useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [adjustInvoice, setAdjustInvoice] = useState<{ id: string; invoiceNumber: string } | null>(null);

    // ── Transaction Guard ──────────────────────────────────────────────────
    // Lock the ERP UI whenever a financial modal is open — prevents background
    // interactions, duplicate submissions, and race conditions.
    const { openGuard, closeGuard } = useTransactionGuard();
    const paymentGuardRef = useRef<GuardHandle | null>(null);
    const billGuardRef = useRef<GuardHandle | null>(null);
    const allocationGuardRef = useRef<GuardHandle | null>(null);

    useEffect(() => {
        if (isPaymentModalOpen) {
            paymentGuardRef.current = openGuard({ cancellable: false, label: 'Record supplier payment' });
            return () => { if (paymentGuardRef.current) { closeGuard(paymentGuardRef.current.id); paymentGuardRef.current = null; } };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPaymentModalOpen]);

    useEffect(() => {
        if (isBillModalOpen) {
            billGuardRef.current = openGuard({ cancellable: true, label: 'Record supplier bill' });
            return () => { if (billGuardRef.current) { closeGuard(billGuardRef.current.id); billGuardRef.current = null; } };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBillModalOpen]);

    useEffect(() => {
        if (isAllocationModalOpen) {
            allocationGuardRef.current = openGuard({ cancellable: false, label: 'Allocate payment' });
            return () => { if (allocationGuardRef.current) { closeGuard(allocationGuardRef.current.id); allocationGuardRef.current = null; } };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAllocationModalOpen]);

    const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null);
    const [outstandingBills, setOutstandingBills] = useState<SupplierInvoice[]>([]);
    const [allocatingPayment, setAllocatingPayment] = useState(false);
    const [paymentReceipt, setPaymentReceipt] = useState<SupplierPaymentReceipt | null>(null);
    // Note: isRecordingPayment could be used to show loading state during payment creation
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);
    const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

    // Ref for printing
    const receiptRef = useRef<HTMLDivElement>(null);

    // ── Mass Payment Run state ──────────────────────────────────────────────────
    interface UnpaidInvoiceRow {
        id: string;
        invoiceNumber: string;
        supplierInvoiceNumber: string | null;
        supplierId: string;
        supplierName: string;
        invoiceDate: string;
        dueDate: string | null;
        /** Invoice face value */
        originalAmount: number;
        /** Paid via payment allocations (ledger-computed) */
        paidAmount: number;
        /** Credits from Return-to-Supplier GRNs (ledger-computed) */
        returnCredits: number;
        /** Credits from price corrections / allowances (ledger-computed) */
        creditNotes: number;
        /** True outstanding = originalAmount − paidAmount − returnCredits − creditNotes */
        outstandingBalance: number;
    }
    const [massInvoices, setMassInvoices] = useState<UnpaidInvoiceRow[]>([]);
    const [massLoading, setMassLoading] = useState(false);
    const [massAsOfDate, setMassAsOfDate] = useState('');
    const [massSupplierFilter, setMassSupplierFilter] = useState('');
    const [massSearch, setMassSearch] = useState('');
    const [massSelected, setMassSelected] = useState<Map<string, number>>(new Map()); // invoiceId → payAmount
    const [massPaymentDate, setMassPaymentDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [massPaymentMethod, setMassPaymentMethod] = useState('BANK_TRANSFER');
    const [massReference, setMassReference] = useState('');
    const [massNotes, setMassNotes] = useState('');
    const [massPosting, setMassPosting] = useState(false);

    const loadMassInvoices = useCallback(async () => {
        setMassLoading(true);
        try {
            const res = await api.supplierPayments.getUnpaidAll({
                asOfDate: massAsOfDate || undefined,
                supplierId: massSupplierFilter || undefined,
                search: massSearch || undefined,
            });
            const rows: UnpaidInvoiceRow[] = (res.data as { data?: UnpaidInvoiceRow[] })?.data ?? [];
            setMassInvoices(rows);
        } catch {
            toast.error('Failed to load unpaid invoices');
        } finally {
            setMassLoading(false);
        }
    }, [massAsOfDate, massSupplierFilter, massSearch]);

    const massRunTotal = useMemo(() => {
        let t = new Decimal(0);
        massSelected.forEach((amt) => { t = t.plus(amt); });
        return t.toNumber();
    }, [massSelected]);

    const toggleMassRow = (invoice: UnpaidInvoiceRow) => {
        setMassSelected(prev => {
            const next = new Map(prev);
            if (next.has(invoice.id)) {
                next.delete(invoice.id);
            } else {
                next.set(invoice.id, invoice.outstandingBalance);
            }
            return next;
        });
    };

    const handleMassAmountChange = (invoiceId: string, value: string) => {
        const amt = parseFloat(value) || 0;
        setMassSelected(prev => {
            const next = new Map(prev);
            if (amt > 0) next.set(invoiceId, amt);
            else next.delete(invoiceId);
            return next;
        });
    };

    const handleSelectAllMass = () => {
        if (massSelected.size === massInvoices.length) {
            setMassSelected(new Map());
        } else {
            const next = new Map<string, number>();
            massInvoices.forEach(inv => next.set(inv.id, inv.outstandingBalance));
            setMassSelected(next);
        }
    };

    const handlePostMassRun = async () => {
        if (massSelected.size === 0) { toast.error('No invoices selected'); return; }
        if (!massPaymentDate) { toast.error('Payment date is required'); return; }
        const allocations = massInvoices
            .filter(inv => massSelected.has(inv.id))
            .map(inv => ({ supplierId: inv.supplierId, invoiceId: inv.id, amount: massSelected.get(inv.id)! }));
        setMassPosting(true);
        try {
            await api.supplierPayments.massRun({
                paymentDate: massPaymentDate,
                paymentMethod: massPaymentMethod,
                reference: massReference || undefined,
                notes: massNotes || undefined,
                allocations,
            });
            toast.success(`Mass payment run posted — ${allocations.length} invoice(s) paid`);
            setMassSelected(new Map());
            await loadMassInvoices();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Mass payment run failed';
            toast.error(msg);
        } finally {
            setMassPosting(false);
        }
    };

    // Form states
    const [paymentFormData, setPaymentFormData] = useState<CreateSupplierPaymentRequest>({
        supplierId: '',
        amount: '',
        paymentMethod: 'BANK_TRANSFER',
        reference: '',
        paymentDate: new Date().toLocaleDateString('en-CA'),
        notes: ''
    });

    const [billFormData, setBillFormData] = useState<CreateSupplierInvoiceRequest>({
        supplierId: '',
        supplierInvoiceNumber: '',
        invoiceDate: new Date().toLocaleDateString('en-CA'),
        dueDate: '',
        notes: '',
        lineItems: [{
            productName: '',
            description: '',
            quantity: '1',
            unitPrice: ''
        }]
    });

    const [allocations, setAllocations] = useState<{
        billId: string;
        billNumber: string;
        totalAmount: number;
        outstandingAmount: number;
        allocationAmount: number;
    }[]>([]);

    // Payment modal supplier search and outstanding balance
    const [supplierSearchFilter, setSupplierSearchFilter] = useState('');
    const [selectedSupplierOutstanding, setSelectedSupplierOutstanding] = useState<{
        totalOutstanding: number;
        invoiceCount: number;
        invoices: SupplierInvoice[];
    } | null>(null);

    // Load payments/bills when tab changes or filters change
    useEffect(() => {
        loadTabData();
    }, [activeTab]);

    useEffect(() => {
        // Debounce search to avoid firing on every keystroke
        const timer = setTimeout(() => {
            loadTabData();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, selectedSupplierId, startDate, endDate]);

    // Log suppliers data for debugging
    useEffect(() => {
        console.log('[SupplierPayments] Suppliers from useSuppliers hook:', suppliers);
        console.log('[SupplierPayments] Loaded', suppliers.length, 'suppliers');
        if (suppliersError) {
            console.error('[SupplierPayments] Suppliers error:', suppliersError);
        }
    }, [suppliers, suppliersError]);

    // Handle URL params from GR "Create Supplier Invoice" button
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('createBill') === '1') {
            const supplierId = params.get('supplierId') || '';
            const grNumber = params.get('grNumber') || '';
            const amount = params.get('amount') || '';
            setBillFormData(prev => ({
                ...prev,
                supplierId,
                supplierInvoiceNumber: grNumber ? `INV-${grNumber}` : '',
                notes: grNumber ? `Goods received per ${grNumber}` : '',
                lineItems: [{
                    productName: grNumber ? `Goods received per ${grNumber}` : '',
                    description: grNumber,
                    quantity: '1',
                    unitPrice: amount
                }]
            }));
            setIsBillModalOpen(true);
            // Clean the URL without reloading
            const url = new URL(window.location.href);
            url.searchParams.delete('createBill');
            url.searchParams.delete('supplierId');
            url.searchParams.delete('grNumber');
            url.searchParams.delete('amount');
            window.history.replaceState({}, '', url.toString());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadTabData = async () => {
        try {
            setLoading(true);

            // Always load both payments and bills for summary cards
            await Promise.all([
                loadPayments(),
                loadBills(),
                supplierInvoiceService.getInvoiceSummary().then(setInvoiceSummary).catch(() => { /* keep defaults */ }),
            ]);
        } catch (error: unknown) {
            console.error('[SupplierPayments] Error loading tab data:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                const errMsg = error instanceof AxiosError
                    ? (error.response?.data as { error?: string })?.error
                    : error instanceof Error ? error.message : undefined;
                toast.error(errMsg || 'Failed to load data');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadPayments = async () => {
        try {
            const response = await supplierPaymentService.getSupplierPayments({
                supplierId: selectedSupplierId || undefined,
                search: searchTerm || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });

            if (response.items) {
                setPayments(response.items || []);
            }
        } catch (error) {
            console.error('Error loading supplier payments:', error);
        }
    };

    const loadBills = async () => {
        try {
            const response = await supplierInvoiceService.getSupplierInvoices({
                supplierId: selectedSupplierId || undefined,
                search: searchTerm || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });

            if (response.items) {
                setBills(response.items || []);
            }
        } catch (error) {
            console.error('Error loading supplier bills:', error);
        }
    };

    // Load outstanding balance when supplier is selected in payment modal
    const loadSupplierOutstanding = async (supplierId: string) => {
        if (!supplierId) {
            setSelectedSupplierOutstanding(null);
            return;
        }
        try {
            // First, use supplier's stored outstanding balance for immediate display
            const supplier = suppliers.find(s => s.id === supplierId);
            if (supplier && safeParseFloat(supplier.outstandingBalance) > 0) {
                // Show immediate value while loading detailed invoices
                setSelectedSupplierOutstanding({
                    totalOutstanding: safeParseFloat(supplier.outstandingBalance),
                    invoiceCount: -1, // -1 indicates loading
                    invoices: []
                });
            }

            // Then fetch actual outstanding invoices for accurate count
            const response = await supplierPaymentService.getOutstandingInvoices(supplierId);
            if (response.success && response.data) {
                const invoices = response.data;
                const totalOutstanding = invoices.reduce((sum: number, inv: SupplierInvoice) => {
                    return sum + safeParseFloat(inv.outstandingBalance);
                }, 0);
                setSelectedSupplierOutstanding({
                    totalOutstanding: totalOutstanding > 0 ? totalOutstanding : safeParseFloat(supplier?.outstandingBalance),
                    invoiceCount: invoices.length,
                    invoices: invoices
                });
            } else {
                // Use supplier's stored balance as fallback
                setSelectedSupplierOutstanding({
                    totalOutstanding: safeParseFloat(supplier?.outstandingBalance) || 0,
                    invoiceCount: 0,
                    invoices: []
                });
            }
        } catch (error) {
            console.error('Error loading supplier outstanding:', error);
            // Use supplier's stored balance as fallback on error
            const supplier = suppliers.find(s => s.id === supplierId);
            setSelectedSupplierOutstanding({
                totalOutstanding: safeParseFloat(supplier?.outstandingBalance) || 0,
                invoiceCount: 0,
                invoices: []
            });
        }
    };

    // Handle supplier selection in payment modal
    const handlePaymentSupplierChange = (supplierId: string) => {
        setPaymentFormData(prev => ({ ...prev, supplierId }));
        loadSupplierOutstanding(supplierId);
    };

    // Filtered suppliers for payment modal dropdown - include outstanding balance
    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(supplierSearchFilter.toLowerCase()) ||
        (s.supplierNumber && s.supplierNumber.toLowerCase().includes(supplierSearchFilter.toLowerCase()))
    );

    // Calculate totals for summary cards
    // Invoice subledger total (SSOT) — do not sum paginated supplier rows
    const totalOutstandingAllSuppliers = invoiceSummary.totalOutstanding > 0
        ? invoiceSummary.totalOutstanding
        : suppliers.reduce((sum, s) => sum + safeParseFloat(s.outstandingBalance), 0);
    const suppliersWithBalance = suppliers.filter(s => safeParseFloat(s.outstandingBalance) > 0).length;
    const totalAllocatedAmount = payments.reduce((sum, p) => new Decimal(sum).plus(safeParseFloat(p.allocatedAmount)).toNumber(), 0);
    const totalUnallocatedCredit = payments.reduce((sum, p) => new Decimal(sum).plus(safeParseFloat(p.unallocatedAmount)).toNumber(), 0);
    const totalBillsAmount = bills.reduce((sum, b) => new Decimal(sum).plus(safeParseFloat(b.totalAmount)).toNumber(), 0);

    const handleCreatePayment = async () => {
        try {
            if (!paymentFormData.supplierId || !paymentFormData.amount || parseFloat(paymentFormData.amount.toString()) <= 0) {
                toast.error(ERROR_MESSAGES.REQUIRED_FIELDS_MISSING);
                return;
            }

            setIsRecordingPayment(true);

            const response = await supplierPaymentService.createSupplierPayment({
                ...paymentFormData,
                amount: parseFloat(paymentFormData.amount.toString())
            });

            if (response.success && response.data) {
                // Store receipt data for printing (service now returns SupplierPaymentReceipt)
                setPaymentReceipt(response.data);

                toast.success(`Payment ${response.data.payment?.paymentNumber || ''} recorded successfully! ${response.data.summary?.totalInvoicesAffected || 0} invoice(s) affected.`);

                setIsPaymentModalOpen(false);
                resetPaymentForm();
                loadPayments();
                loadBills(); // Refresh bills to show updated statuses
                // Refetch suppliers to update outstanding balances (single source of truth)
                refetchSuppliers();

                // Show receipt modal for printing
                setIsReceiptModalOpen(true);
            }
        } catch (error: unknown) {
            console.error('Error creating payment:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                const errMsg = error instanceof AxiosError
                    ? (error.response?.data as { error?: string })?.error
                    : error instanceof Error ? error.message : undefined;
                toast.error(errMsg || 'Failed to record payment');
            }
        } finally {
            setIsRecordingPayment(false);
        }
    };

    // Print payment receipt/voucher
    const handlePrintReceipt = () => {
        if (!receiptRef.current) return;

        const printContent = receiptRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Please allow pop-ups to print the receipt');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Voucher - ${paymentReceipt?.payment.paymentNumber || 'Receipt'}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Arial, sans-serif; 
                        padding: 20px;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    .header { 
                        text-align: center; 
                        border-bottom: 2px solid #333; 
                        padding-bottom: 15px; 
                        margin-bottom: 20px; 
                    }
                    .header h1 { font-size: 24px; color: #1a1a1a; }
                    .header h2 { font-size: 18px; color: #333; margin-top: 5px; }
                    .header p { color: #666; font-size: 12px; margin-top: 5px; }
                    .section { margin-bottom: 20px; }
                    .section-title { 
                        font-weight: bold; 
                        font-size: 14px; 
                        color: #333;
                        border-bottom: 1px solid #ddd;
                        padding-bottom: 5px;
                        margin-bottom: 10px;
                    }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .info-item { font-size: 13px; }
                    .info-item label { color: #666; display: block; }
                    .info-item span { color: #1a1a1a; font-weight: 500; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { 
                        border: 1px solid #ddd; 
                        padding: 8px; 
                        text-align: left; 
                        font-size: 12px; 
                    }
                    th { background-color: #f5f5f5; font-weight: 600; }
                    .amount { text-align: right; font-family: monospace; }
                    .status-paid { color: #16a34a; font-weight: bold; }
                    .status-partial { color: #d97706; font-weight: bold; }
                    .summary-box {
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 20px;
                    }
                    .summary-row { 
                        display: flex; 
                        justify-content: space-between; 
                        padding: 5px 0;
                        font-size: 13px;
                    }
                    .summary-row.total { 
                        font-weight: bold; 
                        font-size: 16px; 
                        border-top: 2px solid #333;
                        padding-top: 10px;
                        margin-top: 10px;
                    }
                    .footer { 
                        margin-top: 40px; 
                        padding-top: 20px;
                        border-top: 1px dashed #ccc;
                        font-size: 11px;
                        color: #666;
                        text-align: center;
                    }
                    .signature-line {
                        margin-top: 50px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .signature-box {
                        width: 200px;
                        text-align: center;
                    }
                    .signature-box .line {
                        border-top: 1px solid #333;
                        margin-top: 40px;
                        padding-top: 5px;
                        font-size: 12px;
                    }
                    @media print {
                        body { padding: 0; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                ${printContent}
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Toggle invoice expansion to show line items
    const toggleInvoiceExpansion = (invoiceId: string) => {
        setExpandedInvoices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(invoiceId)) {
                newSet.delete(invoiceId);
            } else {
                newSet.add(invoiceId);
            }
            return newSet;
        });
    };

    // Export payment voucher as PDF (centralized via DocumentRenderer)
    // Export Payment Voucher — direct authenticated download (same pattern as Customer statement)
    const handleExportPDF = (): void => {
        if (!paymentReceipt) return;
        const paymentNumber = paymentReceipt.payment.paymentNumber || paymentReceipt.payment.id;
        downloadFile(`/documents/PAYMENT_VOUCHER/${paymentReceipt.payment.id}`, `payment-voucher-${paymentNumber}.pdf`).catch((err: Error) => {
            alert(`PDF export failed: ${err.message}`);
        });
    };

    const handleCreateBill = async () => {
        try {
            if (!billFormData.supplierId || !billFormData.supplierInvoiceNumber || billFormData.lineItems.length === 0) {
                toast.error(ERROR_MESSAGES.REQUIRED_FIELDS_MISSING);
                return;
            }

            const validLineItems = billFormData.lineItems.filter(item =>
                item.productName && item.quantity && item.unitPrice
            );

            if (validLineItems.length === 0) {
                toast.error('Please add at least one line item');
                return;
            }

            const response = await supplierInvoiceService.createSupplierInvoice({
                ...billFormData,
                lineItems: validLineItems.map(item => ({
                    ...item,
                    quantity: parseFloat(item.quantity.toString()),
                    unitPrice: parseFloat(item.unitPrice.toString())
                }))
            });

            if (response.success) {
                toast.success('Supplier bill recorded successfully');
                setIsBillModalOpen(false);
                resetBillForm();
                loadBills();
                // Refetch suppliers to update outstanding balances (single source of truth)
                refetchSuppliers();
            }
        } catch (error: unknown) {
            console.error('Error creating bill:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                const errMsg = error instanceof AxiosError
                    ? (error.response?.data as { error?: string })?.error
                    : error instanceof Error ? error.message : undefined;
                toast.error(errMsg || 'Failed to record bill');
            }
        }
    };

    const openAllocationModal = async (payment: SupplierPayment) => {
        try {
            setSelectedPayment(payment);
            setAllocations([]);

            // Load outstanding bills for this supplier
            const response = await supplierPaymentService.getOutstandingInvoices(payment.supplierId);
            if (response.success && response.data) {
                setOutstandingBills(response.data);

                // Initialize allocations
                const initialAllocations = response.data.map(bill => ({
                    billId: bill.id,
                    billNumber: bill.invoiceNumber,
                    totalAmount: safeParseFloat(bill.totalAmount),
                    outstandingAmount: safeParseFloat(bill.outstandingBalance),
                    allocationAmount: 0
                }));

                setAllocations(initialAllocations);
            }

            setIsAllocationModalOpen(true);
        } catch (error) {
            console.error('Error loading outstanding bills:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                toast.error('Failed to load outstanding bills');
            }
        }
    };

    const handleAutoAllocate = async () => {
        if (!selectedPayment) return;

        try {
            setAllocatingPayment(true);
            const response = await supplierPaymentService.autoAllocatePayment(selectedPayment.id);

            if (response.success) {
                toast.success('Payment allocated automatically');
                setIsAllocationModalOpen(false);
                loadPayments();
                // Refetch suppliers to update outstanding balances (single source of truth)
                refetchSuppliers();
            }
        } catch (error: unknown) {
            console.error('Error auto-allocating payment:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                const errMsg = error instanceof AxiosError
                    ? (error.response?.data as { error?: string })?.error
                    : error instanceof Error ? error.message : undefined;
                toast.error(errMsg || 'Failed to allocate payment');
            }
        } finally {
            setAllocatingPayment(false);
        }
    };

    const handleManualAllocate = async () => {
        if (!selectedPayment) return;

        try {
            setAllocatingPayment(true);

            const totalAllocation = allocations.reduce((sum, alloc) => new Decimal(sum).plus(alloc.allocationAmount).toNumber(), 0);
            const unallocatedAmount = safeParseFloat(selectedPayment.unallocatedAmount);

            if (totalAllocation > unallocatedAmount) {
                toast.error('Total allocation cannot exceed unallocated amount');
                return;
            }

            // Create allocations for bills with amount > 0
            const allocationsToCreate = allocations.filter(alloc => alloc.allocationAmount > 0);

            for (const allocation of allocationsToCreate) {
                await supplierPaymentAllocationService.allocatePayment({
                    supplierPaymentId: selectedPayment.id,
                    supplierInvoiceId: allocation.billId,
                    amount: allocation.allocationAmount
                });
            }

            toast.success('Payment allocated successfully');
            setIsAllocationModalOpen(false);
            loadPayments();
            // Refetch suppliers to update outstanding balances (single source of truth)
            refetchSuppliers();
        } catch (error: unknown) {
            console.error('Error allocating payment:', error);
            if (!(error instanceof AxiosError && error.response?.status === 403)) {
                const errMsg = error instanceof AxiosError
                    ? (error.response?.data as { error?: string })?.error
                    : error instanceof Error ? error.message : undefined;
                toast.error(errMsg || 'Failed to allocate payment');
            }
        } finally {
            setAllocatingPayment(false);
        }
    };
    const updateAllocation = (billId: string, amount: number) => {
        setAllocations(prev => prev.map(alloc =>
            alloc.billId === billId
                ? { ...alloc, allocationAmount: Math.max(0, Math.min(amount, alloc.outstandingAmount)) }
                : alloc
        ));
    };

    const addLineItem = () => {
        setBillFormData(prev => ({
            ...prev,
            lineItems: [...prev.lineItems, {
                productName: '',
                description: '',
                quantity: '1',
                unitPrice: ''
            }]
        }));
    };

    const updateLineItem = (index: number, field: string, value: string) => {
        setBillFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const removeLineItem = (index: number) => {
        setBillFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.filter((_, i) => i !== index)
        }));
    };

    const resetPaymentForm = () => {
        setPaymentFormData({
            supplierId: '',
            amount: '',
            paymentMethod: 'BANK_TRANSFER',
            reference: '',
            paymentDate: new Date().toLocaleDateString('en-CA'),
            notes: ''
        });
        setSupplierSearchFilter('');
        setSelectedSupplierOutstanding(null);
    };

    const resetBillForm = () => {
        setBillFormData({
            supplierId: '',
            supplierInvoiceNumber: '',
            invoiceDate: new Date().toLocaleDateString('en-CA'),
            dueDate: '',
            notes: '',
            lineItems: [{
                productName: '',
                description: '',
                quantity: '1',
                unitPrice: ''
            }]
        });
    };

    const getStatusBadgeColor = (status: string) => {
        switch (status) {
            case 'PAID': return 'bg-green-100 text-green-800';
            case 'PARTIALLY_PAID': return 'bg-yellow-100 text-yellow-800';
            case 'APPROVED': return 'bg-blue-100 text-blue-800';
            case 'PENDING': return 'bg-gray-100 text-gray-800';
            case 'CANCELLED': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Combined loading state
    const isPageLoading = suppliersLoading || loading;

    useSubmitOnEnter(isPaymentModalOpen, true, handleCreatePayment);
    useSubmitOnEnter(isBillModalOpen, true, handleCreateBill);
    useSubmitOnEnter(isAllocationModalOpen, !allocatingPayment, handleManualAllocate);

    if (isPageLoading && suppliers.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Loading supplier data...</div>
            </div>
        );
    }

    // Show error state if suppliers failed to load
    if (suppliersError) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <div className="text-lg text-red-600">Failed to load suppliers</div>
                <Button onClick={() => { refetchSuppliers(); }}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Supplier Management</h1>
                    <p className="text-gray-600">Manage supplier bills, payments and allocations</p>
                </div>

                <div className="flex gap-2">
                    {canCreateBill && (
                        <Button variant="outline" className="flex items-center gap-2" onClick={() => setIsBillModalOpen(true)}>
                            <FileText className="h-4 w-4" />
                            Record Bill
                        </Button>
                    )}

                    {canCreatePayment && (
                        <Button
                            className="flex items-center gap-2"
                            onClick={() => {
                                setShowObPanel(false);
                                setIsPaymentModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            Make Payment
                        </Button>
                    )}
                    {canManageOpeningBalance && (
                        <Button
                            variant="outline"
                            className="flex items-center gap-2"
                            onClick={() => {
                                setShowObPanel(true);
                                setIsPaymentModalOpen(true);
                                if (selectedSupplierId) {
                                    setPaymentFormData((p) => ({
                                        ...p,
                                        supplierId: selectedSupplierId,
                                    }));
                                }
                            }}
                        >
                            <Wallet className="h-4 w-4" />
                            Opening Balance
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Outstanding</p>
                                <p className="text-xl font-bold text-red-600">
                                    {formatCurrency(totalOutstandingAllSuppliers)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Bills</p>
                                <p className="text-xl font-bold text-blue-600">
                                    {formatCurrency(totalBillsAmount)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <DollarSign className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Paid</p>
                                <p className="text-xl font-bold text-green-600">
                                    {formatCurrency(totalAllocatedAmount)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Wallet className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Credit Balance</p>
                                <p className="text-xl font-bold text-purple-600">
                                    {formatCurrency(invoiceSummary.totalCreditBalance + totalUnallocatedCredit)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <Building2 className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Suppliers with Balance</p>
                                <p className="text-xl font-bold text-amber-600">
                                    {suppliersWithBalance} / {suppliers.length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div className="w-full sm:w-64">
                        <Select value={selectedSupplierId || "all"} onValueChange={(value) => setSelectedSupplierId(value === "all" ? "" : value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="All suppliers" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All suppliers</SelectItem>
                                {suppliers.map(supplier => {
                                    const balance = safeParseFloat(supplier.outstandingBalance);
                                    return (
                                        <SelectItem key={supplier.id} value={supplier.id}>
                                            {supplier.name}{balance > 0 ? ` (${formatCurrency(balance)} due)` : ''}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end gap-4">
                    <div className="w-full sm:w-48">
                        <Label className="text-xs text-gray-500 mb-1 block">From</Label>
                        <DatePicker
                            value={startDate}
                            onChange={(val) => setStartDate(val)}
                            placeholder="Start date"
                            maxDate={endDate ? new Date(endDate + 'T00:00:00') : undefined}
                        />
                    </div>
                    <div className="w-full sm:w-48">
                        <Label className="text-xs text-gray-500 mb-1 block">To</Label>
                        <DatePicker
                            value={endDate}
                            onChange={(val) => setEndDate(val)}
                            placeholder="End date"
                            minDate={startDate ? new Date(startDate + 'T00:00:00') : undefined}
                        />
                    </div>
                    {(startDate || endDate) && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setStartDate(''); setEndDate(''); }}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            Clear dates
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="bills">Bills</TabsTrigger>
                    <TabsTrigger value="mass-payment">Mass Payment Run</TabsTrigger>
                    <TabsTrigger value="credit-notes" onClick={() => navigate('/accounting/credit-debit-notes?tab=supplier')}>
                        <FileMinus className="h-3.5 w-3.5 mr-1.5" />
                        Credit Notes
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="payments" className="space-y-4">
                    {/* Payments List */}
                    <div className="grid gap-4">
                        {payments.length === 0 ? (
                            <Card>
                                <CardContent className="text-center py-8">
                                    <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No payments found</h3>
                                    <p className="text-gray-600">No supplier payments match your criteria.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            payments.map((payment) => (
                                <Card key={payment.id}>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-lg font-semibold">{payment.paymentNumber || 'N/A'}</h3>
                                                    <Badge variant="outline" className="text-xs">
                                                        {payment.paymentMethod || 'N/A'}
                                                    </Badge>
                                                    {safeParseFloat(payment.unallocatedAmount) > 0 && (
                                                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                                                            Unallocated: {formatCurrency(safeParseFloat(payment.unallocatedAmount))}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm text-gray-600">
                                                    <div>
                                                        <span className="font-medium">Supplier:</span>
                                                        <div>{payment.supplierName || 'Unknown'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Amount:</span>
                                                        <div className="text-lg font-semibold text-green-600">
                                                            {formatCurrency(safeParseFloat(payment.amount))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Date:</span>
                                                        <div>{payment.paymentDate ? formatTimestampDate(payment.paymentDate) : 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Reference:</span>
                                                        <div>{payment.reference || 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium flex items-center gap-1">
                                                            <User className="h-3 w-3" />
                                                            Paid by
                                                        </span>
                                                        <div>{payment.createdByName || '—'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 ml-4">
                                                {safeParseFloat(payment.unallocatedAmount) > 0 ? (
                                                    canCreatePayment ? (
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            onClick={() => openAllocationModal(payment)}
                                                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                                        >
                                                            <ArrowUpRight className="h-4 w-4" />
                                                            Allocate
                                                        </Button>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                                            Unallocated
                                                        </Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                                        Fully Allocated
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="bills" className="space-y-4">
                    {/* Bills List */}
                    <div className="grid gap-4">
                        {bills.length === 0 ? (
                            <Card>
                                <CardContent className="text-center py-8">
                                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No bills found</h3>
                                    <p className="text-gray-600">No supplier bills match your criteria.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            bills.map((bill) => (
                                <Card key={bill.id}>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-lg font-semibold">{bill.invoiceNumber || 'N/A'}</h3>
                                                    {(bill.documentType === 'OPENING_BALANCE' ||
                                                        (bill.invoiceNumber || '').startsWith('OB-')) && (
                                                        <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200">
                                                            Opening Balance
                                                        </Badge>
                                                    )}
                                                    <Badge className={`text-xs ${getStatusBadgeColor(bill.status || '')}`}>
                                                        {(bill.status || 'UNKNOWN').replace('_', ' ')}
                                                    </Badge>
                                                    {safeParseFloat(bill.outstandingBalance) > 0 && (
                                                        <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
                                                            Outstanding: {formatCurrency(safeParseFloat(bill.outstandingBalance))}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                                                    <div>
                                                        <span className="font-medium">Supplier:</span>
                                                        <div>{bill.supplierName || 'Unknown'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Amount:</span>
                                                        <div className="text-lg font-semibold text-red-600">
                                                            {formatCurrency(safeParseFloat(bill.totalAmount))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Date:</span>
                                                        <div>{bill.invoiceDate ? formatTimestampDate(bill.invoiceDate) : 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Due Date:</span>
                                                        <div>{bill.dueDate ? formatTimestampDate(bill.dueDate) : 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Pay Now / Adjust buttons — never shown for cancelled invoices */}
                                            <div className="flex items-center gap-2 ml-4">
                                                {['Cancelled', 'CANCELLED'].includes(bill.status || '') ? null : (
                                                    safeParseFloat(bill.outstandingBalance) > 0 ? (
                                                        canCreatePayment ? (
                                                            <Button
                                                                variant="default"
                                                                size="sm"
                                                                onClick={() => {
                                                                    // Pre-fill payment form with this bill's supplier and outstanding amount
                                                                    setPaymentFormData(prev => ({
                                                                        ...prev,
                                                                        supplierId: bill.supplierId,
                                                                        amount: safeParseFloat(bill.outstandingBalance).toString(),
                                                                        notes: `Payment for ${bill.invoiceNumber}`
                                                                    }));
                                                                    loadSupplierOutstanding(bill.supplierId);
                                                                    setIsPaymentModalOpen(true);
                                                                }}
                                                                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white"
                                                            >
                                                                <DollarSign className="h-4 w-4" />
                                                                Pay Now
                                                            </Button>
                                                        ) : (
                                                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                                                Outstanding
                                                            </Badge>
                                                        )
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                                            Paid
                                                        </Badge>
                                                    )
                                                )}
                                                {/* Adjust button — never shown for cancelled invoices */}
                                                {canCreatePayment &&
                                                    safeParseFloat(bill.outstandingBalance) > 0 &&
                                                    !['Cancelled', 'CANCELLED'].includes(bill.status || '') &&
                                                    bill.documentType !== 'OPENING_BALANCE' &&
                                                    !(bill.invoiceNumber || '').startsWith('OB-') && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setAdjustInvoice({ id: bill.id, invoiceNumber: bill.invoiceNumber ?? '' })}
                                                    >
                                                        Adjust
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* ── Mass Payment Run Tab ─────────────────────────────────────── */}
                <TabsContent value="mass-payment" className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                        <ListChecks className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-medium text-blue-800">Mass Payment Run</p>
                            <p className="text-sm text-blue-700 mt-1">Select invoices across one or more suppliers, set a payment amount per invoice, then post a single payment run. One payment per supplier will be created and posted to the ledger.</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">As-Of Date</Label>
                                    <DatePicker value={massAsOfDate} onChange={setMassAsOfDate} placeholder="Show all unpaid" />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">Supplier</Label>
                                    <Select value={massSupplierFilter} onValueChange={setMassSupplierFilter}>
                                        <SelectTrigger><SelectValue placeholder="All suppliers" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">All suppliers</SelectItem>
                                            {suppliers.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">Search Invoice</Label>
                                    <Input value={massSearch} onChange={e => setMassSearch(e.target.value)} placeholder="Invoice number..." />
                                </div>
                                <Button onClick={() => void loadMassInvoices()} disabled={massLoading}>
                                    {massLoading ? 'Loading…' : 'Load Invoices'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Invoice Grid */}
                    {massInvoices.length > 0 && (
                        <Card>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b">
                                            <tr>
                                                <th className="p-3 w-10">
                                                    <input type="checkbox"
                                                        checked={massSelected.size === massInvoices.length && massInvoices.length > 0}
                                                        onChange={handleSelectAllMass}
                                                        className="rounded"
                                                    />
                                                </th>
                                                <th className="p-3 text-left font-medium text-gray-700">Supplier</th>
                                                <th className="p-3 text-left font-medium text-gray-700">Invoice #</th>
                                                <th className="p-3 text-left font-medium text-gray-700">Invoice Date</th>
                                                <th className="p-3 text-left font-medium text-gray-700">Due Date</th>
                                                <th className="p-3 text-right font-medium text-gray-700">Original</th>
                                                <th className="p-3 text-right font-medium text-gray-700 text-orange-700">−&nbsp;Paid</th>
                                                <th className="p-3 text-right font-medium text-gray-700 text-purple-700">−&nbsp;Returns</th>
                                                <th className="p-3 text-right font-medium text-gray-700 text-purple-700">−&nbsp;Credits</th>
                                                <th className="p-3 text-right font-medium text-gray-900">Outstanding</th>
                                                <th className="p-3 text-right font-medium text-gray-700 w-36">Pay Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {massInvoices.map(inv => {
                                                const isSelected = massSelected.has(inv.id);
                                                const isDue = inv.dueDate && inv.dueDate.slice(0, 10) < new Date().toLocaleDateString('en-CA');
                                                return (
                                                    <tr key={inv.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                                                        <td className="p-3">
                                                            <input type="checkbox" checked={isSelected} onChange={() => toggleMassRow(inv)} className="rounded" />
                                                        </td>
                                                        <td className="p-3 font-medium">{inv.supplierName}</td>
                                                        <td className="p-3 text-blue-700 font-mono text-xs">{inv.invoiceNumber}{inv.supplierInvoiceNumber ? <span className="text-gray-400 ml-1">({inv.supplierInvoiceNumber})</span> : null}</td>
                                                        <td className="p-3 text-gray-600">{inv.invoiceDate ? formatTimestampDate(inv.invoiceDate) : '—'}</td>
                                                        <td className="p-3">
                                                            <span className={isDue ? 'text-red-600 font-medium' : 'text-gray-600'}>{inv.dueDate ? formatTimestampDate(inv.dueDate) : '—'}</span>
                                                        </td>
                                                        <td className="p-3 text-right text-gray-600">{formatCurrency(inv.originalAmount)}</td>
                                                        <td className="p-3 text-right text-orange-700 text-sm">
                                                            {inv.paidAmount > 0 ? `(${formatCurrency(inv.paidAmount)})` : '—'}
                                                        </td>
                                                        <td className="p-3 text-right text-purple-700 text-sm">
                                                            {inv.returnCredits > 0 ? `(${formatCurrency(inv.returnCredits)})` : '—'}
                                                        </td>
                                                        <td className="p-3 text-right text-purple-700 text-sm">
                                                            {inv.creditNotes > 0 ? `(${formatCurrency(inv.creditNotes)})` : '—'}
                                                        </td>
                                                        <td className="p-3 text-right font-semibold">{formatCurrency(inv.outstandingBalance)}</td>
                                                        <td className="p-3 text-right">
                                                            {isSelected ? (
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max={inv.outstandingBalance.toString()}
                                                                    step="1"
                                                                    value={massSelected.get(inv.id)?.toString() ?? ''}
                                                                    onChange={e => handleMassAmountChange(inv.id, e.target.value)}
                                                                    className="text-right h-7 text-sm w-32 ml-auto"
                                                                />
                                                            ) : (
                                                                <span className="text-gray-400">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-gray-50 border-t font-semibold">
                                            <tr>
                                                <td colSpan={10} className="p-3 text-right text-gray-700">
                                                    {massSelected.size} invoice(s) selected — Total to Pay:
                                                </td>
                                                <td className="p-3 text-right text-blue-700">{formatCurrency(massRunTotal)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {massInvoices.length === 0 && !massLoading && (
                        <Card>
                            <CardContent className="text-center py-8">
                                <ListChecks className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Click "Load Invoices" to fetch unpaid supplier invoices.</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Payment Details Panel — shown inline when rows selected */}
                    {massSelected.size > 0 && (
                        <Card className="border-blue-200 bg-blue-50">
                            <CardContent className="pt-4">
                                <h3 className="font-semibold text-blue-800 mb-3">Payment Details</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Payment Date *</Label>
                                        <DatePicker value={massPaymentDate} onChange={setMassPaymentDate} placeholder="Select date" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Payment Method</Label>
                                        <Select value={massPaymentMethod} onValueChange={setMassPaymentMethod}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {PAYMENT_METHODS.map(m => (
                                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Reference</Label>
                                        <Input value={massReference} onChange={e => setMassReference(e.target.value)} placeholder="Cheque #, transfer ref…" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-600 mb-1 block">Notes</Label>
                                        <Input value={massNotes} onChange={e => setMassNotes(e.target.value)} placeholder="Optional notes" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-4">
                                    <p className="text-sm font-medium text-blue-800">
                                        Posting {massSelected.size} invoice payment(s) — Total: {formatCurrency(massRunTotal)}
                                    </p>
                                    <Button
                                        onClick={() => void handlePostMassRun()}
                                        disabled={massPosting}
                                        className="bg-blue-700 hover:bg-blue-800 text-white"
                                    >
                                        {massPosting ? 'Posting…' : 'Post Payment Run'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                </TabsContent>

            </Tabs>

            {/* Payment Modal — guarded: cancellable=false, ERP locked during payment */}
            <Dialog open={isPaymentModalOpen} onOpenChange={(open) => {
                setIsPaymentModalOpen(open);
                if (!open) {
                    resetPaymentForm();
                    setShowObPanel(false);
                }
            }} zIndex={paymentGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {showObPanel ? 'Opening balance (cutover)' : 'Record supplier payment'}
                        </DialogTitle>
                        <DialogDescription>
                            {showObPanel
                                ? 'Post or correct legacy AP brought forward. All changes are audited with your user and reason.'
                                : 'Posts payment to GL and allocates to open supplier bills (FIFO).'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        {showObPanel && canManageOpeningBalance ? (
                            <>
                                <OpeningBalancePanel
                                    partyType="supplier"
                                    partyId={paymentFormData.supplierId}
                                    onPartyIdChange={(v) => setPaymentFormData((p) => ({ ...p, supplierId: v }))}
                                    parties={suppliers.map((s) => ({
                                        id: s.id,
                                        name: s.name || s.supplierNumber || 'Supplier',
                                    }))}
                                    defaultExpanded
                                    onSuccess={() => void loadPayments()}
                                />
                                {canCreatePayment && (
                                    <Button
                                        type="button"
                                        variant="link"
                                        className="text-sm p-0 h-auto justify-start"
                                        onClick={() => setShowObPanel(false)}
                                    >
                                        ← Make a supplier payment instead
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="supplier-payment-search">Supplier</Label>
                                    <Input
                                        id="supplier-payment-search"
                                        placeholder="Type to search suppliers..."
                                        value={supplierSearchFilter}
                                        onChange={(e) => setSupplierSearchFilter(e.target.value)}
                                    />
                                    <Select
                                        value={paymentFormData.supplierId}
                                        onValueChange={handlePaymentSupplierChange}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select supplier" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filteredSuppliers.length === 0 ? (
                                                <div className="px-2 py-3 text-sm text-gray-500 text-center">
                                                    No suppliers found
                                                </div>
                                            ) : (
                                                filteredSuppliers.map((supplier) => (
                                                    <SelectItem key={supplier.id} value={supplier.id}>
                                                        <div className="flex items-center justify-between w-full gap-2">
                                                            <span>{supplier.name}</span>
                                                            {safeParseFloat(supplier.outstandingBalance) > 0 && (
                                                                <span className="text-xs text-amber-600 font-medium">
                                                                    {formatCurrency(safeParseFloat(supplier.outstandingBalance))}{' '}
                                                                    due
                                                                </span>
                                                            )}
                                                        </div>
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedSupplierOutstanding && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm text-amber-900">
                                                <span className="font-medium">Outstanding:</span>{' '}
                                                <span className="text-lg font-bold">
                                                    {formatCurrency(selectedSupplierOutstanding.totalOutstanding)}
                                                </span>
                                            </div>
                                            <Badge variant="outline" className="bg-amber-100 text-amber-800">
                                                {selectedSupplierOutstanding.invoiceCount === -1
                                                    ? 'Loading…'
                                                    : `${selectedSupplierOutstanding.invoiceCount} bill${selectedSupplierOutstanding.invoiceCount !== 1 ? 's' : ''}`}
                                            </Badge>
                                        </div>
                                        {selectedSupplierOutstanding.totalOutstanding > 0 && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 border-amber-300 text-amber-800 hover:bg-amber-100"
                                                onClick={() =>
                                                    setPaymentFormData((prev) => ({
                                                        ...prev,
                                                        amount: selectedSupplierOutstanding.totalOutstanding,
                                                    }))
                                                }
                                            >
                                                Use full balance
                                            </Button>
                                        )}
                                        {selectedSupplierOutstanding.invoices &&
                                            selectedSupplierOutstanding.invoices.length > 0 && (
                                                <div className="border-t border-amber-200 pt-2 space-y-1 max-h-28 overflow-y-auto">
                                                    {selectedSupplierOutstanding.invoices.map((inv) => (
                                                        <button
                                                            key={inv.id}
                                                            type="button"
                                                            className="w-full flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-amber-100 hover:bg-amber-50 text-left"
                                                            onClick={() =>
                                                                setPaymentFormData((prev) => ({
                                                                    ...prev,
                                                                    amount: safeParseFloat(inv.outstandingBalance),
                                                                    notes: `Payment for ${inv.invoiceNumber || inv.supplierInvoiceNumber}`,
                                                                }))
                                                            }
                                                        >
                                                            <span className="font-medium text-gray-900 truncate pr-2">
                                                                {inv.invoiceNumber || inv.supplierInvoiceNumber}
                                                            </span>
                                                            <span className="font-semibold text-amber-800 shrink-0">
                                                                {formatCurrency(safeParseFloat(inv.outstandingBalance))}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="payment-amount">Amount</Label>
                                        <Input
                                            id="payment-amount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={paymentFormData.amount.toString()}
                                            onChange={(e) =>
                                                setPaymentFormData((prev) => ({
                                                    ...prev,
                                                    amount: parseFloat(e.target.value) || 0,
                                                }))
                                            }
                                            placeholder="0.00"
                                        />
                                        {selectedSupplierOutstanding &&
                                            selectedSupplierOutstanding.totalOutstanding > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {[0.25, 0.5, 0.75, 1].map((pct) => (
                                                        <button
                                                            key={pct}
                                                            type="button"
                                                            className={`text-xs px-2 py-0.5 rounded ${
                                                                pct === 1
                                                                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                            }`}
                                                            onClick={() =>
                                                                setPaymentFormData((prev) => ({
                                                                    ...prev,
                                                                    amount: Math.round(
                                                                        selectedSupplierOutstanding.totalOutstanding *
                                                                            pct,
                                                                    ),
                                                                }))
                                                            }
                                                        >
                                                            {pct === 1 ? '100%' : `${pct * 100}%`}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="payment-method">Payment method</Label>
                                        <Select
                                            value={paymentFormData.paymentMethod}
                                            onValueChange={(value: string) =>
                                                setPaymentFormData((prev) => ({
                                                    ...prev,
                                                    paymentMethod: value as CreateSupplierPaymentRequest['paymentMethod'],
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="payment-method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PAYMENT_METHODS.map((method) => (
                                                    <SelectItem key={method.value} value={method.value}>
                                                        {method.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="payment-date">Payment date</Label>
                                    <DatePicker
                                        value={paymentFormData.paymentDate}
                                        onChange={(date) =>
                                            setPaymentFormData((prev) => ({ ...prev, paymentDate: date }))
                                        }
                                        placeholder="Select payment date"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="payment-reference">Reference</Label>
                                    <Input
                                        id="payment-reference"
                                        value={paymentFormData.reference || ''}
                                        onChange={(e) =>
                                            setPaymentFormData((prev) => ({ ...prev, reference: e.target.value }))
                                        }
                                        placeholder="Cheque #, transfer ref, etc."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="payment-notes">Notes</Label>
                                    <Textarea
                                        id="payment-notes"
                                        value={paymentFormData.notes || ''}
                                        onChange={(e) =>
                                            setPaymentFormData((prev) => ({ ...prev, notes: e.target.value }))
                                        }
                                        placeholder="Optional"
                                        rows={2}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {showObPanel ? (
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    ) : (
                        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:items-center">
                            <div className="w-full sm:w-auto">
                                {canManageOpeningBalance && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full sm:w-auto text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50"
                                        onClick={() => setShowObPanel(true)}
                                    >
                                        <Wallet className="h-4 w-4 mr-2" />
                                        Opening balance instead
                                    </Button>
                                )}
                            </div>
                            <div className="flex w-full sm:w-auto gap-2 justify-end">
                                <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreatePayment} disabled={isRecordingPayment}>
                                    {isRecordingPayment ? 'Posting…' : 'Record payment'}
                                </Button>
                            </div>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {/* Bill Modal — guarded: cancellable=true, ERP locked during bill entry */}
            <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen} zIndex={billGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Record Supplier Bill</DialogTitle>
                        <DialogDescription>
                            Record a bill received from a supplier
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                            <Label htmlFor="supplier" className="text-right">Supplier</Label>
                            <div className="col-span-3">
                                <Select
                                    value={billFormData.supplierId}
                                    onValueChange={(value) => setBillFormData(prev => ({ ...prev, supplierId: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select supplier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map(supplier => (
                                            <SelectItem key={supplier.id} value={supplier.id}>
                                                {supplier.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                            <Label htmlFor="billNumber" className="text-right">Bill Number</Label>
                            <Input
                                id="billNumber"
                                value={billFormData.supplierInvoiceNumber}
                                onChange={(e) => setBillFormData(prev => ({ ...prev, supplierInvoiceNumber: e.target.value }))}
                                className="col-span-3"
                                placeholder="Supplier's invoice number"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                            <Label htmlFor="billDate" className="text-right">Bill Date</Label>
                            <div className="col-span-3">
                                <DatePicker
                                    value={billFormData.invoiceDate}
                                    onChange={(date) => setBillFormData(prev => ({ ...prev, invoiceDate: date }))}
                                    placeholder="Select bill date"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                            <Label htmlFor="dueDate" className="text-right">Due Date</Label>
                            <div className="col-span-3">
                                <DatePicker
                                    value={billFormData.dueDate || ''}
                                    onChange={(date) => setBillFormData(prev => ({ ...prev, dueDate: date }))}
                                    placeholder="Select due date"
                                    minDate={billFormData.invoiceDate ? new Date(billFormData.invoiceDate) : undefined}
                                />
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="col-span-4">
                            <Label className="text-sm font-medium">Line Items</Label>
                            <div className="space-y-3 mt-2">
                                {billFormData.lineItems.map((item, index) => (
                                    <div key={index} className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Product/Service"
                                                value={item.productName}
                                                onChange={(e) => updateLineItem(index, 'productName', e.target.value)}
                                            />
                                        </div>
                                        <div className="w-20">
                                            <Input
                                                placeholder="Qty"
                                                type="number"
                                                value={item.quantity.toString()}
                                                onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                                            />
                                        </div>
                                        <div className="w-24">
                                            <Input
                                                placeholder="Price"
                                                type="number"
                                                step="0.01"
                                                value={item.unitPrice.toString()}
                                                onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => removeLineItem(index)}
                                            disabled={billFormData.lineItems.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addLineItem}
                                    className="w-full"
                                >
                                    Add Line Item
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBillModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateBill}>
                            Record Bill
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Payment Allocation Modal — guarded: cancellable=false, double allocation prevented */}
            <Dialog open={isAllocationModalOpen} onOpenChange={setIsAllocationModalOpen} zIndex={allocationGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Allocate Payment to Bills</DialogTitle>
                        <DialogDescription>
                            Allocate {selectedPayment?.paymentNumber}
                            (Unallocated: {formatCurrency(safeParseFloat(selectedPayment?.unallocatedAmount))})
                            to outstanding bills
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {outstandingBills.length === 0 ? (
                            <div className="text-center py-8">
                                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600">No outstanding bills found for this supplier.</p>
                            </div>
                        ) : (
                            outstandingBills.map((bill, index) => (
                                <div key={bill.id} className="border rounded p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-medium">{bill.invoiceNumber || 'N/A'}</h4>
                                            <Badge className={`text-xs ${getStatusBadgeColor(bill.status || '')}`}>
                                                {(bill.status || 'UNKNOWN').replace('_', ' ')}
                                            </Badge>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-gray-600">Total: {formatCurrency(safeParseFloat(bill.totalAmount))}</div>
                                            <div className="text-sm font-medium text-red-600">
                                                Outstanding: {formatCurrency(safeParseFloat(bill.outstandingBalance))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <Label className="text-sm">Allocate Amount:</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={(allocations[index]?.allocationAmount || 0).toString()}
                                            onChange={(e) => updateAllocation(bill.id, parseFloat(e.target.value) || 0)}
                                            className="w-32"
                                            max={safeParseFloat(bill.outstandingBalance)}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateAllocation(bill.id, safeParseFloat(bill.outstandingBalance))}
                                        >
                                            Full Amount
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsAllocationModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleAutoAllocate}
                            disabled={allocatingPayment}
                        >
                            Auto Allocate
                        </Button>
                        <Button
                            onClick={handleManualAllocate}
                            disabled={allocatingPayment || allocations.every(a => a.allocationAmount === 0)}
                        >
                            Manual Allocate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Payment Receipt/Voucher Modal */}
            <Dialog open={isReceiptModalOpen} onOpenChange={setIsReceiptModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            Payment Recorded Successfully
                        </DialogTitle>
                        <DialogDescription>
                            Review the payment details below and print the voucher for your records.
                        </DialogDescription>
                    </DialogHeader>

                    {paymentReceipt && (
                        <div ref={receiptRef}>
                            {/* Receipt Header */}
                            <div className="header text-center border-b-2 border-gray-800 pb-4 mb-4">
                                <h1 className="text-2xl font-bold text-gray-900">SUPPLIER PAYMENT VOUCHER</h1>
                                <h2 className="text-lg font-semibold text-gray-700 mt-1">{paymentReceipt.payment.paymentNumber}</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Date: {new Date(paymentReceipt.payment.paymentDate).toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>

                            {/* Supplier Info */}
                            <div className="section mb-4">
                                <div className="section-title font-bold text-sm text-gray-700 border-b border-gray-300 pb-1 mb-2">
                                    PAID TO
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <label className="text-gray-500 block">Supplier Name</label>
                                        <span className="font-semibold text-gray-900">{paymentReceipt.supplier.name}</span>
                                    </div>
                                    {paymentReceipt.supplier.contactPerson && (
                                        <div>
                                            <label className="text-gray-500 block">Contact Person</label>
                                            <span className="font-medium">{paymentReceipt.supplier.contactPerson}</span>
                                        </div>
                                    )}
                                    {paymentReceipt.supplier.phone && (
                                        <div>
                                            <label className="text-gray-500 block">Phone</label>
                                            <span className="font-medium">{paymentReceipt.supplier.phone}</span>
                                        </div>
                                    )}
                                    {paymentReceipt.supplier.email && (
                                        <div>
                                            <label className="text-gray-500 block">Email</label>
                                            <span className="font-medium">{paymentReceipt.supplier.email}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Details */}
                            <div className="section mb-4">
                                <div className="section-title font-bold text-sm text-gray-700 border-b border-gray-300 pb-1 mb-2">
                                    PAYMENT DETAILS
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <label className="text-gray-500 block">Payment Method</label>
                                        <span className="font-medium">{paymentReceipt.payment.paymentMethod}</span>
                                    </div>
                                    <div>
                                        <label className="text-gray-500 block">Reference</label>
                                        <span className="font-medium">{paymentReceipt.payment.reference || 'N/A'}</span>
                                    </div>
                                    {paymentReceipt.payment.notes && (
                                        <div className="col-span-2">
                                            <label className="text-gray-500 block">Notes</label>
                                            <span className="font-medium">{paymentReceipt.payment.notes}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Invoices Affected - Expandable with Line Items */}
                            {paymentReceipt.allocations.length > 0 && (
                                <div className="section mb-4">
                                    <div className="section-title font-bold text-sm text-gray-700 border-b border-gray-300 pb-1 mb-2">
                                        INVOICES PAID ({paymentReceipt.allocations.length}) - Click to expand for item details
                                    </div>

                                    {paymentReceipt.allocations.map((alloc) => (
                                        <div key={alloc.invoiceId} className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                                            {/* Invoice Header Row - Clickable */}
                                            <div
                                                className="bg-gray-50 p-3 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
                                                onClick={() => toggleInvoiceExpansion(alloc.invoiceId)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {expandedInvoices.has(alloc.invoiceId) ? (
                                                        <ChevronDown className="h-4 w-4 text-gray-500" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-gray-500" />
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm">{alloc.invoiceNumber}</span>
                                                        {alloc.supplierInvoiceRef && (
                                                            <span className="text-xs text-blue-600">
                                                                Ref: {alloc.supplierInvoiceRef}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {alloc.invoiceDate && (
                                                        <span className="text-xs text-gray-500">
                                                            ({formatTimestampDate(alloc.invoiceDate)})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-xs">
                                                    <span>Total: <span className="font-mono">{formatCurrency(alloc.invoiceTotal)}</span></span>
                                                    <span className="text-green-600 font-semibold">
                                                        Paid: <span className="font-mono">{formatCurrency(alloc.allocationAmount)}</span>
                                                    </span>
                                                    <span className={`font-bold px-2 py-1 rounded text-xs ${alloc.status === 'Paid' ? 'bg-green-100 text-green-700' :
                                                        alloc.status === 'PartiallyPaid' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {alloc.status === 'Paid' ? '✓ PAID' :
                                                            alloc.status === 'PartiallyPaid' ? 'PARTIAL' : alloc.status}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Expanded Line Items */}
                                            {expandedInvoices.has(alloc.invoiceId) && (
                                                <div className="p-3 bg-white border-t border-gray-200">
                                                    <div className="text-xs font-semibold text-gray-600 mb-2">Invoice Items:</div>
                                                    {alloc.lineItems && alloc.lineItems.length > 0 ? (
                                                        <table className="w-full border-collapse text-xs">
                                                            <thead>
                                                                <tr className="bg-blue-50">
                                                                    <th className="border border-gray-200 p-2 text-left font-semibold">Product</th>
                                                                    <th className="border border-gray-200 p-2 text-left font-semibold">Description</th>
                                                                    <th className="border border-gray-200 p-2 text-right font-semibold">Qty</th>
                                                                    <th className="border border-gray-200 p-2 text-right font-semibold">Unit Cost</th>
                                                                    <th className="border border-gray-200 p-2 text-right font-semibold">Line Total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {alloc.lineItems.map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-gray-50">
                                                                        <td className="border border-gray-200 p-2 font-medium">{item.productName}</td>
                                                                        <td className="border border-gray-200 p-2 text-gray-600">{item.description || '-'}</td>
                                                                        <td className="border border-gray-200 p-2 text-right font-mono">
                                                                            {item.quantity} {item.unitOfMeasure || ''}
                                                                        </td>
                                                                        <td className="border border-gray-200 p-2 text-right font-mono">
                                                                            {formatCurrency(item.unitCost)}
                                                                        </td>
                                                                        <td className="border border-gray-200 p-2 text-right font-mono font-semibold">
                                                                            {formatCurrency(item.lineTotal)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr className="bg-gray-100 font-semibold">
                                                                    <td colSpan={4} className="border border-gray-200 p-2 text-right">Invoice Total:</td>
                                                                    <td className="border border-gray-200 p-2 text-right font-mono">{formatCurrency(alloc.invoiceTotal)}</td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    ) : (
                                                        <div className="text-gray-500 italic text-sm py-2">
                                                            No line item details available for this invoice.
                                                        </div>
                                                    )}

                                                    {/* Payment Summary for this Invoice */}
                                                    <div className="mt-3 pt-2 border-t border-gray-200 flex justify-between text-xs">
                                                        <span className="text-gray-600">Previously Paid: <span className="font-mono">{formatCurrency(alloc.previouslyPaid)}</span></span>
                                                        <span className="text-green-600 font-semibold">This Payment: <span className="font-mono">{formatCurrency(alloc.allocationAmount)}</span></span>
                                                        <span className={alloc.newOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}>
                                                            Balance: <span className="font-mono">{formatCurrency(alloc.newOutstanding)}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Summary Box */}
                            <div className="summary-box bg-gray-100 p-4 rounded-lg mt-4">
                                <div className="flex justify-between py-1 text-sm">
                                    <span>Total Payment Amount</span>
                                    <span className="font-mono font-semibold">{formatCurrency(paymentReceipt.summary.totalPayment)}</span>
                                </div>
                                <div className="flex justify-between py-1 text-sm">
                                    <span>Allocated to Invoices</span>
                                    <span className="font-mono text-green-600">{formatCurrency(paymentReceipt.summary.totalAllocated)}</span>
                                </div>
                                {paymentReceipt.summary.unallocatedBalance > 0 && (
                                    <div className="flex justify-between py-1 text-sm">
                                        <span>Unallocated (Credit Balance)</span>
                                        <span className="font-mono text-amber-600">{formatCurrency(paymentReceipt.summary.unallocatedBalance)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between py-2 text-lg font-bold border-t-2 border-gray-800 mt-2 pt-2">
                                    <span>TOTAL PAID</span>
                                    <span className="font-mono text-green-700">{formatCurrency(paymentReceipt.summary.totalPayment)}</span>
                                </div>
                            </div>

                            {/* Signature Lines */}
                            <div className="signature-line mt-10 flex justify-between">
                                <div className="signature-box w-48 text-center">
                                    <div className="line border-t border-gray-800 mt-10 pt-1 text-xs">Prepared By</div>
                                </div>
                                <div className="signature-box w-48 text-center">
                                    <div className="line border-t border-gray-800 mt-10 pt-1 text-xs">Approved By</div>
                                </div>
                                <div className="signature-box w-48 text-center">
                                    <div className="line border-t border-gray-800 mt-10 pt-1 text-xs">Received By (Supplier)</div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="footer mt-8 pt-4 border-t border-dashed border-gray-400 text-xs text-gray-500 text-center">
                                <p>Generated on {new Date().toLocaleString('en-GB', { timeZone: BUSINESS_TIMEZONE })}</p>
                                <p>This is a computer-generated document. No signature required for amounts under UGX 1,000,000.</p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                            Close
                        </Button>
                        {selectedPayment && (
                            <DocumentFlowButton entityType="SUPPLIER_PAYMENT" entityId={selectedPayment.id} size="sm" />
                        )}
                        <Button
                            variant="outline"
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 text-green-700 border-green-600 hover:bg-green-50"
                        >
                            <Download className="h-4 w-4" />
                            Export PDF
                        </Button>
                        <Button
                            onClick={handlePrintReceipt}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                            <Printer className="h-4 w-4" />
                            Print Voucher
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Supplier Invoice Adjustment Modal */}
            {adjustInvoice && (
                <AdjustSupplierInvoiceModal
                    open={!!adjustInvoice}
                    invoiceId={adjustInvoice.id}
                    invoiceNumber={adjustInvoice.invoiceNumber}
                    onClose={() => {
                        setAdjustInvoice(null);
                        void loadBills();
                    }}
                />
            )}

        </div>
    );
};

export default SupplierPaymentsPage;
