/**
 * VAT Remittance module barrel — Phase 3A–3D.
 */

export {
  isVatRemittanceDocumentEnabled,
} from './vatRemittanceSettings.js';
export {
  VAT_REMITTANCE_TOUCHPOINT_REGISTRY,
  VAT_REMITTANCE_WRITE_GATEWAY,
  countVatTouchpointsByStatus,
} from './vatRemittanceTouchpointRegistry.js';
export type {
  VatRemittanceTouchpoint,
  VatRemittanceTouchpointStatus,
} from './vatRemittanceTouchpointRegistry.js';
export {
  getVatAccrualReconProbe,
  ytdStart,
} from './vatAccrualReconService.js';
export type { VatAccrualReconProbe } from './vatAccrualReconService.js';
export { sumPostedVatRemittances } from './vatRemittanceSettled.js';
export {
  createAndPostVatRemittance,
  reverseVatRemittance,
  getVatRemittanceWorksheet,
  getAvailableVatPayable,
} from './vatRemittanceService.js';
export type {
  CreateVatRemittanceInput,
  VatRemittanceWorksheet,
} from './vatRemittanceService.js';
export { vatRemittanceRoutes } from './vatRemittanceRoutes.js';
