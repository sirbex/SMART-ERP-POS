export type ExpenseStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'CANCELLED';

export type ExpenseCategory =
  | 'OFFICE_SUPPLIES'
  | 'TRAVEL'
  | 'MEALS'
  | 'FUEL'
  | 'UTILITIES'
  | 'MAINTENANCE'
  | 'MARKETING'
  | 'EQUIPMENT'
  | 'SOFTWARE'
  | 'PROFESSIONAL_SERVICES'
  | 'ACCOMMODATION'
  | 'TRAINING'
  | 'ALLOWANCE'
  | 'OTHER';

export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'MOBILE_MONEY'
  | 'CHEQUE';

export type PaymentStatus =
  | 'UNPAID'
  | 'PAID'
  | 'PARTIAL';

export interface ExpenseDocument {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface Expense {
  // Dual ID System
  id: string; // UUID - Database primary key
  expenseNumber: string; // EXP-YYYYMM-#### - Business identifier

  // Basic information
  title: string;
  description?: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  categoryId?: string; // UUID - Reference to expense_categories
  categoryName?: string;
  vendor?: string;
  receiptNumber?: string; // Optional receipt/invoice number
  paymentMethod: PaymentMethod;
  status: ExpenseStatus;
  receiptRequired: boolean;
  notes?: string;

  // Associated documents
  documents: ExpenseDocument[];

  // Approval workflow fields
  approvedBy?: string; // UUID
  approvedByName?: string;
  approvedAt?: string; // ISO timestamp
  rejectedBy?: string; // UUID
  rejectedByName?: string;
  rejectedAt?: string; // ISO timestamp
  rejectionReason?: string;
  paidBy?: string; // UUID
  paidByName?: string;
  paidAt?: string; // ISO timestamp

  // Audit fields
  createdBy: string; // UUID
  createdByName?: string;
  updatedBy: string; // UUID
  updatedByName?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface CreateExpenseData {
  title: string;
  description?: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  vendor?: string;
  paymentMethod: PaymentMethod;
  receiptRequired?: boolean;
  notes?: string;
  documentIds?: string[]; // UUIDs of uploaded documents to associate
  // Payment status and source account for GL posting
  paymentStatus?: PaymentStatus; // UNPAID, PAID, PARTIAL (default: UNPAID)
  paymentAccountId?: string | null; // UUID of cash/bank account (required when PAID)
}

export interface UpdateExpenseData {
  title?: string;
  description?: string | null;
  amount?: number;
  expenseDate?: string; // YYYY-MM-DD
  category?: ExpenseCategory;
  vendor?: string | null;
  paymentMethod?: PaymentMethod;
  status?: ExpenseStatus;
  receiptRequired?: boolean;
  notes?: string | null;
}

export interface ExpenseFilter {
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  minAmount?: number;
  maxAmount?: number;
  search?: string; // Search in title, description, vendor, expense number
  page?: number;
  limit?: number;
  offset?: number;
  includeSummary?: boolean;
}

// Database row interface (snake_case from PostgreSQL)
export interface ExpenseDbRow {
  id: string;
  expense_number: string;
  title: string;
  description?: string;
  amount: string; // PostgreSQL DECIMAL returns as string
  expense_date: string;
  category: string;
  vendor?: string;
  payment_method: string;
  status: string;
  receipt_required: boolean;
  notes?: string;
  created_by: string;
  created_by_name?: string;
  updated_by: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  documents?: any; // JSON aggregate from query
}

// Utility function to normalize database row to TypeScript interface
export function normalizeExpense(dbRow: ExpenseDbRow): Expense {
  return {
    id: dbRow.id,
    expenseNumber: dbRow.expense_number,
    title: dbRow.title,
    description: dbRow.description,
    amount: parseFloat(dbRow.amount),
    expenseDate: dbRow.expense_date,
    category: dbRow.category as ExpenseCategory,
    vendor: dbRow.vendor,
    paymentMethod: dbRow.payment_method as PaymentMethod,
    status: dbRow.status as ExpenseStatus,
    receiptRequired: dbRow.receipt_required,
    notes: dbRow.notes,
    documents: dbRow.documents || [],
    createdBy: dbRow.created_by,
    createdByName: dbRow.created_by_name,
    updatedBy: dbRow.updated_by,
    updatedByName: dbRow.updated_by_name,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at
  };
}

// Constants for UI and validation
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  OFFICE_SUPPLIES: 'Office Supplies',
  TRAVEL: 'Travel & Transportation',
  MEALS: 'Meals & Entertainment',
  FUEL: 'Fuel & Vehicle',
  UTILITIES: 'Utilities',
  MAINTENANCE: 'Maintenance & Repairs',
  MARKETING: 'Marketing & Advertising',
  EQUIPMENT: 'Equipment & Tools',
  SOFTWARE: 'Software & Licenses',
  PROFESSIONAL_SERVICES: 'Professional Services',
  ACCOMMODATION: 'Accommodation',
  TRAINING: 'Training & Education',
  ALLOWANCE: 'Employee Allowances',
  OTHER: 'Other Expenses'
};

export const EXPENSE_STATUSES: Record<ExpenseStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
  CANCELLED: 'Cancelled'
};

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Credit/Debit Card',
  BANK_TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Cheque'
};