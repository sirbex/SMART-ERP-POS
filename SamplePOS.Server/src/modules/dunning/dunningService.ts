/**
 * Dunning / Collections Service
 * 
 * SAP-style dunning process for overdue customer receivables.
 * 
 * Dunning Levels:
 *   Level 1 (30 days) — Friendly reminder, no fee
 *   Level 2 (60 days) — First notice, small fee
 *   Level 3 (90 days) — Final warning, interest charges, credit block warning
 *   Level 4 (120 days) — Legal notice, credit blocked, high interest
 * 
 * Process:
 *   1. Dunning run analyzes all overdue AR per customer
 *   2. Determines appropriate dunning level based on days overdue
 *   3. Calculates fees and interest charges
 *   4. Creates dunning history records
 *   5. Optionally posts fee/interest to GL
 *   6. Can block further credit sales for severely overdue customers
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface DunningLevel {
  id: string;
  levelNumber: number;
  name: string;
  daysOverdue: number;
  feeAmount: number;
  feePercentage: number;
  interestRate: number;
  letterTemplate: string | null;
  blockFurtherCredit: boolean;
  isActive: boolean;
}

export interface DunningProposal {
  customerId: string;
  customerName: string;
  currentLevel: number;
  proposedLevel: number;
  totalOverdue: number;
  oldestInvoiceDate: string;
  daysOverdue: number;
  proposedFee: number;
  proposedInterest: number;
  overdueItems: OverdueItem[];
  shouldBlockCredit: boolean;
}

export interface OverdueItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  daysOverdue: number;
}

export interface DunningRunResult {
  runDate: string;
  totalCustomers: number;
  totalOverdueAmount: number;
  totalFeesCharged: number;
  totalInterestCharged: number;
  customersBlocked: number;
  proposals: DunningProposal[];
}

export interface DunningHistoryRecord {
  id: string;
  customerId: string;
  dunningLevelId: string;
  dunningDate: string;
  totalOverdue: number;
  feeCharged: number;
  interestCharged: number;
  letterSent: boolean;
  notes: string | null;
  createdAt: string;
}

// =============================================================================
// DUNNING LEVELS MANAGEMENT
// =============================================================================

export const getDunningLevels = async (pool?: pg.Pool): Promise<DunningLevel[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM dunning_levels WHERE is_active = true ORDER BY level_number`
  );
  return result.rows.map(normalizeDunningLevel);
};

export const createDunningLevel = async (
  data: Omit<DunningLevel, 'id' | 'isActive'>,
  pool?: pg.Pool
): Promise<DunningLevel> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `INSERT INTO dunning_levels (id, level_number, name, days_overdue, fee_amount, fee_percentage, interest_rate, letter_template, block_further_credit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [uuidv4(), data.levelNumber, data.name, data.daysOverdue, data.feeAmount, data.feePercentage, data.interestRate, data.letterTemplate, data.blockFurtherCredit]
  );
  return normalizeDunningLevel(result.rows[0]);
};

export const updateDunningLevel = async (
  id: string,
  data: Partial<Omit<DunningLevel, 'id'>>,
  pool?: pg.Pool
): Promise<DunningLevel> => {
  const dbPool = pool || globalPool;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.daysOverdue !== undefined) { sets.push(`days_overdue = $${idx++}`); params.push(data.daysOverdue); }
  if (data.feeAmount !== undefined) { sets.push(`fee_amount = $${idx++}`); params.push(data.feeAmount); }
  if (data.feePercentage !== undefined) { sets.push(`fee_percentage = $${idx++}`); params.push(data.feePercentage); }
  if (data.interestRate !== undefined) { sets.push(`interest_rate = $${idx++}`); params.push(data.interestRate); }
  if (data.letterTemplate !== undefined) { sets.push(`letter_template = $${idx++}`); params.push(data.letterTemplate); }
  if (data.blockFurtherCredit !== undefined) { sets.push(`block_further_credit = $${idx++}`); params.push(data.blockFurtherCredit); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }

  if (sets.length === 0) {
    const existing = await dbPool.query(`SELECT * FROM dunning_levels WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Dunning level');
    return normalizeDunningLevel(existing.rows[0]);
  }

  params.push(id);
  const result = await dbPool.query(
    `UPDATE dunning_levels SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) throw new NotFoundError('Dunning level');
  return normalizeDunningLevel(result.rows[0]);
};

// =============================================================================
// DUNNING RUN — Analyze overdue receivables
// =============================================================================

/**
 * Analyze all overdue customer receivables and propose dunning actions.
 * Does NOT execute — returns proposals for review.
 */
export const analyzeDunningRun = async (
  asOfDate: string,
  pool?: pg.Pool
): Promise<DunningRunResult> => {
  const dbPool = pool || globalPool;

  // Get active dunning levels
  const levels = await getDunningLevels(dbPool);
  if (levels.length === 0) {
    throw new ValidationError('No dunning levels configured. Create dunning levels first.');
  }

  // Find all overdue invoices (credit sales with outstanding balance)
  // invoices table uses PascalCase columns; customers table uses snake_case
  const overdueResult = await dbPool.query(
    `SELECT 
       i."Id" as invoice_id,
       i."InvoiceNumber" as invoice_number,
       i."InvoiceDate" as invoice_date,
       i."DueDate" as due_date,
       i."TotalAmount" as amount,
       COALESCE(i."AmountPaid", 0) as amount_paid,
       i."TotalAmount" - COALESCE(i."AmountPaid", 0) as amount_due,
       ($1::DATE - i."DueDate"::DATE) as days_overdue,
       i."CustomerId" as customer_id,
       c.name as customer_name,
       COALESCE(c.current_dunning_level, 0) as current_dunning_level
     FROM invoices i
     JOIN customers c ON i."CustomerId" = c.id
     WHERE i."Status" IN ('Unpaid', 'PartiallyPaid', 'Overdue')
       AND i."DueDate" < $1
       AND i."TotalAmount" > COALESCE(i."AmountPaid", 0)
     ORDER BY i."CustomerId", i."DueDate"`,
    [asOfDate]
  );

  // Group by customer
  const customerMap = new Map<string, {
    customerId: string;
    customerName: string;
    currentLevel: number;
    items: OverdueItem[];
  }>();

  for (const row of overdueResult.rows) {
    const customerId = row.customer_id;
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerName: row.customer_name,
        currentLevel: row.current_dunning_level,
        items: [],
      });
    }
    customerMap.get(customerId)!.items.push({
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      amount: Number(row.amount),
      amountPaid: Number(row.amount_paid),
      amountDue: Number(row.amount_due),
      daysOverdue: parseInt(row.days_overdue),
    });
  }

  // Build proposals
  const proposals: DunningProposal[] = [];
  let totalOverdueAmount = 0;
  let totalFeesCharged = 0;
  let totalInterestCharged = 0;
  let customersBlocked = 0;

  for (const [, customer] of customerMap) {
    const maxDaysOverdue = Math.max(...customer.items.map(i => i.daysOverdue));
    const totalOverdue = customer.items.reduce((sum, i) => sum + i.amountDue, 0);

    // Determine dunning level
    let proposedLevel = levels[0];
    for (const level of levels) {
      if (maxDaysOverdue >= level.daysOverdue) {
        proposedLevel = level;
      }
    }

    // Calculate fees
    const feeFixed = proposedLevel.feeAmount;
    const feePercent = Money.toNumber(Money.multiply(totalOverdue, proposedLevel.feePercentage / 100));
    const proposedFee = Math.max(feeFixed, feePercent);

    // Calculate interest (annualized, pro-rated for days)
    const proposedInterest = Money.toNumber(
      Money.multiply(
        Money.multiply(totalOverdue, proposedLevel.interestRate),
        maxDaysOverdue / 365
      )
    );

    totalOverdueAmount += totalOverdue;
    totalFeesCharged += proposedFee;
    totalInterestCharged += proposedInterest;
    if (proposedLevel.blockFurtherCredit) customersBlocked++;

    proposals.push({
      customerId: customer.customerId,
      customerName: customer.customerName,
      currentLevel: customer.currentLevel,
      proposedLevel: proposedLevel.levelNumber,
      totalOverdue,
      oldestInvoiceDate: customer.items[0].dueDate,
      daysOverdue: maxDaysOverdue,
      proposedFee,
      proposedInterest,
      overdueItems: customer.items,
      shouldBlockCredit: proposedLevel.blockFurtherCredit,
    });
  }

  return {
    runDate: asOfDate,
    totalCustomers: proposals.length,
    totalOverdueAmount,
    totalFeesCharged,
    totalInterestCharged,
    customersBlocked,
    proposals,
  };
};

/**
 * Execute a dunning run — creates history records, posts fees/interest to GL,
 * and optionally blocks credit for severely overdue customers.
 */
export const executeDunningRun = async (
  proposals: DunningProposal[],
  date: string,
  userId: string,
  pool?: pg.Pool
): Promise<{ processed: number; feesPosted: number; creditBlocked: number }> => {
  const dbPool = pool || globalPool;

  const levels = await getDunningLevels(dbPool);
  const levelMap = new Map(levels.map(l => [l.levelNumber, l]));

  let processed = 0;
  let feesPosted = 0;
  let creditBlocked = 0;

  return UnitOfWork.run(dbPool, async (client) => {
    for (const proposal of proposals) {
      const level = levelMap.get(proposal.proposedLevel);
      if (!level) continue;

      // Create dunning history
      await client.query(
        `INSERT INTO dunning_history (id, customer_id, dunning_level_id, dunning_date, total_overdue, fee_charged, interest_charged, items, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(), proposal.customerId, level.id, date,
          proposal.totalOverdue, proposal.proposedFee, proposal.proposedInterest,
          JSON.stringify(proposal.overdueItems), userId,
        ]
      );

      // Update customer dunning level
      await client.query(
        `UPDATE customers SET current_dunning_level = $1, last_dunning_date = $2,
         credit_blocked = CASE WHEN $3 = true THEN true ELSE credit_blocked END
         WHERE id = $4`,
        [proposal.proposedLevel, date, proposal.shouldBlockCredit, proposal.customerId]
      );

      // Post fees/interest to GL if any
      const totalCharge = Money.toNumber(Money.add(proposal.proposedFee, proposal.proposedInterest));
      if (totalCharge > 0) {
        const lines: JournalLine[] = [
          {
            accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
            description: `Dunning charges for ${proposal.customerName} - Level ${proposal.proposedLevel}`,
            debitAmount: totalCharge,
            creditAmount: 0,
            entityType: 'CUSTOMER',
            entityId: proposal.customerId,
          },
          {
            accountCode: AccountCodes.OTHER_INCOME,
            description: `Dunning fee/interest income - ${proposal.customerName}`,
            debitAmount: 0,
            creditAmount: totalCharge,
            entityType: 'CUSTOMER',
            entityId: proposal.customerId,
          },
        ];

        await AccountingCore.createJournalEntry({
          entryDate: date,
          description: `Dunning charges - ${proposal.customerName} - Level ${proposal.proposedLevel}`,
          referenceType: 'DUNNING',
          referenceId: proposal.customerId,
          referenceNumber: `DUN-${proposal.customerId.slice(0, 8)}-${date}`,
          lines,
          userId,
          idempotencyKey: `DUNNING-${proposal.customerId}-${date}`,
        }, undefined, client);

        feesPosted++;
      }

      if (proposal.shouldBlockCredit) creditBlocked++;
      processed++;
    }

    logger.info('Dunning run executed', { processed, feesPosted, creditBlocked });
    return { processed, feesPosted, creditBlocked };
  });
};

// =============================================================================
// DUNNING HISTORY
// =============================================================================

export const getCustomerDunningHistory = async (
  customerId: string,
  pool?: pg.Pool
): Promise<DunningHistoryRecord[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM dunning_history WHERE customer_id = $1 ORDER BY dunning_date DESC`,
    [customerId]
  );
  return result.rows.map(r => ({
    id: r.id,
    customerId: r.customer_id,
    dunningLevelId: r.dunning_level_id,
    dunningDate: r.dunning_date,
    totalOverdue: Number(r.total_overdue),
    feeCharged: Number(r.fee_charged),
    interestCharged: Number(r.interest_charged),
    letterSent: r.letter_sent,
    notes: r.notes,
    createdAt: r.created_at,
  }));
};

// =============================================================================
// NORMALIZER
// =============================================================================

function normalizeDunningLevel(row: Record<string, unknown>): DunningLevel {
  return {
    id: row.id as string,
    levelNumber: row.level_number as number,
    name: row.name as string,
    daysOverdue: row.days_overdue as number,
    feeAmount: Number(row.fee_amount),
    feePercentage: Number(row.fee_percentage),
    interestRate: Number(row.interest_rate),
    letterTemplate: row.letter_template as string | null,
    blockFurtherCredit: row.block_further_credit as boolean,
    isActive: row.is_active as boolean,
  };
}
