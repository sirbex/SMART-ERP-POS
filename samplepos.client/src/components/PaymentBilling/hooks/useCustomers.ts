/**
 * Custom hook for fetching and managing customer data
 */

import { useQuery } from '@tanstack/react-query';
import * as POSServiceAPI from '../../../services/POSServiceAPI';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  balance: number;
  creditLimit?: number;
}

/**
 * Fetch all customers from the API
 */
const fetchCustomers = async (): Promise<Customer[]> => {
  try {
    const customers = await POSServiceAPI.getCustomersForPOS();
    return customers.map(c => ({
      id: c.id || '',
      name: c.name,
      email: c.email,
      phone: c.contact,
      balance: c.balance || 0,
      creditLimit: 0,
    }));
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw new Error('Failed to load customers');
  }
};

/**
 * Hook to fetch and cache customer list
 */
export const useCustomers = () => {
  return useQuery({
    queryKey: ['customers'],
    queryFn: fetchCustomers,
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
    retry: 2,
  });
};

/**
 * Hook to fetch a single customer by ID
 */
export const useCustomer = (customerId?: string) => {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      if (!customerId) return null;
      return POSServiceAPI.getCustomer(customerId);
    },
    enabled: !!customerId,
    staleTime: 60000,
    gcTime: 300000,
  });
};
