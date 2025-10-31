import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/config/api.config';
import { z } from 'zod';
import { useToast } from './ui/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { 
  Search, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  Save,
  Calculator,
  BarChart3
} from 'lucide-react';

interface Product {
  id: string;
  sku?: string;
  barcode?: string;
  name: string;
  currentStock: number;
  unitOfMeasure: string;
  location?: string;
  category?: string;
  unitCost?: number;
  cost?: number;
}

interface ProductCount {
  productId: string;
  sku: string;
  name: string;
  systemQty: number;
  countedQty: number | null;
  variance: number;
  variancePercentage: number;
  unitCost: number;
  costImpact: number;
  notes: string;
  status: 'pending' | 'counted' | 'variance';
}

export function PhysicalCountManagement() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [productCounts, setProductCounts] = useState<ProductCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countSession, setCountSession] = useState<{
    id: string;
    title: string;
    startedAt: Date;
    status: 'active' | 'completed';
  } | null>(null);

  // Load products when component mounts
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // Use shared axios instance to include auth token automatically
      const { data } = await api.get('/products', { params: { page: 1, limit: 1000 } });
      console.log('Loaded products:', data);

      // Handle paginated response shape { data, pagination }
      const rawProducts = (data?.data ?? data) as any[];

      // Filter to only active products and normalize numeric fields
      const normalized = rawProducts
        .filter((p: any) => p.isActive !== false)
        .map((p) => ({
          ...p,
          currentStock: typeof p.currentStock === 'string' ? Number(p.currentStock) : (p.currentStock ?? 0),
          unitCost: typeof p.unitCost === 'string' ? Number(p.unitCost) : (p.unitCost ?? undefined),
          cost: typeof p.cost === 'string' ? Number(p.cost) : (p.cost ?? undefined),
          costPrice: typeof p.costPrice === 'string' ? Number(p.costPrice) : (p.costPrice ?? undefined),
        }));

      setProducts(normalized as any);

      // Initialize product counts
      const counts: ProductCount[] = normalized.map((product: any) => ({
        productId: product.id,
        sku: product.sku || product.barcode || 'N/A',
        name: product.name,
        systemQty: Number(product.currentStock ?? 0),
        countedQty: null,
        variance: 0,
        variancePercentage: 0,
        // Prefer costPrice from backend, fall back to unitCost/cost
        unitCost: Number(
          product.costPrice ?? product.unitCost ?? product.cost ?? 0
        ),
        costImpact: 0,
        notes: '',
        status: 'pending' as const,
      }));
      setProductCounts(counts);
    } catch (error) {
      console.error('Error loading products:', error);
      // If unauthorized, surface a clearer hint
      const msg = (error as any)?.response?.status === 401
        ? 'Unauthorized. Please sign in first.'
        : 'Error loading products. Please check your connection and try again.';
      toast({
        title: 'Failed to load products',
        description: msg,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startCountSession = () => {
    if (!products || products.length === 0) {
      toast({
        title: 'Cannot start physical count',
        description: 'No products are loaded. Ensure you are signed in and the backend is running on port 3001.',
        variant: 'destructive'
      });
      return;
    }
    const session = {
      id: Date.now().toString(),
      title: `Physical Count - ${new Date().toLocaleDateString()}`,
      startedAt: new Date(),
      status: 'active' as const,
    };
    setCountSession(session);
  };

  const updateProductCount = (productId: string, countedQty: number, notes?: string) => {
    setProductCounts(prev => prev.map(count => {
      if (count.productId === productId) {
        const variance = countedQty - count.systemQty;
        const variancePercentage = count.systemQty === 0 
          ? (countedQty > 0 ? 100 : 0)
          : Math.abs(variance / count.systemQty) * 100;
        const costImpact = variance * count.unitCost;
        
        return {
          ...count,
          countedQty,
          variance,
          variancePercentage,
          costImpact,
          notes: notes || count.notes,
          status: variance === 0 ? 'counted' : 'variance',
        };
      }
      return count;
    }));
  };

  // Frontend Zod schemas (mirrors backend validation)
  const AdjustmentSchema = z.object({
    productId: z.string().min(1, 'Product is required'),
    batchId: z.string().optional().nullable(),
    adjustmentQuantity: z
      .number()
      .finite('Adjustment quantity must be a valid number')
      .refine((v) => v !== 0, 'Adjustment quantity cannot be zero'),
    reason: z.string().min(1, 'Reason is required'),
    notes: z.string().max(1000).optional().nullable(),
    reference: z.string().max(100).optional().nullable(),
  });

  const completeCount = async () => {
    console.log('🎯 Complete Count clicked!');
    console.log('Count session:', countSession);
    
    if (!countSession) {
      console.log('❌ No count session active');
      return;
    }

    const adjustments = productCounts
      .filter(count => count.countedQty !== null && count.variance !== 0)
      .map(count => ({
        productId: count.productId,
        adjustmentQuantity: count.variance, // Backend expects 'adjustmentQuantity' not 'quantity'
        reason: `Physical Count - ${countSession.title}`,
        notes: count.notes || `Physical count adjustment. System: ${count.systemQty}, Counted: ${count.countedQty}, Variance: ${count.variance}`,
      }));
    
    console.log('📦 Adjustments to submit:', adjustments);

    try {
      // Zod validate each adjustment before sending
      const failures: { index: number; message: string }[] = [];
      adjustments.forEach((adj, idx) => {
        const parsed = AdjustmentSchema.safeParse(adj);
        if (!parsed.success) {
          parsed.error.issues.forEach((iss) =>
            failures.push({ index: idx + 1, message: iss.message })
          );
        }
      });

      if (failures.length > 0) {
        toast({
          title: 'Validation failed',
          description: failures
            .slice(0, 4)
            .map((f) => `Item ${f.index}: ${f.message}`)
            .join('\n') + (failures.length > 4 ? `\n...and ${failures.length - 4} more` : ''),
          variant: 'destructive',
        });
        return;
      }

      if (adjustments.length === 0) {
        toast({
          title: 'Nothing to adjust',
          description: 'No variances detected. Enter counted quantities that differ from system quantities to create adjustments.',
          variant: 'destructive',
        });
        return;
      }

      // Submit adjustments to your existing stock movement API
      console.log('📤 Submitting adjustments to API...');
      for (const adjustment of adjustments) {
        console.log('  → Posting adjustment:', adjustment);
        const response = await api.post('/stock-movements/adjustment', adjustment);
        console.log('  ✅ Response:', response.data);
      }

      console.log('✅ All adjustments submitted successfully!');
      setCountSession(prev => prev ? { ...prev, status: 'completed' } : null);
      toast({
        title: 'Physical count completed',
        description: `${adjustments.length} adjustment(s) processed successfully.`,
      });
      
      // Reload products to get updated stock levels
      await loadProducts();
    } catch (error) {
      console.error('Error completing count:', error);
      const err: any = error;
      // Try to surface Zod error details from backend if present
      const details = err?.response?.data?.details;
      const message = err?.response?.data?.error || err?.message || 'Please try again.';
      const desc = Array.isArray(details)
        ? details.slice(0, 4).map((d: any) => d.message || JSON.stringify(d)).join('\n')
        : message;
      toast({
        title: 'Failed to complete physical count',
        description: desc,
        variant: 'destructive',
      });
    }
  };

  const filteredCounts = productCounts.filter(count => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase().trim();
    return (
      count.sku.toLowerCase().includes(searchLower) ||
      count.name.toLowerCase().includes(searchLower)
    );
  });

  const countedItems = productCounts.filter(count => count.countedQty !== null).length;
  const totalItems = productCounts.length;
  const varianceItems = productCounts.filter(count => count.status === 'variance').length;
  const totalCostImpact = productCounts.reduce((sum, count) => sum + count.costImpact, 0);

  const getStatusIcon = (status: ProductCount['status']) => {
    switch (status) {
      case 'pending':
        return <Package className="h-4 w-4 text-gray-400" />;
      case 'counted':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'variance':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    }
  };

  const getVarianceDisplay = (count: ProductCount) => {
    if (count.countedQty === null) return '-';
    
    const isPositive = count.variance > 0;
    const color = count.variance === 0 ? 'text-green-600' : (isPositive ? 'text-blue-600' : 'text-red-600');
    
    return (
      <span className={color}>
        {isPositive ? '+' : ''}{count.variance} ({count.variancePercentage.toFixed(1)}%)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Physical Count Management
              </CardTitle>
              <CardDescription>
                Count physical inventory to identify and correct stock discrepancies
              </CardDescription>
            </div>
            {!countSession && (
              <Button onClick={startCountSession} disabled={isLoading}>
                Start Physical Count
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Count Session Status */}
      {countSession && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-lg">{countSession.title}</CardTitle>
                <CardDescription>
                  Started: {countSession.startedAt.toLocaleString()}
                </CardDescription>
              </div>
              <Badge variant={countSession.status === 'active' ? 'default' : 'secondary'}>
                {countSession.status === 'active' ? 'In Progress' : 'Completed'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{countedItems}/{totalItems}</div>
                <div className="text-sm text-muted-foreground">Products Counted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{varianceItems}</div>
                <div className="text-sm text-muted-foreground">Variances Found</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold flex items-center justify-center gap-1">
                  <Calculator className="h-5 w-5" />
                  {((countedItems / totalItems) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold flex items-center justify-center gap-1">
                  <span className={totalCostImpact >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${Math.abs(totalCostImpact).toFixed(2)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">Cost Impact</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Actions */}
      {countSession && (
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products by SKU or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-20"
            />
            {searchTerm && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {filteredCounts.length} of {productCounts.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="h-6 w-6 p-0 hover:bg-gray-100"
                >
                  ×
                </Button>
              </div>
            )}
          </div>
          
          {countSession.status === 'active' && countedItems > 0 && (
            <Button 
              onClick={completeCount}
              disabled={countedItems === 0 || countSession?.status !== 'active'}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Complete Count ({countedItems} counted, {varianceItems} adjustments)
            </Button>
          )}
        </div>
      )}

      {/* Product Count Table */}
      {countSession && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Product Inventory Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>System Qty</TableHead>
                  <TableHead>Counted Qty</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Cost Impact</TableHead>
                  <TableHead>Prices</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? (
                        <div>
                          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No products found matching "{searchTerm}"
                        </div>
                      ) : (
                        <div>
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No products loaded
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCounts.map((count) => (
                    <TableRow key={count.productId} className={count.status === 'variance' ? 'bg-orange-50' : ''}>
                      <TableCell>
                        {getStatusIcon(count.status)}
                      </TableCell>
                      <TableCell className="font-mono">{count.sku}</TableCell>
                      <TableCell>{count.name}</TableCell>
                      <TableCell>
                        {count.systemQty.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={count.countedQty || ''}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 0;
                            updateProductCount(count.productId, qty);
                          }}
                          className="w-24"
                          placeholder="0"
                          disabled={countSession?.status !== 'active'}
                        />
                      </TableCell>
                      <TableCell>
                        {getVarianceDisplay(count)}
                      </TableCell>
                      <TableCell>
                        {count.costImpact !== 0 && (
                          <span className={count.costImpact > 0 ? 'text-green-600' : 'text-red-600'}>
                            ${Math.abs(count.costImpact).toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PricePopover productId={count.productId} />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={count.notes}
                          onChange={(e) => {
                            setProductCounts(prev => prev.map(c => 
                              c.productId === count.productId 
                                ? { ...c, notes: e.target.value }
                                : c
                            ));
                          }}
                          placeholder="Notes..."
                          className="w-32"
                          disabled={countSession?.status !== 'active'}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Getting Started Message */}
      {!countSession && !isLoading && (
        <Card>
          <CardContent className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Ready to Start Physical Count</h3>
            <p className="text-muted-foreground mb-4">
              Click "Start Physical Count" to begin counting your inventory. You'll be able to enter actual quantities found and the system will calculate variances automatically.
            </p>
            <p className="text-sm text-muted-foreground">
              {products.length > 0 ? (
                `${products.length} products loaded and ready for counting`
              ) : (
                "Loading products... Please ensure your backend server is running on port 3001"
              )}
            </p>
            {products.length === 0 && !isLoading && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Backend Connection Required:</strong><br/>
                  • Ensure SamplePOS.Server is running on port 3001<br/>
                  • Check that you have products in your database<br/>
                  • Verify the /api/products endpoint is accessible
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading products from backend...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Inline component: on-demand price quote for Retail & Wholesale ---
function PricePopover({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['price-quote', productId, { includeBatches: true }],
    queryFn: async () => {
      const res = await api.get(`/pricing/retail-wholesale/${productId}`, { params: { quantity: 1, includeBatches: true } });
      return res.data?.data ?? null;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const retail = data?.retail;
  const wholesale = data?.wholesale;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">View</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Retail</span>
            <Badge>{isFetching ? '...' : retail ? `$${Number(retail.price).toFixed(2)}` : '—'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Wholesale</span>
            <Badge variant="secondary">{isFetching ? '...' : wholesale ? `$${Number(wholesale.price).toFixed(2)}` : '—'}</Badge>
          </div>
          {isError && (
            <div className="text-xs text-red-600">Failed to load prices.</div>
          )}
          {!isFetching && (retail?.tierName || retail?.formula || wholesale?.tierName || wholesale?.formula) && (
            <div className="mt-2 space-y-1">
              {retail?.tierName && (
                <div className="text-xs text-muted-foreground">Retail Tier: {retail.tierName}</div>
              )}
              {wholesale?.tierName && (
                <div className="text-xs text-muted-foreground">Wholesale Tier: {wholesale.tierName}</div>
              )}
            </div>
          )}
          {!!data?.batches?.length && (
            <div className="mt-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Active Batches (FIFO)</div>
              <div className="max-h-48 overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-1">Batch</TableHead>
                      <TableHead className="py-1 text-right">Retail</TableHead>
                      <TableHead className="py-1 text-right">Wholesale</TableHead>
                      <TableHead className="py-1 text-right">Remain</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.batches.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="py-1 text-xs font-mono">{b.batchNumber || b.id.slice(0,6)}</TableCell>
                        <TableCell className="py-1 text-xs text-right">{b.retailPrice != null ? `$${Number(b.retailPrice).toFixed(2)}` : (b.sellingPrice != null ? `$${Number(b.sellingPrice).toFixed(2)}` : '—')}</TableCell>
                        <TableCell className="py-1 text-xs text-right">{b.wholesalePrice != null ? `$${Number(b.wholesalePrice).toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="py-1 text-xs text-right">{Number(b.remainingQuantity).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}