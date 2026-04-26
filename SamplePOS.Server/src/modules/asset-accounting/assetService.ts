/**
 * Asset Accounting Service
 * 
 * Fixed asset management with automated depreciation.
 * 
 * Supported Methods:
 *   - STRAIGHT_LINE: (Cost - Salvage) / Useful Life
 *   - DECLINING_BALANCE: Net Book Value × Rate
 * 
 * Lifecycle:
 *   1. Acquire asset → DR Fixed Assets (1500), CR Cash/AP
 *   2. Monthly depreciation → DR Depreciation Expense (6500), CR Accumulated Depreciation (1550)
 *   3. Dispose asset → DR Cash/Accum Depr, CR Fixed Asset, and gain/loss to P&L
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
import { getBusinessYear } from '../../utils/dateRange.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  usefulLifeMonths: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  depreciationRate: number | null;
  assetAccountCode: string;
  depreciationAccountCode: string;
  accumDepreciationAccountCode: string;
  isActive: boolean;
}

export interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  description: string | null;
  categoryId: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  depreciationStartDate: string;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF';
  disposedDate: string | null;
  disposalAmount: number | null;
  costCenterId: string | null;
  location: string | null;
  serialNumber: string | null;
  createdAt: string;
}

export interface DepreciationEntry {
  id: string;
  assetId: string;
  periodYear: number;
  periodMonth: number;
  depreciationAmount: number;
  accumulatedTotal: number;
  netBookValue: number;
  glTransactionId: string | null;
  postedAt: string | null;
}

// =============================================================================
// ASSET CATEGORIES
// =============================================================================

export const getAssetCategories = async (pool?: pg.Pool): Promise<AssetCategory[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM asset_categories WHERE is_active = true ORDER BY code`
  );
  return result.rows.map(normalizeCategory);
};

export const createAssetCategory = async (
  data: Omit<AssetCategory, 'id' | 'isActive'>,
  pool?: pg.Pool
): Promise<AssetCategory> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `INSERT INTO asset_categories (id, code, name, useful_life_months, depreciation_method, depreciation_rate, asset_account_code, depreciation_account_code, accum_depreciation_account_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [uuidv4(), data.code, data.name, data.usefulLifeMonths, data.depreciationMethod,
    data.depreciationRate || null, data.assetAccountCode, data.depreciationAccountCode, data.accumDepreciationAccountCode]
  );
  return normalizeCategory(result.rows[0]);
};

// =============================================================================
// FIXED ASSETS
// =============================================================================

export const getFixedAssets = async (
  filters: { status?: string; categoryId?: string; page: number; limit: number },
  pool?: pg.Pool
): Promise<{ data: FixedAsset[]; total: number }> => {
  const dbPool = pool || globalPool;
  let query = `SELECT * FROM fixed_assets WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) { query += ` AND status = $${idx++}`; params.push(filters.status); }
  if (filters.categoryId) { query += ` AND category_id = $${idx++}`; params.push(filters.categoryId); }

  const countResult = await dbPool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
  const total = parseInt(countResult.rows[0].total);

  query += ` ORDER BY asset_number ASC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(filters.limit, (filters.page - 1) * filters.limit);

  const result = await dbPool.query(query, params);
  return { data: result.rows.map(normalizeAsset), total };
};

export const getFixedAssetById = async (id: string, pool?: pg.Pool): Promise<FixedAsset> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(`SELECT * FROM fixed_assets WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw new NotFoundError('Fixed asset');
  return normalizeAsset(result.rows[0]);
};

/**
 * Acquire (create) a new fixed asset and post the acquisition to GL.
 */
export const acquireAsset = async (
  data: {
    name: string;
    description?: string;
    categoryId: string;
    acquisitionDate: string;
    acquisitionCost: number;
    salvageValue?: number;
    usefulLifeMonths?: number;
    depreciationMethod?: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
    depreciationStartDate?: string;
    costCenterId?: string;
    location?: string;
    serialNumber?: string;
    paymentMethod: 'CASH' | 'AP';
    userId: string;
  },
  pool?: pg.Pool
): Promise<FixedAsset> => {
  const dbPool = pool || globalPool;

  // Get category defaults
  const catResult = await dbPool.query(`SELECT * FROM asset_categories WHERE id = $1`, [data.categoryId]);
  if (catResult.rows.length === 0) throw new NotFoundError('Asset category');
  const category = normalizeCategory(catResult.rows[0]);

  const usefulLife = data.usefulLifeMonths || category.usefulLifeMonths;
  const method = data.depreciationMethod || category.depreciationMethod;
  const salvage = data.salvageValue || 0;
  const nbv = data.acquisitionCost; // Initial NBV = acquisition cost

  return UnitOfWork.run(dbPool, async (client) => {
    // Generate asset number
    const numResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(asset_number FROM 9) AS INTEGER)), 0) + 1 as next_num
       FROM fixed_assets WHERE asset_number LIKE 'FA-____-%'`
    );
    const year = getBusinessYear();
    const nextNum = parseInt(numResult.rows[0].next_num);
    const assetNumber = `FA-${year}-${String(nextNum).padStart(4, '0')}`;

    // Create asset record
    const result = await client.query(
      `INSERT INTO fixed_assets (id, asset_number, name, description, category_id, acquisition_date, acquisition_cost,
       salvage_value, useful_life_months, depreciation_method, depreciation_start_date,
       accumulated_depreciation, net_book_value, status, cost_center_id, location, serial_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, 'ACTIVE', $13, $14, $15, $16)
       RETURNING *`,
      [uuidv4(), assetNumber, data.name, data.description || null, data.categoryId,
      data.acquisitionDate, data.acquisitionCost, salvage, usefulLife, method,
      data.depreciationStartDate || data.acquisitionDate,
        nbv, data.costCenterId || null, data.location || null, data.serialNumber || null, data.userId]
    );

    // GL: DR Fixed Assets, CR Cash or AP
    const creditAccount = data.paymentMethod === 'CASH' ? AccountCodes.CASH : AccountCodes.ACCOUNTS_PAYABLE;
    const lines: JournalLine[] = [
      {
        accountCode: category.assetAccountCode,
        description: `Asset acquisition: ${data.name} (${assetNumber})`,
        debitAmount: data.acquisitionCost,
        creditAmount: 0,
        entityType: 'FIXED_ASSET',
        entityId: result.rows[0].id,
      },
      {
        accountCode: creditAccount,
        description: `Payment for asset: ${assetNumber}`,
        debitAmount: 0,
        creditAmount: data.acquisitionCost,
        entityType: 'FIXED_ASSET',
        entityId: result.rows[0].id,
      },
    ];

    await AccountingCore.createJournalEntry({
      entryDate: data.acquisitionDate,
      description: `Asset acquisition: ${data.name} (${assetNumber})`,
      referenceType: 'ASSET_ACQUISITION',
      referenceId: result.rows[0].id,
      referenceNumber: assetNumber,
      lines,
      userId: data.userId,
      idempotencyKey: `ASSET-ACQ-${result.rows[0].id}`,
      // CASH method credits cash directly (EXPENSE_PAYMENT passes Rule D).
      // AP method creates a payable (PURCHASE_BILL is the correct AP source).
      source: data.paymentMethod === 'CASH' ? 'EXPENSE_PAYMENT' : 'PURCHASE_BILL',
    }, undefined, client);

    logger.info('Fixed asset acquired', { assetNumber, cost: data.acquisitionCost });
    return normalizeAsset(result.rows[0]);
  });
};

// =============================================================================
// DEPRECIATION
// =============================================================================

/**
 * Calculate monthly depreciation for a single asset.
 */
export const calculateMonthlyDepreciation = (asset: FixedAsset): number => {
  if (asset.status !== 'ACTIVE') return 0;
  if (asset.netBookValue <= asset.salvageValue) return 0;

  if (asset.depreciationMethod === 'STRAIGHT_LINE') {
    const depreciableAmount = Money.toNumber(Money.subtract(asset.acquisitionCost, asset.salvageValue));
    return Money.toNumber(Money.divide(depreciableAmount, asset.usefulLifeMonths));
  }

  // DECLINING_BALANCE
  const monthlyRate = 2 / asset.usefulLifeMonths; // Double-declining
  let amount = Money.toNumber(Money.multiply(asset.netBookValue, monthlyRate));
  // Don't depreciate below salvage value
  const maxAmount = Money.toNumber(Money.subtract(asset.netBookValue, asset.salvageValue));
  if (amount > maxAmount) amount = maxAmount;
  return Math.max(0, amount);
};

/**
 * Run monthly depreciation for ALL active assets.
 * Posts GL entries for each asset.
 */
export const runMonthlyDepreciation = async (
  year: number,
  month: number,
  userId: string,
  pool?: pg.Pool
): Promise<{ processed: number; totalDepreciation: number; entries: DepreciationEntry[] }> => {
  const dbPool = pool || globalPool;

  // Get all active assets
  const assetResult = await dbPool.query(
    `SELECT fa.*, ac.depreciation_account_code, ac.accum_depreciation_account_code
     FROM fixed_assets fa
     JOIN asset_categories ac ON fa.category_id = ac.id
     WHERE fa.status = 'ACTIVE'
       AND fa.net_book_value > fa.salvage_value
       AND fa.depreciation_start_date <= $1`,
    [`${year}-${String(month).padStart(2, '0')}-28`] // Last possible day
  );

  const entries: DepreciationEntry[] = [];
  let totalDepreciation = 0;

  return UnitOfWork.run(dbPool, async (client) => {
    for (const row of assetResult.rows) {
      const asset = normalizeAsset(row);
      const deprAmount = calculateMonthlyDepreciation(asset);
      if (deprAmount <= 0) continue;

      const newAccumulated = Money.toNumber(Money.add(asset.accumulatedDepreciation, deprAmount));
      const newNbv = Money.toNumber(Money.subtract(asset.acquisitionCost, newAccumulated));

      // Check for duplicate
      const existing = await client.query(
        `SELECT id FROM depreciation_entries WHERE asset_id = $1 AND period_year = $2 AND period_month = $3`,
        [asset.id, year, month]
      );
      if (existing.rows.length > 0) continue; // Already processed

      // Post GL: DR Depreciation Expense, CR Accumulated Depreciation
      const deprAccountCode = row.depreciation_account_code || AccountCodes.DEPRECIATION;
      const accumAccountCode = row.accum_depreciation_account_code || '1550';

      const lines: JournalLine[] = [
        {
          accountCode: deprAccountCode,
          description: `Depreciation - ${asset.name} (${asset.assetNumber}) - ${year}/${month}`,
          debitAmount: deprAmount,
          creditAmount: 0,
          entityType: 'FIXED_ASSET',
          entityId: asset.id,
        },
        {
          accountCode: accumAccountCode,
          description: `Accumulated depreciation - ${asset.assetNumber}`,
          debitAmount: 0,
          creditAmount: deprAmount,
          entityType: 'FIXED_ASSET',
          entityId: asset.id,
        },
      ];

      const glResult = await AccountingCore.createJournalEntry({
        entryDate: `${year}-${String(month).padStart(2, '0')}-28`,
        description: `Monthly depreciation - ${asset.assetNumber} - ${year}/${String(month).padStart(2, '0')}`,
        referenceType: 'DEPRECIATION',
        referenceId: asset.id,
        referenceNumber: `DEPR-${asset.assetNumber}-${year}${String(month).padStart(2, '0')}`,
        lines,
        userId,
        idempotencyKey: `DEPR-${asset.id}-${year}-${month}`,
        source: 'ASSET_DEPRECIATION' as const,
      }, undefined, client);

      // Record depreciation entry
      const entryId = uuidv4();
      await client.query(
        `INSERT INTO depreciation_entries (id, asset_id, period_year, period_month, depreciation_amount, accumulated_total, net_book_value, gl_transaction_id, posted_at, posted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
        [entryId, asset.id, year, month, deprAmount, newAccumulated, newNbv, glResult.transactionId, userId]
      );

      // Update asset record
      await client.query(
        `UPDATE fixed_assets SET accumulated_depreciation = $1, net_book_value = $2, updated_at = NOW() WHERE id = $3`,
        [newAccumulated, newNbv, asset.id]
      );

      entries.push({
        id: entryId,
        assetId: asset.id,
        periodYear: year,
        periodMonth: month,
        depreciationAmount: deprAmount,
        accumulatedTotal: newAccumulated,
        netBookValue: newNbv,
        glTransactionId: glResult.transactionId,
        postedAt: new Date().toISOString(),
      });

      totalDepreciation = Money.toNumber(Money.add(totalDepreciation, deprAmount));
    }

    logger.info('Monthly depreciation run completed', { year, month, processed: entries.length, total: totalDepreciation });
    return { processed: entries.length, totalDepreciation, entries };
  });
};

/**
 * Dispose of a fixed asset.
 * GL: DR Cash (proceeds) + DR Accum Depr, CR Fixed Asset, +/- Gain/Loss
 */
export const disposeAsset = async (
  data: {
    assetId: string;
    disposalDate: string;
    disposalAmount: number;
    userId: string;
  },
  pool?: pg.Pool
): Promise<FixedAsset> => {
  const dbPool = pool || globalPool;
  const asset = await getFixedAssetById(data.assetId, dbPool);

  if (asset.status !== 'ACTIVE') {
    throw new ValidationError(`Asset is already ${asset.status}`);
  }

  const catResult = await dbPool.query(`SELECT * FROM asset_categories WHERE id = $1`, [asset.categoryId]);
  const category = normalizeCategory(catResult.rows[0]);

  const gainLoss = Money.toNumber(
    Money.subtract(
      Money.add(data.disposalAmount, asset.accumulatedDepreciation),
      asset.acquisitionCost
    )
  );

  return UnitOfWork.run(dbPool, async (client) => {
    const lines: JournalLine[] = [];

    // DR Cash (proceeds)
    if (data.disposalAmount > 0) {
      lines.push({
        accountCode: AccountCodes.CASH,
        description: `Disposal proceeds - ${asset.assetNumber}`,
        debitAmount: data.disposalAmount,
        creditAmount: 0,
        entityType: 'FIXED_ASSET',
        entityId: asset.id,
      });
    }

    // DR Accumulated Depreciation (remove contra)
    if (asset.accumulatedDepreciation > 0) {
      lines.push({
        accountCode: category.accumDepreciationAccountCode,
        description: `Remove accumulated depreciation - ${asset.assetNumber}`,
        debitAmount: asset.accumulatedDepreciation,
        creditAmount: 0,
        entityType: 'FIXED_ASSET',
        entityId: asset.id,
      });
    }

    // CR Fixed Asset (remove asset)
    lines.push({
      accountCode: category.assetAccountCode,
      description: `Dispose asset - ${asset.assetNumber}`,
      debitAmount: 0,
      creditAmount: asset.acquisitionCost,
      entityType: 'FIXED_ASSET',
      entityId: asset.id,
    });

    // Gain or Loss
    if (gainLoss > 0) {
      lines.push({
        accountCode: AccountCodes.OTHER_INCOME,
        description: `Gain on disposal - ${asset.assetNumber}`,
        debitAmount: 0,
        creditAmount: gainLoss,
        entityType: 'FIXED_ASSET',
        entityId: asset.id,
      });
    } else if (gainLoss < 0) {
      lines.push({
        accountCode: AccountCodes.GENERAL_EXPENSE,
        description: `Loss on disposal - ${asset.assetNumber}`,
        debitAmount: Math.abs(gainLoss),
        creditAmount: 0,
        entityType: 'FIXED_ASSET',
        entityId: asset.id,
      });
    }

    const glResult = await AccountingCore.createJournalEntry({
      entryDate: data.disposalDate,
      description: `Asset disposal: ${asset.name} (${asset.assetNumber})`,
      referenceType: 'ASSET_DISPOSAL',
      referenceId: asset.id,
      referenceNumber: `DISP-${asset.assetNumber}`,
      lines,
      userId: data.userId,
      idempotencyKey: `ASSET-DISP-${asset.id}`,
      // EXPENSE_PAYMENT allows debiting/crediting cash and is unrestricted on asset/income accounts.
      source: 'EXPENSE_PAYMENT',
    }, undefined, client);

    // Update asset record
    const updateResult = await client.query(
      `UPDATE fixed_assets SET status = 'DISPOSED', disposed_date = $1, disposal_amount = $2,
       disposal_gl_transaction_id = $3, net_book_value = 0, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [data.disposalDate, data.disposalAmount, glResult.transactionId, asset.id]
    );

    logger.info('Asset disposed', { assetNumber: asset.assetNumber, proceeds: data.disposalAmount, gainLoss });
    return normalizeAsset(updateResult.rows[0]);
  });
};

/**
 * Get depreciation schedule for an asset
 */
export const getDepreciationSchedule = async (
  assetId: string,
  pool?: pg.Pool
): Promise<DepreciationEntry[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM depreciation_entries WHERE asset_id = $1 ORDER BY period_year, period_month`,
    [assetId]
  );
  return result.rows.map(r => ({
    id: r.id,
    assetId: r.asset_id,
    periodYear: r.period_year,
    periodMonth: r.period_month,
    depreciationAmount: Number(r.depreciation_amount),
    accumulatedTotal: Number(r.accumulated_total),
    netBookValue: Number(r.net_book_value),
    glTransactionId: r.gl_transaction_id,
    postedAt: r.posted_at,
  }));
};

/**
 * Get asset register summary
 */
export const getAssetRegisterSummary = async (pool?: pg.Pool): Promise<{
  totalAssets: number;
  totalAcquisitionCost: number;
  totalAccumulatedDepreciation: number;
  totalNetBookValue: number;
  byCategory: { categoryName: string; count: number; cost: number; nbv: number }[];
}> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT
       ac.name as category_name,
       COUNT(*) as count,
       SUM(fa.acquisition_cost) as total_cost,
       SUM(fa.accumulated_depreciation) as total_accum,
       SUM(fa.net_book_value) as total_nbv
     FROM fixed_assets fa
     JOIN asset_categories ac ON fa.category_id = ac.id
     WHERE fa.status = 'ACTIVE'
     GROUP BY ac.name
     ORDER BY ac.name`
  );

  const byCategory = result.rows.map(r => ({
    categoryName: r.category_name,
    count: parseInt(r.count),
    cost: Number(r.total_cost),
    nbv: Number(r.total_nbv),
  }));

  return {
    totalAssets: byCategory.reduce((s, c) => s + c.count, 0),
    totalAcquisitionCost: byCategory.reduce((s, c) => s + c.cost, 0),
    totalAccumulatedDepreciation: Number(result.rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_accum), 0)),
    totalNetBookValue: byCategory.reduce((s, c) => s + c.nbv, 0),
    byCategory,
  };
};

// =============================================================================
// NORMALIZERS
// =============================================================================

function normalizeCategory(row: Record<string, unknown>): AssetCategory {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    usefulLifeMonths: row.useful_life_months as number,
    depreciationMethod: row.depreciation_method as AssetCategory['depreciationMethod'],
    depreciationRate: row.depreciation_rate != null ? Number(row.depreciation_rate) : null,
    assetAccountCode: row.asset_account_code as string,
    depreciationAccountCode: row.depreciation_account_code as string,
    accumDepreciationAccountCode: row.accum_depreciation_account_code as string,
    isActive: row.is_active as boolean,
  };
}

function normalizeAsset(row: Record<string, unknown>): FixedAsset {
  return {
    id: row.id as string,
    assetNumber: row.asset_number as string,
    name: row.name as string,
    description: row.description as string | null,
    categoryId: row.category_id as string,
    acquisitionDate: row.acquisition_date as string,
    acquisitionCost: Number(row.acquisition_cost),
    salvageValue: Number(row.salvage_value),
    usefulLifeMonths: row.useful_life_months as number,
    depreciationMethod: row.depreciation_method as FixedAsset['depreciationMethod'],
    depreciationStartDate: row.depreciation_start_date as string,
    accumulatedDepreciation: Number(row.accumulated_depreciation),
    netBookValue: Number(row.net_book_value),
    status: row.status as FixedAsset['status'],
    disposedDate: row.disposed_date as string | null,
    disposalAmount: row.disposal_amount != null ? Number(row.disposal_amount) : null,
    costCenterId: row.cost_center_id as string | null,
    location: row.location as string | null,
    serialNumber: row.serial_number as string | null,
    createdAt: row.created_at as string,
  };
}
