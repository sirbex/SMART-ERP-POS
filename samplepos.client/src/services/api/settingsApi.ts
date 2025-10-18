/**
 * Settings API
 * 
 * Handles application settings and configuration management.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/settings.ts
 * 
 * @module services/api/settingsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Application setting
 */
export interface Setting {
  id: number;
  key: string;
  value: string;
  category: string;
  description?: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new setting
 */
export interface CreateSettingRequest {
  key: string;
  value: string;
  category: string;
  description?: string;
  isPublic?: boolean;
}

/**
 * Request to update an existing setting
 */
export interface UpdateSettingRequest {
  value: string;
  description?: string;
  isPublic?: boolean;
}

/**
 * Batch settings update request
 */
export interface BatchUpdateSettingsRequest {
  settings: Array<{
    key: string;
    value: string;
  }>;
}

/**
 * Settings grouped by category
 */
export interface SettingsByCategory {
  [category: string]: Setting[];
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all settings
 * GET /api/settings
 */
export const getSettings = async (): Promise<Setting[]> => {
  const { data } = await api.get<ApiResponse<Setting[]>>('/settings');
  return data.data;
};

/**
 * Get single setting by key
 * GET /api/settings/:key
 */
export const getSetting = async (key: string): Promise<Setting> => {
  const { data } = await api.get<ApiResponse<Setting>>(`/settings/${key}`);
  return data.data;
};

/**
 * Update an existing setting
 * PUT /api/settings/:key
 */
export const updateSetting = async (
  key: string,
  request: UpdateSettingRequest
): Promise<Setting> => {
  const { data } = await api.put<ApiResponse<Setting>>(`/settings/${key}`, request);
  return data.data;
};

/**
 * Create a new setting
 * POST /api/settings
 */
export const createSetting = async (request: CreateSettingRequest): Promise<Setting> => {
  const { data } = await api.post<ApiResponse<Setting>>('/settings', request);
  return data.data;
};

/**
 * Delete a setting
 * DELETE /api/settings/:key
 */
export const deleteSetting = async (key: string): Promise<void> => {
  await api.delete(`/settings/${key}`);
};

/**
 * Get settings by category
 * GET /api/settings/category/:category
 */
export const getSettingsByCategory = async (category: string): Promise<Setting[]> => {
  const { data } = await api.get<ApiResponse<Setting[]>>(`/settings/category/${category}`);
  return data.data;
};

/**
 * Batch update multiple settings
 * POST /api/settings/batch
 */
export const batchUpdateSettings = async (
  request: BatchUpdateSettingsRequest
): Promise<Setting[]> => {
  const { data } = await api.post<ApiResponse<Setting[]>>('/settings/batch', request);
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all settings
 * @example
 * const { data: settings } = useSettings();
 */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
    staleTime: 300000, // 5 minutes - settings change rarely
  });
}

/**
 * Hook to get single setting by key
 * @example
 * const { data: setting } = useSetting('app.name');
 */
export function useSetting(key: string | null | undefined) {
  return useQuery({
    queryKey: ['setting', key],
    queryFn: () => getSetting(key!),
    enabled: !!key,
    staleTime: 300000,
  });
}

/**
 * Hook to get settings by category
 * @example
 * const { data: generalSettings } = useSettingsByCategory('general');
 */
export function useSettingsByCategory(category: string | null | undefined) {
  return useQuery({
    queryKey: ['settingsByCategory', category],
    queryFn: () => getSettingsByCategory(category!),
    enabled: !!category,
    staleTime: 300000,
  });
}

/**
 * Hook to create a setting
 * @example
 * const createSettingMutation = useCreateSetting();
 * await createSettingMutation.mutateAsync({
 *   key: 'app.theme',
 *   value: 'dark',
 *   category: 'appearance',
 *   isPublic: true
 * });
 */
export function useCreateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSetting,
    onSuccess: () => {
      // Invalidate all settings queries
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settingsByCategory'] });
    },
  });
}

/**
 * Hook to update a setting
 * @example
 * const updateSettingMutation = useUpdateSetting();
 * await updateSettingMutation.mutateAsync({
 *   key: 'app.theme',
 *   request: { value: 'light' }
 * });
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, request }: { key: string; request: UpdateSettingRequest }) =>
      updateSetting(key, request),
    onSuccess: (_, variables) => {
      // Invalidate specific setting
      queryClient.invalidateQueries({ queryKey: ['setting', variables.key] });
      // Invalidate all settings
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settingsByCategory'] });
    },
  });
}

/**
 * Hook to delete a setting
 * @example
 * const deleteSettingMutation = useDeleteSetting();
 * await deleteSettingMutation.mutateAsync('app.experimental.feature');
 */
export function useDeleteSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSetting,
    onSuccess: (_, key) => {
      // Invalidate specific setting
      queryClient.invalidateQueries({ queryKey: ['setting', key] });
      // Invalidate all settings
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settingsByCategory'] });
    },
  });
}

/**
 * Hook to batch update multiple settings
 * @example
 * const batchUpdateMutation = useBatchUpdateSettings();
 * await batchUpdateMutation.mutateAsync({
 *   settings: [
 *     { key: 'app.name', value: 'My POS' },
 *     { key: 'app.theme', value: 'dark' }
 *   ]
 * });
 */
export function useBatchUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchUpdateSettings,
    onSuccess: () => {
      // Invalidate all settings queries
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['setting'] });
      queryClient.invalidateQueries({ queryKey: ['settingsByCategory'] });
    },
  });
}

// Export everything as a namespace for convenience
export const settingsApi = {
  getSettings,
  getSetting,
  updateSetting,
  createSetting,
  deleteSetting,
  getSettingsByCategory,
  batchUpdateSettings,
};
