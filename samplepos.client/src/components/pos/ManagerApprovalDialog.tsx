// ManagerApprovalDialog - Manager PIN entry for discount approval
// Uses in-app number pad so Windows/touch POS does not depend on OS soft keyboard.

import { useState, useEffect, useCallback } from 'react';
import { Shield, X } from 'lucide-react';
import { PinNumPad } from '../auth/PinNumPad';

interface ManagerApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (pin: string) => void;
  discountAmount: number;
  discountPercentage: number;
  reason: string;
  isProcessing?: boolean;
}

export default function ManagerApprovalDialog({
  isOpen,
  onClose,
  onApprove,
  discountAmount,
  discountPercentage,
  reason,
  isProcessing = false,
}: ManagerApprovalDialogProps) {
  const [error, setError] = useState('');
  const [padKey, setPadKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPadKey((k) => k + 1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleComplete = useCallback(
    (pin: string) => {
      setError('');
      if (!pin || pin.length < 4) {
        setError('Please enter a valid PIN (minimum 4 digits)');
        return;
      }
      onApprove(pin);
    },
    [onApprove],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-yellow-600" />
            <h2 className="text-xl font-semibold text-gray-900">Manager Approval Required</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
          <p className="text-sm text-yellow-900 mb-2">
            This discount exceeds standard limits and requires manager authorization.
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-yellow-700">Discount:</span>
              <span className="font-medium text-yellow-900">
                {discountPercentage.toFixed(1)}% (UGX {discountAmount.toLocaleString()})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-yellow-700">Reason:</span>
              <span className="font-medium text-yellow-900 text-right ml-2 flex-1">
                {reason}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex justify-center">
          <PinNumPad
            key={padKey}
            length={6}
            minLength={4}
            doneLabel="Approve Discount"
            onComplete={handleComplete}
            error={error}
            isLoading={isProcessing}
            label="Manager PIN"
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="w-full py-2 px-4 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Number pad or keyboard digits · <kbd>Esc</kbd> to cancel
        </p>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            🔒 This action will be logged in the audit trail with your user ID and timestamp.
          </p>
        </div>
      </div>
    </div>
  );
}
