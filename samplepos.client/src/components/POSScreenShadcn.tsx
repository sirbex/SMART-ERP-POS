import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency';
import type { InventoryItem } from '../models/InventoryItem';
import { useCustomerLedger } from '../context/CustomerLedgerContext';
import type { Customer } from '../context/CustomerLedgerContext';
// import CustomerSearch from './CustomerSearch'; // Removed - was not Shadcn-only
import ProductUoMSelectionModal from './ProductUoMSelectionModal';
import type { SaleItem, SaleRecord } from '../types/pos';
import { processSalesTransaction, checkStockAvailability, getInventory } from '../services/InventoryService';

// Import Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';

// Type definitions moved to ../types/pos.ts

// Utility functions moved to InventoryService

// Export CSV function removed

// Remove Item Modal Component
const RemoveItemModal: React.FC<{ 
  item: SaleItem | undefined; 
  onConfirm: () => void; 
  onCancel: () => void; 
}> = ({ item, onConfirm, onCancel }) => {
  if (!item) return null;
  
  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Item</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <strong>{item.name}</strong> from the cart?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Yes, Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Receipt Modal Component
const ReceiptModal: React.FC<{ 
  sale: SaleRecord | null; 
  onClose: () => void 
}> = ({ sale, onClose }) => {
  if (!sale) return null;
  
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="font-medium">Invoice:</span> {sale.invoiceNumber}</div>
            <div><span className="font-medium">Customer:</span> {sale.customer || 'N/A'}</div>
            <div><span className="font-medium">Date:</span> {new Date(sale.timestamp).toLocaleString()}</div>
            <div><span className="font-medium">Note:</span> {sale.note || 'N/A'}</div>
          </div>
          
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.cart.map((item: SaleItem, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right">{formatCurrency(item.price)}</td>
                    <td className="p-2 text-right">{formatCurrency(typeof item.quantity === 'number' ? item.price * item.quantity : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>{formatCurrency(sale.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>{formatCurrency(sale.tax)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Total:</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>
          </div>
          
          <div className="text-center pt-4 font-medium italic">
            Thank you for your business!
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            Print Receipt
          </Button>
          <Button onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const POSScreen: React.FC = () => {
  // Core state
  const [products, setProducts] = useState<InventoryItem[]>(getInventory());
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paid, setPaid] = useState<number | ''>(0);
  const [paymentType, setPaymentType] = useState('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<SaleRecord | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState<number | ''>(0);
  const [tax, setTax] = useState<number | ''>(0);
  const [total, setTotal] = useState(0);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{
    type: string;
    value: string;
    info: string;
  }>>([]);
  const [searchActiveIdx, setSearchActiveIdx] = useState(-1);
  const [selectedCustomerData, setSelectedCustomerData] = useState<Customer | null>(null);
  
  // UoM selection modal state
  const [showUoMModal, setShowUoMModal] = useState(false);
  const [selectedProductForUoM, setSelectedProductForUoM] = useState<InventoryItem | null>(null);
  
  const { customers, updateCustomerBalance, getCustomerByName } = useCustomerLedger();
  
  // Helper functions
  const parseNumberInput = (value: string) => value === '' ? '' : Number(value);
  const isValidPaid = (v: number | ''): v is number => 
    typeof v === 'number' && !isNaN(v) && v >= 0;
  
  // Calculate totals
  useEffect(() => {
    setSubtotal(cart.reduce((sum, item) => sum + item.price * (typeof item.quantity === 'number' ? item.quantity : 0), 0));
  }, [cart]);
  
  useEffect(() => {
    setTotal(subtotal - (typeof discount === 'number' ? discount : 0) + (typeof tax === 'number' ? tax : 0));
  }, [subtotal, discount, tax]);
  
  // Load inventory on mount and listen for changes
  useEffect(() => {
    const updateProducts = () => {
      setProducts(getInventory());
    };
    
    // Initial load
    updateProducts();
    
    // Listen for inventory changes from other components or sales
    window.addEventListener('storage', updateProducts);
    
    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('storage', updateProducts);
    };
  }, []);
  
  // Search functionality
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setSearchActiveIdx(-1);
    
    if (!value.length) {
      setSearchSuggestions([]);
      return;
    }
    
    setTimeout(() => {
      if (value.length > 0) {
        const lowercaseValue = value.toLowerCase();
        
        const productMatches = products
          .slice(0, 100)
          .filter(item => {
            // Only show items that match search AND have stock > 0
            const matchesSearch = item.name.toLowerCase().indexOf(lowercaseValue) !== -1;
            const hasStock = typeof item.quantity === 'number' && item.quantity > 0;
            return matchesSearch && hasStock;
          })
          .slice(0, 5)
          .map(item => ({
            type: 'product',
            value: item.name,
            info: `${item.unit || ''}${item.price ? ` - $${item.price}` : ''}${item.quantity ? ` - Stock: ${item.quantity}` : ''}`
          }));
          
        const customerMatches = customers
          .slice(0, 50)
          .filter(c => c.name.toLowerCase().indexOf(lowercaseValue) !== -1)
          .slice(0, 3)
          .map(c => ({ type: 'customer', value: c.name, info: '' }));
          
        setSearchSuggestions([...productMatches, ...customerMatches].slice(0, 8));
      }
    }, 0);
  };  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchSuggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      setSearchActiveIdx(idx => Math.min(idx + 1, searchSuggestions.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSearchActiveIdx(idx => Math.max(idx - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (searchActiveIdx >= 0 && searchSuggestions[searchActiveIdx]) {
        handleSearchSelect(searchSuggestions[searchActiveIdx]);
        e.preventDefault();
      } else if (searchSuggestions.length > 0 && searchSuggestions[0]?.type === 'product') {
        handleSearchSelect(searchSuggestions[0]);
        e.preventDefault();
      }
    }
  };
  
  const handleSearchSelect = (suggestion: { type: string; value: string }) => {
    setSearch('');
    setSearchSuggestions([]);
    setSearchActiveIdx(-1);
    
    if (suggestion.type === 'customer') {
      const customerData = getCustomerByName(suggestion.value);
      if (customerData) {
        setSelectedCustomer(suggestion.value);
        setSelectedCustomerData(customerData);
      }
    } else if (suggestion.type === 'product') {
      const item = products.find(p => p.name === suggestion.value);
      if (item) {
        // Check if the product has UoM options configured
        const hasUoMOptions = item.uomOptions && item.uomOptions.length > 0;
        
        if (hasUoMOptions) {
          // Show UoM selection modal for products with multiple units
          setSelectedProductForUoM(item);
          setShowUoMModal(true);
        } else {
          // For products without UoM configuration, add directly to cart
          const idx = cart.findIndex(ci => ci.name === item.name && ci.batch === item.batch);
          
          let newCart: SaleItem[];
          let itemToCheck: SaleItem;
          
          if (idx !== -1) {
            newCart = [...cart];
            const currentQty = typeof newCart[idx].quantity === 'number' ? newCart[idx].quantity : 0;
            const newQuantity = currentQty + 1;
            itemToCheck = { ...newCart[idx], quantity: newQuantity };
            
            // Check stock availability
            const stockCheck = checkStockAvailability(itemToCheck);
            if (!stockCheck.available) {
              alert(`Stock Check Failed:\n${stockCheck.message}`);
              return;
            }
            
            newCart[idx].quantity = newQuantity;
          } else {
            itemToCheck = { 
              name: item.name, 
              price: typeof item.price === 'number' ? item.price : 0, 
              quantity: 1, 
              batch: item.batch,
              unit: item.unit,
              selectedUomId: 'piece',
              unitPrice: typeof item.price === 'number' ? item.price : 0,
              basePrice: typeof item.price === 'number' ? item.price : 0,
              conversionFactor: 1,
              uomDisplayName: 'Piece'
            };
            
            // Check stock availability
            const stockCheck = checkStockAvailability(itemToCheck);
            // Check stock availability for item
            
            if (!stockCheck.available) {
              alert(`Stock Check Failed:\n${stockCheck.message}\n\nCurrent Stock: ${stockCheck.currentStock}\nRequired: ${stockCheck.requiredStock}`);
              return;
            }
            
            newCart = [...cart, itemToCheck];
          }
          
          setCart(newCart);
          
          setTimeout(() => {
            const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (searchInput) searchInput.focus();
          }, 0);
        }
      }
    }
  };
  
  const handleAddToCartWithUoM = (productInfo: {
    name: string;
    price: number;
    quantity: number;
    batch?: string;
    selectedUomId?: string;
    unitPrice?: number;
    basePrice?: number;
    conversionFactor?: number;
    uomDisplayName?: string;
  }) => {
    // Check stock availability before adding to cart
    const stockCheck = checkStockAvailability(productInfo as SaleItem);
    
    // Verify stock availability before adding to cart
    
    if (!stockCheck.available) {
      alert(`Stock Check Failed:\n${stockCheck.message}\n\nCurrent Stock: ${stockCheck.currentStock}\nRequired: ${stockCheck.requiredStock}`);
      return;
    }
    
    // Check if item with same name, batch, and UoM already exists in cart
    const idx = cart.findIndex(ci => 
      ci.name === productInfo.name && 
      ci.batch === productInfo.batch &&
      ci.selectedUomId === productInfo.selectedUomId
    );
    
    let newCart: SaleItem[];
    if (idx !== -1) {
      // Update existing cart item quantity
      newCart = [...cart];
      const currentQty = typeof newCart[idx].quantity === 'number' ? newCart[idx].quantity : 0;
      const newQuantity = currentQty + productInfo.quantity;
      
      // Check stock for the new total quantity
      const updatedItem = { ...newCart[idx], quantity: newQuantity };
      const stockCheckForUpdate = checkStockAvailability(updatedItem);
      
      if (!stockCheckForUpdate.available) {
        alert(`Stock Check Failed:\n${stockCheckForUpdate.message}\nCannot add ${productInfo.quantity} more units.`);
        return;
      }
      
      newCart[idx].quantity = newQuantity;
    } else {
      // Add new cart item
      newCart = [...cart, productInfo as SaleItem];
    }
    
    setCart(newCart);
    
    // Close modal and refocus search
    setShowUoMModal(false);
    setSelectedProductForUoM(null);
    
    setTimeout(() => {
      const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }, 0);
  };

  const handlePayment = () => {
    if (selectedCustomer) {
      const customerData = getCustomerByName(selectedCustomer);
      if (customerData) {
        setSelectedCustomerData(customerData);
      }
    }
    setShowPayment(true);
  };
  
  const completeSale = () => {
    const numericDiscount = typeof discount === 'number' ? discount : 0;
    const numericTax = typeof tax === 'number' ? tax : 0;
    const saleSubtotal = cart.reduce((sum, item) => sum + (typeof item.quantity === 'number' ? item.price * item.quantity : 0), 0);
    const saleTotal = saleSubtotal - numericDiscount + numericTax;
    const numericPaid = typeof paid === 'number' ? paid : 0;
    
    const transactionId = `INV-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
    
    const outstanding = numericPaid < saleTotal ? saleTotal - numericPaid : 0;
    const change = numericPaid > saleTotal ? numericPaid - saleTotal : 0;
    const status = change > 0 ? 'OVERPAID' : outstanding > 0 ? 'PARTIAL' : 'PAID';
    
    const saleRecord: SaleRecord = {
      id: transactionId,
      cart: [...cart],
      customer: selectedCustomer,
      subtotal: saleSubtotal,
      discount: numericDiscount,
      tax: numericTax,
      total: saleTotal,
      paid: numericPaid,
      change,
      outstanding,
      status,
      payments: [{
        amount: numericPaid,
        method: paymentType,
        reference: '',
        timestamp: new Date().toISOString()
      }],
      paymentType,
      note: customerNote,
      timestamp: new Date().toISOString(),
      invoiceNumber: transactionId,
    };
    
    // Update customer balance if outstanding
    if (outstanding > 0 && selectedCustomer) {
      const verifiedCustomer = selectedCustomerData || getCustomerByName(selectedCustomer);
      if (verifiedCustomer) {
        updateCustomerBalance(
          selectedCustomer,
          outstanding,
          'credit',
          `Unpaid balance for invoice ${transactionId}`,
          { method: 'Account', reference: transactionId }
        );
      }
    }
    
    setLastSale(saleRecord);
    
    // Save transaction to localStorage for dashboard and reports
    try {
      const existingTransactions = localStorage.getItem('pos_transaction_history_v1');
      const transactionHistory = existingTransactions ? JSON.parse(existingTransactions) : [];
      transactionHistory.push(saleRecord);
      localStorage.setItem('pos_transaction_history_v1', JSON.stringify(transactionHistory));
      console.log('Transaction saved to history:', transactionId);
      
      // Dispatch storage event to notify all components immediately
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'pos_transaction_history_v1',
        newValue: JSON.stringify(transactionHistory),
        url: window.location.href
      }));
      
    } catch (error) {
      console.error('Failed to save transaction:', error);
      alert('Warning: Transaction could not be saved to history');
    }
    
    // Process inventory update using the proper service
    const inventoryResult = processSalesTransaction(cart, transactionId);
    
    if (!inventoryResult.success) {
      // Show error messages if inventory update failed
      alert(`Inventory update failed:\n${inventoryResult.errors.join('\n')}`);
      console.error('Inventory update errors:', inventoryResult.errors);
    } else {
      // Inventory updated successfully
      
      // Sale completed and inventory updated
    }
    
    setShowPayment(false);
    setShowReceipt(true);
    setCart([]);
    setPaid(0);
    setDiscount(0);
    setTax(0);
    setCustomerNote('');
    setSelectedCustomer('');
    setSelectedCustomerData(null);
  };
  
  const confirmRemove = () => {
    if (showRemoveConfirm === null || showRemoveConfirm < 0 || showRemoveConfirm >= cart.length) return;
    setCart(cart.filter((_, i) => i !== showRemoveConfirm));
    setShowRemoveConfirm(null);
  };

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 space-y-4 sm:space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-xl sm:text-2xl font-bold">Point of Sale</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Search for products, manage your cart, and process payments
          </CardDescription>
          
          {/* Debug inventory button - for testing */}
          <div className="mt-2 flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                const inventory = getInventory();
                const inStockItems = inventory.filter(item => 
                  typeof item.quantity === 'number' && item.quantity > 0
                );
                // Debug: Show current inventory state
                
                const stockSummary = inStockItems.map(item => 
                  `${item.name}: ${item.quantity} ${item.unit || 'units'}`
                ).join('\n');
                
                alert(`Total Inventory Items: ${inventory.length}\nItems with Stock: ${inStockItems.length}\n\nIn Stock:\n${stockSummary || 'No items in stock'}\n\nCheck console for full details.`);
              }}
            >
              Debug: Check Stock
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setProducts(getInventory());
                alert('Products list refreshed from inventory!');
              }}
            >
              Refresh Products
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="pos-search">Search products or customers</Label>
            <Input
              id="pos-search"
              type="text"
              placeholder="Start typing to search..."
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Use ↑↓ arrow keys to navigate and Enter to add product to cart
            </p>
          </div>
          
          {/* Search Suggestions */}
          {searchSuggestions.length > 0 && (
            <Card className="mt-2 border shadow-md">
              <CardContent className="p-2">
                <ul className="space-y-1">
                  {searchSuggestions.map((s, idx) => (
                    <li
                      key={idx}
                      className={`p-2 rounded cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground ${
                        searchActiveIdx === idx ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      onClick={() => handleSearchSelect(s)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{s.value}</span>
                        <Badge variant="secondary" className="text-xs">
                          {s.type}
                        </Badge>
                      </div>
                      {s.type === 'product' && s.info && (
                        <p className="text-sm text-muted-foreground mt-1">{s.info}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Cart Section */}
      {cart.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <div className="text-muted-foreground">
                <strong>Your cart is empty.</strong>
                <p className="mt-2">Use the search above to add products to the cart.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Shopping Cart ({cart.length} items)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cart Items */}
            <div className="space-y-2">
              {cart.map((item, idx) => (
                <Card key={idx} className="p-3 sm:p-4">
                  <div className="space-y-3 sm:space-y-0 sm:flex sm:justify-between sm:items-center">
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm sm:text-base break-words">{item.name}</h4>
                      <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                        <p>Batch: {item.batch || 'N/A'}</p>
                        {item.uomDisplayName && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {item.uomDisplayName}
                            </Badge>
                            {item.conversionFactor && item.conversionFactor !== 1 && (
                              <span className="text-xs">
                                (1 unit = {item.conversionFactor} base units)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Controls - Mobile: Stack vertically, Desktop: Horizontal */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                      
                      {/* Mobile: 2x2 Grid, Desktop: Horizontal layout */}
                      <div className="grid grid-cols-2 gap-3 w-full sm:contents">
                        {/* Quantity */}
                        <div className="text-center sm:text-left">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            className="w-full sm:w-20 h-8 text-center"
                            value={item.quantity === '' ? '' : item.quantity}
                            onChange={e => {
                              const newCart = [...cart];
                              newCart[idx].quantity = parseNumberInput(e.target.value);
                              setCart(newCart);
                            }}
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="text-right sm:text-right">
                          <div className="text-xs sm:text-sm text-muted-foreground">Unit Price</div>
                          <div className="font-medium text-sm sm:text-base">{formatCurrency(item.price)}</div>
                          {item.unitPrice && item.unitPrice !== item.price && (
                            <div className="text-xs text-muted-foreground hidden sm:block">
                              ({formatCurrency(item.unitPrice)} per {item.uomDisplayName})
                            </div>
                          )}
                        </div>

                        {/* Total */}
                        <div className="text-right">
                          <div className="text-xs sm:text-sm text-muted-foreground">Total</div>
                          <div className="font-semibold text-sm sm:text-base">
                            {formatCurrency(typeof item.quantity === 'number' ? item.price * item.quantity : 0)}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <div className="flex justify-center sm:justify-start">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowRemoveConfirm(idx)}
                            className="w-full sm:w-auto text-xs"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            <Separator className="my-4" />
            
            {/* Totals */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg">Subtotal:</span>
                <span className="text-lg font-medium">{formatCurrency(subtotal)}</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount" className="text-sm font-medium">Discount</Label>
                  <Input
                    id="discount"
                    type="number"
                    min={0}
                    value={discount === '' ? '' : discount}
                    onChange={e => setDiscount(parseNumberInput(e.target.value))}
                    placeholder="0.00"
                    className="h-10 sm:h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax" className="text-sm font-medium">Tax</Label>
                  <Input
                    id="tax"
                    type="number"
                    min={0}
                    value={tax === '' ? '' : tax}
                    onChange={e => setTax(parseNumberInput(e.target.value))}
                    placeholder="0.00"
                    className="h-10 sm:h-9"
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center border-t pt-4">
                <span className="text-xl font-bold">Total:</span>
                <span className="text-xl font-bold">{formatCurrency(total)}</span>
              </div>
              
              {/* Customer Section - Temporarily simplified */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <div className="p-2 border rounded text-sm text-muted-foreground">
                  Customer search temporarily disabled (converting to Shadcn-only)
                  <br />Selected: {selectedCustomer || 'None'}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customer-note">Customer Note</Label>
                <Input
                  id="customer-note"
                  value={customerNote}
                  onChange={e => setCustomerNote(e.target.value)}
                  placeholder="Add a note for this transaction..."
                />
              </div>
              
              <Button 
                onClick={handlePayment} 
                disabled={cart.length === 0}
                className="w-full h-12 text-base font-medium" 
                size="lg"
              >
                Proceed to Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <Dialog open={true} onOpenChange={() => setShowPayment(false)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Process Payment</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Total Amount</Label>
                <div className="text-2xl font-bold">{formatCurrency(total)}</div>
              </div>
              
              <div className="space-y-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4 sm:space-y-0">
                <Label htmlFor="payment-type" className="text-left sm:text-right">
                  Method
                </Label>
                <select
                  id="payment-type"
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value)}
                  title="Payment method"
                  className="sm:col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Mobile Money">Mobile Money</option>
                </select>
              </div>
              
              <div className="space-y-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4 sm:space-y-0">
                <Label htmlFor="paid-amount" className="text-left sm:text-right">
                  Amount
                </Label>
                <Input
                  id="paid-amount"
                  type="number"
                  min={0}
                  value={paid === '' ? '' : paid}
                  onChange={e => setPaid(parseNumberInput(e.target.value))}
                  className="sm:col-span-3"
                />
              </div>
              
              {typeof paid === 'number' && paid > total && (
                <div className="text-sm text-muted-foreground">
                  Change due: {formatCurrency(paid - total)}
                </div>
              )}
              
              {typeof paid === 'number' && paid < total && paid > 0 && (
                <div className="text-sm text-amber-600">
                  Partial payment: {formatCurrency(total - paid)} will be added to customer balance
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayment(false)}>
                Cancel
              </Button>
              <Button onClick={completeSale} disabled={!isValidPaid(paid)}>
                Complete Sale
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <ReceiptModal sale={lastSale} onClose={() => setShowReceipt(false)} />
      )}

      {/* UoM Selection Modal */}
      <ProductUoMSelectionModal
        product={selectedProductForUoM}
        isOpen={showUoMModal}
        onClose={() => {
          setShowUoMModal(false);
          setSelectedProductForUoM(null);
        }}
        onAddToCart={handleAddToCartWithUoM}
      />

      {/* Remove Item Confirmation */}
      {showRemoveConfirm !== null && showRemoveConfirm >= 0 && showRemoveConfirm < cart.length && (
        <RemoveItemModal
          item={cart[showRemoveConfirm]}
          onConfirm={confirmRemove}
          onCancel={() => setShowRemoveConfirm(null)}
        />
      )}
    </div>
  );
};

export default POSScreen;