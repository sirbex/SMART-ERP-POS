/**
 * Products API
 * 
 * Handles product CRUD operations, search, stock queries, and low stock alerts.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/products.ts
 * 
 * @module services/api/productsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Product,
  ApiResponse,
  PaginatedResponse
} from '@/types/backend';
import { inventoryApi } from './inventoryApi';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Query parameters for fetching products
 */
export interface GetProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
  inStock?: boolean;
  // Include Product UoMs in response for inventory table equivalence display
  includeUoMs?: boolean;
}

/**
 * Request to create a new product
 */
export interface CreateProductRequest {
  name: string;
  barcode?: string;
  description?: string;
  category?: string;
  baseUnit: string; // Backend uses 'baseUnit' not 'unit'
  sellingPrice: number; // Backend uses 'sellingPrice' not 'unitPrice'
  costPrice: number; // Required in backend
  taxRate?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  isActive?: boolean;
  imageUrl?: string;
  // Multi-UoM support
  hasMultipleUnits?: boolean;
  alternateUnit?: string;      // Single alternate unit (backend schema)
  conversionFactor?: number;   // Conversion rate for alternate unit
  alternateUnits?: Array<{     // Extended alternate units (if backend supports array)
    unit: string;
    conversionRate: number;
    barcode?: string;
  }>;
}

/**
 * Request to update an existing product
 */
export interface UpdateProductRequest {
  name?: string;
  barcode?: string;
  description?: string;
  category?: string;
  baseUnit?: string; // Backend uses 'baseUnit' not 'unit'
  sellingPrice?: number; // Backend uses 'sellingPrice' not 'unitPrice'
  costPrice?: number;
  taxRate?: number;
  reorderPoint?: number; // Backend expects 'reorderPoint' not 'reorderLevel'
  reorderQuantity?: number;
  isActive?: boolean;
  imageUrl?: string;
  // Multi-UoM support
  hasMultipleUnits?: boolean;
  alternateUnit?: string;      // Single alternate unit (backend schema)
  conversionFactor?: number;   // Conversion rate for alternate unit
  alternateUnits?: Array<{     // Extended alternate units (if backend supports array)
    unit: string;
    conversionRate: number;
    barcode?: string;
  }>;
}

/**
 * Search parameters for products
 */
export interface SearchProductsParams {
  query: string;
  category?: string;
  limit?: number;
}

/**
 * Product with current stock information
 */
export interface ProductWithStock extends Omit<Product, 'currentStock'> {
  currentStock: number;
  batchCount: number;
}

// ===================================================================
// PRODUCT HISTORY TYPES
// ===================================================================

export type ProductHistoryEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGE'
  | 'PURCHASE_RECEIPT'
  | 'STOCK_ADJUSTMENT'
  | 'BATCH_EXPIRY_ALERT';

export interface ProductHistoryEventMeta {
  // Common optional metadata fields
  userId?: string;
  username?: string;
  // Batch-related
  batchNumber?: string;
  unitCost?: number;
  quantity?: number;
  expiryDate?: string;
  supplierName?: string;
  // Status-related
  fromStatus?: string;
  toStatus?: string;
  // Generic extra bag
  [key: string]: any;
}

export interface ProductHistoryEvent {
  id: string; // stable deterministic id for dedupe
  productId: string;
  type: ProductHistoryEventType;
  occurredAt: string; // ISO date
  title: string;
  description?: string;
  metadata?: ProductHistoryEventMeta;
}

// New types for comprehensive product history (matches backend response)
export interface ProductHistorySummary {
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageSellingPrice: number;
  averageCostPrice: number;
  profitMargin: number;
  currentStock: number;
  totalReceived: number;
  stockTurnover: number;
}

export interface ProductCostHistoryEntry {
  date: string; // ISO date
  cost: number;
  batchNumber?: string;
  quantity: number;
  source: 'PURCHASE' | 'ADJUSTMENT';
}

export interface ProductBatchReceipt {
  batchNumber: string;
  receivedDate: string; // ISO date
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number;
  expiryDate?: string; // ISO date
  totalCost: number;
}

export interface ProductHistoryResponse {
  events: ProductHistoryEvent[];
  summary: ProductHistorySummary;
  costHistory: ProductCostHistoryEntry[];
  batchReceipts: ProductBatchReceipt[];
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all products with pagination and filters
 * GET /api/products
 */
export const getProducts = async (
  params?: GetProductsParams
): Promise<PaginatedResponse<ProductWithStock>> => {
  const { data } = await api.get<PaginatedResponse<ProductWithStock>>('/products', { params });
  return data;
};

/**
 * Get single product by ID with stock details
 * GET /api/products/:id
 * Backend returns product directly, not wrapped in ApiResponse
 */
export const getProduct = async (id: string): Promise<ProductWithStock> => {
  const { data } = await api.get<ProductWithStock>(`/products/${id}`);
  return data; // Backend returns product directly, not data.data
};

/**
 * Get product history (unified timeline)
 * Tries backend endpoint first; falls back to client-side composition to remain robust.
 * GET /api/products/:id/history
 */
export const getProductHistory = async (id: string): Promise<ProductHistoryResponse> => {
  try {
    const { data } = await api.get<ApiResponse<ProductHistoryResponse>>(`/products/${id}/history`);
    // Return backend response directly
    return data.data;
  } catch (err: any) {
    // If endpoint not available (404), compose a minimal history from available data
    if (err?.response?.status !== 404) throw err;

    // Fallback composition
    const product = await getProduct(id);
    const events: ProductHistoryEvent[] = [];

    // Created event
    if (product.createdAt) {
      events.push({
        id: `created:${id}:${new Date(product.createdAt as any).toISOString()}`,
        productId: id,
        type: 'CREATED',
        occurredAt: new Date(product.createdAt as any).toISOString(),
        title: 'Product created',
        description: `${product.name} was added to catalog`,
      });
    }

    // Updated event (if different from created)
    if (product.updatedAt && String(product.updatedAt) !== String(product.createdAt)) {
      events.push({
        id: `updated:${id}:${new Date(product.updatedAt as any).toISOString()}`,
        productId: id,
        type: 'UPDATED',
        occurredAt: new Date(product.updatedAt as any).toISOString(),
        title: 'Product updated',
        description: 'Details were modified',
      });
    }

    // Status change snapshot (we cannot get historical toggles, so include current status as info)
    events.push({
      id: `status:${id}:${new Date(product.updatedAt as any || product.createdAt as any || Date.now()).toString()}`,
      productId: id,
      type: 'STATUS_CHANGE',
      occurredAt: new Date((product.updatedAt as any) || (product.createdAt as any) || Date.now()).toISOString(),
      title: product.isActive ? 'Marked Active' : 'Marked Inactive',
      description: `Product is currently ${product.isActive ? 'active' : 'inactive'}`,
      metadata: {
        toStatus: product.isActive ? 'ACTIVE' : 'INACTIVE',
      },
    });

    // Purchase receipts via stock batches
    try {
      const batchesResp = await inventoryApi.getStockBatches({ productId: id, page: 1, limit: 100 });
      for (const b of batchesResp.data || []) {
        const occurredAt = (b as any).receivedDate || (b as any).createdAt || new Date().toISOString();
        const meta: ProductHistoryEventMeta = {
          batchNumber: (b as any).batchNumber,
          unitCost: Number((b as any).unitCost || 0),
          quantity: Number((b as any).quantity || (b as any).quantityReceived || 0),
          expiryDate: (b as any).expiryDate || undefined,
          supplierName: (b as any).supplier?.name,
        };
        events.push({
          id: `receipt:${id}:${meta.batchNumber || 'batch'}:${new Date(occurredAt).toISOString()}`,
          productId: id,
          type: 'PURCHASE_RECEIPT',
          occurredAt: new Date(occurredAt).toISOString(),
          title: `Stock received${meta.batchNumber ? ` (${meta.batchNumber})` : ''}`,
          description: `${meta.quantity || 0} ${product.baseUnit} at ₱${(meta.unitCost || 0).toFixed(2)}`,
          metadata: meta,
        });
      }
    } catch {}

    // Expiry alerts for batches (client-side hint)
    try {
      const expiring = await inventoryApi.getExpiringStock(90);
      (expiring || []).filter((e: any) => String(e.productId) === String(id)).forEach((e: any) => {
        if (e.expiryDate) {
          const occurredAt = e.expiryDate;
          events.push({
            id: `expiry:${id}:${e.batchNumber}:${new Date(occurredAt).toISOString()}`,
            productId: id,
            type: 'BATCH_EXPIRY_ALERT',
            occurredAt: new Date(occurredAt).toISOString(),
            title: 'Batch nearing expiry',
            description: `Batch ${e.batchNumber} expires on ${new Date(occurredAt).toLocaleDateString()}`,
            metadata: { batchNumber: e.batchNumber, expiryDate: occurredAt },
          });
        }
      });
    } catch {}

    // Sort desc by occurredAt and de-duplicate by id
    const seen = new Set<string>();
    const deduped = events
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));

    // Return fallback response structure
    return {
      events: deduped,
      summary: {
        totalQuantitySold: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        averageSellingPrice: 0,
        averageCostPrice: Number(product.costPrice || 0),
        profitMargin: 0,
        currentStock: Number(product.currentStock || 0),
        totalReceived: 0,
        stockTurnover: 0,
      },
      costHistory: [],
      batchReceipts: [],
    };
  }
};

/**
 * Create a new product
 * POST /api/products
 * Backend returns product directly, not wrapped in ApiResponse
 */
export const createProduct = async (request: CreateProductRequest): Promise<Product> => {
  const { data } = await api.post<Product>('/products', request);
  return data; // Backend returns product directly, not data.data
};

/**
 * Update an existing product
 * PUT /api/products/:id
 * Backend returns product directly, not wrapped in ApiResponse
 */
export const updateProduct = async (id: string, request: UpdateProductRequest): Promise<Product> => {
  const { data } = await api.put<Product>(`/products/${id}`, request);
  return data; // Backend returns product directly, not data.data
};

/**
 * Delete a product (soft delete - sets isActive to false)
 * DELETE /api/products/:id
 */
export const deleteProduct = async (id: string): Promise<void> => {
  await api.delete(`/products/${id}`);
};

/**
 * Search products by query
 * GET /api/products/search
 */
export const searchProducts = async (params: SearchProductsParams): Promise<Product[]> => {
  const { data } = await api.get<ApiResponse<Product[]>>('/products/search', { params });
  return data.data;
};

/**
 * Get products by category
 * GET /api/products/category/:category
 */
export const getProductsByCategory = async (category: string): Promise<Product[]> => {
  const { data } = await api.get<ApiResponse<Product[]>>(`/products/category/${category}`);
  return data.data;
};

/**
 * Get low stock products
 * GET /api/products/low-stock
 */
export const getLowStockProducts = async (): Promise<ProductWithStock[]> => {
  const { data } = await api.get<ApiResponse<ProductWithStock[]>>('/products/low-stock');
  return data.data;
};

/**
 * Get product categories (unique list)
 * GET /api/products/categories
 */
export const getProductCategories = async (): Promise<string[]> => {
  const { data } = await api.get<ApiResponse<string[]>>('/products/categories');
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all products with pagination and filters
 * @example
 * const { data: products } = useProducts({ 
 *   search: 'laptop', 
 *   category: 'Electronics',
 *   inStock: true 
 * });
 */
export function useProducts(params?: GetProductsParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => getProducts(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get single product by ID
 * @example
 * const { data: product } = useProduct('product-123');
 */
export function useProduct(id: string | null | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Hook to get unified product history
 */
export function useProductHistory(id: string | null | undefined) {
  return useQuery({
    queryKey: ['productHistory', id],
    queryFn: () => getProductHistory(id!),
    enabled: !!id,
    staleTime: 30000,
  });
}

/**
 * Hook to search products
 * @example
 * const { data: results } = useSearchProducts({ query: 'laptop', limit: 10 });
 */
export function useSearchProducts(params: SearchProductsParams) {
  return useQuery({
    queryKey: ['searchProducts', params],
    queryFn: () => searchProducts(params),
    enabled: !!params.query && params.query.length >= 2,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get products by category
 * @example
 * const { data: electronics } = useProductsByCategory('Electronics');
 */
export function useProductsByCategory(category: string | null | undefined) {
  return useQuery({
    queryKey: ['productsByCategory', category],
    queryFn: () => getProductsByCategory(category!),
    enabled: !!category,
    staleTime: 60000,
  });
}

/**
 * Hook to get low stock products
 * @example
 * const { data: lowStock } = useLowStockProducts();
 */
export function useLowStockProducts() {
  return useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: () => getLowStockProducts(),
    staleTime: 120000, // 2 minutes
  });
}

/**
 * Hook to get product categories
 * @example
 * const { data: categories } = useProductCategories();
 */
export function useProductCategories() {
  return useQuery({
    queryKey: ['productCategories'],
    queryFn: () => getProductCategories(),
    staleTime: 300000, // 5 minutes - categories change rarely
  });
}

/**
 * Hook to create a product
 * @example
 * const createProductMutation = useCreateProduct();
 * await createProductMutation.mutateAsync({
 *   name: 'Laptop',
 *   sku: 'LAP-001',
 *   unitPrice: 50000,
 *   category: 'Electronics'
 * });
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Invalidate categories (new product might have new category)
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      // Invalidate low stock
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

/**
 * Hook to update a product
 * @example
 * const updateProductMutation = useUpdateProduct();
 * await updateProductMutation.mutateAsync({
 *   id: 'product-123',
 *   request: { unitPrice: 55000, isActive: true }
 * });
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateProductRequest }) =>
      updateProduct(id, request),
    onSuccess: (_, variables) => {
      // Invalidate specific product
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ['searchProducts'] });
      // Invalidate categories
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      // Invalidate low stock
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

/**
 * Hook to delete a product
 * @example
 * const deleteProductMutation = useDeleteProduct();
 * await deleteProductMutation.mutateAsync('product-123');
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: (_, productId) => {
      // Invalidate specific product
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ['searchProducts'] });
      // Invalidate low stock
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

// Export everything as a namespace for convenience
export const productsApi = {
  getProducts,
  getProduct,
  getProductHistory,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getProductsByCategory,
  getLowStockProducts,
  getProductCategories,
};
