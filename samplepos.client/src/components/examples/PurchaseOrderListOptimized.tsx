/**
 * Example: Optimized Purchase Order List Component
 * 
 * This demonstrates how to use the new PaginatedList component
 * to handle large datasets efficiently without performance lag.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { PaginatedList } from '../shared/PaginatedList';
import { CompactTableView, createColumn } from '../shared/CompactTableView';
import { apiGet } from '../../utils/apiClient';
import SettingsService from '../../services/SettingsService';

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierName: string;
  orderDate: string;
  totalValue: number;
  status: 'draft' | 'sent' | 'confirmed' | 'received';
}

interface PurchaseOrderListOptimizedProps {
  onSelectOrder?: (order: PurchaseOrder) => void;
}

export function PurchaseOrderListOptimized({ onSelectOrder }: PurchaseOrderListOptimizedProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch orders with pagination (server-side)
  const fetchOrders = async (page: number, limit: number) => {
    setLoading(true);
    try {
      const response = await apiGet<PurchaseOrder[]>(
        `/api/purchase-orders?page=${page}&limit=${limit}&search=${searchQuery}`
      );
      
      if (response && response.data) {
        setOrders(response.data);
        // Assuming the API returns pagination info in the response
        if ('pagination' in response && typeof response.pagination === 'object' && response.pagination !== null) {
          const pagination = response.pagination as { totalItems?: number };
          setTotalItems(pagination.totalItems || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch purchase orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOrders(1, 20);
  }, [searchQuery]);

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Status badge color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'sent': return 'default';
      case 'confirmed': return 'default';
      case 'received': return 'default';
      default: return 'secondary';
    }
  };

  // Method 1: Using PaginatedList with custom rendering
  const renderOrderRow = (order: PurchaseOrder) => (
    <div className="flex items-center justify-between py-2 px-4 border-b hover:bg-accent transition-colors">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div className="font-medium text-sm">{order.orderNumber}</div>
          <div className="text-xs text-muted-foreground">{order.supplierName}</div>
        </div>
        <div className="text-sm">
          {new Date(order.orderDate).toLocaleDateString()}
        </div>
        <div className="text-sm font-semibold">
          {SettingsService.getInstance().formatCurrency(order.totalValue)}
        </div>
        <div className="flex items-center justify-between">
          <Badge variant={getStatusColor(order.status)}>
            {order.status.toUpperCase()}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectOrder?.(order)}
          >
            View
          </Button>
        </div>
      </div>
    </div>
  );

  // Method 2: Using CompactTableView with columns
  const columns = [
    createColumn<PurchaseOrder>('orderNumber', 'Order #', {
      render: (order) => <span className="font-medium">{order.orderNumber}</span>
    }),
    createColumn<PurchaseOrder>('supplierName', 'Supplier'),
    createColumn<PurchaseOrder>('orderDate', 'Date', {
      render: (order) => new Date(order.orderDate).toLocaleDateString()
    }),
    createColumn<PurchaseOrder>('totalValue', 'Total', {
      render: (order) => SettingsService.getInstance().formatCurrency(order.totalValue),
      className: 'text-right font-semibold'
    }),
    createColumn<PurchaseOrder>('status', 'Status', {
      render: (order) => (
        <Badge variant={getStatusColor(order.status)}>
          {order.status.toUpperCase()}
        </Badge>
      )
    }),
    createColumn<PurchaseOrder>('id', 'Actions', {
      render: (order) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onSelectOrder?.(order);
          }}
        >
          View
        </Button>
      )
    })
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase Orders</CardTitle>
        <CardDescription>
          Efficiently browse through thousands of purchase orders with pagination
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Option 1: Custom list with PaginatedList */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Option 1: Custom Row Layout</h3>
          <PaginatedList
            items={orders}
            renderItem={renderOrderRow}
            loading={loading}
            serverSide
            totalItems={totalItems}
            onPageChange={fetchOrders}
            showSearch
            onSearch={handleSearch}
            searchPlaceholder="Search orders..."
            defaultItemsPerPage={20}
            itemsPerPageOptions={[10, 20, 50, 100]}
            emptyMessage="No purchase orders found"
            compact
          />
        </div>

        {/* Option 2: Compact table view */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Option 2: Compact Table</h3>
          <div className="rounded-md border">
            <CompactTableView
              data={orders}
              columns={columns}
              loading={loading}
              onRowClick={(order) => onSelectOrder?.(order)}
              striped
              hoverable
              stickyHeader
              emptyMessage="No purchase orders found"
            />
          </div>
          
          {/* Pagination controls can be added separately or integrated */}
          {!loading && totalItems > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Showing {orders.length} of {totalItems} orders
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
