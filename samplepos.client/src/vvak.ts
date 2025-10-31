import Decimal from 'decimal.js';
import prisma from '../../config/database.js';

/**
 * Loan Service
 * Handles loan management, interest calculations, and repayment schedules with bank-grade precision
 */

// Configure Decimal.js for bank-grade precision
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface LoanCalculation {
  monthlyPayment: Decimal;
  totalInterest: Decimal;
  totalPayment: Decimal;
  schedule: PaymentScheduleItem[];
}

export interface PaymentScheduleItem {
  paymentNumber: number;
  dueDate: Date;
  principal: Decimal;
  interest: Decimal;
  totalPayment: Decimal;
  remainingBalance: Decimal;
}

/**
 * Calculate monthly payment using amortization formula
 * P = L[c(1 + c)^n]/[(1 + c)^n - 1]
 * where:
 * P = monthly payment
 * L = loan amount (principal)
 * c = monthly interest rate (annual rate / 12)
 * n = number of payments (term in months)
 */
export function calculateMonthlyPayment(
  principal: Decimal,
  annualInterestRate: Decimal,
  termInMonths: number
): Decimal {
  if (annualInterestRate.isZero()) {
    // No interest, just divide principal by term
    return principal.dividedBy(termInMonths);
  }

  const monthlyRate = annualInterestRate.dividedBy(12);
  const numPayments = new Decimal(termInMonths);

  // (1 + r)^n
  const onePlusRate = monthlyRate.plus(1);
  const powered = onePlusRate.pow(numPayments.toNumber());

  // Numerator: L * r * (1 + r)^n
  const numerator = principal.times(monthlyRate).times(powered);

  // Denominator: (1 + r)^n - 1
  const denominator = powered.minus(1);

  const monthlyPayment = numerator.dividedBy(denominator);

  return monthlyPayment;
}

/**
 * Generate complete amortization schedule
 */
export function generateAmortizationSchedule(
  principal: Decimal,
  annualInterestRate: Decimal,
  termInMonths: number,
  startDate: Date,
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' = 'MONTHLY'
): LoanCalculation {
  const schedule: PaymentScheduleItem[] = [];
  let remainingBalance = new Decimal(principal);

  const paymentsPerYear =
    paymentFrequency === 'MONTHLY' ? 12 : paymentFrequency === 'QUARTERLY' ? 4 : 1;
  const periodRate = annualInterestRate.dividedBy(paymentsPerYear);
  const numPayments = Math.ceil(termInMonths / (12 / paymentsPerYear));

  const paymentAmount = calculateMonthlyPayment(principal, annualInterestRate, termInMonths);

  let totalInterestPaid = new Decimal(0);
  let currentDate = new Date(startDate);

  for (let i = 1; i <= numPayments; i++) {
    // Calculate interest on remaining balance
    const interestPayment = remainingBalance.times(periodRate);

    // Principal is payment minus interest
    let principalPayment = paymentAmount.minus(interestPayment);

    // Adjust last payment to clear remaining balance
    if (i === numPayments || principalPayment.greaterThan(remainingBalance)) {
      principalPayment = remainingBalance;
    }

    const totalPayment = principalPayment.plus(interestPayment);
    remainingBalance = remainingBalance.minus(principalPayment);
    totalInterestPaid = totalInterestPaid.plus(interestPayment);

    // Calculate due date based on frequency
    const monthsToAdd = 12 / paymentsPerYear;
    const dueDate = new Date(currentDate);
    dueDate.setMonth(dueDate.getMonth() + monthsToAdd);

    schedule.push({
      paymentNumber: i,
      dueDate: new Date(dueDate),
      principal: principalPayment,
      interest: interestPayment,
      totalPayment: totalPayment,
      remainingBalance: remainingBalance,
    });

    currentDate = dueDate;
  }

  return {
    monthlyPayment: paymentAmount,
    totalInterest: totalInterestPaid,
    totalPayment: principal.plus(totalInterestPaid),
    schedule,
  };
}

/**
 * Calculate accrued interest for a period
 * Interest = Principal × Rate × (Days / 365)
 */
export function calculateAccruedInterest(
  principal: Decimal,
  annualInterestRate: Decimal,
  fromDate: Date,
  toDate: Date
): { interest: Decimal; days: number } {
  const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

  // Daily interest = Annual Rate / 365
  const dailyRate = annualInterestRate.dividedBy(365);

  // Accrued interest = Principal × Daily Rate × Days
  const interest = principal.times(dailyRate).times(days);

  return {
    interest,
    days,
  };
}

/**
 * Create a new loan with initial accounting entries
 */
export async function createLoan(params: {
  borrowerType: 'customer' | 'supplier' | 'employee';
  borrowerId: string;
  borrowerName: string;
  principal: Decimal;
  interestRate: Decimal;
  termInMonths: number;
  startDate: Date;
  paymentFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  disbursementDate?: Date;
  notes?: string;
  createdById: string;
  cashAccountId?: string; // For accounting integration
  loanAccountId?: string; // For accounting integration
}) {
  const {
    borrowerType,
    borrowerId,
    borrowerName,
    principal,
    interestRate,
    termInMonths,
    startDate,
    paymentFrequency = 'MONTHLY',
    disbursementDate,
    notes,
    createdById,
    cashAccountId,
    loanAccountId,
  } = params;

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + termInMonths);

  // Generate loan number
  const loanNumber = `LOAN-${Date.now()}`;

  // Create loan in database
  const loan = await prisma.loan.create({
    data: {
      loanNumber,
      borrowerType,
      borrowerId,
      borrowerName,
      principal: principal.toString(),
      interestRate: interestRate.toString(),
      term: termInMonths,
      startDate,
      endDate,
      paymentFrequency,
      disbursementDate: disbursementDate || new Date(),
      outstandingPrincipal: principal.toString(),
      outstandingInterest: '0',
      totalPaid: '0',
      status: 'ACTIVE',
      accountId: loanAccountId,
      notes,
      createdById,
    },
  });

  // If accounting accounts are provided, create disbursement transaction
  if (cashAccountId && loanAccountId) {
    const { postLedger } = await import('../accounting/postLedger.js');

    await postLedger({
      date: disbursementDate || new Date(),
      description: `Loan disbursement: ${loanNumber}`,
      entries: [
        {
          transactionId: '', // Will be set by postLedger
          accountId: cashAccountId,
          amount: principal,
          type: 'debit' as const,
          currency: 'UGX',
        },
        {
          transactionId: '', // Will be set by postLedger
          accountId: loanAccountId,
          amount: principal,
          type: 'credit' as const,
          currency: 'UGX',
        },
      ],
      refType: 'loan',
      refId: loan.id,
    });
  }

  return loan;
}

/**
 * Record loan repayment with principal/interest allocation
 */
export async function recordRepayment(params: {
  loanId: string;
  amount: Decimal;
  paymentDate: Date;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  createdById: string;
}) {
  const { loanId, amount, paymentDate, paymentMethod, reference, notes, createdById } = params;

  const loan = await prisma.loan.findUnique({ where: { id: loanId } });

  if (!loan) {
    throw new Error('Loan not found');
  }

  if (loan.status !== 'ACTIVE') {
    throw new Error('Cannot make payment on inactive loan');
  }

  const outstandingPrincipal = new Decimal(loan.outstandingPrincipal.toString());
  const outstandingInterest = new Decimal(loan.outstandingInterest.toString());

  // Allocate payment: Interest first, then principal
  let interestPayment = Decimal.min(amount, outstandingInterest);
  let principalPayment = amount.minus(interestPayment);

  // Ensure principal payment doesn't exceed outstanding
  if (principalPayment.greaterThan(outstandingPrincipal)) {
    principalPayment = outstandingPrincipal;
  }

  const totalPayment = principalPayment.plus(interestPayment);

  const newOutstandingPrincipal = outstandingPrincipal.minus(principalPayment);
  const newOutstandingInterest = outstandingInterest.minus(interestPayment);

  // Generate repayment number
  const repaymentNumber = `REP-${Date.now()}`;

  // Update loan and create repayment record
  const result = await prisma.$transaction(async (tx: any) => {
    // Create repayment record
    const repayment = await tx.loanRepayment.create({
      data: {
        loanId,
        repaymentNumber,
        amount: totalPayment.toString(),
        principalAmount: principalPayment.toString(),
        interestAmount: interestPayment.toString(),
        penaltyAmount: '0',
        paymentDate,
        paymentMethod,
        reference,
        notes,
        createdById,
      },
    });

    // Update loan
    const updatedLoan = await tx.loan.update({
      where: { id: loanId },
      data: {
        outstandingPrincipal: newOutstandingPrincipal.toString(),
        outstandingInterest: newOutstandingInterest.toString(),
        totalPaid: { increment: totalPayment.toString() },
        lastPaymentDate: paymentDate,
        status:
          newOutstandingPrincipal.isZero() && newOutstandingInterest.isZero()
            ? 'COMPLETED'
            : 'ACTIVE',
      },
    });

    return { repayment, loan: updatedLoan };
  });

  return result;
}

/**
 * Accrue interest for a loan up to a specific date
 */
export async function accrueInterest(loanId: string, toDate: Date = new Date()) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });

  if (!loan || loan.status !== 'ACTIVE') {
    throw new Error('Loan not found or not active');
  }

  const outstandingPrincipal = new Decimal(loan.outstandingPrincipal.toString());
  const annualRate = new Decimal(loan.interestRate.toString());

  // Determine from date (last accrual or disbursement)
  const fromDate = loan.lastInterestAccrualDate || loan.disbursementDate || loan.startDate;

  // Calculate accrued interest
  const { interest, days } = calculateAccruedInterest(
    outstandingPrincipal,
    annualRate,
    fromDate,
    toDate
  );

  if (interest.lessThanOrEqualTo(0)) {
    return null; // No interest to accrue
  }

  // Create accrual record
  const accrual = await prisma.$transaction(async (tx: any) => {
    const record = await tx.loanInterestAccrual.create({
      data: {
        loanId,
        accrualDate: toDate,
        interestAmount: interest.toString(),
        daysAccrued: days,
        outstandingPrincipal: outstandingPrincipal.toString(),
      },
    });

    // Update loan
    await tx.loan.update({
      where: { id: loanId },
      data: {
        outstandingInterest: { increment: interest.toString() },
        lastInterestAccrualDate: toDate,
      },
    });

    return record;
  });

  return accrual;
}

/**
 * Get loan summary with current status
 */
export async function getLoanSummary(loanId: string) {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      repayments: {
        orderBy: { paymentDate: 'desc' },
        take: 10,
      },
      interestAccruals: {
        orderBy: { accrualDate: 'desc' },
        take: 10,
      },
    },
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  const principal = new Decimal(loan.principal.toString());
  const outstandingPrincipal = new Decimal(loan.outstandingPrincipal.toString());
  const outstandingInterest = new Decimal(loan.outstandingInterest.toString());
  const totalPaid = new Decimal(loan.totalPaid.toString());

  const principalPaid = principal.minus(outstandingPrincipal);
  const percentagePaid = principal.greaterThan(0)
    ? principalPaid.dividedBy(principal).times(100)
    : new Decimal(0);

  return {
    ...loan,
    summary: {
      principal: principal.toString(),
      outstandingPrincipal: outstandingPrincipal.toString(),
      outstandingInterest: outstandingInterest.toString(),
      totalOutstanding: outstandingPrincipal.plus(outstandingInterest).toString(),
      principalPaid: principalPaid.toString(),
      totalPaid: totalPaid.toString(),
      percentagePaid: percentagePaid.toFixed(2) + '%',
      daysActive: Math.floor(
        (new Date().getTime() - loan.startDate.getTime()) / (1000 * 60 * 60 * 24)
      ),
      daysRemaining: Math.floor(
        (loan.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      ),
    },
  };
}
