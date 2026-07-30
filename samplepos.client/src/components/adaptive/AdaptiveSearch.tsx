import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import {
  useAdaptiveLayoutOptional,
  useAdaptiveWorkspaceOptional,
} from './AdaptiveAppShell';
import {
  resolveFloorplanFromWorkspace,
  type AdaptiveSearchPresentation,
} from '../../lib/adaptiveFloorplan';

type AdaptiveSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Accessible name — required for a11y when placeholder alone is insufficient. */
  label?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /**
   * When true, input accepts HID wedge while focused
   * (`barcode-scanner-enabled` + type=search — matches useBarcodeScanner rules).
   */
  scannerEnabled?: boolean;
  disabled?: boolean;
  className?: string;
  /** Leading adornment (icon). */
  leading?: ReactNode;
  /** Trailing control (clear / scan). */
  trailing?: ReactNode;
  presentationOverride?: AdaptiveSearchPresentation;
};

/**
 * Adaptive search field — presentation only.
 * Parent owns query → API / offline catalog lookup (same command on every device).
 */
export function AdaptiveSearch({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder = 'Search…',
  label = 'Search',
  autoFocus,
  inputRef,
  scannerEnabled = true,
  disabled,
  className = '',
  leading,
  trailing,
  presentationOverride,
}: AdaptiveSearchProps) {
  const layout = useAdaptiveLayoutOptional();
  const workspace = useAdaptiveWorkspaceOptional();
  const floorplan = resolveFloorplanFromWorkspace(workspace, layout?.tier ?? 'desktop');
  const presentation = presentationOverride ?? floorplan.searchPresentation;
  const [sheetOpen, setSheetOpen] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const refToUse = inputRef ?? internalRef;
  const inputId = useId();

  useEffect(() => {
    if (autoFocus && presentation !== 'icon-sheet' && refToUse.current) {
      refToUse.current.focus();
    }
  }, [autoFocus, presentation, refToUse]);

  useEffect(() => {
    if (sheetOpen && refToUse.current) {
      refToUse.current.focus();
    }
  }, [sheetOpen, refToUse]);

  const touchMin = 'min-h-[var(--layout-touch-target)]';
  const inputClass = [
    'w-full rounded-md border border-stone-300 bg-white px-3 text-stone-900',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
    touchMin,
    presentation === 'compact' ? 'text-sm py-1.5' : 'text-sm py-2',
    scannerEnabled ? 'barcode-scanner-enabled' : '',
    disabled ? 'opacity-60 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const field = (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {leading}
      <div className="relative min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          ref={refToUse}
          type="search"
          value={value}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          aria-label={label}
          className={inputClass}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.key === 'Enter') {
              onSubmit?.(value);
            }
          }}
          data-adaptive-search-input="true"
        />
      </div>
      {trailing}
      {onSubmit ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(value)}
          className={`shrink-0 rounded-md bg-blue-600 px-3 text-sm font-medium text-white ${touchMin} hover:bg-blue-700 disabled:opacity-60`}
          data-adaptive-search-submit="true"
        >
          Search
        </button>
      ) : null}
    </div>
  );

  if (presentation === 'icon-sheet') {
    return (
      <div data-adaptive-search="true" data-search-presentation="icon-sheet">
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 ${touchMin}`}
          aria-expanded={sheetOpen}
          aria-label={label}
          onClick={() => setSheetOpen(true)}
          data-adaptive-search-open="true"
        >
          Search
        </button>
        {sheetOpen ? (
          <div
            className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-adaptive-search-sheet="true"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close search"
              onClick={() => setSheetOpen(false)}
            />
            <div className="relative z-10 rounded-t-xl border-t border-stone-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {field}
              <button
                type="button"
                className={`mt-3 w-full rounded-md border border-stone-200 text-sm font-medium text-stone-700 ${touchMin}`}
                onClick={() => setSheetOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-adaptive-search="true"
      data-search-presentation={presentation}
    >
      {field}
    </div>
  );
}
