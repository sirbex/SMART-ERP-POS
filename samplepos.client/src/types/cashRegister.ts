/**
 * Cash Register Types
 * 
 * TypeScript interfaces for cash register management.
 */

export type SessionStatus = 'OPEN' | 'CLOSED' | 'RECONCILED';
export type MovementType =
    | 'CASH_IN'              // Legacy: Generic cash in
    | 'CASH_IN_FLOAT'        // Float received (not revenue)
    | 'CASH_IN_PAYMENT'      // Customer invoice/debt payment
    | 'CASH_IN_OTHER'        // Other cash income
    | 'CASH_OUT'             // Legacy: Generic cash out
    | 'CASH_OUT_BANK'        // Bank deposit
    | 'CASH_OUT_EXPENSE'     // Petty cash expense  
    | 'CASH_OUT_OTHER'       // Other cash withdrawal
    | 'SALE'                 // POS sale cash payment
    | 'REFUND'               // Customer refund
    | 'FLOAT_ADJUSTMENT';    // Opening float

// Specific sub-types for Cash In dialog
export type CashInSubType = 'CASH_IN_FLOAT' | 'CASH_IN_PAYMENT' | 'CASH_IN_OTHER';
export type CashOutSubType = 'CASH_OUT_BANK' | 'CASH_OUT_EXPENSE' | 'CASH_OUT_OTHER';

export interface CashRegister {
    id: string;
    name: string;
    location: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    // Session status (populated by GET /cash-registers)
    currentSessionId?: string | null;
    currentSessionNumber?: string | null;
    currentSessionUserId?: string | null;
    currentSessionUserName?: string | null;
    currentSessionOpenedAt?: string | null;
}

export interface CashRegisterSession {
    id: string;
    registerId: string;
    registerName?: string;
    userId: string;
    userName?: string;
    sessionNumber: string;
    status: SessionStatus;
    openingFloat: number;
    expectedClosing: number | null;
    actualClosing: number | null;
    variance: number | null;
    varianceReason: string | null;
    openedAt: string;
    closedAt: string | null;
    reconciledAt: string | null;
    reconciledBy: string | null;
    notes: string | null;
}

export interface CashMovement {
    id: string;
    sessionId: string;
    userId: string;
    userName?: string;
    movementType: MovementType;
    amount: number;
    reason: string | null;
    referenceType: string | null;
    referenceId: string | null;
    approvedBy: string | null;
    approvedByName?: string;
    createdAt: string;
}

export interface SessionSummary {
    session: CashRegisterSession;
    movements: CashMovement[];
    summary: {
        openingFloat: number;
        totalCashIn: number;
        totalCashOut: number;
        totalSales: number;
        totalRefunds: number;
        expectedClosing: number;
        actualClosing: number | null;
        variance: number | null;
        movementCount: number;
        // Detailed breakdown by category
        breakdown?: {
            cashInFloat: number;
            cashInPayment: number;
            cashInOther: number;
            cashOutBank: number;
            cashOutExpense: number;
            cashOutOther: number;
        };
    };
}

// Form types
export interface OpenSessionInput {
    registerId: string;
    openingFloat: number;
}

export interface CloseSessionInput {
    actualClosing: number;
    varianceReason?: string;
    notes?: string;
}

export interface RecordMovementInput {
    sessionId: string;
    movementType: CashInSubType | CashOutSubType | 'CASH_IN' | 'CASH_OUT';
    amount: number;
    reason?: string;
    approvedBy?: string;
    // For customer payments - link to invoice
    invoiceId?: string;
    customerId?: string;
}
