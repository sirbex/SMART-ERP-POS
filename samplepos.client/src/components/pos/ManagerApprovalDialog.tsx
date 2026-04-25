// ManagerApprovalDialog - Manager PIN entry for discount approval

import { useState, useEffect, useRef } from 'react';
import { Shield, X } from 'lucide-react';

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
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Reset and focus when opened
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setTimeout(() => pinInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleApprove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin]);

  const handleApprove = () => {
    setError('');

    if (!pin || pin.length < 4) {
      setError('Please enter a valid PIN (minimum 4 digits)');
      return;
    }

    onApprove(pin);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
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

        {/* Info */}
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

        {/* PIN Input */}
        <div className="mb-4">
          <label htmlFor="manager-pin" className="block text-sm font-medium text-gray-700 mb-1">
            Manager PIN <span className="text-red-500">*</span>
          </label>
          <input
            ref={pinInputRef}
            id="manager-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              // Only allow numbers
              const value = e.target.value.replace(/\D/g, '');
              setPin(value);
              setError('');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest"
            placeholder="••••"
            disabled={isProcessing}
          />
          <p className="text-xs text-gray-500 mt-1 text-center">
            Enter your manager PIN to approve this discount
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-2 px-4 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={!pin || pin.length < 4 || isProcessing}
            className="flex-1 py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Approve Discount</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Keyboard: <kbd>Enter</kbd> to approve, <kbd>Esc</kbd> to cancel
        </p>

        {/* Security Note */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            🔒 This action will be logged in the audit trail with your user ID and timestamp.
          </p>
        </div>
      </div>
    </div>
  );
}
