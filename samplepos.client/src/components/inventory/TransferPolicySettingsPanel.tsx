import { MultistoreGate } from './MultistoreGate';
import type { TransferAssortmentExpansionPolicy } from '../../../../shared/types/transferAssortment';

interface TransferPolicySettingsPanelProps {
  requireApprovalAll: boolean;
  allowDirect: boolean;
  valueThreshold: number | null;
  qtyThreshold: number | null;
  specialStoresRequireApproval: boolean;
  assortmentExpansionPolicy: TransferAssortmentExpansionPolicy;
  onChange: (updates: {
    transferPolicyRequireApprovalAll?: boolean;
    transferPolicyAllowDirect?: boolean;
    transferPolicyValueThreshold?: number | null;
    transferPolicyQtyThreshold?: number | null;
    transferPolicySpecialStoresRequireApproval?: boolean;
    transferAssortmentExpansionPolicy?: TransferAssortmentExpansionPolicy;
  }) => void;
  isSaving: boolean;
}

/**
 * Settings → Inventory — configurable transfer approval policy (Phase E)
 * and assortment expansion on transfer (Phase 3).
 */
export function TransferPolicySettingsPanel({
  requireApprovalAll,
  allowDirect,
  valueThreshold,
  qtyThreshold,
  specialStoresRequireApproval,
  assortmentExpansionPolicy,
  onChange,
  isSaving,
}: TransferPolicySettingsPanelProps) {
  return (
    <MultistoreGate>
      <div className="border-t border-gray-200 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Transfer Policy</h3>
        <p className="text-sm text-gray-500 mb-4">
          Controls when warehouse staff need approval vs direct execution. Users with{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">inventory.transfer.direct</code> can
          bypass the request workflow when policy allows.
        </p>

        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireApprovalAll}
              onChange={(e) =>
                onChange({ transferPolicyRequireApprovalAll: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              <span className="font-medium text-gray-900">Require approval for all transfers</span>
              <span className="block text-gray-500">
                Even users with direct transfer permission must submit requests (unless emergency
                override).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowDirect}
              onChange={(e) => onChange({ transferPolicyAllowDirect: e.target.checked })}
              className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              <span className="font-medium text-gray-900">Allow direct transfers</span>
              <span className="block text-gray-500">
                When enabled, authorized users can complete transfers immediately.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={specialStoresRequireApproval}
              onChange={(e) =>
                onChange({ transferPolicySpecialStoresRequireApproval: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              <span className="font-medium text-gray-900">
                Always require approval for DAMAGE, EXPIRED, or RETURN stores
              </span>
              <span className="block text-gray-500">
                Unless the user has emergency override permission.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value threshold (optional)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={valueThreshold ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange({
                    transferPolicyValueThreshold: raw === '' ? null : parseFloat(raw),
                  });
                }}
                placeholder="No limit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Transfers above this inventory value require approval.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity threshold (optional)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={qtyThreshold ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange({
                    transferPolicyQtyThreshold: raw === '' ? null : parseFloat(raw),
                  });
                }}
                placeholder="No limit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Transfers above this total quantity require approval.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Assortment on Transfer</h3>
          <p className="text-sm text-gray-500 mb-4">
            When transferring a product that is not in the destination store&apos;s assortment,
            choose how the system should behave.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Restricted product policy
            </label>
            <select
              value={assortmentExpansionPolicy}
              onChange={(e) =>
                onChange({
                  transferAssortmentExpansionPolicy: e.target
                    .value as TransferAssortmentExpansionPolicy,
                })
              }
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="PROMPT">Prompt — ask for each product</option>
              <option value="ALWAYS_EXPAND">Always add to destination assortment</option>
              <option value="TRANSFER_ONLY">Transfer stock only — never change assortment</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Applies to restricted products and products hidden at the destination store.
            </p>
          </div>
        </div>

        {isSaving && <p className="mt-3 text-sm text-gray-500">Saving…</p>}
      </div>
    </MultistoreGate>
  );
}
