/**
 * useServerDate — Server-authoritative business date hook.
 *
 * SAP/Odoo pattern: the server is the SOLE authority for business dates.
 * Frontend MUST NOT use `new Date()` for any business-critical date defaults.
 *
 * This hook fetches the server's business date once and caches it for 5 minutes.
 * Falls back to the frontend `getBusinessDate()` if server is unreachable
 * (offline mode / network error).
 */
import { useQuery } from '@tanstack/react-query';
import apiClient from '../utils/api';
import { getBusinessDate as getLocalBusinessDate } from '../utils/businessDate';

interface ServerTimeResponse {
  businessDate: string;       // 'YYYY-MM-DD' in Africa/Kampala
  businessYear: number;       // 4-digit year
  serverTimestamp: string;    // UTC ISO-8601
  businessTimestamp: string;  // Human-readable in business TZ
  timezone: string;           // 'Africa/Kampala'
}

async function fetchServerTime(): Promise<ServerTimeResponse> {
  const response = await apiClient.get('/server-time');
  return response.data.data;
}

/**
 * React hook that provides the server's current business date.
 * Refetches every 5 minutes. Falls back to local calculation on error.
 */
export function useServerDate() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['server-time'],
    queryFn: fetchServerTime,
    staleTime: 5 * 60 * 1000,        // 5 minutes
    gcTime: 10 * 60 * 1000,          // 10 minutes
    refetchInterval: 5 * 60 * 1000,  // Re-check every 5 min
    retry: 1,
  });

  return {
    /** Today's business date as YYYY-MM-DD (server-authoritative, falls back to local) */
    businessDate: data?.businessDate ?? getLocalBusinessDate(),
    /** Business year (e.g. 2026) */
    businessYear: data?.businessYear ?? parseInt(getLocalBusinessDate().slice(0, 4), 10),
    /** Server UTC timestamp as ISO string */
    serverTimestamp: data?.serverTimestamp ?? null,
    /** Business timezone name */
    timezone: data?.timezone ?? 'Africa/Kampala',
    /** Whether the server time is still loading */
    isLoading,
    /** Whether we're using fallback (local) date */
    isFallback: !data && !isLoading,
    error,
  };
}

/**
 * Non-hook version for use outside React components (e.g., API call builders).
 * Fetches once and returns the business date. Falls back to local on error.
 */
export async function getServerBusinessDate(): Promise<string> {
  try {
    const data = await fetchServerTime();
    return data.businessDate;
  } catch {
    return getLocalBusinessDate();
  }
}
