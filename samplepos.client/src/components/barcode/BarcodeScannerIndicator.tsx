/**
 * Barcode Scanner Status Indicator
 *
 * A small, persistent visual indicator showing barcode scanner readiness.
 * Shows:
 * - Scanner enabled/disabled state
 * - Last scanned barcode
 * - Visual feedback on scan (flash green)
 *
 * Can be embedded in any page that uses useBarcodeScanner.
 */

import { useState, useEffect, useRef } from 'react';

interface BarcodeScannerIndicatorProps {
  /** Whether the scanner is currently enabled */
  enabled: boolean;
  /** The last scanned barcode value */
  lastScanned: string | null;
  /** Current buffer (characters being typed fast) */
  buffer?: string;
  /** Optional: toggle scanner on/off */
  onToggle?: () => void;
}

export default function BarcodeScannerIndicator({
  enabled,
  lastScanned,
  buffer,
  onToggle,
}: BarcodeScannerIndicatorProps) {
  const [flash, setFlash] = useState(false);
  const prevScanned = useRef(lastScanned);

  // Flash green on new scan
  useEffect(() => {
    if (lastScanned && lastScanned !== prevScanned.current) {
      setFlash(true);
      prevScanned.current = lastScanned;
      const timer = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastScanned]);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${flash
          ? 'bg-green-100 text-green-800 ring-2 ring-green-400'
          : enabled
            ? 'bg-blue-50 text-blue-700'
            : 'bg-gray-100 text-gray-500'
        }`}
      title={enabled ? 'Barcode scanner active — scan a barcode to search' : 'Barcode scanner disabled'}
    >
      {/* Scanner icon */}
      <svg
        className={`w-4 h-4 ${flash ? 'text-green-600' : enabled ? 'text-blue-600' : 'text-gray-400'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
        />
      </svg>

      {/* Status text */}
      <span>
        {flash && lastScanned
          ? `Scanned: ${lastScanned.length > 15 ? lastScanned.slice(0, 15) + '...' : lastScanned}`
          : buffer && buffer.length > 0
            ? `Scanning: ${buffer}`
            : enabled
              ? 'Scanner Ready'
              : 'Scanner Off'}
      </span>

      {/* Toggle button */}
      {onToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`ml-1 w-8 h-4 rounded-full relative transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          aria-label={enabled ? 'Disable barcode scanner' : 'Enable barcode scanner'}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? 'left-4' : 'left-0.5'
              }`}
          />
        </button>
      )}
    </div>
  );
}
