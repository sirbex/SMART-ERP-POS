/**
 * Cash Register Module
 * 
 * Exports all cash register functionality for use by other modules.
 */

export { cashRegisterRepository } from './cashRegisterRepository.js';
export { cashRegisterService } from './cashRegisterService.js';
export { default as cashRegisterRoutes } from './cashRegisterRoutes.js';

// Re-export types
export type {
    CashRegister,
    CashRegisterSession,
    CashMovement,
    SessionStatus,
    MovementType,
    CreateRegisterData,
    OpenSessionData,
    CloseSessionData,
    RecordMovementData
} from './cashRegisterRepository.js';
