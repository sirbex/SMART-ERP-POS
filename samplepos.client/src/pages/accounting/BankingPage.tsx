/**
 * BANKING PAGE
 * 
 * Main page for banking module with tabs for:
 * - Bank Accounts
 * - Transactions
 * - Statement Import
 * - Reconciliation
 * - Alerts
 * - Recurring Rules
 * - Reports
 */

import React, { useState } from 'react';
import { Building2, ArrowLeftRight, FileUp, CreditCard, AlertCircle, CheckSquare, Clock, BarChart3, Bell } from 'lucide-react';
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
import { formatCurrency } from '../../utils/currency';

const BankingPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('accounts');

    const { data: accounts = [] } = useBankAccounts();
    const { data: alerts = [] } = useBankAlerts('NEW');

    // Calculate totals
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
    const activeAccountsCount = accounts.filter(a => a.isActive).length;

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Banking</h1>
                    <p className="text-muted-foreground">
                        Manage bank accounts, transactions, and statement imports
                    </p>
                </div>
                {alerts.length > 0 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {alerts.length} Alert{alerts.length !== 1 ? 's' : ''}
                    </Badge>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
                        <p className="text-xs text-muted-foreground">
                            Across {activeAccountsCount} active account{activeAccountsCount !== 1 ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>

                {accounts.slice(0, 3).map(account => (
                    <Card key={account.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium truncate">{account.name}</CardTitle>
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(account.currentBalance || 0)}</div>
                            <p className="text-xs text-muted-foreground truncate">
                                {account.bankName || 'Bank Account'}
                                {account.isDefault && ' • Default'}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="flex-wrap h-auto gap-1">
                    <TabsTrigger value="accounts" className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Accounts
                    </TabsTrigger>
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
                            <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
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
