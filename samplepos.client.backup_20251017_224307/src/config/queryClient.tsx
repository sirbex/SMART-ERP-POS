/**
 * React Query Configuration
 * Centralized data fetching, caching, and state management
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React from 'react';

/**
 * Query Client Configuration
 * Optimized for POS system performance
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache time settings
      staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Garbage collect after 10 minutes (was cacheTime)
      
      // Retry configuration
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Refetch configuration
      refetchOnWindowFocus: false, // Don't refetch on window focus (POS environment)
      refetchOnReconnect: true, // Refetch when connection restored
      refetchOnMount: true, // Refetch on component mount
      
      // Error handling
      throwOnError: false,
      
      // Performance
      networkMode: 'online', // Only fetch when online
    },
    mutations: {
      // Retry configuration for mutations
      retry: 2,
      retryDelay: 1000,
      
      // Error handling
      throwOnError: false,
      
      // Network mode
      networkMode: 'online',
    },
  },
});

/**
 * Query Provider Component
 * Wraps the app with React Query context
 */
interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  );
}

/**
 * Query Keys
 * Centralized query key management for consistency
 */
export const queryKeys = {
  // Inventory
  inventory: {
    all: ['inventory'] as const,
    lists: () => [...queryKeys.inventory.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.inventory.lists(), filters] as const,
    details: () => [...queryKeys.inventory.all, 'detail'] as const,
    detail: (id: string | number) => [...queryKeys.inventory.details(), id] as const,
    stats: () => [...queryKeys.inventory.all, 'stats'] as const,
    lowStock: () => [...queryKeys.inventory.all, 'low-stock'] as const,
    expiring: (days: number) => [...queryKeys.inventory.all, 'expiring', days] as const,
  },
  
  // Customers
  customers: {
    all: ['customers'] as const,
    lists: () => [...queryKeys.customers.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.customers.lists(), filters] as const,
    details: () => [...queryKeys.customers.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.customers.details(), id] as const,
    stats: () => [...queryKeys.customers.all, 'stats'] as const,
    top: (limit: number) => [...queryKeys.customers.all, 'top', limit] as const,
    transactions: (id: string, page: number) => 
      [...queryKeys.customers.detail(id), 'transactions', page] as const,
  },
  
  // Transactions
  transactions: {
    all: ['transactions'] as const,
    lists: () => [...queryKeys.transactions.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.transactions.lists(), filters] as const,
    details: () => [...queryKeys.transactions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.transactions.details(), id] as const,
    stats: (startDate: string, endDate: string) => 
      [...queryKeys.transactions.all, 'stats', startDate, endDate] as const,
    paymentMethods: (startDate: string, endDate: string) => 
      [...queryKeys.transactions.all, 'payment-methods', startDate, endDate] as const,
    hourlySales: (date: string) => 
      [...queryKeys.transactions.all, 'hourly-sales', date] as const,
    topProducts: (startDate: string, endDate: string, limit: number) => 
      [...queryKeys.transactions.all, 'top-products', startDate, endDate, limit] as const,
  },
  
  // Purchase Orders
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    lists: () => [...queryKeys.purchaseOrders.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.purchaseOrders.lists(), filters] as const,
    details: () => [...queryKeys.purchaseOrders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.purchaseOrders.details(), id] as const,
  },
  
  // Suppliers
  suppliers: {
    all: ['suppliers'] as const,
    lists: () => [...queryKeys.suppliers.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.suppliers.lists(), filters] as const,
    details: () => [...queryKeys.suppliers.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.suppliers.details(), id] as const,
  },
  
  // Settings
  settings: {
    all: ['settings'] as const,
    currency: () => [...queryKeys.settings.all, 'currency'] as const,
    system: () => [...queryKeys.settings.all, 'system'] as const,
    tax: () => [...queryKeys.settings.all, 'tax'] as const,
    business: () => [...queryKeys.settings.all, 'business'] as const,
  },
};

/**
 * Invalidation helpers
 * Centralized cache invalidation
 */
export const invalidateQueries = {
  inventory: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  },
  
  customers: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  },
  
  transactions: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
  },
  
  purchaseOrders: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
  },
  
  suppliers: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
  },
  
  all: () => {
    queryClient.invalidateQueries();
  },
};

/**
 * Prefetch helpers
 * Preload data for better UX
 */
export const prefetchQueries = {
  inventoryList: async (filters: any = {}) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.inventory.list(filters),
      queryFn: async () => {
        const response = await fetch(`/api/inventory?${new URLSearchParams(filters)}`);
        return response.json();
      },
    });
  },
  
  customerList: async (filters: any = {}) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.customers.list(filters),
      queryFn: async () => {
        const response = await fetch(`/api/customers?${new URLSearchParams(filters)}`);
        return response.json();
      },
    });
  },
};

export default queryClient;
