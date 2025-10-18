/**
 * Customer model for the POS system
 */
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  balance?: number;
  loyaltyDiscount?: number;    // Added: loyalty discount percentage for customer
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}