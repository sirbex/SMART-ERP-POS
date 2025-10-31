import cron from 'node-cron';
import prisma from '../config/database.js';
import { accrueInterest } from '../services/loans/loanService.js';
import logger from '../utils/logger.js';

/**
 * Daily Interest Accrual Job
 * Automatically accrues interest for all active loans
 * Runs every day at 00:01 AM (1 minute after midnight)
 */

export function startInterestAccrualJob() {
  // Schedule: Run at 00:01 AM every day
  // Format: minute hour day month dayOfWeek
  const schedule = '1 0 * * *';

  cron.schedule(
    schedule,
    async () => {
      const startTime = new Date();
      logger.info('🕐 Starting daily interest accrual job', { startTime });

      try {
        // Get all active loans that need interest accrual
        const activeLoans = await prisma.loan.findMany({
          where: {
            status: 'ACTIVE',
          },
          select: {
            id: true,
            loanNumber: true,
            borrowerName: true,
            outstandingPrincipal: true,
            interestRate: true,
            lastInterestAccrualDate: true,
          },
        });

        if (activeLoans.length === 0) {
          logger.info('No active loans found for interest accrual');
          return;
        }

        logger.info(`Found ${activeLoans.length} active loans for interest accrual`);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        const errors: Array<{ loanNumber: string; error: string }> = [];

        // Accrue interest for each loan
        for (const loan of activeLoans) {
          try {
            const today = new Date();

            // Check if interest was already accrued today
            if (
              loan.lastInterestAccrualDate &&
              isSameDay(new Date(loan.lastInterestAccrualDate), today)
            ) {
              logger.info(
                `Skipping loan ${loan.loanNumber} - interest already accrued today`
              );
              skippedCount++;
              continue;
            }

            // Accrue interest
            const accrual = await accrueInterest(loan.id, today);

            if (accrual) {
              successCount++;
              logger.info(
                `✓ Interest accrued for loan ${loan.loanNumber}: ${accrual.interestAmount} (${accrual.daysAccrued} days)`
              );
            } else {
              skippedCount++;
              logger.info(`⊘ No interest to accrue for loan ${loan.loanNumber}`);
            }
          } catch (error: any) {
            errorCount++;
            const errorMessage = error.message || 'Unknown error';
            errors.push({
              loanNumber: loan.loanNumber,
              error: errorMessage,
            });
            logger.error(`✗ Failed to accrue interest for loan ${loan.loanNumber}:`, {
              error: errorMessage,
              loanId: loan.id,
            });
          }
        }

        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        // Summary log
        logger.info('✓ Interest accrual job completed', {
          duration: `${duration}ms`,
          totalLoans: activeLoans.length,
          successful: successCount,
          skipped: skippedCount,
          errors: errorCount,
          errorDetails: errors.length > 0 ? errors : undefined,
        });

        // Alert if there were errors
        if (errorCount > 0) {
          logger.error('⚠️  Interest accrual job had errors!', {
            errorCount,
            errors,
          });
          // TODO: Send email/SMS alert to admins
        }
      } catch (error: any) {
        logger.error('✗ Interest accrual job failed catastrophically:', {
          error: error.message,
          stack: error.stack,
        });
        // TODO: Send critical alert to admins
      }
    },
    {
      scheduled: true,
      timezone: process.env.TZ || 'America/New_York', // Use server timezone or default
    }
  );

  logger.info('✓ Interest accrual cron job scheduled', {
    schedule: 'Daily at 00:01 AM',
    timezone: process.env.TZ || 'America/New_York',
    nextRun: getNextRunTime(),
  });
}

/**
 * Check if two dates are the same day (ignoring time)
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get next scheduled run time for logging
 */
function getNextRunTime(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 1, 0, 0); // 00:01 AM
  return tomorrow.toISOString();
}

/**
 * Manual trigger for interest accrual (for testing or manual runs)
 */
export async function triggerManualInterestAccrual() {
  logger.info('🔧 Manual interest accrual triggered');

  try {
    const activeLoans = await prisma.loan.findMany({
      where: {
        status: 'ACTIVE',
      },
    });

    let successCount = 0;
    let errorCount = 0;

    for (const loan of activeLoans) {
      try {
        await accrueInterest(loan.id, new Date());
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`Failed to accrue interest for loan ${loan.loanNumber}:`, error);
      }
    }

    logger.info(
      `Manual interest accrual completed: ${successCount} successful, ${errorCount} errors`
    );

    return {
      success: true,
      totalLoans: activeLoans.length,
      successful: successCount,
      errors: errorCount,
    };
  } catch (error) {
    logger.error('Manual interest accrual failed:', error);
    throw error;
  }
}
