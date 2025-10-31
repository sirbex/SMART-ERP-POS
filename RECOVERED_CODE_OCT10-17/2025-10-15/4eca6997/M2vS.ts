/**
 * API Client Wrapper
 * Centralized API call handling with consistent error management
 */

import api from '../config/api.config';
import { AxiosError } from 'axios';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: string[];
  timestamp?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * Handle API errors consistently
 */
export const handleApiError = (error: unknown): ApiResponse => {
  if (error instanceof AxiosError) {
    if (error.response) {
      // Server responded with error
      const { data, status } = error.response;
      return {
        success: false,
        error: data?.error || data?.message || 'An error occurred',
        errors: data?.errors || [],
        ...data
      };
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'No response from server. Please check your connection.'
      };
    }
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : 'An unknown error occurred'
  };
};

/**
 * GET request wrapper
 */
export const apiGet = async <T = any>(
  endpoint: string,
  params?: Record<string, any>
): Promise<ApiResponse<T>> => {
  try {
    const response = await api.get<ApiResponse<T>>(endpoint, { params });
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * POST request wrapper
 */
export const apiPost = async <T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> => {
  try {
    const response = await api.post<ApiResponse<T>>(endpoint, data);
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * PUT request wrapper
 */
export const apiPut = async <T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> => {
  try {
    const response = await api.put<ApiResponse<T>>(endpoint, data);
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * DELETE request wrapper
 */
export const apiDelete = async <T = any>(
  endpoint: string
): Promise<ApiResponse<T>> => {
  try {
    const response = await api.delete<ApiResponse<T>>(endpoint);
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Paginated GET request wrapper
 */
export const apiGetPaginated = async <T = any>(
  endpoint: string,
  page: number = 1,
  limit: number = 50,
  additionalParams?: Record<string, any>
): Promise<PaginatedResponse<T>> => {
  try {
    const offset = (page - 1) * limit;
    const response = await api.get<PaginatedResponse<T>>(endpoint, {
      params: {
        limit,
        offset,
        ...additionalParams
      }
    });
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Search request wrapper
 */
export const apiSearch = async <T = any>(
  endpoint: string,
  query: string,
  limit: number = 50
): Promise<ApiResponse<T[]>> => {
  try {
    const response = await api.get<ApiResponse<T[]>>(`${endpoint}/${encodeURIComponent(query)}`, {
      params: { limit }
    });
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Batch API requests
 */
export const apiBatch = async <T = any>(
  requests: Array<() => Promise<any>>
): Promise<ApiResponse<T[]>> => {
  try {
    const results = await Promise.allSettled(requests.map(req => req()));
    
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value);

    const failedResults = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    return {
      success: failedResults.length === 0,
      data: successfulResults as T[],
      errors: failedResults.map(err => err?.message || 'Unknown error')
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Upload file
 */
export const apiUpload = async <T = any>(
  endpoint: string,
  file: File,
  additionalData?: Record<string, any>
): Promise<ApiResponse<T>> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value as string);
      });
    }

    const response = await api.post<ApiResponse<T>>(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Check API health
 */
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const response = await api.get('/health', { timeout: 3000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
};
