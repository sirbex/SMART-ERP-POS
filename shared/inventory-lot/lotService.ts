import type { InventoryLot } from './lotTypes.js';
import type {
  LotConsumeInput,
  LotCorrectAttributesInput,
  LotOpeningReceiveInput,
  LotOpeningReceiveResult,
  LotReceiveInput,
  LotReturnInput,
  LotSplitInput,
  LotSplitResult,
  LotStatusTransitionInput,
  LotTransferInput,
} from './lotEvents.js';

/**
 * Write gateway contract — server implementation only (ADR-002 §6).
 * No module may mutate lot storage outside this interface.
 */
export interface ILotService {
  receiveLot(client: unknown, input: LotReceiveInput): Promise<InventoryLot>;
  receiveOpeningLot(client: unknown, input: LotOpeningReceiveInput): Promise<LotOpeningReceiveResult>;
  correctLotAttributes(client: unknown, input: LotCorrectAttributesInput): Promise<InventoryLot>;
  transitionLotStatus(client: unknown, input: LotStatusTransitionInput): Promise<InventoryLot>;
  transferLot(client: unknown, input: LotTransferInput): Promise<void>;
  consumeLot(client: unknown, input: LotConsumeInput): Promise<import('./lotEvents.js').LotConsumeResult>;
  returnLot(client: unknown, input: LotReturnInput): Promise<InventoryLot>;
  /** Partial qty off parent → new child lot (ADR-002 §4.4); no loss GL */
  splitLot(client: unknown, input: LotSplitInput): Promise<LotSplitResult>;
  /** Reserved — batch merge (ADR deferred) */
  mergeLot?(client: unknown, input: unknown): Promise<InventoryLot>;
}
