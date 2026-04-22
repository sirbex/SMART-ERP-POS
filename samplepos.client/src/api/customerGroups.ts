/**
 * Customer Groups API Client
 */

import apiClient from '../utils/api';

export interface CustomerGroupData {
  id: string;
  name: string;
  description: string | null;
  discountPercentage: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customerCount: number;
  ruleCount: number;
}

export interface GroupCustomer {
  id: string;
  customerNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  balance: number;
  isActive: boolean;
}

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  discountPercentage: number;
  isActive?: boolean;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  discountPercentage?: number;
  isActive?: boolean;
}

export const customerGroupsApi = {
  async list(filters?: { isActive?: boolean; search?: string }): Promise<CustomerGroupData[]> {
    const params: Record<string, string> = {};
    if (filters?.isActive !== undefined) params.isActive = String(filters.isActive);
    if (filters?.search) params.search = filters.search;
    const res = await apiClient.get('/customers/groups', { params });
    return res.data.data;
  },

  async getById(id: string): Promise<CustomerGroupData> {
    const res = await apiClient.get(`/customers/groups/${id}`);
    return res.data.data;
  },

  async create(data: CreateGroupInput): Promise<CustomerGroupData> {
    const res = await apiClient.post('/customers/groups', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateGroupInput): Promise<CustomerGroupData> {
    const res = await apiClient.put(`/customers/groups/${id}`, data);
    return res.data.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/customers/groups/${id}`);
  },

  async getCustomers(groupId: string): Promise<GroupCustomer[]> {
    const res = await apiClient.get(`/customers/groups/${groupId}/customers`);
    return res.data.data;
  },

  async assignCustomer(groupId: string, customerId: string): Promise<void> {
    await apiClient.post(`/customers/groups/${groupId}/assign`, { customerId });
  },

  async unassignCustomer(groupId: string, customerId: string): Promise<void> {
    await apiClient.post(`/customers/groups/${groupId}/unassign`, { customerId });
  },

  async bulkAssign(groupId: string, customerIds: string[]): Promise<void> {
    await apiClient.post(`/customers/groups/${groupId}/bulk-assign`, { customerIds });
  },
};
