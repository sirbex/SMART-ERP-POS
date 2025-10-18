/**
 * QuickBooks-Inspired POS Screen Component
 * 
 * Professional Point of Sale interface with clean layout:
 * - Left: Product search and grid/list view
 * - Right: Shopping cart and checkout summary
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AspectRatio } from './ui/aspect-ratio';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { SheetContent, SheetDescription, SheetHeader, SheetTitle, Sheet } from './ui/sheet';
import { useToast } from '@/components/ui/toast';
import { Camera, Package, Search, Trash2, Plus, Minus, X, User, FileText, Receipt, ShoppingCart, Loader2, CircleDollarSign, CreditCard, Banknote, Wallet, UserRound, Grid3x3, List } from 'lucide-react';

// Import API services
import * as POSServiceAPI from '../services/POSServiceAPI';
import api from '@/config/api.config';
import type { InventoryItem } from '../types';
import type { Customer } from '../types';
import type { Transaction, TransactionItem } from '../types';
import CreateCustomerModal from './CreateCustomerModal';

// Helper function for currency formatting
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

const POSScreenAPI: React.FC = () => {
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [cartItems, setCartItems] = useState<TransactionItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxRate = 0.10; // 10% tax rate
  const taxAmount = subtotal * taxRate;
  const discountAmount = selectedCustomer?.loyaltyDiscount || 0;
  const total = subtotal + taxAmount - discountAmount;
  const changeAmount = Math.max(0, paymentAmount - total);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Use new backend API endpoints
        const [customerList, transactions, productsResponse] = await Promise.all([
          POSServiceAPI.getCustomersForPOS(),
          POSServiceAPI.getRecentTransactions(),
          api.get('/products?limit=1000') // Get all products
        ]);
        
        // Transform new API response to InventoryItem format
        const productsData = productsResponse.data?.data || [];
        const items: InventoryItem[] = productsData.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          sku: item.barcode || item.id, // Use barcode or ID as SKU
          category: item.category || 'General',
          unit: item.baseUnit || 'pcs',
          price: Number(item.sellingPrice) || 0,
          basePrice: Number(item.costPrice) || Number(item.sellingPrice) || 0,
          quantity: Number(item.currentStock) || 0,
          reorderLevel: Number(item.reorderLevel) || 10,
          isActive: item.isActive !== false,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }));
        
        setInventoryItems(items);
        setFilteredItems(items);
        setCustomers(customerList);
        setRecentTransactions(transactions);
      } catch (error) {
        console.error("Error loading initial POS data:", error);
        toast({
          title: "Error",
          description: "Failed to load POS data. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
    
    // Focus search input when component mounts
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
    
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F3 or Ctrl+F to focus search
      if (e.key === 'F3' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      
      // Escape to clear search
      if (e.key === 'Escape' && searchInputRef.current === document.activeElement) {
        setSearchTerm('');
        debouncedSearch(''); // Clear search properly
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toast]); // Removed inventoryItems dependency

  // Debounced search with loading indicator
  const handleSearch = useCallback(async (term: string) => {
    setSearchTerm(term);
    
    if (!term.trim()) {
      setFilteredItems(inventoryItems);
      setSearching(false);
      return;
    }
    
    setSearching(true);
    
    try {
      const results = await POSServiceAPI.searchInventory(term);
      setFilteredItems(results);
      
      // If no results from API, try client-side filtering
      if (results.length === 0) {
        const filtered = inventoryItems.filter(item => 
          item.name.toLowerCase().includes(term.toLowerCase()) ||
          (item.sku && item.sku.toLowerCase().includes(term.toLowerCase())) ||
          (item.barcode && item.barcode.toLowerCase().includes(term.toLowerCase()))
        );
        setFilteredItems(filtered);
      }
    } catch (error) {
      console.error("Error searching inventory:", error);
      // Fall back to client-side filtering if API search fails
      const filtered = inventoryItems.filter(item => 
        item.name.toLowerCase().includes(term.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(term.toLowerCase())) ||
        (item.barcode && item.barcode.toLowerCase().includes(term.toLowerCase()))
      );
      setFilteredItems(filtered);
    } finally {
      setSearching(false);
    }
  }, [inventoryItems]);
  
  // Use a ref to store the timeout ID
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounce search to avoid excessive API calls
  const debouncedSearch = useCallback((term: string) => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If empty, search immediately
    if (!term.trim()) {
      handleSearch(term);
      return;
    }
    
    // Show searching state immediately
    setSearching(true);
    
    // Set new timeout
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(term);
    }, 300);
  }, [handleSearch]);

  // Add item to cart
  const addToCart = async (item: InventoryItem) => {
    // Check if we have enough stock
    try {
      const stockCheck = await POSServiceAPI.checkStock(item.id || '', 1);
      
      if (!stockCheck.success) {
        toast({
          title: "Insufficient Stock",
          description: stockCheck.message || `Only ${stockCheck.available} available.`,
          variant: "destructive",
        });
        return;
      }
      
      const existingItemIndex = cartItems.findIndex(cartItem => cartItem.productId === item.id);
      
      if (existingItemIndex >= 0) {
        // Item already in cart, increase quantity
        const updatedCart = [...cartItems];
        updatedCart[existingItemIndex].quantity += 1;
        setCartItems(updatedCart);
      } else {
        // Add new item to cart
        const newItem: TransactionItem = {
          id: Date.now().toString(),
          productId: item.id || '',
          name: item.name || '',
          price: item.basePrice || 0,
          quantity: 1,
          unit: item.unit || 'piece',
          unitPrice: item.basePrice || 0,
          subtotal: item.basePrice || 0,
          originalProduct: item
        };
        setCartItems([...cartItems, newItem]);
      }
      
      // Clear search after adding item
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
        searchInputRef.current.focus();
      }
    } catch (error) {
      console.error("Error adding item to cart:", error);
      toast({
        title: "Error",
        description: "Could not add item to cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update item quantity in cart
  const updateQuantity = async (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(index);
      return;
    }
    
    const item = cartItems[index];
    
    // Check if we have enough stock
    try {
      const stockCheck = await POSServiceAPI.checkStock(item.productId, newQuantity);
      
      if (!stockCheck.success) {
        toast({
          title: "Insufficient Stock",
          description: stockCheck.message || `Only ${stockCheck.available} available.`,
          variant: "destructive",
        });
        return;
      }
      
      const updatedCart = [...cartItems];
      updatedCart[index].quantity = newQuantity;
      updatedCart[index].subtotal = newQuantity * updatedCart[index].price;
      setCartItems(updatedCart);
    } catch (error) {
      console.error("Error updating quantity:", error);
      toast({
        title: "Error",
        description: "Could not update quantity. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Remove item from cart
  const removeFromCart = (index: number) => {
    const updatedCart = [...cartItems];
    updatedCart.splice(index, 1);
    setCartItems(updatedCart);
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
    setSelectedCustomer(null);
    setPaymentAmount(0);
    setPaymentMethod('cash');
  };

  // Search customers
  const handleCustomerSearch = useCallback(async (term: string) => {
    setCustomerSearchTerm(term);
    
    if (!term.trim()) {
      return;
    }
    
    try {
      const results = await POSServiceAPI.searchCustomers(term);
      setCustomers(results);
    } catch (error) {
      console.error("Error searching customers:", error);
    }
  }, []);

  // Handle customer selection
  const selectCustomer = async (customerId: string) => {
    try {
      const customer = await POSServiceAPI.getCustomer(customerId);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerSearchTerm('');
      }
    } catch (error) {
      console.error("Error loading customer:", error);
      toast({
        title: "Error",
        description: "Failed to load customer details. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Create new customer
  const handleCreateCustomer = async (customer: Omit<Customer, 'id'>) => {
    try {
      const newCustomerId = await POSServiceAPI.createCustomer(customer);
      
      if (newCustomerId) {
        const newCustomer = await POSServiceAPI.getCustomer(newCustomerId);
        if (newCustomer) {
          setSelectedCustomer(newCustomer);
          setCustomers(prev => [...prev, newCustomer]);
          setShowNewCustomerModal(false);
          
          toast({
            title: "Success",
            description: `Customer ${newCustomer.name} created successfully.`,
            variant: "default",
          });
        }
      }
    } catch (error) {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: "Failed to create new customer. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Process payment
  const processPayment = async () => {
    if (cartItems.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add items to the cart before checking out.",
        variant: "destructive",
      });
      return;
    }
    
    if (paymentAmount < total && paymentMethod === 'cash') {
      toast({
        title: "Insufficient Payment",
        description: `Payment amount must be at least ${formatCurrency(total)}.`,
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const transaction = {
        items: cartItems,
        customerId: selectedCustomer?.id,
        paymentMethod,
        paymentAmount,
        changeAmount,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        notes: selectedCustomer ? `Sale to ${selectedCustomer.name}` : 'Walk-in customer'
      };
      
      const transactionId = await POSServiceAPI.createTransaction(transaction);
      
      if (transactionId) {
        // Get the completed transaction with full details including items
        const completedTransaction = await POSServiceAPI.getTransactionById(transactionId);
        setCurrentTransaction(completedTransaction);
        
        toast({
          title: "Success",
          description: `Transaction completed successfully. ID: ${transactionId}`,
          variant: "default",
        });
        
        // Update recent transactions list
        const updatedTransactions = await POSServiceAPI.getRecentTransactions();
        setRecentTransactions(updatedTransactions);
        
        // Open receipt dialog
        setReceiptDialogOpen(true);
        
        // Clear cart and reset
        clearCart();
      } else {
        throw new Error("Failed to create transaction");
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      toast({
        title: "Transaction Failed",
        description: "Failed to process transaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPaymentDialogOpen(false);
    }
  };

  // Void a transaction
  const voidTransaction = async (id: string) => {
    if (window.confirm("Are you sure you want to void this transaction?")) {
      try {
        const reason = prompt("Please enter a reason for voiding this transaction:");
        if (!reason) return;
        
        const success = await POSServiceAPI.voidTransaction(id, reason);
        
        if (success) {
          toast({
            title: "Success",
            description: `Transaction ${id} voided successfully.`,
            variant: "default",
          });
          
          // Update recent transactions list
          const updatedTransactions = await POSServiceAPI.getRecentTransactions();
          setRecentTransactions(updatedTransactions);
        } else {
          throw new Error("Failed to void transaction");
        }
      } catch (error) {
        console.error("Error voiding transaction:", error);
        toast({
          title: "Error",
          description: "Failed to void transaction. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Handle barcode scanning
  const handleBarcodeScanned = async (barcode: string) => {
    try {
      // Search for item by barcode
      const results = await POSServiceAPI.searchInventory(barcode);
      
      if (results.length > 0) {
        // Add first matching item to cart
        addToCart(results[0]);
      } else {
        toast({
          title: "Item Not Found",
          description: `No item found with barcode ${barcode}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error processing barcode:", error);
      toast({
        title: "Error",
        description: "Failed to process barcode scan. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full bg-qb-gray-50">
      {/* Left column: Product Search & Inventory */}
      <div className="flex flex-col lg:w-3/5 h-full">
        <Card className="qb-card flex flex-col h-full bg-white">
          <CardHeader className="pb-3 border-b border-qb-gray-200">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-qb-gray-900">Product Catalog</CardTitle>
              <Badge variant="outline" className="bg-qb-blue-50 text-qb-blue-700 border-qb-blue-200">
                {filteredItems.length} items
              </Badge>
            </div>
            
            {/* Enhanced Search Bar */}
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                {searching ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-qb-blue-500 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-qb-gray-400" />
                )}
                <Input
                  ref={searchInputRef}
                  className="pl-10 qb-input bg-qb-gray-50 border-qb-gray-200 focus:bg-white"
                  placeholder="Search by name, SKU, or scan barcode..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    debouncedSearch(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Press Enter to add first result to cart
                    if (e.key === 'Enter' && filteredItems.length > 0 && !searching) {
                      addToCart(filteredItems[0]);
                      e.currentTarget.select(); // Select text for quick clear
                    }
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilteredItems(inventoryItems);
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-qb-gray-400 hover:text-qb-gray-600"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handleBarcodeScanned(searchTerm)}
                className="qb-btn-secondary"
                title="Scan Barcode"
                disabled={!searchTerm.trim()}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <Separator />
          
          <CardContent className="flex-1 pt-4 pb-0 overflow-hidden">
            <Tabs defaultValue="grid" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 mb-3 bg-qb-gray-100">
                <TabsTrigger value="grid" className="data-[state=active]:bg-white">
                  <Grid3x3 className="h-4 w-4 mr-2" />
                  Grid View
                </TabsTrigger>
                <TabsTrigger value="list" className="data-[state=active]:bg-white">
                  <List className="h-4 w-4 mr-2" />
                  List View
                </TabsTrigger>
              </TabsList>
              
              <div className="flex-1 overflow-hidden">
                <TabsContent value="grid" className="h-full overflow-y-auto mt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {loading ? (
                      <div className="col-span-full flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-qb-blue-500" />
                        <span className="ml-2 text-qb-gray-600">Loading inventory...</span>
                      </div>
                    ) : searching ? (
                      <div className="col-span-full flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-qb-blue-500" />
                        <span className="ml-2 text-qb-gray-600">Searching...</span>
                      </div>
                    ) : filteredItems.length === 0 ? (
                      <div className="col-span-full text-center p-8">
                        <Package className="h-12 w-12 mx-auto text-qb-gray-300 mb-3" />
                        {searchTerm ? (
                          <>
                            <p className="text-qb-gray-600 font-medium">No items found for "{searchTerm}"</p>
                            <p className="text-sm text-qb-gray-400 mt-1">Try different keywords or check spelling</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setSearchTerm('');
                                setFilteredItems(inventoryItems);
                                searchInputRef.current?.focus();
                              }}
                            >
                              Clear Search
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-qb-gray-600 font-medium">No inventory items</p>
                            <p className="text-sm text-qb-gray-400 mt-1">Add products to your inventory to get started</p>
                          </>
                        )}
                      </div>
                    ) : (
                      filteredItems.map((item) => (
                        <Card 
                          key={item.id}
                          className="cursor-pointer hover:shadow-qb-card-hover hover:border-qb-blue-300 transition-all duration-200 animate-fade-in"
                          onClick={() => addToCart(item)}
                        >
                          <CardContent className="p-3">
                            <div className="mb-2">
                              <AspectRatio ratio={1}>
                                <div className="flex items-center justify-center h-full bg-qb-gray-100 rounded-md">
                                  <Package className="h-8 w-8 text-qb-gray-400" />
                                </div>
                              </AspectRatio>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium line-clamp-1 text-qb-gray-900">{item.name}</p>
                              <p className="text-xs text-qb-gray-500">SKU: {item.sku || 'N/A'}</p>
                              <div className="flex justify-between items-center mt-2">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs px-1.5 py-0.5 ${
                                    (item.quantity || 0) < 10 
                                      ? 'bg-qb-red-50 text-qb-red-700 border-qb-red-200' 
                                      : 'bg-qb-green-50 text-qb-green-700 border-qb-green-200'
                                  }`}
                                >
                                  {item.quantity || 0} {item.unit || 'pc'}
                                </Badge>
                                <p className="text-sm font-semibold text-qb-blue-600">{formatCurrency(item.basePrice || 0)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="list" className="h-full overflow-y-auto mt-0">
                  <div className="space-y-1">
                    {loading ? (
                      <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-qb-blue-500" />
                        <span className="ml-2 text-qb-gray-600">Loading inventory...</span>
                      </div>
                    ) : searching ? (
                      <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-qb-blue-500" />
                        <span className="ml-2 text-qb-gray-600">Searching...</span>
                      </div>
                    ) : filteredItems.length === 0 ? (
                      <div className="text-center p-8">
                        <Package className="h-12 w-12 mx-auto text-qb-gray-300 mb-3" />
                        {searchTerm ? (
                          <>
                            <p className="text-qb-gray-600 font-medium">No items found for "{searchTerm}"</p>
                            <p className="text-sm text-qb-gray-400 mt-1">Try different keywords or check spelling</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setSearchTerm('');
                                setFilteredItems(inventoryItems);
                                searchInputRef.current?.focus();
                              }}
                            >
                              Clear Search
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-qb-gray-600 font-medium">No inventory items</p>
                            <p className="text-sm text-qb-gray-400 mt-1">Add products to your inventory to get started</p>
                          </>
                        )}
                      </div>
                    ) : (
                      filteredItems.map((item) => (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between p-3 hover:bg-qb-gray-50 rounded-md cursor-pointer qb-table-row border border-transparent hover:border-qb-blue-200 transition-all duration-200"
                          onClick={() => addToCart(item)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-qb-gray-100 rounded flex items-center justify-center">
                              <Package className="h-5 w-5 text-qb-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-qb-gray-900">{item.name}</p>
                              <div className="flex gap-2 text-xs text-qb-gray-500">
                                <span>SKU: {item.sku || 'N/A'}</span>
                                <span>•</span>
                                <span className={
                                  (item.quantity || 0) < 10 ? 'text-qb-red-600 font-medium' : 'text-qb-green-600'
                                }>
                                  {item.quantity || 0} {item.unit || 'pc'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="font-semibold text-qb-blue-600">{formatCurrency(item.basePrice || 0)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      
      {/* Right column: Shopping Cart & Checkout */}
      <div className="flex flex-col lg:w-2/5 h-full">
        <Card className="qb-card flex flex-col h-full bg-white">
          <CardHeader className="pb-3 border-b border-qb-gray-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-semibold text-qb-gray-900 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-qb-blue-500" />
                Shopping Cart
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearCart}
                disabled={cartItems.length === 0}
                className="qb-btn-secondary text-xs"
              >
                Clear All
              </Button>
            </div>
            
            {/* Customer Selection */}
            <div className="flex gap-2 mt-3">
              {selectedCustomer ? (
                <div className="flex-1 flex items-center space-x-2 p-2.5 bg-qb-blue-50 border border-qb-blue-200 rounded-md">
                  <UserRound className="h-5 w-5 text-qb-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-qb-gray-900">{selectedCustomer.name}</p>
                    <p className="text-xs text-qb-gray-500">{selectedCustomer.phone || selectedCustomer.email}</p>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6 hover:bg-qb-blue-100" 
                    onClick={() => setSelectedCustomer(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-qb-gray-400" />
                    <Input
                      className="pl-10 qb-input bg-qb-gray-50"
                      placeholder="Search customer..."
                      value={customerSearchTerm}
                      onChange={(e) => handleCustomerSearch(e.target.value)}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setShowNewCustomerModal(true)}
                    className="qb-btn-secondary"
                    title="Add New Customer"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            
            {/* Customer search results */}
            {!selectedCustomer && customerSearchTerm && customers.length > 0 && (
              <div className="relative">
                <Card className="absolute top-0 left-0 right-0 z-10 max-h-48 overflow-y-auto shadow-lg">
                  <CardContent className="p-0">
                    <ScrollArea className="h-full">
                      {customers.map((customer) => (
                        <div 
                          key={customer.id}
                          className="flex items-center justify-between p-3 hover:bg-qb-gray-50 cursor-pointer border-b last:border-b-0"
                          onClick={() => selectCustomer(customer.id)}
                        >
                          <div>
                            <p className="font-medium text-qb-gray-900">{customer.name}</p>
                            <p className="text-xs text-qb-gray-500">
                              {customer.phone || customer.email}
                            </p>
                          </div>
                          {(customer.balance ?? 0) > 0 && (
                            <Badge variant="outline" className="bg-qb-orange-50 text-qb-orange-700 border-qb-orange-200">
                              Balance: {formatCurrency(customer.balance ?? 0)}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardHeader>
          
          <Separator />
          
          <CardContent className="flex-1 py-4 overflow-auto">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-qb-gray-400">
                <ShoppingCart className="h-16 w-16 mb-3 opacity-50" />
                <p className="font-medium text-qb-gray-600">Cart is empty</p>
                <p className="text-sm mt-1">Search or scan items to add</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border border-qb-gray-200 rounded-md hover:border-qb-blue-300 transition-colors bg-white">
                    <div className="flex-1 mr-3">
                      <p className="font-medium text-qb-gray-900 text-sm">{item.name}</p>
                      <p className="text-xs text-qb-gray-500">
                        {formatCurrency(item.price)} per {item.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-7 w-7 hover:bg-qb-blue-50 hover:border-qb-blue-300"
                          onClick={() => updateQuantity(index, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="w-14 h-8 text-center text-sm font-medium border-qb-gray-200"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                        />
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-7 w-7 hover:bg-qb-blue-50 hover:border-qb-blue-300"
                          onClick={() => updateQuantity(index, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="w-20 text-right font-semibold text-qb-gray-900 text-sm">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-qb-red-600 hover:bg-qb-red-50"
                        onClick={() => removeFromCart(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          
          <Separator />
          
          <CardFooter className="flex-col pt-4 bg-qb-gray-50 border-t border-qb-gray-200">
            {/* Totals Summary */}
            <div className="w-full space-y-2 mb-4">
              <div className="flex justify-between text-sm text-qb-gray-700">
                <span>Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-qb-gray-700">
                <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                <span className="font-medium">{formatCurrency(taxAmount)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-qb-green-600">
                  <span>Discount</span>
                  <span className="font-medium">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-lg text-qb-gray-900">
                <span>Total</span>
                <span className="text-qb-blue-600">{formatCurrency(total)}</span>
              </div>
            </div>
            
            {/* Checkout Button */}
            <Button 
              className="w-full qb-btn-primary h-11 text-base font-semibold shadow-md" 
              size="lg" 
              disabled={cartItems.length === 0 || loading}
              onClick={() => setPaymentDialogOpen(true)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CircleDollarSign className="mr-2 h-5 w-5" />
                  Proceed to Checkout
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
      
      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
            <DialogDescription>
              Enter payment details to complete the transaction.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Total Due:</span>
              <span>{formatCurrency(total)}</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={setPaymentMethod}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center">
                      <Banknote className="mr-2 h-4 w-4" />
                      Cash
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Card
                    </div>
                  </SelectItem>
                  <SelectItem value="credit" disabled={!selectedCustomer}>
                    <div className="flex items-center">
                      <Wallet className="mr-2 h-4 w-4" />
                      Store Credit
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {paymentMethod === 'cash' && (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount Received</Label>
                <Input
                  id="amount"
                  type="number"
                  min={total}
                  step="0.01"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                />
                
                {paymentAmount >= total && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-800">
                    <p className="font-medium">Change Due: {formatCurrency(changeAmount)}</p>
                  </div>
                )}
              </div>
            )}
            
            {paymentMethod === 'card' && (
              <div className="space-y-2">
                <Label htmlFor="cardAmount">Card Payment Amount</Label>
                <Input
                  id="cardAmount"
                  type="number"
                  value={total.toFixed(2)}
                  disabled
                />
                <p className="text-sm text-muted-foreground">
                  Customer will be charged exactly {formatCurrency(total)}
                </p>
              </div>
            )}
            
            {paymentMethod === 'credit' && selectedCustomer && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Customer</Label>
                  <span>{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between">
                  <Label>Current Balance</Label>
                  <span>{formatCurrency(selectedCustomer.balance ?? 0)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <Label>New Balance After Purchase</Label>
                  <span>{formatCurrency((selectedCustomer.balance ?? 0) + total)}</span>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={processPayment} 
              disabled={
                loading || 
                (paymentMethod === 'cash' && paymentAmount < total) ||
                cartItems.length === 0
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Complete Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
            <DialogDescription>
              Transaction completed successfully.
            </DialogDescription>
          </DialogHeader>
          
          {currentTransaction && (
            <div className="space-y-4 py-4">
              <div className="border rounded-md p-4 space-y-2">
                <div className="text-center mb-4">
                  <h3 className="font-bold text-lg">SamplePOS Receipt</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(currentTransaction.createdAt).toLocaleString()}
                  </p>
                  <p className="text-sm">Transaction #{currentTransaction.id.slice(0, 8)}</p>
                </div>
                
                <div className="space-y-2">
                  {currentTransaction.items && currentTransaction.items.length > 0 ? (
                    currentTransaction.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        <span>{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground text-center">
                      <p>{currentTransaction.itemCount || 0} items</p>
                      <p>(Item details not loaded)</p>
                    </div>
                  )}
                </div>
                
                <Separator className="my-2" />
                
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(currentTransaction.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{formatCurrency((currentTransaction as any).tax || currentTransaction.taxAmount || 0)}</span>
                  </div>
                  {((currentTransaction as any).discount || currentTransaction.discountAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Discount</span>
                      <span>-{formatCurrency((currentTransaction as any).discount || currentTransaction.discountAmount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(currentTransaction.total || 0)}</span>
                  </div>
                </div>
                
                <div className="mt-2 pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Payment Method</span>
                    <span className="capitalize">{currentTransaction.paymentMethod}</span>
                  </div>
                  {currentTransaction.paymentMethod === 'cash' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Amount Received</span>
                        <span>{formatCurrency((currentTransaction as any).amountPaid || (currentTransaction as any).paymentAmount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Change</span>
                        <span>{formatCurrency((currentTransaction as any).changeAmount || 0)}</span>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="mt-4 text-center text-xs text-muted-foreground">
                  <p>Thank you for your purchase!</p>
                  <p>www.samplepos.com</p>
                </div>
              </div>
              
              <div className="flex justify-center space-x-2">
                <Button variant="outline" size="sm">
                  <FileText className="mr-1 h-4 w-4" /> Print
                </Button>
                <Button variant="outline" size="sm">
                  <Receipt className="mr-1 h-4 w-4" /> Email
                </Button>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setReceiptDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <CreateCustomerModal
          open={showNewCustomerModal}
          onClose={() => setShowNewCustomerModal(false)}
          onSave={handleCreateCustomer}
        />
      )}
      
      {/* Recent Transactions Sidebar */}
      <Sheet>
        <SheetContent side="right" className="w-full sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Recent Transactions</SheetTitle>
            <SheetDescription>
              View and manage recent sales.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4 space-y-2">
            {recentTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No recent transactions found.
              </p>
            ) : (
              recentTransactions.map((transaction) => (
                <Card key={transaction.id} className={transaction.voided ? 'border-destructive opacity-70' : ''}>
                  <CardHeader className="p-3 pb-1">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Transaction #{transaction.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={transaction.voided ? 'destructive' : 'default'}>
                        {transaction.voided ? 'Voided' : formatCurrency(transaction.total)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className="text-sm">
                      <p>{transaction.itemCount || transaction.items?.length || 0} items</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Paid via {transaction.paymentMethod}
                      </p>
                    </div>
                  </CardContent>
                  <CardFooter className="p-2 flex justify-end gap-2">
                    <Button variant="outline" size="sm">
                      <FileText className="mr-1 h-3 w-3" /> Details
                    </Button>
                    {!transaction.voided && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => voidTransaction(transaction.id)}
                      >
                        <X className="mr-1 h-3 w-3" /> Void
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default POSScreenAPI;

