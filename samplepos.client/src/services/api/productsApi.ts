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
}

/**
 * Request to create a new product
 */
export interface CreateProductRequest {
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  category?: string;
  unitPrice: number;
  costPrice?: number;
  taxRate?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  unit?: string;
  isActive?: boolean;
  imageUrl?: string;
  alternateUnits?: Array<{
    unit: string;
    conversionRate: number;
  }>;
}

/**
 * Request to update an existing product
 */
export interface UpdateProductRequest {
  name?: string;
  sku?: string;
  barcode?: string;
  description?: string;
  category?: string;
  unitPrice?: number;
  costPrice?: number;
  taxRate?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  unit?: string;
  isActive?: boolean;
  imageUrl?: string;
  alternateUnits?: Array<{
    unit: string;
    conversionRate: number;
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
 */
export const getProduct = async (id: string): Promise<ProductWithStock> => {
  const { data } = await api.get<ApiResponse<ProductWithStock>>(`/products/${id}`);
  return data.data;
};

/**
 * Create a new product
 * POST /api/products
 */
export const createProduct = async (request: CreateProductRequest): Promise<Product> => {
  const { data } = await api.post<ApiResponse<Product>>('/products', request);
  return data.data;
};

/**
 * Update an existing product
 * PUT /api/products/:id
 */
export const updateProduct = async (id: string, request: UpdateProductRequest): Promise<Product> => {
  const { data } = await api.put<ApiResponse<Product>>(`/products/${id}`, request);
  return data.data;
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
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getProductsByCategory,
  getLowStockProducts,
  getProductCategories,
};
