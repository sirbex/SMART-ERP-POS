/**
 * PostgreSQL POS Integration Tests
 * Tests the integration between PostgreSQL POS components and the database
 */

import * as POSService from '../services/POSService.postgres';
import * as TransactionService from '../services/TransactionService.postgres';
import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock database client
vi.mock('../db/pool', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    })
  }
}));

// Mock repositories
vi.mock('../repositories/transaction-repository');
vi.mock('../repositories/transaction-item-repository');
vi.mock('../repositories/inventory-item-repository');
vi.mock('../repositories/inventory-batch-repository');

// Mock services
vi.mock('../services/TransactionService.postgres');

describe('PostgreSQL POS Integration Tests', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });
  
  test('getInventory should return inventory items from PostgreSQL', async () => {
    // Arrange
    const mockInventoryItems = [
      { 
        id: 1, 
        name: 'Test Item 1', 
        sku: 'SKU001',
        description: 'Test description 1',
        category: 'Test',
        base_price: 10.99,
        tax_rate: 0.10,
        quantity: 100,
        is_active: true,
        // Add the mapped properties that will be returned after transformation
        price: 10.99
      },
      { 
        id: 2, 
        name: 'Test Item 2', 
        sku: 'SKU002',
        description: 'Test description 2',
        category: 'Test',
        base_price: 20.99,
        tax_rate: 0.10,
        quantity: 50,
        is_active: true,
        // Add the mapped properties that will be returned after transformation
        price: 20.99
      }
    ];
    
    // Mock the TransactionService.getInventoryItemsForPOS function
    vi.spyOn(TransactionService, 'getInventoryItemsForPOS').mockResolvedValue(mockInventoryItems);
    
    // Act
    const result = await POSService.getInventory();
    
    // Assert
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Test Item 1');
    expect(result[0].price).toBe(10.99);
    expect(TransactionService.getInventoryItemsForPOS).toHaveBeenCalledTimes(1);
  });
  
  test('processTransaction should process a transaction successfully', async () => {
    // Arrange
    const mockItems = [
      { 
        id: '1', 
        productId: '1', 
        name: 'Test Item', 
        quantity: 2, 
        unitPrice: 10.99, 
        subtotal: 21.98,
        taxes: 2.20,
        unit: 'piece',
        originalProduct: {
          id: '1',
          sku: 'SKU001',
          name: 'Test Item',
          price: 10.99,
          taxRate: 0.10
        }
      }
    ];
    
    const mockPayment = {
      method: 'cash',
      amountPaid: 25,
      change: 3.02,
      status: 'paid'
    };
    
    const mockCustomer = {
      id: '1',
      name: 'Test Customer'
    };
    
    const mockTransaction = {
      id: '1',
      items: [],
      subtotal: 21.98,
      tax: 2.20,
      discount: 0,
      total: 24.18,
      payment: mockPayment,
      customer: mockCustomer,
      createdAt: '2023-01-01T00:00:00Z'
    };
    
    // Mock the TransactionService.createTransaction function
    vi.spyOn(TransactionService, 'createTransaction').mockResolvedValue(mockTransaction as any);
    
    // Act
    const result = await POSService.processTransaction(mockItems as any[], mockPayment, mockCustomer);
    
    // Assert
    expect(result).toEqual(mockTransaction);
    expect(TransactionService.createTransaction).toHaveBeenCalledTimes(1);
  });
  
  test('getTransactionDetails should return transaction by ID', async () => {
    // Arrange
    const mockTransactionId = '1234-5678';
    const mockTransaction = {
      id: mockTransactionId,
      items: [
        {
          inventoryItemId: 1,
          name: 'Test Item',
          unitPrice: 10.99,
          price: 10.99,  // Add the required price property
          quantity: 2,
          subtotal: 21.98,
          tax: 2.20,
          total: 24.18
        }
      ],
      subtotal: 21.98,
      tax: 2.20,
      discount: 0,
      total: 24.18,
      payment: {
        method: 'cash',
        amountPaid: 30,
        change: 5.82,
        status: 'paid'
      },
      createdAt: '2023-01-01T00:00:00Z'
    };
    
    // Mock the TransactionService.getTransactionById function
    vi.spyOn(TransactionService, 'getTransactionById').mockResolvedValue(mockTransaction);
    
    // Act
    const result = await POSService.getTransactionDetails(mockTransactionId);
    
    // Assert
    expect(result).toEqual(mockTransaction);
    expect(TransactionService.getTransactionById).toHaveBeenCalledWith(mockTransactionId);
  });
  
  test('getTransactionHistory should return recent transactions', async () => {
    // Arrange
    const mockTransactions = [
      {
        id: '1',
        subtotal: 21.98,
        tax: 2.20,
        discount: 0,
        total: 24.18,
        payment: { method: 'cash', status: 'paid' },
        createdAt: '2023-01-01T00:00:00Z'
      },
      {
        id: '2',
        subtotal: 15.99,
        tax: 1.60,
        discount: 0,
        total: 17.59,
        payment: { method: 'card', status: 'paid' },
        createdAt: '2023-01-02T00:00:00Z'
      }
    ];
    
    // Mock the TransactionService.getRecentTransactions function
    vi.spyOn(TransactionService, 'getRecentTransactions').mockResolvedValue(mockTransactions as any[]);
    
    // Act
    const result = await POSService.getTransactionHistory();
    
    // Assert
    expect(result).toEqual(mockTransactions);
    expect(TransactionService.getRecentTransactions).toHaveBeenCalledWith(50); // Default limit
  });
  
  test('voidTransaction should void a transaction', async () => {
    // Arrange
    const mockTransactionId = '1234-5678';
    const mockReason = 'Customer changed mind';
    
    // Mock the TransactionService.voidTransaction function
    vi.spyOn(TransactionService, 'voidTransaction').mockResolvedValue(true);
    
    // Act
    const result = await POSService.voidTransaction(mockTransactionId, mockReason);
    
    // Assert
    expect(result).toBe(true);
    expect(TransactionService.voidTransaction).toHaveBeenCalledWith(mockTransactionId, mockReason);
  });
  
  test('mapTransactionForClient should convert data format correctly', async () => {
    // Arrange
    const mockTransaction = {
      id: '1234-5678',
      items: [
        {
          id: 'item1',
          inventoryItemId: 1,
          name: 'Test Item',
          sku: 'SKU001',
          unitPrice: 10.99,
          quantity: 2,
          subtotal: 21.98,
          tax: 2.20,
          total: 24.18,
          unit: 'piece'
        }
      ],
      subtotal: 21.98,
      tax: 2.20,
      discount: 0,
      total: 24.18,
      payment: {
        method: 'cash',
        amountPaid: 30,
        change: 5.82,
        status: 'paid'
      },
      createdAt: '2023-01-01T00:00:00Z'
    };
    
    // Act
    const result = await POSService.mapTransactionForClient(mockTransaction);
    
    // Assert
    expect(result).not.toBeNull();
    expect(result.id).toBe('1234-5678');
    expect(result.transactionNumber).toBe('1234-5678'.substring(0, 8).toUpperCase());
    expect(result.items[0].productId).toBe('1');
    expect(result.payment.method).toBe('cash');
    expect(result.payment.amount).toBe(30);
    expect(result.payment.changeAmount).toBe(5.82);
  });
});