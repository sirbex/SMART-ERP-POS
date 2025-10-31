import Decimal from 'decimal.js';
import prisma from '../../config/database.js';

/**
 * Financial Reporting Service
 * Generates Profit & Loss and Balance Sheet reports with bank-grade precision
 */

// Configure Decimal.js for bank-grade precision
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface ProfitAndLossReport {
  period: {
    startDate: Date;
    endDate: Date;
    periodName: string;
  };
  revenue: {
    total: string;
    accounts: AccountSummary[];
  };
  costOfGoodsSold: {
    total: string;
    accounts: AccountSummary[];
  };
  grossProfit: string;
  grossProfitMargin: string;
  operatingExpenses: {
    total: string;
    accounts: AccountSummary[];
  };
  operatingIncome: string;
  operatingMargin: string;
  otherIncome: {
    total: string;
    accounts: AccountSummary[];
  };
  otherExpenses: {
    total: string;
    accounts: AccountSummary[];
  };
  netIncome: string;
  netProfitMargin: string;
}

export interface BalanceSheetReport {
  asOfDate: Date;
  assets: {
    currentAssets: {
      total: string;
      accounts: AccountSummary[];
    };
    fixedAssets: {
      total: string;
      accounts: AccountSummary[];
    };
    totalAssets: string;
  };
  liabilities: {
    currentLiabilities: {
      total: string;
      accounts: AccountSummary[];
    };
    longTermLiabilities: {
      total: string;
      accounts: AccountSummary[];
    };
    totalLiabilities: string;
  };
  equity: {
    total: string;
    accounts: AccountSummary[];
  };
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
}

export interface AccountSummary {
  accountId: string;
  accountName: string;
  balance: string;
  percentage?: string;
}

/**
 * Generate Profit & Loss Statement
 * Formula: Revenue - COGS = Gross Profit
 *          Gross Profit - Operating Expenses = Operating Income
 *          Operating Income + Other Income - Other Expenses = Net Income
 */
export async function generateProfitAndLoss(
  startDate: Date,
  endDate: Date,
  comparisonPeriod?: { startDate: Date; endDate: Date }
): Promise<ProfitAndLossReport> {
  // Get all ledger entries within the period
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      account: true,
      transaction: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Categorize accounts and calculate totals
  const revenueAccounts = new Map<string, { name: string; balance: Decimal }>();
  const cogsAccounts = new Map<string, { name: string; balance: Decimal }>();
  const expenseAccounts = new Map<string, { name: string; balance: Decimal }>();
  const otherIncomeAccounts = new Map<string, { name: string; balance: Decimal }>();
  const otherExpenseAccounts = new Map<string, { name: string; balance: Decimal }>();

  // Process each entry
  entries.forEach((entry: any) => {
    const account = entry.account;
    const amount = new Decimal(entry.amount.toString());
    const type = entry.type; // 'debit' or 'credit'
    const accountType = account.type; // 'income', 'expense', etc.

    // Determine the net effect on the account
    let netEffect = new Decimal(0);
    
    if (accountType === 'income') {
      // Income accounts: credits increase, debits decrease
      netEffect = type === 'credit' ? amount : amount.negated();
      
      // Categorize income (revenue vs other income based on account name)
      const accountName = account.name.toLowerCase();
      const targetMap = accountName.includes('other') || accountName.includes('interest') || accountName.includes('gain')
        ? otherIncomeAccounts
        : revenueAccounts;
      
      const existing = targetMap.get(account.id) || { name: account.name, balance: new Decimal(0) };
      targetMap.set(account.id, { name: account.name, balance: existing.balance.plus(netEffect) });
    } 
    else if (accountType === 'expense') {
      // Expense accounts: debits increase, credits decrease
      netEffect = type === 'debit' ? amount : amount.negated();
      
      // Categorize expenses (COGS vs operating vs other)
      const accountName = account.name.toLowerCase();
      let targetMap = expenseAccounts;
      
      if (accountName.includes('cogs') || accountName.includes('cost of goods') || accountName.includes('cost of sales')) {
        targetMap = cogsAccounts;
      } else if (accountName.includes('other') || accountName.includes('interest expense') || accountName.includes('loss')) {
        targetMap = otherExpenseAccounts;
      }
      
      const existing = targetMap.get(account.id) || { name: account.name, balance: new Decimal(0) };
      targetMap.set(account.id, { name: account.name, balance: existing.balance.plus(netEffect) });
    }
  });

  // Calculate totals
  const totalRevenue = Array.from(revenueAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalCOGS = Array.from(cogsAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const grossProfit = totalRevenue.minus(totalCOGS);
  const grossProfitMargin = totalRevenue.greaterThan(0)
    ? grossProfit.dividedBy(totalRevenue).times(100)
    : new Decimal(0);

  const totalOperatingExpenses = Array.from(expenseAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const operatingIncome = grossProfit.minus(totalOperatingExpenses);
  const operatingMargin = totalRevenue.greaterThan(0)
    ? operatingIncome.dividedBy(totalRevenue).times(100)
    : new Decimal(0);

  const totalOtherIncome = Array.from(otherIncomeAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalOtherExpenses = Array.from(otherExpenseAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));

  const netIncome = operatingIncome.plus(totalOtherIncome).minus(totalOtherExpenses);
  const netProfitMargin = totalRevenue.greaterThan(0)
    ? netIncome.dividedBy(totalRevenue).times(100)
    : new Decimal(0);

  // Helper to convert Map to AccountSummary array
  const mapToSummary = (map: Map<string, { name: string; balance: Decimal }>, total: Decimal): AccountSummary[] => {
    return Array.from(map.entries()).map(([id, data]) => ({
      accountId: id,
      accountName: data.name,
      balance: data.balance.toFixed(2),
      percentage: total.greaterThan(0)
        ? data.balance.dividedBy(total).times(100).toFixed(2) + '%'
        : '0%',
    }));
  };

  return {
    period: {
      startDate,
      endDate,
      periodName: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
    },
    revenue: {
      total: totalRevenue.toFixed(2),
      accounts: mapToSummary(revenueAccounts, totalRevenue),
    },
    costOfGoodsSold: {
      total: totalCOGS.toFixed(2),
      accounts: mapToSummary(cogsAccounts, totalCOGS),
    },
    grossProfit: grossProfit.toFixed(2),
    grossProfitMargin: grossProfitMargin.toFixed(2) + '%',
    operatingExpenses: {
      total: totalOperatingExpenses.toFixed(2),
      accounts: mapToSummary(expenseAccounts, totalOperatingExpenses),
    },
    operatingIncome: operatingIncome.toFixed(2),
    operatingMargin: operatingMargin.toFixed(2) + '%',
    otherIncome: {
      total: totalOtherIncome.toFixed(2),
      accounts: mapToSummary(otherIncomeAccounts, totalOtherIncome),
    },
    otherExpenses: {
      total: totalOtherExpenses.toFixed(2),
      accounts: mapToSummary(otherExpenseAccounts, totalOtherExpenses),
    },
    netIncome: netIncome.toFixed(2),
    netProfitMargin: netProfitMargin.toFixed(2) + '%',
  };
}

/**
 * Generate Balance Sheet
 * Formula: Assets = Liabilities + Equity
 */
export async function generateBalanceSheet(asOfDate: Date): Promise<BalanceSheetReport> {
  // Get all accounts with their balances as of the specified date
  const accounts = await prisma.account.findMany({
    where: {
      isActive: true,
    },
    include: {
      ledgerEntries: {
        where: {
          transaction: {
            date: {
              lte: asOfDate,
            },
          },
        },
        include: {
          transaction: true,
        },
      },
    },
  });

  // Calculate balance for each account as of the date
  const currentAssets = new Map<string, { name: string; balance: Decimal }>();
  const fixedAssets = new Map<string, { name: string; balance: Decimal }>();
  const currentLiabilities = new Map<string, { name: string; balance: Decimal }>();
  const longTermLiabilities = new Map<string, { name: string; balance: Decimal }>();
  const equityAccounts = new Map<string, { name: string; balance: Decimal }>();

  accounts.forEach((account: any) => {
    let balance = new Decimal(0);

    // Calculate balance from ledger entries
    account.ledgerEntries.forEach((entry: any) => {
      const amount = new Decimal(entry.amount.toString());
      const type = entry.type;

      // Apply accounting rules for balance calculation
      if (account.type === 'asset' || account.type === 'expense') {
        // Debits increase, credits decrease
        balance = type === 'debit' ? balance.plus(amount) : balance.minus(amount);
      } else {
        // Liabilities, equity, income: credits increase, debits decrease
        balance = type === 'credit' ? balance.plus(amount) : balance.minus(amount);
      }
    });

    // Categorize based on account type and name
    const accountName = account.name.toLowerCase();
    
    if (account.type === 'asset') {
      // Categorize as current or fixed asset
      const isCurrentAsset = accountName.includes('cash') || 
                            accountName.includes('receivable') || 
                            accountName.includes('inventory') ||
                            accountName.includes('current');
      
      const targetMap = isCurrentAsset ? currentAssets : fixedAssets;
      targetMap.set(account.id, { name: account.name, balance });
    } 
    else if (account.type === 'liability') {
      // Categorize as current or long-term liability
      const isCurrentLiability = accountName.includes('payable') || 
                                 accountName.includes('current') ||
                                 accountName.includes('short-term');
      
      const targetMap = isCurrentLiability ? currentLiabilities : longTermLiabilities;
      targetMap.set(account.id, { name: account.name, balance });
    } 
    else if (account.type === 'equity') {
      equityAccounts.set(account.id, { name: account.name, balance });
    }
  });

  // Calculate totals
  const totalCurrentAssets = Array.from(currentAssets.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalFixedAssets = Array.from(fixedAssets.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalAssets = totalCurrentAssets.plus(totalFixedAssets);

  const totalCurrentLiabilities = Array.from(currentLiabilities.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalLongTermLiabilities = Array.from(longTermLiabilities.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));
  
  const totalLiabilities = totalCurrentLiabilities.plus(totalLongTermLiabilities);

  const totalEquity = Array.from(equityAccounts.values())
    .reduce((sum, acc) => sum.plus(acc.balance), new Decimal(0));

  const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

  // Check if balanced (allow 0.01 tolerance for rounding)
  const difference = totalAssets.minus(totalLiabilitiesAndEquity).abs();
  const isBalanced = difference.lessThan('0.01');

  // Helper to convert Map to AccountSummary array
  const mapToSummary = (map: Map<string, { name: string; balance: Decimal }>, total: Decimal): AccountSummary[] => {
    return Array.from(map.entries()).map(([id, data]) => ({
      accountId: id,
      accountName: data.name,
      balance: data.balance.toFixed(2),
      percentage: total.greaterThan(0)
        ? data.balance.dividedBy(total).times(100).toFixed(2) + '%'
        : '0%',
    }));
  };

  return {
    asOfDate,
    assets: {
      currentAssets: {
        total: totalCurrentAssets.toFixed(2),
        accounts: mapToSummary(currentAssets, totalCurrentAssets),
      },
      fixedAssets: {
        total: totalFixedAssets.toFixed(2),
        accounts: mapToSummary(fixedAssets, totalFixedAssets),
      },
      totalAssets: totalAssets.toFixed(2),
    },
    liabilities: {
      currentLiabilities: {
        total: totalCurrentLiabilities.toFixed(2),
        accounts: mapToSummary(currentLiabilities, totalCurrentLiabilities),
      },
      longTermLiabilities: {
        total: totalLongTermLiabilities.toFixed(2),
        accounts: mapToSummary(longTermLiabilities, totalLongTermLiabilities),
      },
      totalLiabilities: totalLiabilities.toFixed(2),
    },
    equity: {
      total: totalEquity.toFixed(2),
      accounts: mapToSummary(equityAccounts, totalEquity),
    },
    totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
    isBalanced,
  };
}

/**
 * Generate comparative financial reports (current period vs previous period)
 */
export async function generateComparativeReports(
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date
) {
  const [currentPL, previousPL, currentBS, previousBS] = await Promise.all([
    generateProfitAndLoss(currentStart, currentEnd),
    generateProfitAndLoss(previousStart, previousEnd),
    generateBalanceSheet(currentEnd),
    generateBalanceSheet(previousEnd),
  ]);

  // Calculate changes
  const revenueChange = new Decimal(currentPL.revenue.total).minus(new Decimal(previousPL.revenue.total));
  const revenueChangePercent = new Decimal(previousPL.revenue.total).greaterThan(0)
    ? revenueChange.dividedBy(new Decimal(previousPL.revenue.total)).times(100)
    : new Decimal(0);

  const netIncomeChange = new Decimal(currentPL.netIncome).minus(new Decimal(previousPL.netIncome));
  const netIncomeChangePercent = new Decimal(previousPL.netIncome).greaterThan(0)
    ? netIncomeChange.dividedBy(new Decimal(previousPL.netIncome)).times(100)
    : new Decimal(0);

  return {
    profitAndLoss: {
      current: currentPL,
      previous: previousPL,
      changes: {
        revenue: {
          amount: revenueChange.toFixed(2),
          percentage: revenueChangePercent.toFixed(2) + '%',
        },
        netIncome: {
          amount: netIncomeChange.toFixed(2),
          percentage: netIncomeChangePercent.toFixed(2) + '%',
        },
      },
    },
    balanceSheet: {
      current: currentBS,
      previous: previousBS,
    },
  };
}
