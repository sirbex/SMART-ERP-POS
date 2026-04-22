/**
 * Customer Groups React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerGroupsApi } from '../api/customerGroups';
import type { CreateGroupInput, UpdateGroupInput } from '../api/customerGroups';

export const groupKeys = {
  all: ['customer-groups'] as const,
  list: (filters?: { isActive?: boolean; search?: string }) =>
    [...groupKeys.all, 'list', filters] as const,
  detail: (id: string) => [...groupKeys.all, 'detail', id] as const,
  customers: (id: string) => [...groupKeys.all, 'customers', id] as const,
};

export function useCustomerGroupsList(filters?: { isActive?: boolean; search?: string }) {
  return useQuery({
    queryKey: groupKeys.list(filters),
    queryFn: () => customerGroupsApi.list(filters),
    staleTime: 30_000,
  });
}

export function useCustomerGroupDetail(id: string | null) {
  return useQuery({
    queryKey: groupKeys.detail(id!),
    queryFn: () => customerGroupsApi.getById(id!),
    enabled: !!id,
  });
}

export function useGroupCustomers(groupId: string | null) {
  return useQuery({
    queryKey: groupKeys.customers(groupId!),
    queryFn: () => customerGroupsApi.getCustomers(groupId!),
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGroupInput) => customerGroupsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGroupInput }) =>
      customerGroupsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerGroupsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useAssignCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, customerId }: { groupId: string; customerId: string }) =>
      customerGroupsApi.assignCustomer(groupId, customerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useUnassignCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, customerId }: { groupId: string; customerId: string }) =>
      customerGroupsApi.unassignCustomer(groupId, customerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
