import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';
import { CreateInstallmentPlanSchema, UpdateInstallmentSchema } from '../validation/installment.js';
import { InstallmentPaymentSchema } from '../validation/payment.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// ============================================================================
// ENDPOINT 1: CREATE INSTALLMENT PLAN
// POST /api/installments/create
// ============================================================================

router.post(
  '/create',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body with Zod
      const validatedData = CreateInstallmentPlanSchema.parse(req.body);
      const {
        customerId,
        saleId,
        totalAmount,
        numberOfInstallments,
        frequency,
        interestRate = 0,
        startDate,
        downPayment = 0
      } = validatedData;

      const userId = (req as any).user.userId;
      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      // Verify sale exists and is not already on an installment plan
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: { installmentPlans: true }
      });

      if (!sale) {
        res.status(404).json({ error: 'Sale not found' });
        return;
      }

      if (sale.installmentPlans && sale.installmentPlans.length > 0) {
        const activePlans = sale.installmentPlans.filter(p => p.status === 'ACTIVE' || p.status === 'PENDING');
        if (activePlans.length > 0) {
          res.status(400).json({ error: 'Sale already has an active installment plan' });
          return;
        }
      }

      // Calculate plan details
      const principal = totalAmount - downPayment;
      const totalInterest = (principal * interestRate) / 100;
      const totalWithInterest = principal + totalInterest;
      const installmentAmount = totalWithInterest / numberOfInstallments;

      // Calculate end date based on frequency
      const start = startDate ? new Date(startDate) : new Date();
      let endDate = new Date(start);
      
      switch (frequency) {
        case 'WEEKLY':
          endDate.setDate(endDate.getDate() + (numberOfInstallments * 7));
          break;
        case 'BIWEEKLY':
          endDate.setDate(endDate.getDate() + (numberOfInstallments * 14));
          break;
        case 'MONTHLY':
          endDate.setMonth(endDate.getMonth() + numberOfInstallments);
          break;
      }

      // Calculate next due date (first installment date)
      const nextDueDate = new Date(start);
      switch (frequency) {
        case 'WEEKLY':
          nextDueDate.setDate(nextDueDate.getDate() + 7);
          break;
        case 'BIWEEKLY':
          nextDueDate.setDate(nextDueDate.getDate() + 14);
          break;
        case 'MONTHLY':
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          break;
      }

      // Create installment plan with payment schedule in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the installment plan
        const plan = await tx.installmentPlan.create({
          data: {
            planName: `Plan-${Date.now()}`,
            customer: { connect: { id: customerId } },
            sale: saleId ? { connect: { id: saleId } } : undefined,
            totalAmount: new Decimal(totalAmount),
            paidAmount: new Decimal(downPayment),
            outstandingAmount: new Decimal(totalWithInterest - downPayment),
            numberOfInstallments,
            installmentAmount: new Decimal(installmentAmount),
            frequency,
            startDate: start,
            endDate,
            nextDueDate,
            status: downPayment >= totalAmount ? 'COMPLETED' : 'ACTIVE',
            interestRate: new Decimal(interestRate),
            lateFeesAccrued: new Decimal(0),
            createdBy: { connect: { id: userId } }
          }
        });

        // Create individual payment records for each installment
        const payments = [];
        let currentDueDate = new Date(start);

        for (let i = 1; i <= numberOfInstallments; i++) {
          // Calculate due date for this installment
          switch (frequency) {
            case 'WEEKLY':
              currentDueDate = new Date(start);
              currentDueDate.setDate(currentDueDate.getDate() + (i * 7));
              break;
            case 'BIWEEKLY':
              currentDueDate = new Date(start);
              currentDueDate.setDate(currentDueDate.getDate() + (i * 14));
              break;
            case 'MONTHLY':
              currentDueDate = new Date(start);
              currentDueDate.setMonth(currentDueDate.getMonth() + i);
              break;
          }

          payments.push({
            installmentPlanId: plan.id,
            installmentNumber: i,
            dueDate: currentDueDate,
            dueAmount: new Decimal(installmentAmount),
            paidAmount: new Decimal(0),
            status: 'PENDING'
          });
        }

        // Bulk create all payment records
        await tx.installmentPayment.createMany({
          data: payments
        });

        // If down payment was made, record it
        if (downPayment > 0) {
          await tx.customerTransaction.create({
            data: {
              customerId,
              type: 'PAYMENT',
              amount: new Decimal(downPayment),
              balance: customer.currentBalance ? new Decimal(customer.currentBalance).minus(downPayment) : new Decimal(0).minus(downPayment),
              description: `Down payment for installment plan #${plan.id}`,
              referenceId: `INSTALLMENT-DOWN-${plan.id}`,
              createdBy: userId
            }
          });
        }

        // Update sale payment status
        await tx.sale.update({
          where: { id: saleId },
          data: {
            paymentStatus: downPayment >= totalAmount ? 'PAID' : 'INSTALLMENT',
            amountPaid: new Decimal(downPayment),
            amountOutstanding: new Decimal(totalWithInterest - downPayment)
          }
        });

        return plan;
      });

      logger.info(`Installment plan created: Plan ID ${result.id} for customer ${customerId}`, {
        planId: result.id,
        customerId,
        saleId,
        totalAmount,
        numberOfInstallments,
        userId
      });

      res.status(201).json({
        message: 'Installment plan created successfully',
        plan: {
          id: result.id,
          totalAmount: result.totalAmount.toString(),
          numberOfInstallments: result.numberOfInstallments,
          installmentAmount: result.installmentAmount.toString(),
          frequency: result.frequency,
          startDate: result.startDate,
          endDate: result.endDate,
          nextDueDate: result.nextDueDate,
          status: result.status,
          interestRate: result.interestRate.toString()
        }
      });
    } catch (error: any) {
      logger.error('Error creating installment plan:', error);
      res.status(500).json({ error: 'Failed to create installment plan' });
    }
  }
);

// ============================================================================
// ENDPOINT 2: GET CUSTOMER INSTALLMENT PLANS
// GET /api/installments/customer/:id
// ============================================================================

router.get(
  '/customer/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = req.params.id;
      const status = req.query.status as string | undefined;

      const whereClause: any = { customerId };
      
      if (status) {
        if (!['PENDING', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'].includes(status)) {
          res.status(400).json({ error: 'Invalid status filter' });
          return;
        }
        whereClause.status = status;
      }

      const plans = await prisma.installmentPlan.findMany({
        where: whereClause,
        include: {
          sale: {
            select: {
              id: true,
              totalAmount: true,
              saleDate: true,
              saleNumber: true
            }
          },
          payments: {
            orderBy: { installmentNumber: 'asc' }
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              fullName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate summary for each plan
      const plansWithSummary = plans.map(plan => {
        const totalPaid = (plan as any).payments.reduce((sum: number, p: any) => sum + parseFloat(p.paidAmount.toString()), 0);
        const totalPending = (plan as any).payments.filter((p: any) => p.status === 'PENDING').length;
        const totalOverdue = (plan as any).payments.filter((p: any) => p.status === 'OVERDUE').length;

        return {
          id: plan.id,
          saleId: plan.saleId,
          saleReference: (plan as any).sale.saleNumber,
          totalAmount: plan.totalAmount.toString(),
          paidAmount: plan.paidAmount.toString(),
          outstandingAmount: plan.outstandingAmount.toString(),
          numberOfInstallments: plan.numberOfInstallments,
          installmentAmount: plan.installmentAmount.toString(),
          frequency: plan.frequency,
          startDate: plan.startDate,
          endDate: plan.endDate,
          nextDueDate: plan.nextDueDate,
          status: plan.status,
          interestRate: plan.interestRate.toString(),
          lateFeesAccrued: plan.lateFeesAccrued.toString(),
          createdAt: plan.createdAt,
          createdBy: (plan as any).createdBy,
          summary: {
            totalPaid,
            totalPending,
            totalOverdue,
            completionPercentage: (totalPaid / parseFloat(plan.totalAmount.toString())) * 100
          }
        };
      });

      res.json({
        customerId,
        plans: plansWithSummary,
        count: plans.length
      });
    } catch (error: any) {
      logger.error('Error fetching customer installment plans:', error);
      res.status(500).json({ error: 'Failed to fetch installment plans' });
    }
  }
);

// ============================================================================
// ENDPOINT 3: GET INSTALLMENT PLAN DETAILS
// GET /api/installments/:planId
// ============================================================================

router.get(
  '/:planId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const planId = req.params.planId;
      const plan = await prisma.installmentPlan.findUnique({
        where: { id: planId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          },
          sale: {
            select: {
              id: true,
              totalAmount: true,
              saleDate: true,
              saleNumber: true
            }
          },
          payments: {
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  amount: true,
                  referenceId: true,
                  createdAt: true
                }
              },
              processedBy: {
                select: {
                  id: true,
                  username: true,
                  fullName: true
                }
              }
            },
            orderBy: { installmentNumber: 'asc' }
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              fullName: true
            }
          }
        }
      });

      if (!plan) {
        res.status(404).json({ error: 'Installment plan not found' });
        return;
      }

      // Calculate summary
      const paidPayments = (plan as any).payments.filter((p: any) => p.status === 'PAID' || p.status === 'PARTIAL');
      const pendingPayments = (plan as any).payments.filter((p: any) => p.status === 'PENDING');
      const overduePayments = (plan as any).payments.filter((p: any) => p.status === 'OVERDUE');
      const totalPaid = paidPayments.reduce((sum: number, p: any) => sum + parseFloat(p.paidAmount.toString()), 0);
      const totalLateFeesAccrued = (plan as any).payments.reduce((sum: number, p: any) => sum + parseFloat(p.lateFee?.toString() || '0'), 0);

      res.json({
        plan: {
          id: plan.id,
          customer: (plan as any).customer,
          sale: (plan as any).sale,
          totalAmount: plan.totalAmount.toString(),
          paidAmount: plan.paidAmount.toString(),
          outstandingAmount: plan.outstandingAmount.toString(),
          numberOfInstallments: plan.numberOfInstallments,
          installmentAmount: plan.installmentAmount.toString(),
          frequency: plan.frequency,
          startDate: plan.startDate,
          endDate: plan.endDate,
          nextDueDate: plan.nextDueDate,
          status: plan.status,
          interestRate: plan.interestRate.toString(),
          lateFeesAccrued: plan.lateFeesAccrued.toString(),
          createdAt: plan.createdAt,
          createdBy: (plan as any).createdBy
        },
        payments: (plan as any).payments.map((p: any) => ({
          id: p.id,
          installmentNumber: p.installmentNumber,
          dueDate: p.dueDate,
          dueAmount: p.dueAmount.toString(),
          paidAmount: p.paidAmount.toString(),
          paidDate: p.paidDate,
          status: p.status,
          lateFee: p.lateFee?.toString() || '0',
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          transaction: p.transaction,
          processedBy: p.processedBy
        })),
        summary: {
          totalPaid,
          totalPending: pendingPayments.length,
          totalOverdue: overduePayments.length,
          totalLateFeesAccrued,
          completionPercentage: (totalPaid / parseFloat(plan.totalAmount.toString())) * 100,
          nextPaymentDue: overduePayments[0] || pendingPayments[0] || null
        }
      });
    } catch (error: any) {
      logger.error('Error fetching installment plan details:', error);
      res.status(500).json({ error: 'Failed to fetch installment plan details' });
    }
  }
);

// ============================================================================
// ENDPOINT 4: RECORD INSTALLMENT PAYMENT
// POST /api/installments/:planId/payment
// ============================================================================

router.post(
  '/:planId/payment',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body with Zod
      const validatedData = InstallmentPaymentSchema.parse(req.body);

      const planId = req.params.planId;
      const { amount, paymentMethod: rawPaymentMethod, reference } = validatedData;
      
      // Map payment methods to Prisma enum values
      const paymentMethod = rawPaymentMethod === 'MOBILE_MONEY' || rawPaymentMethod === 'CHEQUE' || rawPaymentMethod === 'OTHER' 
        ? 'BANK_TRANSFER' as const
        : rawPaymentMethod;
      
      const paymentDate = new Date(); // Use current date
      const userId = (req as any).user.userId;
      const plan = await prisma.installmentPlan.findUnique({
        where: { id: planId },
        include: {
          payments: {
            orderBy: { installmentNumber: 'asc' }
          },
          customer: true
        }
      });

      if (!plan) {
        res.status(404).json({ error: 'Installment plan not found' });
        return;
      }

      if (plan.status === 'COMPLETED') {
        res.status(400).json({ error: 'Installment plan is already completed' });
        return;
      }

      if (plan.status === 'CANCELLED') {
        res.status(400).json({ error: 'Cannot make payment on a cancelled plan' });
        return;
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();
      let remainingAmount = amount;
      const updatedPayments: any[] = [];

      // Process payment in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Find unpaid/partial installments in order and apply payment
        const unpaidPayments = plan.payments.filter(
          p => p.status === 'PENDING' || p.status === 'OVERDUE' || p.status === 'PARTIAL'
        );

        for (const payment of unpaidPayments) {
          if (remainingAmount <= 0) break;

          const amountDue = parseFloat(payment.dueAmount.toString()) - parseFloat(payment.paidAmount.toString());
          const lateFee = parseFloat(payment.lateFee?.toString() || '0');
          const totalDue = amountDue + lateFee;

          if (remainingAmount >= totalDue) {
            // Full payment for this installment
            const updatedPayment = await tx.installmentPayment.update({
              where: { id: payment.id },
              data: {
                paidAmount: payment.dueAmount,
                paidDate,
                status: 'PAID',
                paymentMethod,
                reference,
                processedById: userId
              }
            });
            updatedPayments.push(updatedPayment);
            remainingAmount -= totalDue;
          } else {
            // Partial payment
            const newPaidAmount = new Decimal(payment.paidAmount).plus(remainingAmount);
            const updatedPayment = await tx.installmentPayment.update({
              where: { id: payment.id },
              data: {
                paidAmount: newPaidAmount,
                paidDate,
                status: 'PARTIAL',
                paymentMethod,
                reference,
                processedById: userId
              }
            });
            updatedPayments.push(updatedPayment);
            remainingAmount = 0;
          }
        }

        // Update plan totals
        const newPaidAmount = new Decimal(plan.paidAmount).plus(amount);
        const newOutstanding = new Decimal(plan.outstandingAmount).minus(amount);
        const allPaid = newOutstanding.lte(0);

        // Calculate next due date
        let nextDueDate = plan.nextDueDate;
        if (updatedPayments.length > 0) {
          const nextUnpaid = await tx.installmentPayment.findFirst({
            where: {
              installmentPlanId: planId,
              status: { in: ['PENDING', 'OVERDUE'] }
            },
            orderBy: { installmentNumber: 'asc' }
          });
          nextDueDate = nextUnpaid?.dueDate || plan.endDate;
        }

        const updatedPlan = await tx.installmentPlan.update({
          where: { id: planId },
          data: {
            paidAmount: newPaidAmount,
            outstandingAmount: allPaid ? new Decimal(0) : newOutstanding,
            status: allPaid ? 'COMPLETED' : 'ACTIVE',
            nextDueDate
          }
        });

        // Create customer transaction record
        const transaction = await tx.customerTransaction.create({
          data: {
            customerId: plan.customerId,
            type: 'PAYMENT',
            amount: new Decimal(amount),
            balance: plan.customer.currentBalance 
              ? new Decimal(plan.customer.currentBalance).minus(amount)
              : new Decimal(0).minus(amount),
            description: `Installment payment for plan #${planId}`,
            referenceId: reference || `INSTALLMENT-${planId}-${Date.now()}`,
            createdBy: userId
          }
        });

        // Link transaction to the first updated payment
        if (updatedPayments.length > 0) {
          await tx.installmentPayment.update({
            where: { id: updatedPayments[0].id },
            data: { transactionId: transaction.id }
          });
        }

        // Update sale payment tracking
        if (plan.saleId) {
          await tx.sale.update({
            where: { id: plan.saleId },
            data: {
              amountPaid: { increment: amount },
              amountOutstanding: { decrement: amount },
              paymentStatus: allPaid ? 'PAID' : 'INSTALLMENT'
            }
          });
        }

        return { updatedPlan, transaction, updatedPayments };
      });

      logger.info(`Installment payment recorded: Plan ID ${planId}, Amount ${amount}`, {
        planId,
        amount,
        paymentMethod,
        userId,
        paymentsUpdated: result.updatedPayments.length
      });

      res.json({
        message: 'Payment recorded successfully',
        payment: {
          transactionId: result.transaction.id,
          amount,
          paymentsUpdated: result.updatedPayments.length,
          remainingBalance: result.updatedPlan.outstandingAmount.toString(),
          planStatus: result.updatedPlan.status
        }
      });
    } catch (error: any) {
      logger.error('Error recording installment payment:', error);
      res.status(500).json({ error: 'Failed to record payment' });
    }
  }
);

// ============================================================================
// ENDPOINT 5: UPDATE INSTALLMENT PLAN STATUS
// PUT /api/installments/:planId/status
// ============================================================================

router.put(
  '/:planId/status',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body with Zod  
      const validatedData = UpdateInstallmentSchema.parse(req.body);
      
      const planId = req.params.planId;
      const { status, notes: reason } = validatedData;
      const userId = (req as any).user.userId;
      const plan = await prisma.installmentPlan.findUnique({
        where: { id: planId },
        include: {
          customer: true,
          sale: true
        }
      });

      if (!plan) {
        res.status(404).json({ error: 'Installment plan not found' });
        return;
      }

      // Validate status transitions
      if (plan.status === 'COMPLETED' && status && (status as string) !== 'COMPLETED') {
        res.status(400).json({ error: 'Cannot change status of completed plan' });
        return;
      }

      if (status && status === 'PAID' && parseFloat(plan.outstandingAmount.toString()) > 0) {
        res.status(400).json({ error: 'Cannot mark plan as completed with outstanding balance' });
        return;
      }

      // Update status in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const updatedPlan = await tx.installmentPlan.update({
          where: { id: planId },
          data: {
            status,
            notes: reason ? `Status changed to ${status}: ${reason}` : undefined
          }
        });

        // If cancelling, update all pending payments
        if (status === 'CANCELLED') {
          await tx.installmentPayment.updateMany({
            where: {
              installmentPlanId: planId,
              status: { in: ['PENDING', 'OVERDUE'] }
            },
            data: {
              status: 'CANCELLED'
            }
          });

          // Update sale status
          if (plan.saleId) {
            await tx.sale.update({
              where: { id: plan.saleId },
              data: {
                paymentStatus: 'CANCELLED'
              }
            });
          }
        }

        // If defaulted, mark overdue payments
        if (status && (status as string) === 'DEFAULTED') {
          await tx.installmentPayment.updateMany({
            where: {
              installmentPlanId: planId,
              status: { in: ['PENDING', 'OVERDUE'] },
              dueDate: { lt: new Date() }
            },
            data: {
              status: 'OVERDUE'
            }
          });
        }

        // Create audit log
        await tx.customerTransaction.create({
          data: {
            customerId: plan.customerId,
            type: 'ADJUSTMENT',
            amount: new Decimal(0),
            balance: plan.customer.currentBalance || new Decimal(0),
            description: `Installment plan #${planId} status changed to ${status}${reason ? `: ${reason}` : ''}`,
            referenceId: `STATUS-CHANGE-${planId}-${Date.now()}`,
            createdBy: userId
          }
        });

        return updatedPlan;
      });

      logger.info(`Installment plan status updated: Plan ID ${planId}, New Status ${status}`, {
        planId,
        oldStatus: plan.status,
        newStatus: status,
        reason,
        userId
      });

      res.json({
        message: 'Installment plan status updated successfully',
        plan: {
          id: result.id,
          status: result.status,
          totalAmount: result.totalAmount.toString(),
          paidAmount: result.paidAmount.toString(),
          outstandingAmount: result.outstandingAmount.toString()
        }
      });
    } catch (error: any) {
      logger.error('Error updating installment plan status:', error);
      res.status(500).json({ error: 'Failed to update plan status' });
    }
  }
);

export default router;












