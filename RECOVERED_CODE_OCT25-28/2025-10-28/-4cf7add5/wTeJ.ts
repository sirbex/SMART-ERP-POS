import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import {
  createLoan,
  recordRepayment,
  accrueInterest,
  getLoanSummary,
  calculateMonthlyPayment,
  generateAmortizationSchedule,
} from '../services/loans/loanService.js';

const router = Router();

// Configure Decimal.js for bank-grade precision
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

// ===================================================================
// POST /api/loans - Create new loan
// ===================================================================
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        borrowerType,
        borrowerId,
        borrowerName,
        principal,
        interestRate,
        termInMonths,
        startDate,
        paymentFrequency,
        disbursementDate,
        notes,
        cashAccountId,
        loanAccountId,
      } = req.body;

      const userId = (req as any).user?.id;

      // Validation
      if (!borrowerType || !['customer', 'supplier', 'employee'].includes(borrowerType)) {
        return res.status(400).json({ error: 'Invalid borrower type' });
      }

      if (!borrowerId || !borrowerName) {
        return res.status(400).json({ error: 'Borrower ID and name are required' });
      }

      if (!principal || principal <= 0) {
        return res.status(400).json({ error: 'Principal must be greater than 0' });
      }

      if (!interestRate || interestRate < 0) {
        return res.status(400).json({ error: 'Interest rate must be non-negative' });
      }

      if (!termInMonths || termInMonths <= 0) {
        return res.status(400).json({ error: 'Term must be greater than 0' });
      }

      // Create loan
      const loan = await createLoan({
        borrowerType,
        borrowerId,
        borrowerName,
        principal: new Decimal(principal.toString()),
        interestRate: new Decimal(interestRate.toString()),
        termInMonths: parseInt(termInMonths),
        startDate: startDate ? new Date(startDate) : new Date(),
        paymentFrequency: paymentFrequency || 'MONTHLY',
        disbursementDate: disbursementDate ? new Date(disbursementDate) : new Date(),
        notes,
        createdById: userId,
        cashAccountId,
        loanAccountId,
      });

      logger.info(`Loan created: ${loan.loanNumber}`, { userId, loanId: loan.id });

      res.status(201).json({
        success: true,
        message: 'Loan created successfully',
        loan: {
          id: loan.id,
          loanNumber: loan.loanNumber,
          borrowerType: loan.borrowerType,
          borrowerId: loan.borrowerId,
          borrowerName: loan.borrowerName,
          principal: loan.principal.toString(),
          interestRate: loan.interestRate.toString(),
          term: loan.term,
          startDate: loan.startDate,
          endDate: loan.endDate,
          paymentFrequency: loan.paymentFrequency,
          status: loan.status,
          outstandingPrincipal: loan.outstandingPrincipal.toString(),
          outstandingInterest: loan.outstandingInterest.toString(),
        },
      });
    } catch (error: any) {
      logger.error('Error creating loan:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/loans - List all loans with filters
// ===================================================================
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, borrowerType, borrowerId, page = '1', limit = '50' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (borrowerType) {
        where.borrowerType = borrowerType;
      }

      if (borrowerId) {
        where.borrowerId = borrowerId;
      }

      const [loans, total] = await Promise.all([
        prisma.loan.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                repayments: true,
                interestAccruals: true,
              },
            },
          },
        }),
        prisma.loan.count({ where }),
      ]);

      const formattedLoans = loans.map((loan: any) => ({
        id: loan.id,
        loanNumber: loan.loanNumber,
        borrowerType: loan.borrowerType,
        borrowerId: loan.borrowerId,
        borrowerName: loan.borrowerName,
        principal: loan.principal.toString(),
        interestRate: loan.interestRate.toString(),
        term: loan.term,
        startDate: loan.startDate,
        endDate: loan.endDate,
        paymentFrequency: loan.paymentFrequency,
        status: loan.status,
        outstandingPrincipal: loan.outstandingPrincipal.toString(),
        outstandingInterest: loan.outstandingInterest.toString(),
        totalPaid: loan.totalPaid.toString(),
        lastPaymentDate: loan.lastPaymentDate,
        repaymentsCount: loan._count.repayments,
        accrualsCount: loan._count.interestAccruals,
        createdAt: loan.createdAt,
      }));

      logger.info(`Listed ${loans.length} loans`, { userId: (req as any).user?.id });

      res.json({
        success: true,
        loans: formattedLoans,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error('Error listing loans:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/loans/:id - Get loan details with summary
// ===================================================================
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const loanSummary = await getLoanSummary(id);

      if (!loanSummary) {
        return res.status(404).json({ error: 'Loan not found' });
      }

      logger.info(`Loan details retrieved: ${loanSummary.loanNumber}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        loan: {
          id: loanSummary.id,
          loanNumber: loanSummary.loanNumber,
          borrowerType: loanSummary.borrowerType,
          borrowerId: loanSummary.borrowerId,
          borrowerName: loanSummary.borrowerName,
          principal: loanSummary.principal.toString(),
          interestRate: loanSummary.interestRate.toString(),
          term: loanSummary.term,
          startDate: loanSummary.startDate,
          endDate: loanSummary.endDate,
          paymentFrequency: loanSummary.paymentFrequency,
          status: loanSummary.status,
          outstandingPrincipal: loanSummary.outstandingPrincipal.toString(),
          outstandingInterest: loanSummary.outstandingInterest.toString(),
          totalPaid: loanSummary.totalPaid.toString(),
          lastPaymentDate: loanSummary.lastPaymentDate,
          lastInterestAccrualDate: loanSummary.lastInterestAccrualDate,
          notes: loanSummary.notes,
          summary: loanSummary.summary,
          recentRepayments: loanSummary.repayments.map((r: any) => ({
            id: r.id,
            repaymentNumber: r.repaymentNumber,
            amount: r.amount.toString(),
            principalAmount: r.principalAmount.toString(),
            interestAmount: r.interestAmount.toString(),
            penaltyAmount: r.penaltyAmount.toString(),
            paymentDate: r.paymentDate,
            paymentMethod: r.paymentMethod,
            reference: r.reference,
          })),
          recentAccruals: loanSummary.interestAccruals.map((a: any) => ({
            id: a.id,
            accrualDate: a.accrualDate,
            interestAmount: a.interestAmount.toString(),
            daysAccrued: a.daysAccrued,
            outstandingPrincipal: a.outstandingPrincipal.toString(),
          })),
        },
      });
    } catch (error: any) {
      if (error.message === 'Loan not found') {
        return res.status(404).json({ error: 'Loan not found' });
      }
      logger.error('Error retrieving loan:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/loans/:id/repay - Record loan repayment
// ===================================================================
router.post(
  '/:id/repay',
  authenticate,
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { amount, paymentDate, paymentMethod, reference, notes } = req.body;
      const userId = (req as any).user?.id;

      // Validation
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      if (!paymentMethod) {
        return res.status(400).json({ error: 'Payment method is required' });
      }

      // Record repayment
      const result = await recordRepayment({
        loanId: id,
        amount: new Decimal(amount.toString()),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentMethod,
        reference,
        notes,
        createdById: userId,
      });

      logger.info(`Loan repayment recorded: ${result.repayment.repaymentNumber}`, {
        userId,
        loanId: id,
      });

      res.status(201).json({
        success: true,
        message: 'Repayment recorded successfully',
        repayment: {
          id: result.repayment.id,
          repaymentNumber: result.repayment.repaymentNumber,
          amount: result.repayment.amount.toString(),
          principalAmount: result.repayment.principalAmount.toString(),
          interestAmount: result.repayment.interestAmount.toString(),
          penaltyAmount: result.repayment.penaltyAmount.toString(),
          paymentDate: result.repayment.paymentDate,
          paymentMethod: result.repayment.paymentMethod,
          reference: result.repayment.reference,
        },
        loan: {
          status: result.loan.status,
          outstandingPrincipal: result.loan.outstandingPrincipal.toString(),
          outstandingInterest: result.loan.outstandingInterest.toString(),
          totalPaid: result.loan.totalPaid.toString(),
        },
      });
    } catch (error: any) {
      if (error.message === 'Loan not found' || error.message === 'Cannot make payment on inactive loan') {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error recording repayment:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/loans/:id/accrue-interest - Accrue interest to date
// ===================================================================
router.post(
  '/:id/accrue-interest',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { toDate } = req.body;
      const userId = (req as any).user?.id;

      const accrualDate = toDate ? new Date(toDate) : new Date();

      const accrual = await accrueInterest(id, accrualDate);

      if (!accrual) {
        return res.json({
          success: true,
          message: 'No interest to accrue',
        });
      }

      logger.info(`Interest accrued for loan: ${id}`, { userId, accrualId: accrual.id });

      res.status(201).json({
        success: true,
        message: 'Interest accrued successfully',
        accrual: {
          id: accrual.id,
          accrualDate: accrual.accrualDate,
          interestAmount: accrual.interestAmount.toString(),
          daysAccrued: accrual.daysAccrued,
          outstandingPrincipal: accrual.outstandingPrincipal.toString(),
        },
      });
    } catch (error: any) {
      if (error.message === 'Loan not found or not active') {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error accruing interest:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/loans/:id/schedule - Get amortization schedule
// ===================================================================
router.get(
  '/:id/schedule',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const loan = await prisma.loan.findUnique({ where: { id } });

      if (!loan) {
        return res.status(404).json({ error: 'Loan not found' });
      }

      const principal = new Decimal(loan.principal.toString());
      const interestRate = new Decimal(loan.interestRate.toString());

      const schedule = generateAmortizationSchedule(
        principal,
        interestRate,
        loan.term,
        loan.startDate,
        loan.paymentFrequency as any
      );

      logger.info(`Amortization schedule generated for loan: ${loan.loanNumber}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        loan: {
          loanNumber: loan.loanNumber,
          principal: principal.toString(),
          interestRate: interestRate.toString(),
          term: loan.term,
          paymentFrequency: loan.paymentFrequency,
        },
        schedule: {
          monthlyPayment: schedule.monthlyPayment.toFixed(2),
          totalInterest: schedule.totalInterest.toFixed(2),
          totalPayment: schedule.totalPayment.toFixed(2),
          payments: schedule.schedule.map((p) => ({
            paymentNumber: p.paymentNumber,
            dueDate: p.dueDate,
            principal: p.principal.toFixed(2),
            interest: p.interest.toFixed(2),
            totalPayment: p.totalPayment.toFixed(2),
            remainingBalance: p.remainingBalance.toFixed(2),
          })),
        },
      });
    } catch (error) {
      logger.error('Error generating schedule:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/loans/:id/repayments - Get all repayments for a loan
// ===================================================================
router.get(
  '/:id/repayments',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const repayments = await prisma.loanRepayment.findMany({
        where: { loanId: id },
        orderBy: { paymentDate: 'desc' },
      });

      const formattedRepayments = repayments.map((r: any) => ({
        id: r.id,
        repaymentNumber: r.repaymentNumber,
        amount: r.amount.toString(),
        principalAmount: r.principalAmount.toString(),
        interestAmount: r.interestAmount.toString(),
        penaltyAmount: r.penaltyAmount.toString(),
        paymentDate: r.paymentDate,
        paymentMethod: r.paymentMethod,
        reference: r.reference,
        notes: r.notes,
        createdAt: r.createdAt,
      }));

      const totalPaid = repayments.reduce(
        (sum: Decimal, r: any) => sum.plus(new Decimal(r.amount.toString())),
        new Decimal(0)
      );

      logger.info(`Retrieved ${repayments.length} repayments for loan ${id}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        repayments: formattedRepayments,
        summary: {
          count: repayments.length,
          totalPaid: totalPaid.toString(),
        },
      });
    } catch (error) {
      logger.error('Error retrieving repayments:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/loans/calculate-payment - Calculate monthly payment (utility endpoint)
// ===================================================================
router.post(
  '/calculate-payment',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { principal, interestRate, termInMonths } = req.body;

      if (!principal || principal <= 0) {
        return res.status(400).json({ error: 'Principal must be greater than 0' });
      }

      if (!interestRate || interestRate < 0) {
        return res.status(400).json({ error: 'Interest rate must be non-negative' });
      }

      if (!termInMonths || termInMonths <= 0) {
        return res.status(400).json({ error: 'Term must be greater than 0' });
      }

      const monthlyPayment = calculateMonthlyPayment(
        new Decimal(principal.toString()),
        new Decimal(interestRate.toString()),
        parseInt(termInMonths)
      );

      const totalPayment = monthlyPayment.times(termInMonths);
      const totalInterest = totalPayment.minus(new Decimal(principal.toString()));

      res.json({
        success: true,
        calculation: {
          principal: principal.toString(),
          interestRate: interestRate.toString(),
          term: termInMonths,
          monthlyPayment: monthlyPayment.toFixed(2),
          totalInterest: totalInterest.toFixed(2),
          totalPayment: totalPayment.toFixed(2),
          annualPercentageRate: (parseFloat(interestRate) * 100).toFixed(2) + '%',
        },
      });
    } catch (error) {
      logger.error('Error calculating payment:', error);
      next(error);
    }
  }
);

// ===================================================================
// PATCH /api/loans/:id/status - Update loan status
// ===================================================================
router.patch(
  '/:id/status',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const userId = (req as any).user?.id;

      if (!status || !['ACTIVE', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const loan = await prisma.loan.update({
        where: { id },
        data: {
          status,
          notes: notes ? `${status} - ${notes}` : undefined,
        },
      });

      logger.info(`Loan status updated: ${loan.loanNumber} -> ${status}`, { userId, loanId: id });

      res.json({
        success: true,
        message: 'Loan status updated successfully',
        loan: {
          id: loan.id,
          loanNumber: loan.loanNumber,
          status: loan.status,
          updatedAt: loan.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error updating loan status:', error);
      next(error);
    }
  }
);

export default router;
