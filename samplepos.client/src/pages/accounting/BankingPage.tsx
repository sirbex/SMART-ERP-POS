/**
 * BANKING PAGE — bank books + (when enabled) liquidity workspace
 *
 * Single home for:
 * - Bank accounts, transactions, import, reconcile
 * - Undeposited receipts → bank (Deposit Worksheet)
 * - Move money across cash / bank / mobile money
 * - Petty cash float
 * - Liquidity document audit list
 *
 * Legacy URLs ?tab= / redirects land here so we do not maintain parallel pages in the nav.
 */

import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  ArrowLeftRight,
  FileUp,
  CreditCard,
  AlertCircle,
  CheckSquare,
  Clock,
  BarChart3,
  Bell,
  Landmark,
  Wallet,
  ArrowLeftRight as MoveIcon,
  FileText,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BankAccountsTab } from '../../components/banking/BankAccountsTab';
import { BankTransactionsTab } from '../../components/banking/BankTransactionsTab';
import { StatementImportTab } from '../../components/banking/StatementImportTab';
import { ReconciliationTab } from '../../components/banking/ReconciliationTab';
import { BankAlertsTab } from '../../components/banking/BankAlertsTab';
import { RecurringRulesTab } from '../../components/banking/RecurringRulesTab';
import { BankReportsTab } from '../../components/banking/BankReportsTab';
import { useBankAccounts, useBankAlerts } from '../../hooks/useBanking';
import { useTreasuryEnabled } from '../../hooks/useTreasuryEnabled';
import { formatCurrency } from '../../utils/currency';
import DepositWorksheetPage from './DepositWorksheetPage';
import TreasuryTransferPage from './TreasuryTransferPage';
import PettyCashPage from './PettyCashPage';
import TreasuryDocumentsPage from './TreasuryDocumentsPage';

const CORE_TABS = new Set([
  'accounts',
  'transactions',
  'import',
  'reconciliation',
  'recurring',
  'alerts',
  'reports',
]);

const TREASURY_TABS = new Set(['undeposited', 'move-money', 'petty-cash', 'documents']);

/** Map legacy deep links / old route names to Banking tabs */
const TAB_ALIASES: Record<string, string> = {
  deposits: 'undeposited',
  deposit: 'undeposited',
  'deposit-worksheet': 'undeposited',
  transfer: 'move-money',
  transfers: 'move-money',
  'treasury-transfer': 'move-money',
  petty: 'petty-cash',
  treasury: 'documents',
  documents: 'documents',
};

const BankingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: accounts = [] } = useBankAccounts();
  const { data: alerts = [] } = useBankAlerts('NEW');
  const { data: treasuryOn = false, isLoading: treasuryLoading } = useTreasuryEnabled();

  const rawTab = searchParams.get('tab') || 'accounts';
  const requestedTab = TAB_ALIASES[rawTab] ?? rawTab;

  const activeTab = useMemo(() => {
    if (TREASURY_TABS.has(requestedTab)) {
      if (!treasuryOn && !treasuryLoading) return 'accounts';
      return requestedTab;
    }
    if (CORE_TABS.has(requestedTab)) return requestedTab;
    return 'accounts';
  }, [requestedTab, treasuryOn, treasuryLoading]);

  useEffect(() => {
    if (treasuryLoading) return;
    if (TREASURY_TABS.has(requestedTab) && !treasuryOn && searchParams.get('tab')) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'accounts');
      setSearchParams(next, { replace: true });
    }
  }, [treasuryLoading, treasuryOn, requestedTab, searchParams, setSearchParams]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
  const activeAccountsCount = accounts.filter((a) => a.isActive).length;

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banking & Liquidity</h1>
          <p className="text-muted-foreground">
            Bank accounts, undeposited receipts, moving money between cash and banks, and
            reconciliation — one workspace.
          </p>
        </div>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {alerts.length} Alert{alerts.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-base sm:text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground">
              Across {activeAccountsCount} active account{activeAccountsCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {accounts.slice(0, 3).map((account) => (
          <Card key={account.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">{account.name}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-base sm:text-2xl font-bold">
                {formatCurrency(account.currentBalance || 0)}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {account.bankName || 'Bank Account'}
                {account.isDefault && ' • Default'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          {treasuryOn && (
            <>
              <TabsTrigger value="undeposited" className="flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Undeposited receipts
              </TabsTrigger>
              <TabsTrigger value="move-money" className="flex items-center gap-2">
                <MoveIcon className="h-4 w-4" />
                Move money
              </TabsTrigger>
              <TabsTrigger value="petty-cash" className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Petty cash
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Reconcile
          </TabsTrigger>
          <TabsTrigger value="recurring" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recurring
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {alerts.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {alerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <BankAccountsTab />
        </TabsContent>

        {treasuryOn && (
          <>
            <TabsContent value="undeposited">
              <DepositWorksheetPage embedded />
            </TabsContent>
            <TabsContent value="move-money">
              <TreasuryTransferPage embedded />
            </TabsContent>
            <TabsContent value="petty-cash">
              <PettyCashPage embedded />
            </TabsContent>
            <TabsContent value="documents">
              <TreasuryDocumentsPage embedded />
            </TabsContent>
          </>
        )}

        <TabsContent value="transactions">
          <BankTransactionsTab />
        </TabsContent>

        <TabsContent value="import">
          <StatementImportTab />
        </TabsContent>

        <TabsContent value="reconciliation">
          <ReconciliationTab />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringRulesTab />
        </TabsContent>

        <TabsContent value="alerts">
          <BankAlertsTab />
        </TabsContent>

        <TabsContent value="reports">
          <BankReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BankingPage;
