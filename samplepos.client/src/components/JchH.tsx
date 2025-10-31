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
import { Switch } from './ui/switch';
import { SheetContent, SheetDescription, SheetHeader, SheetTitle, Sheet } from './ui/sheet';
import { useToast } from '@/components/ui/toast';
import { Camera, Package, Search, Trash2, Plus, Minus, X, User, FileText, Receipt, ShoppingCart, Loader2, CircleDollarSign, CreditCard, Banknote, UserRound, Grid3x3, List, Archive, HelpCircle } from 'lucide-react';

// Import API services
import * as POSServiceAPI from '../services/POSServiceAPI';
import api from '@/config/api.config';
import type { Customer } from '../types';
import type { Transaction, TransactionItem } from '../types';
import type { ProductWithUoMs } from '../types';
import CreateCustomerModal from './CreateCustomerModal';
import HeldSalesDialog from './HeldSalesDialog';
import { getHeldSalesCount, holdSale, deleteHeldSale, type HeldSale } from '../services/heldSalesService';
import { 
  roundMoney, 
  addMoney, 
  subtractMoney, 
  multiplyMoney, 
  sumMoney, 
  calculateTax,
  nonNegative
} from '../utils/precision';
import SettingsService from '../services/SettingsService';
import UoMSelect from './UoMSelect';
import { 
  calculatePriceForUoM, 
  getDefaultUoM, 
  hasUoMSystem 
} from '../utils/uomUtils';

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
  const settingsService = SettingsService.getInstance();
  const [quickAmountsEnabled, setQuickAmountsEnabled] = useState<boolean>(settingsService.loadSettings().system.enableQuickAmounts);
  const [quickSteps, setQuickSteps] = useState<number[]>(settingsService.loadSettings().system.quickAmountSteps || [50,100,200,500]);
  const [quickSuggestionsEnabled, setQuickSuggestionsEnabled] = useState<boolean>(settingsService.loadSettings().system.enableQuickRoundingSuggestions);

  // React to settings changes live
  useEffect(() => {
    const handler = (e: any) => {
      const s = e.detail || settingsService.loadSettings();
      setQuickAmountsEnabled(!!s.system.enableQuickAmounts);
      setQuickSteps(s.system.quickAmountSteps || [50,100,200,500]);
      setQuickSuggestionsEnabled(!!s.system.enableQuickRoundingSuggestions);
    };
    window.addEventListener('settingsChanged', handler as any);
    return () => window.removeEventListener('settingsChanged', handler as any);
  }, []);
  
  // State
  const [inventoryItems, setInventoryItems] = useState<ProductWithUoMs[]>([]);
  const [filteredItems, setFilteredItems] = useState<ProductWithUoMs[]>([]);
  const [cartItems, setCartItems] = useState<TransactionItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  // Multi-pay state
  const [payments, setPayments] = useState<Array<{ method: string; amount: number; reference?: string }>>([]);
  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState<number>(0);
  const [autoBalance, setAutoBalance] = useState<boolean>(true);
  // Keyboard navigation/selection state
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1);
  // Legacy single-payment fields (kept for backward compatibility and receipt rendering)
  // removed legacy single-payment fields
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [heldSalesCount, setHeldSalesCount] = useState(0);
  const [heldSalesDialogOpen, setHeldSalesDialogOpen] = useState(false);
  // Track the currently restored held sale to auto-clear after settlement
  const [restoredHeldSaleId, setRestoredHeldSaleId] = useState<string | null>(null);
  const [restoredHoldNumber, setRestoredHoldNumber] = useState<string | null>(null);
  // Basic theming toggle (dark mode)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme.dark');
    if (saved != null) return saved === 'true';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme.dark', String(darkMode));
  }, [darkMode]);

  // Dialog state for inline editing
  const [priceDialog, setPriceDialog] = useState<{ open: boolean; index: number | null; newPrice: string; reason: string }>({
    open: false,
    index: null,
    newPrice: '',
    reason: ''
  });
  const [discountDialog, setDiscountDialog] = useState<{ open: boolean; index: number | null; mode: 'percent' | 'amount'; value: string; reason: string }>({
    open: false,
    index: null,
    mode: 'percent',
    value: '',
    reason: ''
  });

  // Calculate totals with bank-grade precision with product-managed tax rates
  const subtotal = sumMoney(
    cartItems.map(item => multiplyMoney(item.price || 0, item.quantity))
  );
  const defaultTaxRatePercent = 10; // fallback if product has no taxRate
  const lineDiscountTotal = sumMoney(cartItems.map(i => roundMoney(i.discount || 0)));
  const customerDiscount = roundMoney(selectedCustomer?.loyaltyDiscount || 0);
  const discountAmount = roundMoney(addMoney(customerDiscount, lineDiscountTotal));
  // Per-line net amounts (after line discounts)
  const _lineNets = cartItems.map(i => {
    const base = multiplyMoney(i.price || 0, i.quantity);
    const disc = roundMoney(i.discount || 0);
    return nonNegative(subtractMoney(base, disc));
  });
  const _totalNetBeforeCustomerDisc = sumMoney(_lineNets);
  // Determine which lines are taxable (taxRate% > 0 and not explicitly exempt)
  const _isTaxable = cartItems.map((i) => {
    const ratePct = (i.taxRate != null ? Number(i.taxRate) : defaultTaxRatePercent);
    return !i.taxExempt && ratePct > 0;
  });
  const _taxableNetBeforeCustDisc = sumMoney(_lineNets.map((net, idx) => (_isTaxable[idx] ? net : 0)));
  // Allocate customer discount proportionally to taxable lines only
  const _allocCustDiscToTaxableTotal = _taxableNetBeforeCustDisc > 0 && customerDiscount > 0
    ? roundMoney((customerDiscount * _taxableNetBeforeCustDisc) / (_totalNetBeforeCustomerDisc || 1))
    : 0;
  const _perLineAllocCustDisc = _lineNets.map((net, idx) => {
    if (!_isTaxable[idx] || _taxableNetBeforeCustDisc === 0 || _allocCustDiscToTaxableTotal === 0) return 0;
    return roundMoney((_allocCustDiscToTaxableTotal * net) / (_taxableNetBeforeCustDisc || 1));
  });
  // Compute per-line tax with each product's tax rate
  const _perLineTax = _lineNets.map((net, idx) => {
    if (!_isTaxable[idx]) return 0;
    const ratePct = (cartItems[idx].taxRate != null ? Number(cartItems[idx].taxRate) : defaultTaxRatePercent);
    const rate = ratePct / 100;
    const taxableLineBase = nonNegative(subtractMoney(net, _perLineAllocCustDisc[idx] || 0));
    return calculateTax(taxableLineBase, rate);
  });
  const taxAmount = sumMoney(_perLineTax);
  // Total = (subtotal - all discounts) + sum of per-line taxes
  const total = roundMoney(addMoney(nonNegative(subtractMoney(subtotal, discountAmount)), taxAmount));
  // Optional rounding adjustment (toggled via keyboard 'R')
  const [roundingAdjustment, setRoundingAdjustment] = useState<number>(0);
  const grandTotal = roundMoney(addMoney(total, roundingAdjustment));
  // For split payments
  const paidTotal = payments.reduce((sum, p) => addMoney(sum, p.amount || 0), 0);
  const remainingDue = nonNegative(subtractMoney(grandTotal, paidTotal));
  // Change is always computed against the original total (server authoritative)
  const multiChangeAmount = nonNegative(subtractMoney(paidTotal, total));

  // Initialize a default payment row when opening the payment dialog
  useEffect(() => {
    if (paymentDialogOpen) {
      setPayments((prev) => (prev.length > 0 ? prev : [{ method: 'cash', amount: grandTotal, reference: '' }]));
      setSelectedPaymentIndex(0);
    }
  }, [paymentDialogOpen, grandTotal]);

  // Helper: auto-balance the last payment line to meet total
  const balancePayments = useCallback((list: Array<{ method: string; amount: number; reference?: string }>) => {
    if (!autoBalance) return list;
    if (!list || list.length === 0) return list;
    const lastIdx = list.length - 1;
    const sumOthers = list.slice(0, lastIdx).reduce((s, p) => addMoney(s, p.amount || 0), 0);
    const newLastAmt = nonNegative(subtractMoney(grandTotal, sumOthers));
    return list.map((p, i) => i === lastIdx ? { ...p, amount: newLastAmt } : p);
  }, [autoBalance, grandTotal]);

  // Rebalance when total changes and auto-balance enabled
  useEffect(() => {
    if (!paymentDialogOpen || !autoBalance) return;
    setPayments((prev) => balancePayments(prev));
  }, [grandTotal, autoBalance, paymentDialogOpen, balancePayments]);

  // Keyboard: Enter to complete payment
  useEffect(() => {
    if (!paymentDialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (paidTotal >= grandTotal && !loading) {
          processPayment();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPaymentDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paymentDialogOpen, paidTotal, grandTotal, loading]);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Use new backend API endpoints
        const [customerList, transactions, productsResponse, heldCount] = await Promise.all([
          POSServiceAPI.getCustomersForPOS(),
          POSServiceAPI.getRecentTransactions(),
          api.get('/products?limit=1000&includeUoMs=true'), // Get all products with UoMs
          getHeldSalesCount().catch(() => 0) // Get held sales count, default to 0 on error
        ]);
        
        // Transform new API response to ProductWithUoMs format
        const productsData = productsResponse.data?.data || [];
        const items: ProductWithUoMs[] = productsData.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          sku: item.barcode || item.id, // Use barcode or ID as SKU
          category: item.category || 'General',
          baseUnit: item.baseUnit || 'pcs', // CRITICAL: Include baseUnit field
          unit: item.baseUnit || 'pcs',
          price: Number(item.sellingPrice) || 0,
          basePrice: Number(item.costPrice) || Number(item.sellingPrice) || 0,
          quantity: Number(item.currentStock) || 0,
          reorderLevel: Number(item.reorderLevel) || 10,
          isActive: item.isActive !== false,
          taxRate: item.taxRate != null ? Number(item.taxRate) * 100 : undefined, // convert decimal to %
          taxExempt: item.taxRate != null ? Number(item.taxRate) === 0 : (item.isTaxExempt ?? item.taxExempt ?? false), // 0 = exempt
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          productUoMs: item.productUoMs || [] // Add UoM data
        }));
        
        setInventoryItems(items);
        setFilteredItems(items);
        setCustomers(customerList);
        setRecentTransactions(transactions);
        setHeldSalesCount(heldCount);
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
      // Global shortcuts (when not in a dialog/input)
      const target = e.target as HTMLElement | null;
      const isEditable = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as any).isContentEditable ||
        target.tagName === 'SELECT'
      );
      if (!paymentDialogOpen && !receiptDialogOpen && !shortcutHelpOpen) {
        // ? => toggle help (Shift + /)
        if (!isEditable && ((e.key === '?' ) || (e.key === '/' && e.shiftKey))) {
          e.preventDefault();
          setShortcutHelpOpen(true);
          return;
        }
        // Space => open checkout
        if (e.code === 'Space' && !isEditable) {
          if (cartItems.length > 0) {
            e.preventDefault();
            setPaymentDialogOpen(true);
          }
        }
        // F5 => Hold
        if (e.key === 'F5') {
          e.preventDefault();
          handleHoldSale();
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
        // F6 => Held list
        if (e.key === 'F6') {
          e.preventDefault();
          setHeldSalesDialogOpen(true);
        }
        // Ctrl+Delete => Clear cart
        if (e.ctrlKey && (e.key === 'Delete')) {
          e.preventDefault();
          if (cartItems.length > 0) {
            clearCart();
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }
        }
        // +/- => quantity change on selected cart item (defaults to last)
        if (!isEditable && (e.key === '+' || e.key === '=')) {
          const idx = selectedCartIndex >= 0 ? selectedCartIndex : (cartItems.length - 1);
          if (idx >= 0) {
            e.preventDefault();
            const qty = (cartItems[idx]?.quantity ?? 0) + 1;
            updateQuantity(idx, qty);
          }
        }
        if (!isEditable && e.key === '-') {
          const idx = selectedCartIndex >= 0 ? selectedCartIndex : (cartItems.length - 1);
          if (idx >= 0) {
            e.preventDefault();
            const qty = (cartItems[idx]?.quantity ?? 0) - 1;
            updateQuantity(idx, qty);
          }
        }
        // D => discount on selected cart item
        if (!isEditable && (e.key === 'd' || e.key === 'D')) {
          const idx = selectedCartIndex >= 0 ? selectedCartIndex : (cartItems.length - 1);
          if (idx >= 0) {
            e.preventDefault();
            openDiscountDialog(idx);
          }
        }
        // R => toggle rounding to nearest whole unit
        if (!isEditable && (e.key === 'r' || e.key === 'R')) {
          e.preventDefault();
          setRoundingAdjustment((curr) => {
            if (Math.abs(curr) > 0.0001) return 0; // toggle off
            const rounded = Math.round(total);
            return roundMoney(rounded - total);
          });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toast, paymentDialogOpen, receiptDialogOpen, cartItems.length, selectedCartIndex, total]); // Removed inventoryItems dependency

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
  const addToCart = async (item: ProductWithUoMs) => {
    // Check if we have enough stock
    try {
      const stockCheck = await POSServiceAPI.checkStock(item.id?.toString() || '', 1);
      
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
        setSelectedCartIndex(existingItemIndex);
      } else {
        // Add new item to cart with UoM support
        const hasUoM = hasUoMSystem(item);
        let defaultUomId: string | undefined = undefined;
        let unitPrice = item.basePrice || 0;
        let actualUnit = item.unit || 'piece';
        
        if (hasUoM) {
          const defaultUom = getDefaultUoM(item);
          if (defaultUom) {
            defaultUomId = defaultUom;
            const priceCalc = calculatePriceForUoM(
              item.basePrice || 0,
              1,
              defaultUom,
              item
            );
            unitPrice = priceCalc.unitPrice;
            const uomData = item.productUoMs?.find((pu) => pu.uomId === defaultUom);
            actualUnit = uomData?.uom?.abbreviation?.toLowerCase() || actualUnit;
          }
        }
        
        const newItem: TransactionItem = {
          id: Date.now(),
          productId: item.id,
          name: item.name || '',
          price: unitPrice,
          quantity: 1,
          unit: actualUnit,
          unitPrice: unitPrice,
          subtotal: unitPrice,
          uomId: defaultUomId,
          taxRate: (item as any)?.taxRate != null ? Number((item as any).taxRate) : undefined,
          taxExempt: (item as any)?.taxExempt || (item as any)?.isTaxExempt || Number((item as any)?.taxRate || 0) === 0
        };
        setCartItems([...cartItems, newItem]);
        setSelectedCartIndex(cartItems.length);
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
      const stockCheck = await POSServiceAPI.checkStock(item.productId?.toString() || '', newQuantity);
      
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
      updatedCart[index].subtotal = newQuantity * (updatedCart[index].price || 0);
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
    setSelectedCartIndex((prev) => {
      if (updatedCart.length === 0) return -1;
      if (prev > index) return prev - 1;
      if (prev === index) return Math.min(index, updatedCart.length - 1);
      return prev;
    });
  };

  // Handle UoM change for cart items
  const handleUoMChange = (cartItemIndex: number, newUomId: string) => {
    const cartItem = cartItems[cartItemIndex];
    const product = inventoryItems.find(p => p.id === cartItem.productId) as ProductWithUoMs;
    
    if (!product || !hasUoMSystem(product)) {
      return;
    }
    
    try {
      // Calculate new price based on selected UoM
      const priceCalc = calculatePriceForUoM(
        product.basePrice || 0,
        cartItem.quantity,
        newUomId,
        product
      );
      
      // Get UoM details
      const productUoM = product.productUoMs?.find(pu => pu.uomId === newUomId);
      const unitAbbr = productUoM?.uom?.abbreviation?.toLowerCase() || 'base';
      
      // Update cart item with new UoM pricing
      const updatedCart = [...cartItems];
      updatedCart[cartItemIndex] = {
        ...updatedCart[cartItemIndex],
        price: priceCalc.unitPrice,
        unitPrice: priceCalc.unitPrice,
        subtotal: priceCalc.total,
        unit: unitAbbr,
        uomId: newUomId
      };
      setCartItems(updatedCart);
      
      toast({
        title: "Unit Updated",
        description: `Price updated to ${formatCurrency(priceCalc.unitPrice)} per ${unitAbbr}`,
      });
    } catch (error) {
      console.error("Error changing UoM:", error);
      toast({
        title: "Error",
        description: "Could not change unit of measure.",
        variant: "destructive",
      });
    }
  };

  // Open price override dialog for a cart line
  const openPriceOverride = (index: number) => {
    const item = cartItems[index];
    setPriceDialog({ open: true, index, newPrice: String(item.price ?? item.unitPrice ?? 0), reason: '' });
  };

  // Confirm price override with validation (10% - 200% of current price)
  const confirmPriceOverride = () => {
    if (priceDialog.index == null) return;
    const idx = priceDialog.index;
    const item = cartItems[idx];
    const current = Number(item.price ?? 0);
    const next = Number(priceDialog.newPrice);
    if (!isFinite(next) || next <= 0) {
      toast({ title: 'Invalid Price', description: 'Enter a valid unit price greater than 0.', variant: 'destructive' });
      return;
    }
    const min = current * 0.10;
    const max = current * 2.0;
    if (next < min || next > max) {
      toast({ title: 'Out of Range', description: 'Override must be between 10% and 200% of current price.', variant: 'destructive' });
      return;
    }
    if (!priceDialog.reason || priceDialog.reason.trim().length < 3) {
      toast({ title: 'Reason Required', description: 'Please provide a brief reason (min 3 chars).', variant: 'destructive' });
      return;
    }
    const updated = [...cartItems];
    updated[idx].price = roundMoney(next);
    updated[idx].unitPrice = roundMoney(next);
    updated[idx].notes = `${updated[idx].notes ? updated[idx].notes + ' | ' : ''}Price override: ${priceDialog.reason.trim()}`;
    // Recompute subtotal for line
    updated[idx].subtotal = multiplyMoney(updated[idx].price || 0, updated[idx].quantity);
    setCartItems(updated);
    setPriceDialog({ open: false, index: null, newPrice: '', reason: '' });
  };

  // Open discount dialog
  const openDiscountDialog = (index: number) => {
    setDiscountDialog({ open: true, index, mode: 'percent', value: '', reason: '' });
  };

  // Confirm discount with validation (>5% requires reason)
  const confirmDiscount = () => {
    if (discountDialog.index == null) return;
    const idx = discountDialog.index;
    const item = cartItems[idx];
    const lineTotal = multiplyMoney(item.price || 0, item.quantity);
    let discountAmt = 0;
    if (discountDialog.mode === 'percent') {
      const pct = Number(discountDialog.value);
      if (!isFinite(pct) || pct < 0 || pct > 100) {
        toast({ title: 'Invalid Percent', description: 'Enter a valid percent between 0 and 100.', variant: 'destructive' });
        return;
      }
      if (pct > 5 && (!discountDialog.reason || discountDialog.reason.trim().length < 3)) {
        toast({ title: 'Reason Required', description: 'Discounts over 5% require a reason (min 3 chars).', variant: 'destructive' });
        return;
      }
      discountAmt = roundMoney((lineTotal * pct) / 100);
    } else {
      const amt = Number(discountDialog.value);
      if (!isFinite(amt) || amt < 0 || amt > lineTotal) {
        toast({ title: 'Invalid Amount', description: 'Enter an amount between 0 and the line total.', variant: 'destructive' });
        return;
      }
      discountAmt = roundMoney(amt);
    }
    const updated = [...cartItems];
    updated[idx].discount = discountAmt;
    if (discountAmt > 0 && discountDialog.reason?.trim()) {
      updated[idx].notes = `${updated[idx].notes ? updated[idx].notes + ' | ' : ''}Discount: ${discountDialog.reason.trim()}`;
    }
    setCartItems(updated);
    setDiscountDialog({ open: false, index: null, mode: 'percent', value: '', reason: '' });
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
    setSelectedCustomer(null);
    setPayments([]);
    setSelectedCartIndex(-1);
    setRoundingAdjustment(0);
    // Clear any restored hold context
    setRestoredHeldSaleId(null);
    setRestoredHoldNumber(null);
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

  // Hold current sale
  const handleHoldSale = async () => {
    if (cartItems.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Cannot hold an empty cart.",
        variant: "destructive",
      });
      return;
    }

    // Require authentication
    const token = localStorage.getItem('accessToken');
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please log in to hold a sale.',
        variant: 'destructive',
      });
      try {
        window.location.href = '/login';
      } catch {}
      return;
    }

    setLoading(true);
    try {
      // Precompute per-line nets and allocate customer discount to taxable lines
      const perLineBase = cartItems.map(item => multiplyMoney(roundMoney(item.price || 0), item.quantity));
      const perLineDisc = cartItems.map(item => roundMoney(item.discount || 0));
      const perLineNet = perLineBase.map((b, i) => nonNegative(subtractMoney(b, perLineDisc[i])));
      const totalNet = sumMoney(perLineNet);
      const taxableFlags = cartItems.map(i => {
        const pct = i.taxRate != null ? Number(i.taxRate) : defaultTaxRatePercent;
        return !i.taxExempt && pct > 0;
      });
      const taxableNetForAll = sumMoney(perLineNet.map((net, i) => (taxableFlags[i] ? net : 0)));
      const allocCustDiscToTaxable = taxableNetForAll > 0 && customerDiscount > 0
        ? roundMoney((customerDiscount * taxableNetForAll) / (totalNet || 1))
        : 0;
      // Item-level allocation share for taxable lines
      const perLineAllocatedCustDisc = perLineNet.map((net, i) => {
        if (!taxableFlags[i] || taxableNetForAll === 0 || allocCustDiscToTaxable === 0) return 0;
        return roundMoney((allocCustDiscToTaxable * net) / (taxableNetForAll || 1));
      });

      await holdSale({
        customerId: selectedCustomer?.id?.toString() || null,
        items: cartItems.map(item => ({
          // Send productId as string to match server schema
          productId: item.productId ? item.productId.toString() : '',
          name: item.name || 'Unknown Product',
          quantity: item.quantity,
          unit: item.unit || 'pcs',
          uomId: item.uomId || null,
          // Ensure currency fields have 2-decimal precision
          unitPrice: roundMoney(item.price || 0),
          discount: roundMoney(item.discount || 0),
          // Use the same rounded unitPrice for subtotal to satisfy server validation
          subtotal: multiplyMoney(roundMoney(item.price || 0), item.quantity),
          taxAmount: (() => {
            const idx = cartItems.findIndex(ci => ci === item);
            const net = perLineNet[idx] || 0;
            const ratePct = item.taxRate != null ? Number(item.taxRate) : defaultTaxRatePercent;
            if (item.taxExempt || ratePct === 0) return 0;
            const alloc = perLineAllocatedCustDisc[idx] || 0;
            const taxableLineBase = nonNegative(subtractMoney(net, alloc));
            const rate = ratePct / 100;
            return calculateTax(taxableLineBase, rate);
          })(),
          total: roundMoney(
            Math.max(0, subtractMoney(
              multiplyMoney(roundMoney(item.price || 0), item.quantity),
              item.discount || 0
            ))
          ),
        })),
        subtotal,
        taxAmount,
        discount: discountAmount,
        total,
        notes: `Held by ${selectedCustomer?.name || 'Walk-in'}`
      });

  // Clear cart after holding
      setCartItems([]);
      setSelectedCustomer(null);
  setSelectedCartIndex(-1);
  setRoundingAdjustment(0);
      
      // Refresh held sales count
      const newCount = await getHeldSalesCount().catch(() => 0);
      setHeldSalesCount(newCount);

      toast({
        title: "Sale Held",
        description: "Cart has been saved. You can restore it later.",
      });
      // Refocus search
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } catch (error) {
      console.error('Error holding sale:', error);
      // Surface server validation details when available
      const details = (error as any)?.response?.data?.details;
      const firstDetail = Array.isArray(details) && details.length > 0 ? details[0]?.message || details[0] : null;
      toast({
        title: "Failed to Hold Sale",
        description: firstDetail || "Please review line totals and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Restore held sale to cart
  const handleRestoreHeldSale = (heldSale: HeldSale) => {
    // Map held sale items to cart items
    // Ensure productId stays as string for backend compatibility
    // Preserve productId as stored (string) to avoid NaN issues and support UUIDs
    const restoredItems: TransactionItem[] = heldSale.items.map((item, index) => ({
      id: index + 1,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.unitPrice,
      unit: item.unit,
      uomId: item.uomId || undefined,
      discount: item.discount || 0,
      unitPrice: item.unitPrice,
      // Restore tax metadata if available
      taxRate: (item as any)?.taxRate != null ? Number((item as any).taxRate) : undefined,
      taxExempt: (item as any)?.taxAmount === 0 || Number((item as any)?.taxRate || 0) === 0
    }));    setCartItems(restoredItems);
  // Remember which hold we restored, so we can clear it after settlement
  setRestoredHeldSaleId(heldSale.id);
  setRestoredHoldNumber(heldSale.holdNumber);
  setSelectedCartIndex(restoredItems.length > 0 ? restoredItems.length - 1 : -1);
  setRoundingAdjustment(0);
    
    // Restore customer if available
    if (heldSale.customer) {
      setSelectedCustomer({
        id: parseInt(heldSale.customer.id),
        name: heldSale.customer.name,
        phone: heldSale.customer.phone,
      } as Customer);
    }

    // Refresh held sales count
    getHeldSalesCount().then(setHeldSalesCount).catch(() => setHeldSalesCount(0));

    toast({
      title: "Cart Restored",
      description: `Hold #${heldSale.holdNumber} restored to cart`,
    });
  };

  // Refresh held sales count (called after delete)
  const refreshHeldSalesCount = async () => {
    const newCount = await getHeldSalesCount().catch(() => 0);
    setHeldSalesCount(newCount);
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
    // Validate split payments
    if (!payments || payments.length === 0) {
      toast({ title: 'Add a payment', description: 'Please add at least one payment.', variant: 'destructive' });
      return;
    }
    if (paidTotal < grandTotal) {
      toast({ title: 'Insufficient Payment', description: `Paid ${formatCurrency(paidTotal)} of ${formatCurrency(grandTotal)}.`, variant: 'destructive' });
      return;
    }
    for (const p of payments) {
      const m = (p.method || '').toLowerCase();
      if (['card','bank_transfer','mobile_money','airtel_money','flex_pay'].includes(m)) {
        if (!p.reference || p.reference.trim().length === 0) {
          toast({ title: 'Reference Required', description: `Reference required for ${m.toUpperCase()} payment.`, variant: 'destructive' });
          return;
        }
        if (m.includes('money')) {
          const ok = /^[a-z0-9]{6,}$/i.test(p.reference.trim());
          if (!ok) {
            toast({ title: 'Invalid Reference', description: 'Mobile money references must be alphanumeric and at least 6 characters.', variant: 'destructive' });
            return;
          }
        }
      }
    }
    
    // Require authentication
    const token = localStorage.getItem('accessToken');
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please log in to complete a transaction.',
        variant: 'destructive',
      });
      try {
        window.location.href = '/login';
      } catch {}
      return;
    }

    setLoading(true);
    
    try {
      const transaction = {
        items: cartItems,
        customerId: selectedCustomer?.id?.toString(),
        payments: payments.map(p => ({ method: p.method, amount: p.amount || 0, reference: p.reference || '' })),
        changeAmount: multiChangeAmount,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        notes: selectedCustomer ? `Sale to ${selectedCustomer.name}` : 'Walk-in customer'
      };
      
      const created = await POSServiceAPI.createTransaction(transaction);
      
      if (created) {
        // If this sale was restored from a hold, remove the held sale now
        if (restoredHeldSaleId) {
          try {
            await deleteHeldSale(restoredHeldSaleId);
            // Refresh held count
            const newCount = await getHeldSalesCount().catch(() => 0);
            setHeldSalesCount(newCount);
            if (restoredHoldNumber) {
              toast({ title: 'Hold Cleared', description: `Hold #${restoredHoldNumber} has been settled and removed.` });
            }
          } catch (e) {
            console.error('Failed to delete held sale after settlement:', e);
          } finally {
            setRestoredHeldSaleId(null);
            setRestoredHoldNumber(null);
          }
        }
        // API returns full sale object already; no need to re-fetch by ID
        setCurrentTransaction(created as any);
        
        toast({
          title: "Success",
          description: `Transaction completed successfully.`,
          variant: "default",
        });
        
        // Update recent transactions list
        const updatedTransactions = await POSServiceAPI.getRecentTransactions();
        setRecentTransactions(updatedTransactions);
        
        // Open receipt dialog
        setReceiptDialogOpen(true);
        // Auto-print if enabled in settings
        try {
          const s = settingsService.loadSettings();
          if (s.system.printReceipts) {
            setTimeout(() => window.print && window.print(), 100);
          }
        } catch {}
        
        // Clear cart and reset
        clearCart();
      } else {
        throw new Error("Failed to create transaction");
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      // Show server validation details if available
      const details = (error as any)?.response?.data?.details;
      const firstDetail = Array.isArray(details) && details.length > 0 ? details[0]?.message || details[0] : null;
      toast({
        title: "Transaction Failed",
        description: firstDetail || "Failed to process transaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPaymentDialogOpen(false);
      setPayments([]);
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

  // Focus search after print completes
  useEffect(() => {
    const afterPrint = () => {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    };
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full bg-qb-gray-50">
      {/* Left column: Product Search & Inventory */}
      <div className="flex flex-col lg:w-3/5 h-full">
        <Card className="qb-card flex flex-col h-full bg-white">
          <CardHeader className="pb-3 border-b border-qb-gray-200 sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
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
                    setSelectedSuggestionIndex(-1);
                    debouncedSearch(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Arrow navigation through suggestions
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedSuggestionIndex((idx) => Math.min((idx < 0 ? 0 : idx + 1), Math.max(0, filteredItems.length - 1)));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedSuggestionIndex((idx) => Math.max(-1, idx - 1));
                      return;
                    }
                    // Press Enter to add selected (or first) result to cart
                    if (e.key === 'Enter' && filteredItems.length > 0 && !searching) {
                      const pick = selectedSuggestionIndex >= 0 ? filteredItems[selectedSuggestionIndex] : filteredItems[0];
                      if (pick) {
                        addToCart(pick);
                        e.currentTarget.select(); // Select text for quick clear
                        setSelectedSuggestionIndex(-1);
                      }
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
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
                      filteredItems.map((item, idx) => (
                        <Card 
                          key={item.id}
                          className={`cursor-pointer hover:shadow-qb-card-hover hover:border-qb-blue-300 transition-all duration-200 animate-fade-in ${idx === selectedSuggestionIndex ? 'ring-2 ring-qb-blue-400 border-qb-blue-300' : ''}`}
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
                      filteredItems.map((item, idx) => (
                        <div 
                          key={item.id}
                          className={`flex items-center justify-between p-3 hover:bg-qb-gray-50 rounded-md cursor-pointer qb-table-row border border-transparent hover:border-qb-blue-200 transition-all duration-200 ${idx === selectedSuggestionIndex ? 'ring-2 ring-qb-blue-400 border-qb-blue-300' : ''}`}
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
          <CardHeader className="pb-3 border-b border-qb-gray-200 sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-semibold text-qb-gray-900 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-qb-blue-500" />
                Shopping Cart
              </CardTitle>
              <div className="flex gap-2">
                {/* Help Button (Shortcut Legend) */}
                <Button 
                  variant="outline"
                  size="sm"
                  className="qb-btn-secondary text-xs"
                  title="Keyboard shortcuts (press ? too)"
                  onClick={() => setShortcutHelpOpen(true)}
                >
                  <HelpCircle className="h-4 w-4 mr-1" /> Help
                </Button>
                {/* Held Sales Button - always visible */}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setHeldSalesDialogOpen(true)}
                  className="qb-btn-secondary text-xs"
                  title="View held sales"
                >
                  <Archive className="h-4 w-4 mr-1" />
                  Held ({heldSalesCount})
                </Button>
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
                          onClick={() => selectCustomer(customer.id?.toString() || '')}
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
                {cartItems.map((item, index) => {
                  // Get product for UoM options
                  const product = inventoryItems.find(p => p.id === item.productId) as ProductWithUoMs;
                  
                  return (
                    <div key={item.id} className={`border border-qb-gray-200 rounded-md hover:border-qb-blue-300 transition-colors bg-white ${index === selectedCartIndex ? 'ring-2 ring-qb-blue-300 border-qb-blue-300' : ''}`} onClick={() => setSelectedCartIndex(index)}>
                      {/* Main row with product info and controls */}
                      <div className="flex items-center justify-between p-3">
                        <div className="flex-1 mr-3">
                          <p className="font-medium text-qb-gray-900 text-sm">{item.name}</p>
                          <p className="text-xs text-qb-gray-500">
                            {formatCurrency(item.price || 0)} per {item.unit}
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
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(index, parseFloat(e.target.value) || 1)}
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
                          <div className="w-24 text-right font-semibold text-qb-gray-900 text-sm">
                            {formatCurrency(
                              Math.max(0, multiplyMoney(item.price || 0, item.quantity) - (item.discount || 0))
                            )}
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
                      
                      {/* UoM Selector */}
                      {product && hasUoMSystem(product) && (
                        <div className="px-3 pb-3 pt-0 border-t border-qb-gray-100">
                          <div className="flex items-center gap-2 mt-2">
                            <Label className="text-xs text-qb-gray-600 whitespace-nowrap min-w-[35px]">
                              Unit:
                            </Label>
                            <UoMSelect
                              product={product}
                              value={item.uomId}
                              onChange={(newUomId) => handleUoMChange(index, newUomId)}
                              size="sm"
                              className="flex-1"
                            />
                          </div>
                        </div>
                      )}

                      {/* Inline actions: price override, discount, and tax toggle */}
                      <div className="px-3 pb-3 pt-2 border-t border-qb-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2 flex-wrap items-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPriceOverride(index)}>
                              Override Price
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDiscountDialog(index)}>
                              Discount
                            </Button>
                            <label className="flex items-center gap-1 text-xs text-qb-gray-700 select-none">
                              <input
                                type="checkbox"
                                className="h-3 w-3 accent-qb-blue-600"
                                checked={!!item.taxExempt}
                                onChange={(e) => {
                                  const updated = [...cartItems];
                                  updated[index].taxExempt = e.target.checked;
                                  setCartItems(updated);
                                }}
                              />
                              Tax Exempt
                            </label>
                          </div>
                          <div className="text-xs text-qb-gray-600">
                            {item.discount && item.discount > 0 ? (
                              <span className="text-qb-green-600">- {formatCurrency(item.discount)}</span>
                            ) : (
                              <span className="opacity-60">No discount</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          
          <Separator />
          
          <CardFooter className="flex-col pt-4 bg-qb-gray-50 border-t border-qb-gray-200 sticky bottom-0 z-10 shadow-[0_-4px_10px_-6px_rgba(0,0,0,0.15)]">
            {/* Totals Summary */}
            <div className="w-full space-y-2 mb-4">
              <div className="flex justify-between text-sm text-qb-gray-700">
                <span>Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-qb-gray-700">
                <span>Tax</span>
                <span className="font-medium">{formatCurrency(taxAmount)}</span>
              </div>
              {lineDiscountTotal > 0 && (
                <div className="flex justify-between text-sm text-qb-green-600">
                  <span>Item Discounts</span>
                  <span className="font-medium">-{formatCurrency(lineDiscountTotal)}</span>
                </div>
              )}
              {customerDiscount > 0 && (
                <div className="flex justify-between text-sm text-qb-green-600">
                  <span>Discount</span>
                  <span className="font-medium">-{formatCurrency(customerDiscount)}</span>
                </div>
              )}
              {Math.abs(roundingAdjustment) > 0.0001 && (
                <div className="flex justify-between text-sm text-qb-gray-700">
                  <span>Rounding</span>
                  <span className="font-medium">{roundingAdjustment >= 0 ? '+' : ''}{formatCurrency(Math.abs(roundingAdjustment))}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-lg text-qb-gray-900">
                <span>Total</span>
                <span className="text-qb-blue-600">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            
            {/* Checkout Buttons */}
            <div className="flex gap-2">
              <Button 
                variant="outline"
                className="flex-1 qb-btn-secondary h-11 text-base font-semibold" 
                size="lg" 
                disabled={cartItems.length === 0 || loading}
                onClick={handleHoldSale}
              >
                <Archive className="mr-2 h-5 w-5" />
                Hold
              </Button>
              <Button
                variant="outline"
                className="h-11 text-base font-semibold"
                size="lg"
                onClick={() => setDarkMode((d) => !d)}
              >
                {darkMode ? 'Light' : 'Dark'}
              </Button>
              <Button 
                className="flex-[2] qb-btn-primary h-11 text-base font-semibold shadow-md" 
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
                    Checkout
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
      
      {/* Price Override Dialog */}
      <Dialog open={priceDialog.open} onOpenChange={(open) => setPriceDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Override Unit Price</DialogTitle>
            <DialogDescription>Enter a new unit price and a brief reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="newPrice">New Price</Label>
              <Input id="newPrice" type="number" step="0.01" value={priceDialog.newPrice} onChange={(e) => setPriceDialog((s) => ({ ...s, newPrice: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="priceReason">Reason</Label>
              <Input id="priceReason" placeholder="e.g., Manager approval" value={priceDialog.reason} onChange={(e) => setPriceDialog((s) => ({ ...s, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialog({ open: false, index: null, newPrice: '', reason: '' })}>Cancel</Button>
            <Button onClick={confirmPriceOverride}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={discountDialog.open} onOpenChange={(open) => setDiscountDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
            <DialogDescription>Enter discount as percent or amount.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={discountDialog.mode} onValueChange={(v: 'percent' | 'amount') => setDiscountDialog((s) => ({ ...s, mode: v }))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                </SelectContent>
              </Select>
              <Input autoFocus type="number" step="0.01" placeholder={discountDialog.mode === 'percent' ? 'e.g., 5' : 'e.g., 2.50'} value={discountDialog.value} onChange={(e) => setDiscountDialog((s) => ({ ...s, value: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="discReason">Reason (required if &gt;5%)</Label>
              <Input id="discReason" value={discountDialog.reason} onChange={(e) => setDiscountDialog((s) => ({ ...s, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialog({ open: false, index: null, mode: 'percent', value: '', reason: '' })}>Cancel</Button>
            <Button onClick={confirmDiscount}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={(open)=>{
        setPaymentDialogOpen(open);
        if (!open) {
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }}>
        <DialogContent className="max-w-[100vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl w-[100vw] sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6 m-0">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
            <DialogDescription>
              Enter payment details to complete the transaction.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Totals summary */}
            <div className="grid grid-cols-2 gap-2 text-base sm:text-lg font-bold">
              <div className="flex justify-between bg-qb-gray-100 rounded px-3 py-2"><span>Total Due</span><span>{formatCurrency(grandTotal)}</span></div>
              <div className="flex justify-between bg-qb-gray-100 rounded px-3 py-2"><span>Paid</span><span>{formatCurrency(paidTotal)}</span></div>
              <div className="flex justify-between bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-yellow-800"><span>Remaining</span><span>{formatCurrency(remainingDue)}</span></div>
              <div className="flex justify-between bg-green-50 border border-green-200 rounded px-3 py-2 text-green-800"><span>Change</span><span>{formatCurrency(Math.max(0, paidTotal - total))}</span></div>
            </div>

            {/* Responsive content: payments on left, helpers on right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payments list */}
              <div className="space-y-3 order-2 md:order-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Payments</Label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="hidden sm:inline">Auto-balance</span>
                    <Switch checked={autoBalance} onCheckedChange={setAutoBalance} aria-label="Auto-balance last line" />
                  </div>
                </div>
                {payments.map((p, idx) => (
                  <div key={idx} className={`p-3 rounded border ${idx === selectedPaymentIndex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-border'}`} onClick={() => setSelectedPaymentIndex(idx)}>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-4">
                        <Label className="text-xs">Method</Label>
                        <Select value={p.method} onValueChange={(val) => setPayments((list) => balancePayments(list.map((it,i)=> i===idx? { ...it, method: val }: it)))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash"><div className="flex items-center"><Banknote className="mr-2 h-4 w-4"/>Cash</div></SelectItem>
                            <SelectItem value="card"><div className="flex items-center"><CreditCard className="mr-2 h-4 w-4"/>Card</div></SelectItem>
                            <SelectItem value="bank_transfer"><div className="flex items-center"><CircleDollarSign className="mr-2 h-4 w-4"/>Bank Transfer</div></SelectItem>
                            <SelectItem value="mobile_money"><div className="flex items-center"><CircleDollarSign className="mr-2 h-4 w-4"/>Mobile Money</div></SelectItem>
                            <SelectItem value="airtel_money"><div className="flex items-center"><CircleDollarSign className="mr-2 h-4 w-4"/>Airtel Money</div></SelectItem>
                            <SelectItem value="flex_pay"><div className="flex items-center"><CircleDollarSign className="mr-2 h-4 w-4"/>Flex Pay</div></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-4">
                        <Label className="text-xs">Amount</Label>
                        <Input type="number" step="0.01" inputMode="decimal" value={p.amount ?? 0} onChange={(e)=>{
                          const val = parseFloat(e.target.value || '0') || 0;
                          setPayments((list)=> balancePayments(list.map((it,i)=> i===idx? { ...it, amount: Math.max(0, val) }: it)));
                        }} />
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Reference</Label>
                        <Input placeholder={p.method?.includes('money')? 'Txn Ref (6+ chars)' : 'Ref / Auth Code'} value={p.reference || ''} onChange={(e)=> setPayments((list)=> balancePayments(list.map((it,i)=> i===idx? { ...it, reference: e.target.value }: it)))} />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <Button variant="outline" className="w-full sm:w-auto" disabled={payments.length <= 1} onClick={() => setPayments((list)=> balancePayments(list.filter((_,i)=> i!==idx)))}>Remove</Button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 flex-col sm:flex-row">
                  <Button className="flex-1" variant="outline" onClick={() => setPayments((list)=> balancePayments([...(list||[]), { method: 'cash', amount: remainingDue || 0, reference: '' }]))}><Banknote className="h-4 w-4 mr-1"/>Add Cash</Button>
                  <Button className="flex-1" variant="outline" onClick={() => setPayments((list)=> balancePayments([...(list||[]), { method: 'card', amount: remainingDue || 0, reference: '' }]))}><CreditCard className="h-4 w-4 mr-1"/>Add Card</Button>
                  <Button className="flex-1" variant="outline" onClick={() => setPayments((list)=> balancePayments([...(list||[]), { method: 'bank_transfer', amount: remainingDue || 0, reference: '' }]))}><CircleDollarSign className="h-4 w-4 mr-1"/>Add Transfer</Button>
                </div>
              </div>

              {/* Quick amounts + keypad */}
              <div className="space-y-3 order-1 md:order-2">
                {quickAmountsEnabled && (
                  <div>
                    <Label className="text-xs">Quick Amounts</Label>
                    {/* Horizontal scroll on small screens, wrap on md+ */}
                    <div className="md:hidden -mx-4 px-4 flex items-center gap-2 overflow-x-auto pb-1">
                      <Button variant="outline" className="py-3 shrink-0" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: remainingDue }: it)))}>Exact</Button>
                      {(quickSteps || []).map(v => (
                        <Button key={`m-${v}`} variant="outline" className="py-3 shrink-0" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: addMoney(it.amount||0, v) }: it)))}>+{v}</Button>
                      ))}
                      {quickSuggestionsEnabled && (() => {
                        const up = (base: number, step: number) => Math.ceil((base || 0) / step) * step;
                        const sugg = [remainingDue, up(remainingDue, 10), up(remainingDue, 50), up(remainingDue, 100)];
                        const labels = ['Exact', 'Next 10', 'Next 50', 'Next 100'];
                        return sugg.map((amt, i) => (
                          <Button key={`s-${i}`} variant="secondary" className="py-3 shrink-0" onClick={()=> setPayments((list)=> balancePayments(list.map((it,idx)=> idx===selectedPaymentIndex? { ...it, amount: amt }: it)))}>
                            {labels[i]} ({formatCurrency(amt)})
                          </Button>
                        ));
                      })()}
                    </div>
                    <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                      <Button variant="outline" className="py-4" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: remainingDue }: it)))}>Exact</Button>
                      {(quickSteps || []).map(v => (
                        <Button key={`d-${v}`} variant="outline" className="py-4" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: addMoney(it.amount||0, v) }: it)))}>+{v}</Button>
                      ))}
                      {quickSuggestionsEnabled && (() => {
                        const up = (base: number, step: number) => Math.ceil((base || 0) / step) * step;
                        const sugg = [remainingDue, up(remainingDue, 10), up(remainingDue, 50), up(remainingDue, 100)];
                        const labels = ['Exact', 'Next 10', 'Next 50', 'Next 100'];
                        return sugg.map((amt, i) => (
                          <Button key={`lg-${i}`} variant="secondary" className="py-4" onClick={()=> setPayments((list)=> balancePayments(list.map((it,idx)=> idx===selectedPaymentIndex? { ...it, amount: amt }: it)))}>
                            {labels[i]} ({formatCurrency(amt)})
                          </Button>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 mt-2 select-none">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <Button key={n} className="py-6 text-xl" variant="secondary" onClick={()=> {
                      setPayments((list)=> balancePayments(list.map((it,i)=> {
                        if (i!==selectedPaymentIndex) return it;
                        const s = (it.amount ?? 0).toFixed(2);
                        const concat = (s.replace('.','') + String(n)).replace(/^0+/, '');
                        const cents = parseInt(concat,10) || 0;
                        return { ...it, amount: cents/100 };
                      })));
                    }}>{n}</Button>
                  ))}
                  <Button className="py-6 text-xl" variant="secondary" onClick={()=> {
                    setPayments((list)=> balancePayments(list.map((it,i)=> {
                      if (i!==selectedPaymentIndex) return it;
                      const cents = Math.floor((it.amount ?? 0) * 100);
                      const next = Math.floor(cents/10);
                      return { ...it, amount: Math.max(0, next/100) };
                    })));
                  }}>⌫</Button>
                  <Button className="py-6 text-xl" variant="secondary" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: addMoney(it.amount||0, 0) }: it)))}>0</Button>
                  <Button className="py-6 text-xl" variant="secondary" onClick={()=> setPayments((list)=> balancePayments(list.map((it,i)=> i===selectedPaymentIndex? { ...it, amount: remainingDue }: it)))}>↵</Button>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="sticky bottom-0 bg-white dark:bg-neutral-900 border-t mt-2 pt-3">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={processPayment} 
              disabled={loading || cartItems.length === 0 || paidTotal < grandTotal}
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
      <Dialog open={receiptDialogOpen} onOpenChange={(open)=>{
        setReceiptDialogOpen(open);
        if (!open) {
          // Refocus search when receipt is closed
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg p-4 sm:p-6">
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
                    {new Date(currentTransaction.createdAt || Date.now()).toLocaleString()}
                  </p>
                  <p className="text-sm">Transaction #{currentTransaction.id.toString().slice(0, 8)}</p>
                </div>
                
                <div className="space-y-2">
                  {currentTransaction.items && currentTransaction.items.length > 0 ? (
                    currentTransaction.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        <span>{formatCurrency((item.price || 0) * item.quantity)}</span>
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
                
                <div className="mt-2 pt-2 border-t space-y-1">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Payments</span>
                  </div>
                  {Array.isArray((currentTransaction as any).payments) && (currentTransaction as any).payments.length > 0 ? (
                    <div className="space-y-1 text-sm">
                      {(currentTransaction as any).payments.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="capitalize">{p.method}</span>
                          <span>{formatCurrency(p.amount || 0)}</span>
                        </div>
                      ))}
                      {((currentTransaction as any).changeAmount || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>Change</span>
                          <span>{formatCurrency((currentTransaction as any).changeAmount)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm">
                      <div className="flex justify-between">
                        <span>Method</span>
                        <span className="capitalize">{(currentTransaction as any).paymentMethod || 'cash'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Paid</span>
                        <span>{formatCurrency((currentTransaction as any).amountPaid || (currentTransaction as any).paymentAmount || currentTransaction.total || 0)}</span>
                      </div>
                      {((currentTransaction as any).changeAmount || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>Change</span>
                          <span>{formatCurrency((currentTransaction as any).changeAmount)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="mt-4 text-center text-xs text-muted-foreground">
                  <p>Thank you for your purchase!</p>
                  <p>www.samplepos.com</p>
                </div>
              </div>
              
              <div className="flex justify-center space-x-2">
                <Button variant="outline" size="sm" onClick={() => { try { window.print && window.print(); } catch {} }}>
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
      
      {/* Shortcuts Legend Dialog */}
      <Dialog open={shortcutHelpOpen} onOpenChange={(open)=>{
        setShortcutHelpOpen(open);
        if (!open) setTimeout(()=> searchInputRef.current?.focus(), 0);
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md w-[95vw] sm:w-auto rounded-none sm:rounded-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Work faster with keys; press ? to toggle this panel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Start typing</span><span className="font-medium">Search items</span></div>
            <div className="flex justify-between"><span>Arrow Up/Down</span><span className="font-medium">Navigate suggestions</span></div>
            <div className="flex justify-between"><span>Enter (in search)</span><span className="font-medium">Add selected/first item</span></div>
            <div className="flex justify-between"><span>Space</span><span className="font-medium">Open checkout</span></div>
            <div className="flex justify-between"><span>Enter (in payment)</span><span className="font-medium">Complete + Print</span></div>
            <div className="flex justify-between"><span>Esc (in payment)</span><span className="font-medium">Close payment</span></div>
            <div className="flex justify-between"><span>+ / -</span><span className="font-medium">Change qty (selected line)</span></div>
            <div className="flex justify-between"><span>D</span><span className="font-medium">Discount on selected line</span></div>
            <div className="flex justify-between"><span>R</span><span className="font-medium">Toggle rounding</span></div>
            <div className="flex justify-between"><span>F5</span><span className="font-medium">Hold sale</span></div>
            <div className="flex justify-between"><span>F6</span><span className="font-medium">Open held list</span></div>
            <div className="flex justify-between"><span>Ctrl + Del</span><span className="font-medium">Clear cart</span></div>
            <div className="flex justify-between"><span>?</span><span className="font-medium">Toggle this help</span></div>
          </div>
          <DialogFooter>
            <Button onClick={()=> setShortcutHelpOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <CreateCustomerModal
          open={showNewCustomerModal}
          onClose={() => setShowNewCustomerModal(false)}
        />
      )}
      
      {/* Held Sales Dialog */}
      <HeldSalesDialog
        open={heldSalesDialogOpen}
        onOpenChange={(open)=>{
          setHeldSalesDialogOpen(open);
          if (!open) setTimeout(()=> searchInputRef.current?.focus(), 0);
        }}
        onRestore={handleRestoreHeldSale}
        onDeleted={refreshHeldSalesCount}
      />
      
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
                          Transaction #{transaction.id.toString().slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.createdAt || Date.now()).toLocaleString()}
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
                        {Array.isArray((transaction as any).payments) && (transaction as any).payments.length > 0
                          ? `Paid: ${(transaction as any).payments.map((p: any) => p.method).join(' + ')}`
                          : `Paid via ${(transaction as any).paymentMethod || 'cash'}`}
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
                        onClick={() => voidTransaction(transaction.id.toString())}
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

