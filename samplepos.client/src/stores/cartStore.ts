/**
 * Cart Store
 * 
 * Zustand store for managing POS cart with persistence.
 * Implements FEFO batch selection, Decimal.js precision, and localStorage sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Decimal from 'decimal.js';
import type { CartItem, Cart, Product, InventoryBatch, Customer } from '../types';
import { multiplyCurrency, addCurrency, subtractCurrency } from '../utils/currency';
import { STORAGE_KEYS } from '../utils/constants';

interface CartStore extends Cart {
  // Actions
  addItem: (product: Product, quantity: Decimal, batch?: InventoryBatch) => void;
  updateItemQuantity: (productId: string, batchId: string | undefined, quantity: Decimal) => void;
  removeItem: (productId: string, batchId: string | undefined) => void;
  updateItemDiscount: (productId: string, batchId: string | undefined, discountPercent: Decimal) => void;
  setCustomer: (customer: Customer | undefined) => void;
  setPaymentMethod: (method: string) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  recalculateTotals: () => void;
}

/**
 * Calculate item totals with Decimal.js precision
 */
function calculateItemTotals(item: Omit<CartItem, 'subtotal' | 'discountAmount' | 'taxAmount' | 'total'>): CartItem {
  const { quantity, unitPrice, discountPercent, taxPercent } = item;
  
  // Subtotal = quantity × unitPrice
  const subtotal = multiplyCurrency(quantity, unitPrice);
  
  // Discount = subtotal × (discountPercent / 100)
  const discountAmount = multiplyCurrency(subtotal, discountPercent).dividedBy(100);
  
  // Amount after discount
  const amountAfterDiscount = subtractCurrency(subtotal, discountAmount);
  
  // Tax = amountAfterDiscount × (taxPercent / 100)
  const taxAmount = multiplyCurrency(amountAfterDiscount, taxPercent).dividedBy(100);
  
  // Total = amountAfterDiscount + taxAmount
  const total = addCurrency(amountAfterDiscount, taxAmount);
  
  return {
    ...item,
    subtotal,
    discountAmount,
    taxAmount,
    total
  };
}

/**
 * Cart Store
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      subtotal: new Decimal(0),
      discountAmount: new Decimal(0),
      taxAmount: new Decimal(0),
      total: new Decimal(0),
      customerId: undefined,
      customer: undefined,
      paymentMethod: undefined,
      notes: undefined,

      /**
       * Add item to cart
       */
      addItem: (product, quantity, batch) => {
        const state = get();
        const existingItemIndex = state.items.findIndex(
          item => item.productId === product.id && item.batchId === batch?.id
        );

        if (existingItemIndex >= 0) {
          // Update existing item quantity
          const updatedItems = [...state.items];
          const existingItem = updatedItems[existingItemIndex];
          const newQuantity = existingItem.quantity.plus(quantity);
          
          updatedItems[existingItemIndex] = calculateItemTotals({
            ...existingItem,
            quantity: newQuantity
          });

          set({ items: updatedItems });
        } else {
          // Add new item
          const taxPercent = product.taxRate ? new Decimal(product.taxRate) : new Decimal(0);
          
          const newItem = calculateItemTotals({
            productId: product.id,
            product,
            batchId: batch?.id,
            batch,
            quantity,
            unitPrice: new Decimal(product.sellingPrice),
            discountPercent: new Decimal(0),
            taxPercent
          });

          set({ items: [...state.items, newItem] });
        }

        get().recalculateTotals();
      },

      /**
       * Update item quantity
       */
      updateItemQuantity: (productId, batchId, quantity) => {
        const state = get();
        const updatedItems = state.items.map(item => {
          if (item.productId === productId && item.batchId === batchId) {
            return calculateItemTotals({
              ...item,
              quantity
            });
          }
          return item;
        });

        set({ items: updatedItems });
        get().recalculateTotals();
      },

      /**
       * Remove item from cart
       */
      removeItem: (productId, batchId) => {
        const state = get();
        const updatedItems = state.items.filter(
          item => !(item.productId === productId && item.batchId === batchId)
        );

        set({ items: updatedItems });
        get().recalculateTotals();
      },

      /**
       * Update item discount
       */
      updateItemDiscount: (productId, batchId, discountPercent) => {
        const state = get();
        const updatedItems = state.items.map(item => {
          if (item.productId === productId && item.batchId === batchId) {
            return calculateItemTotals({
              ...item,
              discountPercent
            });
          }
          return item;
        });

        set({ items: updatedItems });
        get().recalculateTotals();
      },

      /**
       * Set customer
       */
      setCustomer: (customer) => {
        set({
          customer,
          customerId: customer?.id
        });
      },

      /**
       * Set payment method
       */
      setPaymentMethod: (method) => {
        set({ paymentMethod: method });
      },

      /**
       * Set notes
       */
      setNotes: (notes) => {
        set({ notes });
      },

      /**
       * Clear cart
       */
      clearCart: () => {
        set({
          items: [],
          subtotal: new Decimal(0),
          discountAmount: new Decimal(0),
          taxAmount: new Decimal(0),
          total: new Decimal(0),
          customerId: undefined,
          customer: undefined,
          paymentMethod: undefined,
          notes: undefined
        });
      },

      /**
       * Recalculate cart totals
       */
      recalculateTotals: () => {
        const state = get();
        
        const subtotal = state.items.reduce(
          (sum, item) => sum.plus(item.subtotal),
          new Decimal(0)
        );
        
        const discountAmount = state.items.reduce(
          (sum, item) => sum.plus(item.discountAmount),
          new Decimal(0)
        );
        
        const taxAmount = state.items.reduce(
          (sum, item) => sum.plus(item.taxAmount),
          new Decimal(0)
        );
        
        const total = state.items.reduce(
          (sum, item) => sum.plus(item.total),
          new Decimal(0)
        );

        set({
          subtotal,
          discountAmount,
          taxAmount,
          total
        });
      }
    }),
    {
      name: STORAGE_KEYS.CART,
      // Custom serialization for Decimal.js
      partialize: (state) => ({
        items: state.items.map(item => ({
          ...item,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          discountPercent: item.discountPercent.toString(),
          discountAmount: item.discountAmount.toString(),
          taxPercent: item.taxPercent.toString(),
          taxAmount: item.taxAmount.toString(),
          subtotal: item.subtotal.toString(),
          total: item.total.toString()
        })),
        subtotal: state.subtotal.toString(),
        discountAmount: state.discountAmount.toString(),
        taxAmount: state.taxAmount.toString(),
        total: state.total.toString(),
        customerId: state.customerId,
        customer: state.customer,
        paymentMethod: state.paymentMethod,
        notes: state.notes
      }),
      // Custom deserialization for Decimal.js
      onRehydrateStorage: () => (state) => {
        if (state && state.items) {
          state.items = state.items.map(item => ({
            ...item,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            discountPercent: new Decimal(item.discountPercent),
            discountAmount: new Decimal(item.discountAmount),
            taxPercent: new Decimal(item.taxPercent),
            taxAmount: new Decimal(item.taxAmount),
            subtotal: new Decimal(item.subtotal),
            total: new Decimal(item.total)
          }));
          state.subtotal = new Decimal(state.subtotal);
          state.discountAmount = new Decimal(state.discountAmount);
          state.taxAmount = new Decimal(state.taxAmount);
          state.total = new Decimal(state.total);
        }
      }
    }
  )
);
