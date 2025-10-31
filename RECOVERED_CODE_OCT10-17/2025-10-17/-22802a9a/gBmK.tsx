/**
 * POS Screen Component - Main point of sale interface
 */

import { useState, useEffect } from 'react';
import { POSService } from '../services/POSService';
import type { InventoryItem } from '../models/InventoryItem';
import type { TransactionItem, PaymentMethod, Transaction } from '../models/Transaction';
import type { ProductStockSummary } from '../models/BatchInventory';
// InventoryBatchService is used indirectly through POSService
import { v4 as uuidv4 } from 'uuid';

// Shadcn UI components
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';

// Icons
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  X,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle
} from 'lucide-react';

const POSScreenShadcn = () => {
  // State for inventory items and filtered results
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'expiring-soon'>('all');
  
  // Enhanced inventory information
  const [productsWithInventory, setProductsWithInventory] = useState<Array<{
    product: InventoryItem;
    stockSummary: ProductStockSummary | null;
  }>>([]);
  
  // Shopping cart state
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  
  // Payment state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [changeAmount, setChangeAmount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  
  // Receipt state
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  
  // Inventory details dialog state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [showInventoryDetailsDialog, setShowInventoryDetailsDialog] = useState(false);
  
  // Transaction history dialog state
  const [showTransactionHistoryDialog, setShowTransactionHistoryDialog] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<Transaction[]>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Initialize data
  useEffect(() => {
    const loadData = () => {
      setIsLoading(true);
      
      // Add sample inventory if needed
      POSService.addSampleInventory();
      
      // Load inventory with enhanced batch information
      const inventoryItems = POSService.getInventory();
      const enhancedProducts = POSService.getAllProductsWithInventory();
      
      // Load transaction history
      const transactions = POSService.getTransactions();
      
      setInventory(inventoryItems);
      setFilteredItems(inventoryItems);
      setProductsWithInventory(enhancedProducts);
      setTransactionHistory(transactions);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(inventoryItems.map(item => item.category || 'Uncategorized'))];
      setCategories(uniqueCategories as string[]);
      
      setIsLoading(false);
    };
    
    loadData();
  }, []);
  
  // Filter items when search term, category, or inventory status changes
  useEffect(() => {
    // Ensure inventory is always an array
    let filtered = Array.isArray(inventory) ? inventory : [];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = Array.isArray(filtered) ? filtered.filter(item => 
        item?.name?.toLowerCase().includes(term) || 
        item?.sku?.toLowerCase?.()?.includes(term) || 
        item?.barcode?.includes(term)
      ) : [];
    }
    
    // Apply category filter
    if (selectedCategory) {
      filtered = Array.isArray(filtered) ? filtered.filter(item => item?.category === selectedCategory) : [];
    }
    
    // Apply inventory status filter
    if (inventoryFilter !== 'all') {
      filtered = Array.isArray(filtered) ? filtered.filter(item => {
        if (!item) return false;
        const enhancedProduct = Array.isArray(productsWithInventory) ? 
          productsWithInventory.find(p => p?.product?.id === item.id) : undefined;
        const stockSummary = enhancedProduct?.stockSummary;
        
        if (!stockSummary) return true; // Include if we don't have enhanced info
        
        switch (inventoryFilter) {
          case 'in-stock':
            return stockSummary.availableQuantity > 0;
          case 'low-stock':
            return stockSummary.isLowStock;
          case 'expiring-soon':
            return stockSummary.hasExpiringSoonStock;
          default:
            return true;
        }
      }) : [];
    }
    
    setFilteredItems(filtered);
  }, [searchTerm, selectedCategory, inventoryFilter, inventory, productsWithInventory]);
  
  // Calculate cart total whenever cart changes
  useEffect(() => {
    const total = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item?.subtotal || 0), 0) : 0;
    setCartTotal(total);
  }, [cart]);
  
  // Calculate change amount when payment amount changes
  useEffect(() => {
    const amount = parseFloat(paymentAmount) || 0;
    setChangeAmount(Math.max(0, amount - cartTotal));
  }, [paymentAmount, cartTotal]);
  
  // Add item to cart
  const addToCart = (product: InventoryItem) => {
    if (!product) return;
    
    // Ensure cart is always an array
    const safeCart = Array.isArray(cart) ? cart : [];
    
    // Check if item already exists in cart
    const existingItemIndex = safeCart.findIndex(item => item?.productId === product.id);
    
    if (existingItemIndex >= 0) {
      // Increment quantity of existing item
      const updatedCart = [...safeCart];
      updatedCart[existingItemIndex].quantity += 1;
      updatedCart[existingItemIndex].subtotal = 
        updatedCart[existingItemIndex].quantity * updatedCart[existingItemIndex].unitPrice;
      setCart(updatedCart);
    } else {
      // Add new item to cart
      const price = (typeof product.price === 'number') ? product.price : 0;
      const newItem: TransactionItem = {
        id: uuidv4(),
        productId: product.id || '',
        name: product.name || 'Unknown Product',
        quantity: 1,
        unit: product.unit || 'piece',
        unitPrice: price,
        price: price,        // Added required price property
        subtotal: price,
        originalProduct: product
      };
      setCart([...safeCart, newItem]);
    }
  };
  
  // Remove item from cart
  const removeFromCart = (itemId: string) => {
    if (!itemId) return;
    const safeCart = Array.isArray(cart) ? cart : [];
    setCart(safeCart.filter(item => item?.id !== itemId));
  };
  
  // Update item quantity
  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (!itemId || newQuantity < 1) return;
    
    const safeCart = Array.isArray(cart) ? cart : [];
    setCart(safeCart.map(item => {
      if (item?.id === itemId) {
        return {
          ...item,
          quantity: newQuantity,
          subtotal: newQuantity * (item?.unitPrice || 0)
        };
      }
      return item;
    }));
  };
  
  // Clear the cart
  const clearCart = () => {
    setCart([]);
  };
  
  // Process payment
  const processPayment = () => {
    setIsProcessing(true);
    
    // Create customer object if name provided
    const customer = customerName ? {
      id: uuidv4(),
      name: customerName
    } : undefined;
    
    // Create payment details
    const payment = {
      method: paymentMethod,
      amount: parseFloat(paymentAmount) || cartTotal,
      changeAmount: changeAmount
    };
    
    // Ensure cart is always an array
    const safeCart = Array.isArray(cart) ? cart : [];
    
    // Create transaction
    const transaction = POSService.createTransaction(safeCart, payment, customer);
    
    // Complete the transaction
    POSService.completeTransaction(transaction.id);
    
    // Save current transaction for receipt
    setCurrentTransaction(transaction);
    
    // Refresh transaction history
    const transactions = POSService.getTransactions();
    setTransactionHistory(transactions);
    
    // Update inventory information
    const enhancedProducts = POSService.getAllProductsWithInventory();
    setProductsWithInventory(enhancedProducts);
    
    setIsProcessing(false);
    setShowPaymentDialog(false);
    setShowReceipt(true);
  };
  
  // Start a new transaction
  const startNewTransaction = () => {
    setCart([]);
    setCurrentTransaction(null);
    setShowReceipt(false);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setChangeAmount(0);
    setCustomerName('');
  };
  
  // Category filtering
  const handleCategorySelect = (category: string) => {
    if (selectedCategory === category) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(category);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Point of Sale</h1>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm"
              className="flex items-center gap-1 h-8"
              onClick={() => setShowTransactionHistoryDialog(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path></svg>
              History
            </Button>
            <span className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>      {/* Main layout with products and cart */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-200px)]">
        {/* Product listing section */}
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Select products to add to cart
            </CardDescription>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name, SKU or barcode..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={inventoryFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInventoryFilter('all')}
                  className="text-xs h-8"
                >
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                  All Items
                </Button>
                <Button
                  variant={inventoryFilter === 'in-stock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInventoryFilter('in-stock')}
                  className="text-xs h-8"
                >
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                  In Stock
                </Button>
                <Button
                  variant={inventoryFilter === 'low-stock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInventoryFilter('low-stock')}
                  className="text-xs h-8"
                >
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  Low Stock
                </Button>
                <Button
                  variant={inventoryFilter === 'expiring-soon' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInventoryFilter('expiring-soon')}
                  className="text-xs h-8"
                >
                  <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                  Expiring Soon
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            {/* Category filter buttons */}
            <div className="overflow-x-auto whitespace-nowrap pb-2">
              <div className="flex gap-2 pb-2">
                {categories.map((category) => (
                  <Button 
                    key={category} 
                    variant={selectedCategory === category ? "default" : "outline"} 
                    size="sm"
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>
            <Separator className="my-2" />
          </CardContent>
          
          {/* Product grid */}
          <div className="h-[calc(100vh-400px)] overflow-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
              {isLoading ? (
                <div className="col-span-full flex justify-center items-center h-48">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((product) => (
                  <Card 
                    key={product.id} 
                    className="cursor-pointer hover:bg-accent transition-colors"
                  >
                    <CardContent 
                      className="p-4"
                      onClick={() => addToCart(product)}
                    >
                      <div className="text-sm font-medium">{product.name}</div>
                      <div className="flex justify-between items-center mt-2">
                        <Badge variant="outline">{product.unit}</Badge>
                        <span className="font-semibold">${product.price as number}</span>
                      </div>
                      
                      {/* Enhanced inventory information */}
                      {(() => {
                        // Find enhanced inventory information
                        const enhancedProduct = productsWithInventory.find(p => p.product.id === product.id);
                        const stockSummary = enhancedProduct?.stockSummary;
                        
                        if (stockSummary) {
                          return (
                            <div className="mt-2">
                              <div className="flex justify-between items-center">
                                <span 
                                  className="text-xs text-muted-foreground cursor-pointer underline-offset-2 hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductId(product.id || '');
                                    setShowInventoryDetailsDialog(true);
                                  }}
                                >
                                  Stock: {stockSummary.availableQuantity}
                                </span>
                                
                                {/* Status indicators */}
                                <div className="flex gap-1">
                                  {stockSummary.isLowStock && (
                                    <Badge 
                                      variant="destructive" 
                                      className="text-[10px] px-1 py-0 h-4 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductId(product.id || '');
                                        setShowInventoryDetailsDialog(true);
                                      }}
                                    >
                                      Low
                                    </Badge>
                                  )}
                                  {stockSummary.hasExpiringSoonStock && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-[10px] px-1 py-0 h-4 border-orange-500 text-orange-500 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductId(product.id || '');
                                        setShowInventoryDetailsDialog(true);
                                      }}
                                    >
                                      Expiring
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {/* Show expiry info if available */}
                              {stockSummary.earliestExpiry && (
                                <div 
                                  className={`text-[10px] cursor-pointer ${
                                    stockSummary.hasExpiredStock ? 'text-red-500' : 
                                    stockSummary.hasExpiringSoonStock ? 'text-orange-500' : 
                                    'text-muted-foreground'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductId(product.id || '');
                                    setShowInventoryDetailsDialog(true);
                                  }}
                                >
                                  Exp: {new Date(stockSummary.earliestExpiry).toLocaleDateString()}
                                </div>
                              )}
                              
                              {/* Details button */}
                              <div className="flex justify-between mt-2 pt-2 border-t border-muted">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-5 text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductId(product.id || '');
                                    setShowInventoryDetailsDialog(true);
                                  }}
                                >
                                  Details
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-5 text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToCart(product);
                                  }}
                                >
                                  Add to Cart +
                                </Button>
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <div>
                              <div className="text-xs text-muted-foreground mt-2">
                                Stock: {product.quantity as number}
                              </div>
                              
                              {/* Details button */}
                              <div className="flex justify-between mt-2 pt-2 border-t border-muted">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-5 text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductId(product.id || '');
                                    setShowInventoryDetailsDialog(true);
                                  }}
                                >
                                  Details
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-5 text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToCart(product);
                                  }}
                                >
                                  Add to Cart +
                                </Button>
                              </div>
                            </div>
                          );
                        }
                      })()}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center h-48 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No products found</p>
                  <p className="text-xs text-muted-foreground">Try a different search term or category</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Inventory status summary */}
          <div className="border-t p-4 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span>Total: {inventory.length} items</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                <span>In Stock: {
                  productsWithInventory.filter(p => 
                    p.stockSummary?.availableQuantity && p.stockSummary.availableQuantity > 0
                  ).length
                } items</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span>Low Stock: {
                  productsWithInventory.filter(p => 
                    p.stockSummary?.isLowStock
                  ).length
                } items</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                <span>Expiring Soon: {
                  productsWithInventory.filter(p => 
                    p.stockSummary?.hasExpiringSoonStock
                  ).length
                } items</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-gray-300 mr-2"></div>
                <span>Filtered: {filteredItems.length} items</span>
              </div>
            </div>
          </div>
        </Card>
        
        {/* Cart section */}
        <Card className="w-full lg:w-1/3">
          <CardHeader className="pb-2">
            <div className="flex justify-between">
              <CardTitle>Shopping Cart</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={clearCart}
                disabled={cart.length === 0}
              >
                Clear <X className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              {cart.length} item{cart.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          
          <div className="h-[calc(100vh-450px)] overflow-auto">
            <CardContent>
              {cart.length > 0 ? (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between items-center">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          ${item.unitPrice.toFixed(2)} per {item.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <div className="w-20 text-right">
                          ${item.subtotal.toFixed(2)}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground">Add products to get started</p>
                </div>
              )}
            </CardContent>
          </div>
          
          <CardFooter className="flex flex-col border-t">
            <div className="w-full pt-4">
              <div className="flex justify-between mb-2">
                <span>Subtotal</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold text-lg mb-4">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                disabled={cart.length === 0}
                onClick={() => setShowPaymentDialog(true)}
              >
                <CreditCard className="mr-2 h-5 w-5" /> Checkout
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
      
      {/* Payment dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name (Optional)</Label>
              <Input
                id="customerName"
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Tabs defaultValue="cash" onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                <TabsList className="grid grid-cols-3 mb-2">
                  <TabsTrigger value="cash">
                    <Banknote className="h-4 w-4 mr-2" /> Cash
                  </TabsTrigger>
                  <TabsTrigger value="card">
                    <CreditCard className="h-4 w-4 mr-2" /> Card
                  </TabsTrigger>
                  <TabsTrigger value="mobile">
                    <Smartphone className="h-4 w-4 mr-2" /> Mobile
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="cash" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cashAmount">Cash Received</Label>
                    <Input
                      id="cashAmount"
                      type="number"
                      placeholder="Enter amount"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Total Amount</span>
                    <span className="font-semibold">${cartTotal.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Change</span>
                    <span className="font-semibold">${changeAmount.toFixed(2)}</span>
                  </div>
                </TabsContent>
                
                <TabsContent value="card" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardAmount">Card Amount</Label>
                    <Input
                      id="cardAmount"
                      type="number"
                      placeholder="Enter amount"
                      value={cartTotal.toFixed(2)}
                      readOnly
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="cardReference">Reference/Last 4 Digits</Label>
                    <Input
                      id="cardReference"
                      placeholder="e.g., 1234"
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="mobile" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mobileAmount">Mobile Payment Amount</Label>
                    <Input
                      id="mobileAmount"
                      type="number"
                      placeholder="Enter amount"
                      value={cartTotal.toFixed(2)}
                      readOnly
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mobileReference">Reference Number</Label>
                    <Input
                      id="mobileReference"
                      placeholder="e.g., TR12345"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={processPayment} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Complete Payment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Receipt dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Receipt</DialogTitle>
          </DialogHeader>
          
          {currentTransaction && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <h3 className="font-bold">Sample POS Store</h3>
                <p className="text-sm text-muted-foreground">Business Address</p>
                <p className="text-sm text-muted-foreground">Phone: Phone Number</p>
              </div>
              
              <div className="text-sm">
                <div className="flex justify-between">
                  <span>Receipt #:</span>
                  <span>{currentTransaction.transactionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date(currentTransaction.createdAt).toLocaleString()}</span>
                </div>
                {currentTransaction.customer && (
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span>{currentTransaction.customer.name}</span>
                  </div>
                )}
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Item</span>
                  <div className="flex gap-8">
                    <span>Qty</span>
                    <span>Price</span>
                    <span>Total</span>
                  </div>
                </div>
                
                {currentTransaction.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.name}</span>
                    <div className="flex gap-8">
                      <span className="text-right w-8">{item.quantity}</span>
                      <span className="text-right w-12">${item.unitPrice.toFixed(2)}</span>
                      <span className="text-right w-12">${item.subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <Separator />
              
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${currentTransaction.subtotal.toFixed(2)}</span>
                </div>
                {currentTransaction.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>${currentTransaction.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {currentTransaction.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>${currentTransaction.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>${currentTransaction.total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Payment Method</span>
                  <span>{currentTransaction.payment.method}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Paid</span>
                  <span>${currentTransaction.payment.amount.toFixed(2)}</span>
                </div>
                {currentTransaction.payment.changeAmount && currentTransaction.payment.changeAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Change</span>
                    <span>${currentTransaction.payment.changeAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
              
              <div className="text-center text-xs text-muted-foreground pt-4">
                <p>Thank you for your purchase!</p>
                <p>Please come again</p>
              </div>
            </div>
          )}
          
          <div className="flex justify-center gap-2">
            <Button onClick={startNewTransaction}>
              <ArrowRight className="mr-2 h-4 w-4" /> New Transaction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Transaction History Dialog */}
      <Dialog open={showTransactionHistoryDialog} onOpenChange={setShowTransactionHistoryDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-4xl lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Tabs defaultValue="today">
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">This Week</TabsTrigger>
                <TabsTrigger value="month">This Month</TabsTrigger>
              </TabsList>
              
              <TabsContent value="today" className="space-y-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Transaction #</th>
                        <th className="p-2 text-left font-medium">Time</th>
                        <th className="p-2 text-left font-medium">Items</th>
                        <th className="p-2 text-left font-medium">Total</th>
                        <th className="p-2 text-left font-medium">Status</th>
                        <th className="p-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactionHistory
                        .filter(t => {
                          const today = new Date().toDateString();
                          const txDate = new Date(t.createdAt).toDateString();
                          return today === txDate;
                        })
                        .map(transaction => (
                          <tr key={transaction.id} className="hover:bg-muted/50">
                            <td className="p-2">{transaction.transactionNumber}</td>
                            <td className="p-2">{new Date(transaction.createdAt).toLocaleTimeString()}</td>
                            <td className="p-2">{transaction.itemCount || transaction.items?.length || 0} items</td>
                            <td className="p-2">${transaction.total.toFixed(2)}</td>
                            <td className="p-2">
                              <Badge variant={
                                transaction.status === 'completed' ? 'default' : 
                                transaction.status === 'cancelled' ? 'destructive' : 
                                'outline'
                              }>
                                {transaction.status}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  /* setSelectedTransaction removed */
                                  setCurrentTransaction(transaction);
                                  setShowReceipt(true);
                                  setShowTransactionHistoryDialog(false);
                                }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                        
                      {transactionHistory.filter(t => {
                        const today = new Date().toDateString();
                        const txDate = new Date(t.createdAt).toDateString();
                        return today === txDate;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-muted-foreground">
                            No transactions today
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
              
              <TabsContent value="week" className="space-y-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Transaction #</th>
                        <th className="p-2 text-left font-medium">Date</th>
                        <th className="p-2 text-left font-medium">Items</th>
                        <th className="p-2 text-left font-medium">Total</th>
                        <th className="p-2 text-left font-medium">Status</th>
                        <th className="p-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactionHistory
                        .filter(t => {
                          const now = new Date();
                          const weekAgo = new Date();
                          weekAgo.setDate(now.getDate() - 7);
                          const txDate = new Date(t.createdAt);
                          return txDate >= weekAgo && txDate <= now;
                        })
                        .map(transaction => (
                          <tr key={transaction.id} className="hover:bg-muted/50">
                            <td className="p-2">{transaction.transactionNumber}</td>
                            <td className="p-2">{new Date(transaction.createdAt).toLocaleDateString()}</td>
                            <td className="p-2">{transaction.itemCount || transaction.items?.length || 0} items</td>
                            <td className="p-2">${transaction.total.toFixed(2)}</td>
                            <td className="p-2">
                              <Badge variant={
                                transaction.status === 'completed' ? 'default' : 
                                transaction.status === 'cancelled' ? 'destructive' : 
                                'outline'
                              }>
                                {transaction.status}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  /* setSelectedTransaction removed */
                                  setCurrentTransaction(transaction);
                                  setShowReceipt(true);
                                  setShowTransactionHistoryDialog(false);
                                }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                        
                      {transactionHistory.filter(t => {
                        const now = new Date();
                        const weekAgo = new Date();
                        weekAgo.setDate(now.getDate() - 7);
                        const txDate = new Date(t.createdAt);
                        return txDate >= weekAgo && txDate <= now;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-muted-foreground">
                            No transactions this week
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
              
              <TabsContent value="month" className="space-y-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Transaction #</th>
                        <th className="p-2 text-left font-medium">Date</th>
                        <th className="p-2 text-left font-medium">Items</th>
                        <th className="p-2 text-left font-medium">Total</th>
                        <th className="p-2 text-left font-medium">Status</th>
                        <th className="p-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactionHistory
                        .filter(t => {
                          const now = new Date();
                          const monthAgo = new Date();
                          monthAgo.setMonth(now.getMonth() - 1);
                          const txDate = new Date(t.createdAt);
                          return txDate >= monthAgo && txDate <= now;
                        })
                        .map(transaction => (
                          <tr key={transaction.id} className="hover:bg-muted/50">
                            <td className="p-2">{transaction.transactionNumber}</td>
                            <td className="p-2">{new Date(transaction.createdAt).toLocaleDateString()}</td>
                            <td className="p-2">{transaction.itemCount || transaction.items?.length || 0} items</td>
                            <td className="p-2">${transaction.total.toFixed(2)}</td>
                            <td className="p-2">
                              <Badge variant={
                                transaction.status === 'completed' ? 'default' : 
                                transaction.status === 'cancelled' ? 'destructive' : 
                                'outline'
                              }>
                                {transaction.status}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  /* setSelectedTransaction removed */
                                  setCurrentTransaction(transaction);
                                  setShowReceipt(true);
                                  setShowTransactionHistoryDialog(false);
                                }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                        
                      {transactionHistory.filter(t => {
                        const now = new Date();
                        const monthAgo = new Date();
                        monthAgo.setMonth(now.getMonth() - 1);
                        const txDate = new Date(t.createdAt);
                        return txDate >= monthAgo && txDate <= now;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-muted-foreground">
                            No transactions this month
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
            
            <div className="flex justify-between pt-2">
              <div>
                <span className="text-sm text-muted-foreground">
                  Total Transactions: {transactionHistory.length}
                </span>
              </div>
              <Button 
                variant="outline"
                onClick={() => setShowTransactionHistoryDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Inventory Details Dialog */}
      <Dialog open={showInventoryDetailsDialog} onOpenChange={setShowInventoryDetailsDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Inventory Details</DialogTitle>
          </DialogHeader>
          
          {selectedProductId && (() => {
            const enhancedProduct = productsWithInventory.find(p => p.product.id === selectedProductId);
            
            if (!enhancedProduct) {
              return <div>No inventory details available</div>;
            }
            
            const { product, stockSummary } = enhancedProduct;
            
            return (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">{product.name}</h3>
                    <div className="flex text-sm text-muted-foreground">
                      <span className="mr-4">SKU: {product.sku || 'N/A'}</span>
                      <span>Barcode: {product.barcode || 'N/A'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {product.category || 'Uncategorized'}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Stock Information</h4>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Available:</div>
                      <div className="font-medium">
                        {stockSummary ? stockSummary.availableQuantity : product.quantity as number} {product.unit}
                      </div>
                      
                      {stockSummary && (
                        <>
                          <div className="text-muted-foreground">Total Batches:</div>
                          <div className="font-medium">{stockSummary.batchCount}</div>
                          
                          <div className="text-muted-foreground">Expiring Soon:</div>
                          <div className={`font-medium ${stockSummary.expiringSoonQuantity > 0 ? 'text-orange-500' : ''}`}>
                            {stockSummary.expiringSoonQuantity} {product.unit}
                          </div>
                          
                          <div className="text-muted-foreground">Reorder Level:</div>
                          <div className="font-medium">{stockSummary.reorderLevel} {product.unit}</div>
                          
                          <div className="text-muted-foreground">Status:</div>
                          <div>
                            {stockSummary.isLowStock && (
                              <Badge variant="destructive" className="text-xs mr-2">Low Stock</Badge>
                            )}
                            {stockSummary.hasExpiringSoonStock && (
                              <Badge variant="outline" className="text-xs border-orange-500 text-orange-500">Expiring Soon</Badge>
                            )}
                            {!stockSummary.isLowStock && !stockSummary.hasExpiringSoonStock && (
                              <Badge variant="outline" className="text-xs border-green-500 text-green-500">Good</Badge>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Pricing & Expiry</h4>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Selling Price:</div>
                      <div className="font-medium">${product.price as number}</div>
                      
                      {stockSummary && (
                        <>
                          <div className="text-muted-foreground">Average Cost:</div>
                          <div className="font-medium">${stockSummary.averageCost.toFixed(2)}</div>
                          
                          <div className="text-muted-foreground">Est. Profit:</div>
                          <div className="font-medium text-green-600">
                            ${((product.price as number) - stockSummary.averageCost).toFixed(2)} per {product.unit}
                          </div>
                          
                          <div className="text-muted-foreground">Earliest Expiry:</div>
                          <div className={`font-medium ${
                            stockSummary.hasExpiringSoonStock ? 'text-orange-500' : ''
                          }`}>
                            {stockSummary.earliestExpiry ? 
                              new Date(stockSummary.earliestExpiry).toLocaleDateString() : 'N/A'}
                          </div>
                          
                          <div className="text-muted-foreground">Latest Expiry:</div>
                          <div className="font-medium">
                            {stockSummary.latestExpiry ? 
                              new Date(stockSummary.latestExpiry).toLocaleDateString() : 'N/A'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {stockSummary && stockSummary.isLowStock && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                    <div className="font-medium text-red-600 mb-1">Reorder Alert</div>
                    <p className="text-red-700">
                      Current stock ({stockSummary.availableQuantity}) is below the reorder level ({stockSummary.reorderLevel}).
                      Consider ordering more stock soon.
                    </p>
                  </div>
                )}
                
                {stockSummary && stockSummary.hasExpiringSoonStock && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
                    <div className="font-medium text-orange-600 mb-1">Expiry Alert</div>
                    <p className="text-orange-700">
                      {stockSummary.expiringSoonQuantity} {product.unit}(s) expiring soon.
                      Earliest expiry: {stockSummary.earliestExpiry ? 
                        new Date(stockSummary.earliestExpiry).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                )}
                
                <div className="flex justify-between mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowInventoryDetailsDialog(false)}
                  >
                    Close
                  </Button>
                  <Button 
                    onClick={() => {
                      const productToAdd = productsWithInventory.find(p => p.product.id === selectedProductId)?.product;
                      if (productToAdd) {
                        addToCart(productToAdd);
                        setShowInventoryDetailsDialog(false);
                      }
                    }}
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSScreenShadcn;
