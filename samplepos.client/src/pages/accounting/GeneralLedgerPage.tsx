import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { Eye, Search, Download, ArrowUpDown } from 'lucide-react';
import { AxiosError } from 'axios';
import { DatePicker } from '../../components/ui/date-picker';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '../../components/ui/temp-ui-components';
import { formatCurrency } from '../../utils/currency';
import { accountingApi } from '../../services/api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  transactionDate: string;
  reference: string;
  createdAt: string;
  createdBy: string;
  // Integration fields for customers, suppliers, invoices
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  saleId?: string;
  saleNumber?: string;
}

interface LedgerTransaction {
  id: string;
  transactionNumber: string; // Human-readable ID like "TXN-000001"
  transactionDate: string;
  description: string;
  reference: string;
  totalAmount: number;
  entries: LedgerEntry[];
  createdAt: string;
  createdBy: string;
}

interface Account {
  id: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
}

const GeneralLedgerPage = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortBy, setSortBy] = useState('transactionDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadAccounts();
    loadLedgerEntries();
    // loadIntegrationData();
  }, []);

  // Integration data for future use
  // const [integrationData, setIntegrationData] = useState<{
  //   customers: { id: string; name: string; balance: number; }[];
  //   suppliers: { id: string; name: string; }[];
  //   invoices: { id: string; invoiceNumber: string; status: string; totalAmount: number; customerName: string; }[];
  // }>({ customers: [], suppliers: [], invoices: [] });

  // const loadIntegrationData = async () => {
  //   try {
  //     // Load customers with account balances
  //     const customersResponse = await fetch('/api/customers?limit=100');
  //     const suppliersResponse = await fetch('/api/suppliers?limit=100');
  //     const invoicesResponse = await fetch('/api/invoices?limit=100&status=UNPAID');
  //     
  //     const [customersData, suppliersData, invoicesData] = await Promise.all([
  //       customersResponse.ok ? customersResponse.json() : { success: false, data: [] },
  //       suppliersResponse.ok ? suppliersResponse.json() : { success: false, data: [] },
  //       invoicesResponse.ok ? invoicesResponse.json() : { success: false, data: [] }
  //     ]);
  //     
  //     setIntegrationData({
  //       customers: customersData.success ? customersData.data : [],
  //       suppliers: suppliersData.success ? suppliersData.data : [],
  //       invoices: invoicesData.success ? invoicesData.data : []
  //     });
  //   } catch (error) {
  //     console.error('Error loading integration data:', error);
  //     // Continue without integration data
  //   }
  // };

  useEffect(() => {
    loadLedgerEntries();
  }, [selectedAccount, dateFrom, dateTo, sortBy, sortOrder, currentPage, searchTerm]);

  const loadAccounts = async () => {
    try {
      const response = await accountingApi.get('/chart-of-accounts');
      const result = response.data;
      if (result.success) {
        setAccounts(result.data || []);
      }
    } catch (error: unknown) {
      console.error('Error loading accounts:', error);
      toast.error('Failed to load accounts');
    }
  };

  const loadLedgerEntries = async () => {
    try {
      setLoading(true);

      const params = {
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        sortBy,
        sortOrder,
        ...(selectedAccount !== 'ALL' && { accountId: selectedAccount }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(searchTerm.trim() && { search: searchTerm.trim() })
      };

      const response = await accountingApi.get('/general-ledger', { params });
      const result = response.data;
      if (result.success) {
        setEntries(result.data || []);
        setTotalItems(result.pagination?.total || 0);
      } else {
        throw new Error(result.error || 'Failed to load ledger entries');
      }
    } catch (error: unknown) {
      console.error('Error loading ledger entries:', error);
      toast.error(`Failed to load ledger entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionDetails = async (transactionId: string) => {
    try {
      const response = await accountingApi.get(`/transactions/${transactionId}`);
      const result = response.data;
      if (result.success) {
        setSelectedTransaction(result.data);
      } else {
        throw new Error(result.error || 'Failed to load transaction details');
      }
    } catch (error: unknown) {
      console.error('Error loading transaction details:', error);

      // TEMPORARY FIX: Create mock transaction details from existing ledger entries
      // This handles the 404 error until the C# API transaction endpoint is properly deployed
      if (error instanceof AxiosError && error.response?.status === 404) {
        const mockTransaction = createMockTransactionFromLedger(transactionId);
        if (mockTransaction) {
          setSelectedTransaction(mockTransaction);
          return;
        }
      }

      toast.error('Transaction details temporarily unavailable');
    }
  };

  const createMockTransactionFromLedger = (transactionId: string): LedgerTransaction | null => {
    // Find entries with the same transaction ID
    const relatedEntries = entries.filter(entry => entry.transactionId === transactionId);

    if (relatedEntries.length === 0) {
      return null;
    }

    // Use the first entry as the base for transaction details
    const baseEntry = relatedEntries[0];

    return {
      id: transactionId,
      transactionNumber: baseEntry.reference || `TXN-${transactionId.slice(0, 6).toUpperCase()}`,
      transactionDate: baseEntry.transactionDate,
      description: `Transaction ${baseEntry.reference || transactionId}`,
      reference: baseEntry.reference,
      totalAmount: relatedEntries.reduce((sum, entry) => new Decimal(sum).plus(Math.abs(entry.debitAmount || entry.creditAmount)).toNumber(), 0),
      entries: relatedEntries,
      createdAt: baseEntry.createdAt,
      createdBy: baseEntry.createdBy || 'System'
    };
  };

  const exportToCSV = async () => {
    try {
      const params = new URLSearchParams({
        format: 'csv',
        sortBy,
        sortOrder
      });

      if (selectedAccount !== 'ALL') {
        params.append('accountId', selectedAccount);
      }
      if (dateFrom) {
        params.append('dateFrom', dateFrom);
      }
      if (dateTo) {
        params.append('dateTo', dateTo);
      }
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }

      const response = await accountingApi.get(`/general-ledger/export?${params}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `general-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('General ledger exported successfully');
    } catch (error: unknown) {
      console.error('Error exporting:', error);
      toast.error(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />;
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // const getTransactionTypeColor = (entry: LedgerEntry) => {
  //   if (entry.debitAmount > 0) return 'text-red-600';
  //   if (entry.creditAmount > 0) return 'text-green-600';
  //   return 'text-gray-600';
  // };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  /**
   * Format reference for display - converts UUID to shortened format
   * and shows business ID if available in description
   */
  const formatReference = (entry: LedgerEntry): { display: string; type: string } => {
    const desc = entry.description.toLowerCase();
    const ref = entry.reference;

    // Check if we have business IDs in the entry
    if (entry.saleNumber) {
      return { display: entry.saleNumber, type: 'SALE' };
    }
    if (entry.invoiceNumber) {
      return { display: entry.invoiceNumber, type: 'INVOICE' };
    }

    // Parse type from description
    let type = 'TXN';
    if (desc.includes('sale') || desc.includes('cost of goods')) {
      type = 'SALE';
    } else if (desc.includes('invoice')) {
      type = 'INV';
    } else if (desc.includes('payment')) {
      type = 'PMT';
    } else if (desc.includes('deposit')) {
      type = 'DEP';
    } else if (desc.includes('inventory')) {
      type = 'INV-ADJ';
    }

    // Shorten UUID to first 8 characters for display
    const shortRef = ref.length > 8 ? ref.substring(0, 8).toUpperCase() : ref;
    return { display: `${type}-${shortRef}`, type };
  };

  /**
   * Format description to remove UUIDs and make it more readable
   */
  const formatDescription = (entry: LedgerEntry): string => {
    let desc = entry.description;

    // Replace UUID patterns with shortened version or business ID
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

    // If we have business IDs, use them
    if (entry.saleNumber) {
      desc = desc.replace(uuidPattern, entry.saleNumber);
    } else if (entry.invoiceNumber) {
      desc = desc.replace(uuidPattern, entry.invoiceNumber);
    } else {
      // Shorten UUIDs in description
      desc = desc.replace(uuidPattern, (match) => match.substring(0, 8).toUpperCase() + '...');
    }

    return desc;
  };

  /**
   * Get badge color based on transaction type
   */
  const getTypeBadgeColor = (type: string): string => {
    switch (type) {
      case 'SALE': return 'bg-green-100 text-green-800';
      case 'INV': return 'bg-blue-100 text-blue-800';
      case 'PMT': return 'bg-purple-100 text-purple-800';
      case 'DEP': return 'bg-yellow-100 text-yellow-800';
      case 'INV-ADJ': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <div className="p-4 lg:p-6">
        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters & Search</CardTitle>
            <CardDescription>Filter transactions by account, date range, or search terms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* First Row: Search and Account Filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by description, reference, or transaction ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Filter by account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Accounts</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountNumber} - {account.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Second Row: Date Range */}
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <DatePicker
                    value={dateFrom}
                    onChange={(date) => {
                      setDateFrom(date);
                      setCurrentPage(1);
                    }}
                    placeholder="Select date"
                    className="w-full sm:w-48"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date To</Label>
                  <DatePicker
                    value={dateTo}
                    onChange={(date) => {
                      setDateTo(date);
                      setCurrentPage(1);
                    }}
                    placeholder="Select date"
                    className="w-full sm:w-48"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      setSearchTerm('');
                      setSelectedAccount('ALL');
                      setCurrentPage(1);
                    }}
                  >
                    Clear Filters
                  </Button>
                  <Button variant="outline" onClick={exportToCSV} disabled={loading || entries.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Table */}
        <Card>
          <CardHeader>
            <CardTitle>Ledger Entries ({totalItems} total)</CardTitle>
            <CardDescription>
              {selectedAccount !== 'ALL' && (
                <>Filtered by: {accounts.find(a => a.id === selectedAccount)?.accountName} • </>
              )}
              Showing {entries.length} entries on page {currentPage} of {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading ledger entries...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No ledger entries found matching your criteria.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead className="border-b">
                      <tr className="text-left">
                        <th className="pb-3 font-medium">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600"
                            onClick={() => handleSort('transactionDate')}
                          >
                            Date {getSortIcon('transactionDate')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600"
                            onClick={() => handleSort('reference')}
                          >
                            Reference {getSortIcon('reference')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600"
                            onClick={() => handleSort('accountName')}
                          >
                            Account {getSortIcon('accountName')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium">Description</th>
                        <th className="pb-3 font-medium text-right">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                            onClick={() => handleSort('debitAmount')}
                          >
                            Debit {getSortIcon('debitAmount')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium text-right">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                            onClick={() => handleSort('creditAmount')}
                          >
                            Credit {getSortIcon('creditAmount')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium text-right">
                          <button
                            className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                            onClick={() => handleSort('balance')}
                          >
                            Balance {getSortIcon('balance')}
                          </button>
                        </th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {entries.map((entry) => {
                        const refInfo = formatReference(entry);
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="py-3 font-mono text-sm">
                              {formatDate(entry.transactionDate)}
                            </td>
                            <td className="py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(refInfo.type)}`}>
                                  {refInfo.type}
                                </span>
                                <span className="font-mono text-sm text-blue-600" title={entry.reference}>
                                  {refInfo.display}
                                </span>
                              </div>
                            </td>
                            <td className="py-3">
                              <div>
                                <div className="font-mono text-xs text-gray-500">
                                  {entry.accountNumber}
                                </div>
                                <div className="font-medium text-sm">
                                  {entry.accountName}
                                </div>
                              </div>
                            </td>
                            <td className="py-3">
                              <p className="text-sm" title={entry.description}>{formatDescription(entry)}</p>
                            </td>
                            <td className="py-3 text-right font-mono">
                              {entry.debitAmount > 0 ? (
                                <span className="text-red-600">
                                  {formatCurrency(entry.debitAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="py-3 text-right font-mono">
                              {entry.creditAmount > 0 ? (
                                <span className="text-green-600">
                                  {formatCurrency(entry.creditAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="py-3 text-right font-mono">
                              <span className={entry.balance < 0 ? 'text-red-600' : 'text-gray-900'}>
                                {formatCurrency(entry.balance)}
                              </span>
                            </td>
                            <td className="py-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => loadTransactionDetails(entry.transactionId)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-gray-500">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} entries
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-sm px-3 py-1 bg-gray-100 rounded">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Transaction Details Modal */}
        <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Transaction Details</DialogTitle>
              <DialogDescription>
                Complete journal entry details
              </DialogDescription>
            </DialogHeader>

            {selectedTransaction && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Transaction Number</Label>
                    <p className="font-mono">{selectedTransaction.transactionNumber}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Reference</Label>
                    <p className="font-mono">{selectedTransaction.reference}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Date</Label>
                    <p>{formatDate(selectedTransaction.transactionDate)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Total Amount</Label>
                    <p className="font-mono">{formatCurrency(selectedTransaction.totalAmount)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500">Description</Label>
                  <p>{selectedTransaction.description}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500 mb-3 block">Journal Entries</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium">Account</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Debit</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedTransaction.entries.map((entry, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div>
                                <div className="text-xs text-gray-500 font-mono">
                                  {entry.accountNumber}
                                </div>
                                <div className="text-sm font-medium">
                                  {entry.accountName}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-sm">
                              {entry.debitAmount > 0 ? (
                                <span className="text-red-600">
                                  {formatCurrency(entry.debitAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-sm">
                              {entry.creditAmount > 0 ? (
                                <span className="text-green-600">
                                  {formatCurrency(entry.creditAmount)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2">
                        <tr>
                          <td className="px-3 py-2 font-medium">Total</td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-red-600">
                            {formatCurrency(selectedTransaction.entries.reduce((sum, e) => new Decimal(sum).plus(e.debitAmount).toNumber(), 0))}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-green-600">
                            {formatCurrency(selectedTransaction.entries.reduce((sum, e) => new Decimal(sum).plus(e.creditAmount).toNumber(), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500 pt-2 border-t">
                  <span>Created by: {selectedTransaction.createdBy}</span>
                  <span>Created: {formatDate(selectedTransaction.createdAt)}</span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default GeneralLedgerPage;