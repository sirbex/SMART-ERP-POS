import Decimal from 'decimal.js';
import type { ReceiptData } from './print';
import { api } from '../utils/api';

/** Invoice/receipt branding fields from tenant settings */
export interface InvoiceSettingsForReceipt {
  companyName?: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  customReceiptNote?: string | null;
  paymentAccounts?: Array<{
    type: string;
    provider: string;
    accountName: string;
    accountNumber: string;
    branchOrCode?: string;
    isActive: boolean;
    showOnReceipt: boolean;
  }>;
}

export interface SaleItemForReceipt {
  productName?: string;
  product_name?: string;
  quantity?: number | string;
  qty?: number | string;
  unitPrice?: number | string;
  unit_price?: number | string;
  price?: number | string;
  subtotal?: number | string;
  totalPrice?: number | string;
  total_price?: number | string;
  totalAmount?: number | string;
  lineTotal?: number | string;
  line_total?: number | string;
  discountAmount?: number | string;
  discount_amount?: number | string;
}

export interface PaymentLineForReceipt {
  paymentMethod?: string;
  payment_method?: string;
  amount: number | string;
  reference?: string;
}

export interface SaleForReceipt {
  saleNumber: string;
  saleDate?: string;
  createdAt?: string;
  totalAmount: number;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  cashierName?: string;
  soldByName?: string;
  customerName?: string;
  paymentMethod?: string;
  amountPaid?: number;
  paymentReceived?: number;
  changeAmount?: number;
  items?: SaleItemForReceipt[];
  paymentLines?: PaymentLineForReceipt[];
}

/** Format a Date into a receipt-friendly date+time string: DD/MM/YYYY h:mm AM/PM */
export function formatReceiptDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

export async function fetchInvoiceSettingsForReceipt(): Promise<InvoiceSettingsForReceipt | null> {
  try {
    const response = await api.settings.getInvoiceSettings();
    if (response.data?.success && response.data?.data) {
      return response.data.data as InvoiceSettingsForReceipt;
    }
  } catch (error) {
    console.error('Failed to fetch invoice settings for receipt:', error);
  }
  return null;
}

export function invoiceSettingsToReceiptBranding(
  invoiceSettings?: InvoiceSettingsForReceipt | null
): Pick<
  ReceiptData,
  'companyName' | 'companyAddress' | 'companyPhone' | 'paymentAccounts' | 'customReceiptNote'
> {
  if (!invoiceSettings) {
    return {};
  }

  return {
    companyName: invoiceSettings.companyName,
    companyAddress: invoiceSettings.companyAddress || undefined,
    companyPhone: invoiceSettings.companyPhone || undefined,
    paymentAccounts: invoiceSettings.paymentAccounts
      ?.filter((a) => a.isActive && a.showOnReceipt)
      .map((a) => ({
        type: a.type,
        provider: a.provider,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        branchOrCode: a.branchOrCode,
      })),
    customReceiptNote: invoiceSettings.customReceiptNote || undefined,
  };
}

function computeEffectiveDiscount(sale: SaleForReceipt): number {
  const saleDisc = Number(sale.discountAmount || 0);
  if (saleDisc > 0) {
    return saleDisc;
  }

  return (sale.items || []).reduce((sum, item) => {
    return sum + parseFloat(String(item.discountAmount || item.discount_amount || 0));
  }, 0);
}

function resolveSaleDate(sale: SaleForReceipt): string {
  const raw = sale.createdAt || sale.saleDate;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return formatReceiptDateTime(parsed);
    }
  }
  return formatReceiptDateTime(new Date());
}

/** Build receipt payload from a persisted sale (e.g. reprint from Sales history). */
export function buildReceiptDataFromSale(
  sale: SaleForReceipt,
  invoiceSettings?: InvoiceSettingsForReceipt | null,
  options?: { isReprint?: boolean }
): ReceiptData {
  const effectiveDisc = computeEffectiveDiscount(sale);
  const changeAmount = Number(sale.changeAmount || 0);

  return {
    isReprint: options?.isReprint,
    saleNumber: sale.saleNumber,
    saleDate: resolveSaleDate(sale),
    totalAmount: sale.totalAmount,
    subtotal:
      effectiveDisc > 0
        ? new Decimal(sale.totalAmount || 0).plus(effectiveDisc).toNumber()
        : sale.subtotal,
    discountAmount: effectiveDisc > 0 ? effectiveDisc : undefined,
    taxAmount: sale.taxAmount,
    cashierName: sale.cashierName || sale.soldByName,
    customerName: sale.customerName || undefined,
    paymentMethod: sale.paymentMethod,
    amountPaid: sale.amountPaid || sale.paymentReceived,
    changeAmount: changeAmount > 0 ? changeAmount : undefined,
    changeGiven: changeAmount > 0 ? changeAmount : undefined,
    items: sale.items?.map((item) => ({
      name: item.productName || item.product_name || 'Unknown',
      quantity: Number(item.quantity || item.qty || 0),
      unitPrice: Number(item.unitPrice || item.unit_price || item.price || 0),
      subtotal: Number(
        item.totalPrice || item.total_price || item.subtotal || item.totalAmount || item.lineTotal || item.line_total || 0
      ),
      discountAmount:
        parseFloat(String(item.discountAmount || item.discount_amount || 0)) || undefined,
    })),
    payments: sale.paymentLines?.map((pl) => ({
      method: pl.paymentMethod || pl.payment_method || 'CASH',
      amount: Number(pl.amount),
      reference: pl.reference,
    })),
    ...invoiceSettingsToReceiptBranding(invoiceSettings),
  };
}
