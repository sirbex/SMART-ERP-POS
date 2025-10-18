import React, { useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Package } from "lucide-react";

// Import all components
import InventoryBatchManagement from './InventoryBatchManagement';
import PurchaseOrderManagement from './PurchaseOrderManagement';
import EnhancedSupplierManagement from './EnhancedSupplierManagement';
import PurchaseAnalytics from './PurchaseAnalytics';
import SupplierAccountsPayable from './SupplierAccountsPayable';

// Dynamic import for PurchaseReceiving to avoid type issues
const PurchaseReceiving = React.lazy(() => import('./PurchaseReceiving'));

const InventoryManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('inventory');

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8" />
                  Inventory & Purchasing Management
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Manage products, batches, purchasing, suppliers, and track inventory with FIFO system
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-max min-w-full sm:w-full">
              <TabsTrigger value="inventory" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>📦</span>
                  <span className="hidden xs:inline">Inventory</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="purchase-orders" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>📝</span>
                  <span className="hidden xs:inline">Orders</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="receiving" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>📥</span>
                  <span className="hidden xs:inline">Receiving</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="suppliers" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>🏪</span>
                  <span className="hidden xs:inline">Suppliers</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="payments" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>💰</span>
                  <span className="hidden xs:inline">Payments</span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <span>📈</span>
                  <span className="hidden xs:inline">Analytics</span>
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="inventory">
            <InventoryBatchManagement />
          </TabsContent>

          <TabsContent value="purchase-orders">
            <PurchaseOrderManagement 
              onNavigateToReceiving={(order) => {
                // Store order info for the receiving tab
                localStorage.setItem('orderToReceive', JSON.stringify({
                  id: order.id,
                  orderNumber: order.orderNumber,
                  supplierName: order.supplierName
                }));
                setActiveTab('receiving');
              }}
            />
          </TabsContent>

          <TabsContent value="receiving">
            <React.Suspense fallback={<div>Loading receiving interface...</div>}>
              <PurchaseReceiving />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="suppliers">
            <EnhancedSupplierManagement />
          </TabsContent>

          <TabsContent value="payments">
            <SupplierAccountsPayable />
          </TabsContent>

          <TabsContent value="analytics">
            <PurchaseAnalytics />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default InventoryManagement;