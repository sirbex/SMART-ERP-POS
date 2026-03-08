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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Decimal from 'decimal.js';
import { AxiosError } from 'axios';
import { Plus, Search, FileText, DollarSign, ArrowUpRight, Trash2, AlertCircle, Building2, Printer, CheckCircle, ChevronDown, ChevronRight, Download, Wallet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'react-hot-toast';
import { ERROR_MESSAGES } from '../../constants/errorMessages';
import { SUPPLIER_PAYMENT_METHODS as PAYMENT_METHODS } from '../../constants/paymentMethods';
// SINGLE SOURCE OF TRUTH: Use the same useSuppliers hook as SuppliersPage
import { useSuppliers } from '../../hooks/useSuppliers';
import {
    supplierPaymentService,
    supplierInvoiceService,
    supplierPaymentAllocationService
} from '../../services/comprehensive-accounting';
import type {
    SupplierPayment,
    SupplierInvoice,
    CreateSupplierPaymentRequest,
    CreateSupplierInvoiceRequest,
    SupplierPaymentReceipt
} from '../../types/comprehensive-accounting';

/** jsPDF instance extended with autoTable tracking properties */
interface JsPDFWithAutoTable extends jsPDF {
    lastAutoTable: { finalY: number };
}

// Unified Supplier interface matching backend response
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
    const [activeTab, setActiveTab] = useState('payments');
    const [payments, setPayments] = useState<SupplierPayment[]>([]);
    const [bills, setBills] = useState<SupplierInvoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // SINGLE SOURCE OF TRUTH: Use the same useSuppliers hook as SuppliersPage
    const { data: suppliersData, isLoading: suppliersLoading, error: suppliersError, refetch: refetchSuppliers } = useSuppliers({ page: 1, limit: 100 });

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

    const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null);
    const [outstandingBills, setOutstandingBills] = useState<SupplierInvoice[]>([]);
    const [allocatingPayment, setAllocatingPayment] = useState(false);
    const [paymentReceipt, setPaymentReceipt] = useState<SupplierPaymentReceipt | null>(null);
    // Note: isRecordingPayment could be used to show loading state during payment creation
    const [_isRecordingPayment, setIsRecordingPayment] = useState(false);
    const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

    // Ref for printing
    const receiptRef = useRef<HTMLDivElement>(null);

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

    const loadTabData = async () => {
        try {
            setLoading(true);

            // Always load both payments and bills for summary cards
            await Promise.all([loadPayments(), loadBills()]);
        } catch (error: unknown) {
            console.error('[SupplierPayments] Error loading tab data:', error);
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to load data');
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
    const totalOutstandingAllSuppliers = suppliers.reduce((sum, s) =>
        sum + safeParseFloat(s.outstandingBalance), 0
    );
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
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to record payment');
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

    // Export payment voucher as PDF with detailed invoice line items
    const handleExportPDF = () => {
        if (!paymentReceipt) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        let yPos = 20;

        // Use shared formatCurrency for PDF — consistent UGX formatting
        const formatCurrencyPDF = (amount: number): string => formatCurrency(amount, true, 0);

        // Header
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('SUPPLIER PAYMENT VOUCHER', pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;

        doc.setFontSize(14);
        doc.text(paymentReceipt.payment.paymentNumber, pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${new Date(paymentReceipt.payment.paymentDate).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;

        // Line separator
        doc.setLineWidth(0.5);
        doc.line(15, yPos, pageWidth - 15, yPos);
        yPos += 10;

        // Supplier Info Section
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PAID TO', 15, yPos);
        yPos += 6;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Supplier: ${paymentReceipt.supplier.name}`, 15, yPos);
        yPos += 5;
        if (paymentReceipt.supplier.contactPerson) {
            doc.text(`Contact: ${paymentReceipt.supplier.contactPerson}`, 15, yPos);
            yPos += 5;
        }
        if (paymentReceipt.supplier.phone) {
            doc.text(`Phone: ${paymentReceipt.supplier.phone}`, 15, yPos);
            yPos += 5;
        }
        if (paymentReceipt.supplier.email) {
            doc.text(`Email: ${paymentReceipt.supplier.email}`, 15, yPos);
            yPos += 5;
        }
        yPos += 5;

        // Payment Details Section
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PAYMENT DETAILS', 15, yPos);
        yPos += 6;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Payment Method: ${paymentReceipt.payment.paymentMethod}`, 15, yPos);
        doc.text(`Reference: ${paymentReceipt.payment.reference || 'N/A'}`, 100, yPos);
        yPos += 5;
        if (paymentReceipt.payment.notes) {
            doc.text(`Notes: ${paymentReceipt.payment.notes}`, 15, yPos);
            yPos += 5;
        }
        yPos += 10;

        // Invoices Summary Table
        if (paymentReceipt.allocations.length > 0) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`INVOICES PAID (${paymentReceipt.allocations.length})`, 15, yPos);
            yPos += 5;

            // Invoice summary table - show both Bill # and Supplier Reference
            const invoiceTableData = paymentReceipt.allocations.map(alloc => [
                alloc.invoiceNumber + (alloc.supplierInvoiceRef ? `\n(Ref: ${alloc.supplierInvoiceRef})` : ''),
                formatCurrencyPDF(alloc.invoiceTotal),
                formatCurrencyPDF(alloc.previouslyPaid),
                formatCurrencyPDF(alloc.allocationAmount),
                formatCurrencyPDF(alloc.newOutstanding),
                alloc.status === 'Paid' ? '✓ PAID' : alloc.status === 'PartiallyPaid' ? 'PARTIAL' : alloc.status
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Invoice # / Ref', 'Total', 'Prev. Paid', 'This Payment', 'Balance', 'Status']],
                body: invoiceTableData,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 30, halign: 'right' },
                    2: { cellWidth: 28, halign: 'right' },
                    3: { cellWidth: 30, halign: 'right' },
                    4: { cellWidth: 28, halign: 'right' },
                    5: { cellWidth: 22, halign: 'center' }
                },
                margin: { left: 15, right: 15 }
            });

            yPos = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 10;

            // Detailed Invoice Line Items
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('DETAILED INVOICE ITEMS', 15, yPos);
            yPos += 8;

            for (const alloc of paymentReceipt.allocations) {
                // Check if we need a new page
                if (yPos > 250) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(`Invoice: ${alloc.invoiceNumber}${alloc.supplierInvoiceRef ? ` (Ref: ${alloc.supplierInvoiceRef})` : ''}`, 15, yPos);
                if (alloc.invoiceDate) {
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Date: ${new Date(alloc.invoiceDate).toLocaleDateString()}`, 130, yPos);
                }
                yPos += 3;

                if (alloc.lineItems && alloc.lineItems.length > 0) {
                    const itemTableData = alloc.lineItems.map(item => [
                        item.productName,
                        item.description || '-',
                        `${item.quantity} ${item.unitOfMeasure || ''}`.trim(),
                        formatCurrencyPDF(item.unitCost),
                        formatCurrencyPDF(item.lineTotal)
                    ]);

                    autoTable(doc, {
                        startY: yPos,
                        head: [['Product', 'Description', 'Qty', 'Unit Cost', 'Total']],
                        body: itemTableData,
                        styles: { fontSize: 8, cellPadding: 2 },
                        headStyles: { fillColor: [150, 150, 150], textColor: 255, fontStyle: 'bold' },
                        columnStyles: {
                            0: { cellWidth: 45 },
                            1: { cellWidth: 45 },
                            2: { cellWidth: 25, halign: 'center' },
                            3: { cellWidth: 30, halign: 'right' },
                            4: { cellWidth: 30, halign: 'right' }
                        },
                        margin: { left: 20, right: 15 }
                    });

                    yPos = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 8;
                } else {
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(9);
                    doc.text('No line item details available', 20, yPos + 3);
                    yPos += 10;
                }
            }
        }

        // Summary Section
        if (yPos > 230) {
            doc.addPage();
            yPos = 20;
        }

        yPos += 5;
        doc.setFillColor(240, 240, 240);
        doc.rect(15, yPos, pageWidth - 30, 40, 'F');
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Total Payment Amount:', 20, yPos);
        doc.text(formatCurrencyPDF(paymentReceipt.summary.totalPayment), pageWidth - 25, yPos, { align: 'right' });
        yPos += 7;

        doc.text('Allocated to Invoices:', 20, yPos);
        doc.text(formatCurrencyPDF(paymentReceipt.summary.totalAllocated), pageWidth - 25, yPos, { align: 'right' });
        yPos += 7;

        if (paymentReceipt.summary.unallocatedBalance > 0) {
            doc.text('Unallocated (Credit Balance):', 20, yPos);
            doc.text(formatCurrencyPDF(paymentReceipt.summary.unallocatedBalance), pageWidth - 25, yPos, { align: 'right' });
            yPos += 7;
        }

        yPos += 3;
        doc.setLineWidth(0.5);
        doc.line(20, yPos, pageWidth - 20, yPos);
        yPos += 8;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL PAID:', 20, yPos);
        doc.text(formatCurrencyPDF(paymentReceipt.summary.totalPayment), pageWidth - 25, yPos, { align: 'right' });

        // Signature lines (if space allows)
        if (yPos < 230) {
            yPos = 250;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            doc.line(20, yPos, 60, yPos);
            doc.text('Prepared By', 30, yPos + 5);

            doc.line(80, yPos, 120, yPos);
            doc.text('Approved By', 90, yPos + 5);

            doc.line(140, yPos, 190, yPos);
            doc.text('Received By (Supplier)', 148, yPos + 5);
        }

        // Footer
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, 285, { align: 'center' });
        doc.text('Computer-generated document. No signature required for amounts under UGX 1,000,000.', pageWidth / 2, 290, { align: 'center' });

        // Save the PDF
        doc.save(`Payment_Voucher_${paymentReceipt.payment.paymentNumber}.pdf`);
        toast.success('PDF exported successfully');
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
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to record bill');
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
            toast.error('Failed to load outstanding bills');
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
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to allocate payment');
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
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to allocate payment');
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
                    <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Record Bill
                            </Button>
                        </DialogTrigger>
                    </Dialog>

                    <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                        <DialogTrigger asChild>
                            <Button className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                Make Payment
                            </Button>
                        </DialogTrigger>
                    </Dialog>
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
                                    {formatCurrency(totalUnallocatedCredit)}
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
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="bills">Bills</TabsTrigger>
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

                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
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
                                                        <div>{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Reference:</span>
                                                        <div>{payment.reference || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 ml-4">
                                                {safeParseFloat(payment.unallocatedAmount) > 0 ? (
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
                                                        <div>{bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString() : 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Due Date:</span>
                                                        <div>{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Pay Now button for outstanding bills */}
                                            <div className="flex items-center gap-2 ml-4">
                                                {safeParseFloat(bill.outstandingBalance) > 0 ? (
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
                                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                                        Paid
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
            </Tabs>

            {/* Payment Modal */}
            <Dialog open={isPaymentModalOpen} onOpenChange={(open) => {
                setIsPaymentModalOpen(open);
                if (!open) resetPaymentForm();
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Record Supplier Payment</DialogTitle>
                        <DialogDescription>
                            Record a payment made to a supplier
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="supplier" className="text-right">Supplier</Label>
                            <div className="col-span-3 space-y-2">
                                {/* Supplier search filter */}
                                <Input
                                    placeholder="Type to search suppliers..."
                                    value={supplierSearchFilter}
                                    onChange={(e) => setSupplierSearchFilter(e.target.value)}
                                    className="mb-1"
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
                                            filteredSuppliers.map(supplier => (
                                                <SelectItem key={supplier.id} value={supplier.id}>
                                                    <div className="flex items-center justify-between w-full gap-2">
                                                        <span>{supplier.name}</span>
                                                        {safeParseFloat(supplier.outstandingBalance) > 0 && (
                                                            <span className="text-xs text-amber-600 font-medium">
                                                                {formatCurrency(safeParseFloat(supplier.outstandingBalance))} due
                                                            </span>
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Outstanding Balance Display */}
                        {selectedSupplierOutstanding && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-amber-800">
                                        <span className="font-medium">Outstanding Balance:</span>
                                        <span className="ml-2 text-lg font-bold text-amber-900">
                                            {formatCurrency(selectedSupplierOutstanding.totalOutstanding)}
                                        </span>
                                    </div>
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800">
                                        {selectedSupplierOutstanding.invoiceCount === -1
                                            ? 'Loading...'
                                            : `${selectedSupplierOutstanding.invoiceCount} invoice${selectedSupplierOutstanding.invoiceCount !== 1 ? 's' : ''}`
                                        }
                                    </Badge>
                                </div>
                                {selectedSupplierOutstanding.totalOutstanding > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-amber-700 border-amber-300 hover:bg-amber-50 px-2 h-auto mt-1"
                                        onClick={() => setPaymentFormData(prev => ({
                                            ...prev,
                                            amount: selectedSupplierOutstanding.totalOutstanding
                                        }))}
                                    >
                                        Pay full balance
                                    </Button>
                                )}

                                {/* Outstanding Invoices List */}
                                {selectedSupplierOutstanding.invoices && selectedSupplierOutstanding.invoices.length > 0 && (
                                    <div className="mt-3 border-t border-amber-200 pt-3">
                                        <p className="text-xs font-medium text-amber-700 mb-2">Outstanding Invoices:</p>
                                        <div className="space-y-2 max-h-32 overflow-y-auto">
                                            {selectedSupplierOutstanding.invoices.map((inv) => (
                                                <div
                                                    key={inv.id}
                                                    className="flex justify-between items-center text-xs bg-white p-2 rounded border border-amber-100 cursor-pointer hover:bg-amber-50"
                                                    onClick={() => setPaymentFormData(prev => ({
                                                        ...prev,
                                                        amount: safeParseFloat(inv.outstandingBalance),
                                                        notes: `Payment for ${inv.invoiceNumber || inv.supplierInvoiceNumber}`
                                                    }))}
                                                >
                                                    <div>
                                                        <span className="font-medium text-gray-900">{inv.invoiceNumber || inv.supplierInvoiceNumber}</span>
                                                        {inv.dueDate && (
                                                            <span className="ml-2 text-gray-500">
                                                                Due: {new Date(inv.dueDate).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-semibold text-amber-800">
                                                        {formatCurrency(safeParseFloat(inv.outstandingBalance))}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Click an invoice to pay that amount</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="amount" className="text-right">Amount</Label>
                            <div className="col-span-3 space-y-2">
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    value={paymentFormData.amount.toString()}
                                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    placeholder="Enter payment amount"
                                />
                                {/* Quick partial payment buttons */}
                                {selectedSupplierOutstanding && selectedSupplierOutstanding.totalOutstanding > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        <span className="text-xs text-gray-500 mr-1">Quick:</span>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                                            onClick={() => setPaymentFormData(prev => ({
                                                ...prev,
                                                amount: Math.round(selectedSupplierOutstanding.totalOutstanding * 0.25)
                                            }))}
                                        >
                                            25%
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                                            onClick={() => setPaymentFormData(prev => ({
                                                ...prev,
                                                amount: Math.round(selectedSupplierOutstanding.totalOutstanding * 0.50)
                                            }))}
                                        >
                                            50%
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                                            onClick={() => setPaymentFormData(prev => ({
                                                ...prev,
                                                amount: Math.round(selectedSupplierOutstanding.totalOutstanding * 0.75)
                                            }))}
                                        >
                                            75%
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-0.5 bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
                                            onClick={() => setPaymentFormData(prev => ({
                                                ...prev,
                                                amount: selectedSupplierOutstanding.totalOutstanding
                                            }))}
                                        >
                                            100%
                                        </button>
                                    </div>
                                )}
                                <p className="text-xs text-gray-500">Enter any amount for partial payment</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="method" className="text-right">Method</Label>
                            <div className="col-span-3">
                                <Select
                                    value={paymentFormData.paymentMethod}
                                    onValueChange={(value: string) => setPaymentFormData(prev => ({ ...prev, paymentMethod: value as CreateSupplierPaymentRequest['paymentMethod'] }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_METHODS.map(method => (
                                            <SelectItem key={method.value} value={method.value}>
                                                {method.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="date" className="text-right">Date</Label>
                            <div className="col-span-3">
                                <DatePicker
                                    value={paymentFormData.paymentDate}
                                    onChange={(date) => setPaymentFormData(prev => ({ ...prev, paymentDate: date }))}
                                    placeholder="Select payment date"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="reference" className="text-right">Reference</Label>
                            <Input
                                id="reference"
                                value={paymentFormData.reference || ''}
                                onChange={(e) => setPaymentFormData(prev => ({ ...prev, reference: e.target.value }))}
                                className="col-span-3"
                                placeholder="Payment reference"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreatePayment}>
                            Record Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bill Modal */}
            <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Record Supplier Bill</DialogTitle>
                        <DialogDescription>
                            Record a bill received from a supplier
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
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

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="billNumber" className="text-right">Bill Number</Label>
                            <Input
                                id="billNumber"
                                value={billFormData.supplierInvoiceNumber}
                                onChange={(e) => setBillFormData(prev => ({ ...prev, supplierInvoiceNumber: e.target.value }))}
                                className="col-span-3"
                                placeholder="Supplier's invoice number"
                            />
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="billDate" className="text-right">Bill Date</Label>
                            <div className="col-span-3">
                                <DatePicker
                                    value={billFormData.invoiceDate}
                                    onChange={(date) => setBillFormData(prev => ({ ...prev, invoiceDate: date }))}
                                    placeholder="Select bill date"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
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

            {/* Payment Allocation Modal */}
            <Dialog open={isAllocationModalOpen} onOpenChange={setIsAllocationModalOpen}>
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
                                                            ({new Date(alloc.invoiceDate).toLocaleDateString()})
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
                                <p>Generated on {new Date().toLocaleString()}</p>
                                <p>This is a computer-generated document. No signature required for amounts under UGX 1,000,000.</p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                            Close
                        </Button>
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
        </div>
    );
};

export default SupplierPaymentsPage;