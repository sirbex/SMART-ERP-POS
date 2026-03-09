/**
 * customerService unit tests
 * Tests customer CRUD and business logic.
 */
import { jest } from '@jest/globals';

// Mock functions matching actual customerRepository exports
const mockFindAllCustomers = jest.fn();
const mockCountCustomers = jest.fn();
const mockFindCustomerById = jest.fn();
const mockFindCustomerByNumber = jest.fn();
const mockFindCustomerByEmail = jest.fn();
const mockSearchCustomers = jest.fn();
const mockCreateCustomer = jest.fn();
const mockUpdateCustomer = jest.fn();
const mockDeleteCustomer = jest.fn();
const mockToggleCustomerActive = jest.fn();
const mockUpdateCustomerBalance = jest.fn();
const mockFindCustomerSales = jest.fn();
const mockCountCustomerSales = jest.fn();

jest.unstable_mockModule('./customerRepository.js', () => ({
  findAllCustomers: mockFindAllCustomers,
  countCustomers: mockCountCustomers,
  findCustomerById: mockFindCustomerById,
  findCustomerByNumber: mockFindCustomerByNumber,
  findCustomerByEmail: mockFindCustomerByEmail,
  searchCustomers: mockSearchCustomers,
  createCustomer: mockCreateCustomer,
  updateCustomer: mockUpdateCustomer,
  deleteCustomer: mockDeleteCustomer,
  toggleCustomerActive: mockToggleCustomerActive,
  updateCustomerBalance: mockUpdateCustomerBalance,
  findCustomerSales: mockFindCustomerSales,
  countCustomerSales: mockCountCustomerSales,
  findCustomerTransactions: jest.fn().mockResolvedValue([]),
  countCustomerTransactions: jest.fn().mockResolvedValue(0),
  getCustomerSummary: jest.fn().mockResolvedValue({}),
  getOpeningBalance: jest.fn().mockResolvedValue(0),
  getStatementEntries: jest.fn().mockResolvedValue([]),
  getDepositEntries: jest.fn().mockResolvedValue([]),
  getCustomerDepositSummary: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../middleware/businessRules.js', () => ({
  SalesBusinessRules: { MAX_CREDIT_LIMIT: 5000000 },
}));

jest.unstable_mockModule('../../../../shared/zod/customerStatement.js', () => ({
  CustomerStatementSchema: { parse: jest.fn((v: unknown) => v) },
}));

const customerService = await import('./customerService.js');

describe('customerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAllCustomers', () => {
    it('should return paginated customers', async () => {
      mockFindAllCustomers.mockResolvedValue([{ id: 'c1', name: 'Alpha' }]);
      mockCountCustomers.mockResolvedValue(1);

      const result = await customerService.getAllCustomers(1, 20);

      expect(result.data).toHaveLength(1);
      expect(mockFindAllCustomers).toHaveBeenCalled();
      expect(mockCountCustomers).toHaveBeenCalled();
    });
  });

  describe('getCustomerById', () => {
    it('should return customer when found', async () => {
      mockFindCustomerById.mockResolvedValue({ id: 'c1', name: 'Alpha' });

      const customer = await customerService.getCustomerById('c1');
      expect(customer.name).toBe('Alpha');
    });

    it('should throw when not found', async () => {
      mockFindCustomerById.mockResolvedValue(null);

      await expect(customerService.getCustomerById('ghost')).rejects.toThrow();
    });
  });

  describe('createCustomer', () => {
    it('should create and return new customer', async () => {
      mockFindCustomerByEmail.mockResolvedValue(null);
      mockCreateCustomer.mockResolvedValue({ id: 'c2', name: 'Beta', customerNumber: 'CUST-0001' });

      const customer = await customerService.createCustomer({
        name: 'Beta',
        email: 'beta@x.com',
      } as any);
      expect(customer.id).toBe('c2');
      expect(mockCreateCustomer).toHaveBeenCalled();
    });
  });

  describe('updateCustomer', () => {
    it('should update and return customer', async () => {
      mockFindCustomerById.mockResolvedValue({ id: 'c1', name: 'Old', email: 'old@x.com' });
      mockUpdateCustomer.mockResolvedValue({ id: 'c1', name: 'Updated' });

      const customer = await customerService.updateCustomer('c1', { name: 'Updated' } as any);
      expect(customer.name).toBe('Updated');
    });

    it('should throw when customer not found', async () => {
      mockFindCustomerById.mockResolvedValue(null);

      await expect(customerService.updateCustomer('ghost', { name: 'X' } as any)).rejects.toThrow();
    });
  });

  describe('deleteCustomer', () => {
    it('should delete customer', async () => {
      mockFindCustomerById.mockResolvedValue({ id: 'c1', name: 'Alpha', balance: 0 });
      mockDeleteCustomer.mockResolvedValue(true);

      await expect(customerService.deleteCustomer('c1')).resolves.not.toThrow();
    });
  });

  describe('searchCustomers', () => {
    it('should return matching customers', async () => {
      mockSearchCustomers.mockResolvedValue([{ id: 'c1', name: 'Alpha' }]);

      const results = await customerService.searchCustomers('Alpha');
      expect(results).toHaveLength(1);
    });

    it('should return empty for no matches', async () => {
      mockSearchCustomers.mockResolvedValue([]);

      const results = await customerService.searchCustomers('ZZZ');
      expect(results).toHaveLength(0);
    });
  });
});
