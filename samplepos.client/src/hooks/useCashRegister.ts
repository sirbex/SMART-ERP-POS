/**
 * Cash Register API Hook
 * 
 * React Query hooks for cash register management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useOfflineContext } from '../contexts/OfflineContext';
import type {
    CashRegister,
    CashRegisterSession,
    CashMovement,
    SessionSummary,
    OpenSessionInput,
    CloseSessionInput,
    RecordMovementInput,
    SessionStatus
} from '../types/cashRegister';

// Query keys
const QUERY_KEYS = {
    registers: ['cash-registers'] as const,
    register: (id: string) => ['cash-registers', id] as const,
    currentSession: ['cash-register-session', 'current'] as const,
    sessions: (filters?: SessionFilters) => ['cash-register-sessions', filters] as const,
    session: (id: string) => ['cash-register-session', id] as const,
    sessionSummary: (id: string) => ['cash-register-session', id, 'summary'] as const,
    sessionMovements: (id: string) => ['cash-register-session', id, 'movements'] as const,
};

interface SessionFilters {
    registerId?: string;
    userId?: string;
    status?: SessionStatus;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}

// ============================================================================
// REGISTER HOOKS
// ============================================================================

/**
 * Get all cash registers
 */
export function useRegisters() {
    return useQuery({
        queryKey: QUERY_KEYS.registers,
        queryFn: async () => {
            const response = await api.get<{ success: boolean; data: CashRegister[] }>(
                '/cash-registers'
            );
            return response.data.data;
        },
    });
}

/**
 * Create a new register
 */
export function useCreateRegister() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { name: string; location?: string }) => {
            const response = await api.post<{ success: boolean; data: CashRegister }>(
                '/cash-registers',
                data
            );
            return response.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.registers });
        },
    });
}

/**
 * Update a register (name, location, isActive)
 */
export function useUpdateRegister() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...data }: { id: string; name?: string; location?: string | null; isActive?: boolean }) => {
            const response = await api.put<{ success: boolean; data: CashRegister }>(
                `/cash-registers/${id}`,
                data
            );
            return response.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.registers });
        },
    });
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

// Key for caching session in localStorage (offline resilience)
const SESSION_CACHE_KEY = 'cash_register_session';

function getCachedSession(): CashRegisterSession | null {
    try {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Get current user's open session.
 * Caches to localStorage so the POS stays usable when offline
 * (avoids the "Cash Register Required" overlay on network blips).
 */
export function useCurrentSession() {
    const { isOnline } = useOfflineContext();

    return useQuery({
        queryKey: QUERY_KEYS.currentSession,
        queryFn: async () => {
            const response = await api.get<{ success: boolean; data: CashRegisterSession | null }>(
                '/cash-registers/sessions/current'
            );
            const session = response.data.data;
            // Persist for offline use
            if (session) {
                localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
            } else {
                localStorage.removeItem(SESSION_CACHE_KEY);
            }
            return session;
        },
        // Don't poll the server when offline — use cached data
        refetchInterval: isOnline ? 30000 : false,
        staleTime: 10000,
        // Seed from localStorage so offline starts with last-known session
        initialData: getCachedSession,
        // Keep stale data visible while a background refetch is in-flight
        placeholderData: (prev: CashRegisterSession | null | undefined) => prev ?? getCachedSession(),
    });
}

/**
 * Get sessions with filters
 */
export function useSessions(filters?: SessionFilters) {
    return useQuery({
        queryKey: QUERY_KEYS.sessions(filters),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.registerId) params.append('registerId', filters.registerId);
            if (filters?.userId) params.append('userId', filters.userId);
            if (filters?.status) params.append('status', filters.status);
            if (filters?.startDate) params.append('startDate', filters.startDate);
            if (filters?.endDate) params.append('endDate', filters.endDate);
            if (filters?.limit) params.append('limit', filters.limit.toString());
            if (filters?.offset) params.append('offset', filters.offset.toString());

            const response = await api.get<{
                success: boolean;
                data: CashRegisterSession[];
                pagination: { total: number; limit: number; offset: number };
            }>(`/cash-registers/sessions?${params.toString()}`);

            return {
                sessions: response.data.data,
                pagination: response.data.pagination,
            };
        },
    });
}

/**
 * Get session summary with movements
 */
export function useSessionSummary(sessionId: string | undefined) {
    return useQuery({
        queryKey: QUERY_KEYS.sessionSummary(sessionId || ''),
        queryFn: async () => {
            if (!sessionId) return null;
            const response = await api.get<{ success: boolean; data: SessionSummary }>(
                `/cash-registers/sessions/${sessionId}/summary`
            );
            return response.data.data;
        },
        enabled: !!sessionId,
        staleTime: 30000, // Cache for 30 seconds to prevent infinite refetches
        refetchOnMount: true, // Refetch once when dialog opens
        refetchOnWindowFocus: false, // Don't refetch on window focus
    });
}

/**
 * Open a new session
 */
export function useOpenSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: OpenSessionInput) => {
            try {
                const response = await api.post<{ success: boolean; data: CashRegisterSession; error?: string }>(
                    '/cash-registers/sessions/open',
                    data
                );
                if (!response.data.success) {
                    throw new Error(response.data.error || 'Failed to open session');
                }
                return response.data.data;
            } catch (error: unknown) {
                // Extract error message from axios error response
                if (error && typeof error === 'object' && 'response' in error) {
                    const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
                    const errorMessage = axiosError.response?.data?.error
                        || axiosError.response?.data?.message
                        || 'Failed to open session';
                    throw new Error(errorMessage);
                }
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.currentSession });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.registers });
        },
    });
}

/**
 * Close a session
 */
export function useCloseSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ sessionId, data }: { sessionId: string; data: CloseSessionInput }) => {
            const response = await api.post<{ success: boolean; data: CashRegisterSession }>(
                `/cash-registers/sessions/${sessionId}/close`,
                data
            );
            return response.data.data;
        },
        onSuccess: (_, { sessionId }) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.currentSession });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.session(sessionId) });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionSummary(sessionId) });
        },
    });
}

/**
 * Reconcile a session (manager only)
 */
export function useReconcileSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (sessionId: string) => {
            const response = await api.post<{ success: boolean; data: CashRegisterSession }>(
                `/cash-registers/sessions/${sessionId}/reconcile`
            );
            return response.data.data;
        },
        onSuccess: (_, sessionId) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.session(sessionId) });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions() });
        },
    });
}

/**
 * Force-close a stale/abandoned session (admin/manager only)
 */
export function useForceCloseSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (sessionId: string) => {
            try {
                const response = await api.post<{ success: boolean; data: CashRegisterSession; error?: string }>(
                    `/cash-registers/sessions/${sessionId}/force-close`
                );
                if (!response.data.success) {
                    throw new Error(response.data.error || 'Failed to force-close session');
                }
                return response.data.data;
            } catch (error: unknown) {
                if (error && typeof error === 'object' && 'response' in error) {
                    const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
                    const errorMessage = axiosError.response?.data?.error
                        || axiosError.response?.data?.message
                        || 'Failed to force-close session';
                    throw new Error(errorMessage);
                }
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.currentSession });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.registers });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions() });
        },
    });
}

// ============================================================================
// MOVEMENT HOOKS
// ============================================================================

/**
 * Get movements for a session
 */
export function useSessionMovements(sessionId: string | undefined) {
    return useQuery({
        queryKey: QUERY_KEYS.sessionMovements(sessionId || ''),
        queryFn: async () => {
            if (!sessionId) return [];
            const response = await api.get<{ success: boolean; data: CashMovement[] }>(
                `/cash-registers/sessions/${sessionId}/movements`
            );
            return response.data.data;
        },
        enabled: !!sessionId,
    });
}

/**
 * Record a cash movement
 */
export function useRecordMovement() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: RecordMovementInput) => {
            const response = await api.post<{ success: boolean; data: CashMovement }>(
                '/cash-registers/movements',
                data
            );
            return response.data.data;
        },
        onSuccess: (_, { sessionId }) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionMovements(sessionId) });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionSummary(sessionId) });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.currentSession });
        },
    });
}
