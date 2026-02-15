/**
 * Store Exports
 * 
 * Central export point for all Zustand stores
 * 
 * NOTE: Auth is handled by AuthContext (contexts/AuthContext.tsx)
 * Do NOT use authStore - it's deprecated and causes dual-state issues
 */

export { useCartStore } from './cartStore';
export { useInventoryStore } from './inventoryStore';
// authStore removed - use AuthContext instead via hooks/useAuth
