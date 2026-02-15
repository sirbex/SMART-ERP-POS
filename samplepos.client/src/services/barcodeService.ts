// Barcode Service - Product lookup and UoM selection

import apiClient from '../utils/api';

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  sellingPrice: number;
  productUoms: Array<{
    id: string;
    name: string;
    symbol: string;
    factor: number;
    isBaseUnit: boolean;
    barcode?: string | null;
  }>;
}

interface BarcodeMatch {
  product: Product;
  uom: {
    id: string;
    name: string;
    factor: number;
  };
  defaultQuantity: number;
}

/**
 * Find product by barcode (checks product and UoM barcodes)
 * @param barcode - Scanned barcode
 * @param products - Product catalog (from cache or API)
 * @returns Matched product with UoM or null
 */
export function findProductByBarcode(
  barcode: string,
  products: Product[]
): BarcodeMatch | null {
  if (!barcode || barcode.trim().length === 0) {
    return null;
  }

  const normalizedBarcode = barcode.trim().toUpperCase();

  for (const product of products) {
    // Check product-level barcode
    if (product.barcode && product.barcode.toUpperCase() === normalizedBarcode) {
      // Find base UoM
      const baseUom = product.productUoms.find(u => u.isBaseUnit);
      if (baseUom) {
        return {
          product,
          uom: {
            id: baseUom.id,
            name: baseUom.name,
            factor: baseUom.factor,
          },
          defaultQuantity: 1,
        };
      }
    }

    // Check UoM-level barcodes
    for (const uom of product.productUoms) {
      if (uom.barcode && uom.barcode.toUpperCase() === normalizedBarcode) {
        return {
          product,
          uom: {
            id: uom.id,
            name: uom.name,
            factor: uom.factor,
          },
          defaultQuantity: 1, // One unit of this UoM
        };
      }
    }
  }

  return null;
}

/**
 * Validate barcode format
 * @param barcode - Barcode string
 * @returns True if valid format
 */
export function isValidBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') {
    return false;
  }

  const trimmed = barcode.trim();

  // Must be between 3 and 50 characters
  if (trimmed.length < 3 || trimmed.length > 50) {
    return false;
  }

  // Common barcode formats validation
  // EAN-8, EAN-13, UPC-A, Code128, etc.
  const validPatterns = [
    /^\d{8}$/,        // EAN-8
    /^\d{12,13}$/,    // UPC-A, EAN-13
    /^[A-Z0-9\-]+$/,  // Code128, Code39
  ];

  return validPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Get product catalog from cache or API
 * Used for offline barcode scanning
 * 
 * CRITICAL: Uses centralized apiClient to ensure token is always included
 */
export async function getProductCatalog(): Promise<Product[]> {
  // Try localStorage cache first (offline mode)
  const cached = localStorage.getItem('product_catalog_cache');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const cacheTime = parsed.timestamp || 0;
      const maxAge = 30 * 60 * 1000; // 30 minutes

      if (Date.now() - cacheTime < maxAge) {
        return parsed.products || [];
      }
    } catch (error) {
      console.error('Failed to parse product cache:', error);
    }
  }

  // Fetch from API using centralized apiClient (handles auth automatically)
  try {
    const response = await apiClient.get('/products', {
      params: { limit: 1000 }
    });

    const products = response.data?.data?.data || [];

    // Cache for offline use
    localStorage.setItem('product_catalog_cache', JSON.stringify({
      products,
      timestamp: Date.now(),
    }));

    return products;
  } catch (error) {
    console.error('Failed to fetch product catalog:', error);

    // Fallback to stale cache if available
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.products || [];
      } catch {
        return [];
      }
    }

    return [];
  }
}

/**
 * Pre-warm product cache
 * Call on POS page load for faster barcode scanning
 */
export async function preWarmProductCache(): Promise<void> {
  try {
    await getProductCatalog();
  } catch (error) {
    console.error('Failed to pre-warm product cache:', error);
  }
}
