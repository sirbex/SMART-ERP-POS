import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { DollarSign, Package, TrendingUp, Download, RefreshCw, ArrowUpDown } from 'lucide-react';
import { useStockValuation } from '@/services/api/inventoryApi';
import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '../utils/currency';

type SortField = 'name' | 'quantity' | 'cost' | 'value';
type SortOrder = 'asc' | 'desc';

const StockValuationReport: React.FC = () => {
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Fetch valuation data
  const { data: valuation, isLoading, refetch } = useStockValuation();

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Sort products
  const sortedProducts = React.useMemo(() => {
    if (!valuation?.products) return [];

    const sorted = [...valuation.products].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
        case 'name':
          aValue = a.productName.toLowerCase();
          bValue = b.productName.toLowerCase();
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'cost':
          aValue = a.costPrice;
          bValue = b.costPrice;
          break;
        case 'value':
          aValue = a.totalValue;
          bValue = b.totalValue;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      return sortOrder === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return sorted;
  }, [valuation?.products, sortField, sortOrder]);

  // Calculate top products (top 5 by value)
  const topProducts = React.useMemo(() => {
    if (!valuation?.products) return [];
    return [...valuation.products].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
  }, [valuation?.products]);

  // Export to CSV
  const handleExport = () => {
    if (!valuation?.products) return;

    const headers = ['Product Name', 'Quantity', 'Unit Cost (UGX)', 'Total Value (UGX)'];
    const rows = sortedProducts.map((p) => [
      p.productName,
      p.quantity.toFixed(2),
      p.costPrice.toFixed(2),
      p.totalValue.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      `Total Items,${valuation.itemCount}`,
      `Total Value,${formatCurrency(valuation.totalValue)}`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-valuation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Exported',
      description: 'Stock valuation report downloaded as CSV.',
    });
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => (
    <ArrowUpDown
      className={`ml-1 h-3 w-3 inline ${
        sortField === field ? 'text-primary' : 'text-muted-foreground'
      }`}
    />
  );

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(valuation?.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">Total cost of all inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{valuation?.itemCount || 0}</div>
            <p className="text-xs text-muted-foreground">Unique products in stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Value per Product</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {valuation?.itemCount
                ? formatCurrency(valuation.totalValue / valuation.itemCount)
                : formatCurrency(0)}
            </div>
            <p className="text-xs text-muted-foreground">Per product average</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Products Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Top 5 Products by Value</CardTitle>
          <CardDescription>Products contributing most to total inventory value</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto"></div>
            </div>
          ) : topProducts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No products in inventory</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((product, index) => {
                const percentage = valuation
                  ? (product.totalValue / valuation.totalValue) * 100
                  : 0;
                return (
                  <div key={product.productId} className="flex items-center gap-3">
                    <Badge variant="outline" className="min-w-[30px] justify-center">
                      #{index + 1}
                    </Badge>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm">{product.productName}</span>
                        <span className="text-sm font-semibold text-green-600">
                          {formatCurrency(product.totalValue)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2 px-[2px] flex gap-[2px]">
                          {Array.from({ length: 20 }).map((_, i) => {
                            const filled = Math.round(Math.min(100, percentage) / 5);
                            return (
                              <div
                                key={i}
                                className={`${i < filled ? 'bg-green-600' : 'bg-transparent'} h-[6px] flex-1 rounded-full`}
                              />
                            );
                          })}
                        </div>
                        <span className="text-xs text-muted-foreground min-w-[45px] text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {product.quantity.toFixed(2)} units × {formatCurrency(product.costPrice)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Valuation Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Stock Valuation Report
              </CardTitle>
              <CardDescription>Detailed breakdown of inventory value by product</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetch();
                  toast({
                    title: 'Refreshed',
                    description: 'Valuation report updated.',
                  });
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!valuation?.products || valuation.products.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading valuation data...</p>
            </div>
          ) : !valuation?.products || valuation.products.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold">No inventory</h3>
              <p className="text-sm text-muted-foreground">
                Receive inventory to see valuation report
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('name')}
                          className="hover:bg-transparent p-0 h-auto font-semibold"
                        >
                          Product Name
                          <SortIcon field="name" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('quantity')}
                          className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                        >
                          Quantity
                          <SortIcon field="quantity" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('cost')}
                          className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                        >
                          Unit Cost (UGX)
                          <SortIcon field="cost" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('value')}
                          className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                        >
                          Total Value (UGX)
                          <SortIcon field="value" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProducts.map((product, index) => {
                      const percentage = valuation
                        ? (product.totalValue / valuation.totalValue) * 100
                        : 0;
                      return (
                        <TableRow key={product.productId}>
                          <TableCell className="font-medium text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{product.productName}</TableCell>
                          <TableCell className="text-right">
                            {product.quantity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.costPrice)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(product.totalValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="font-mono">
                              {percentage.toFixed(2)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary Footer */}
              {valuation && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 mt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {sortedProducts.length} products
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total Quantity</p>
                      <p className="text-lg font-semibold">
                        {valuation.products.reduce((sum, p) => sum + p.quantity, 0).toFixed(2)}{' '}
                        units
                      </p>
                    </div>
                    <div className="h-10 w-px bg-border"></div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-lg font-bold text-green-600">
                        ₱
                        {valuation.totalValue.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockValuationReport;
