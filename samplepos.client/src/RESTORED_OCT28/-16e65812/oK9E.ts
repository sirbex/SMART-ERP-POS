import api from '@/config/api.config';

export interface ProfitAndLossReport {
  period: {
    startDate: string;
    endDate: string;
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
  asOfDate: string;
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

export interface ComparativeReports {
  profitAndLoss: {
    current: ProfitAndLossReport;
    previous: ProfitAndLossReport;
    changes: {
      revenue: {
        amount: string;
        percentage: string;
      };
      netIncome: {
        amount: string;
        percentage: string;
      };
    };
  };
  balanceSheet: {
    current: BalanceSheetReport;
    previous: BalanceSheetReport;
  };
}

class FinancialReportsService {
  /**
   * Generate Profit & Loss Statement
   */
  async getProfitAndLoss(
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; report: ProfitAndLossReport }> {
    const response = await api.get('/reports/profit-loss', {
      params: { startDate, endDate },
    });
    return response.data;
  }

  /**
   * Generate Balance Sheet
   */
  async getBalanceSheet(
    asOfDate: string
  ): Promise<{ success: boolean; report: BalanceSheetReport }> {
    const response = await api.get('/reports/balance-sheet', {
      params: { asOfDate },
    });
    return response.data;
  }

  /**
   * Generate Comparative Reports
   */
  async getComparativeReports(
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string
  ): Promise<{ success: boolean; report: ComparativeReports }> {
    const response = await api.get('/reports/comparative', {
      params: { currentStart, currentEnd, previousStart, previousEnd },
    });
    return response.data;
  }
}

export default new FinancialReportsService();
