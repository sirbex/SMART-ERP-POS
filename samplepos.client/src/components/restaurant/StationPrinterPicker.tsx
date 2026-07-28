/**
 * Station / settings printer picker — select from local bridge list instead of typing.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  listLocalPrintBridgePrinters,
  mergePrinterOptions,
} from '../../lib/localPrintBridge';

const CUSTOM = '__custom__';
const NONE = '';

type Props = {
  value: string | null | undefined;
  knownPrinters?: Array<string | null | undefined>;
  disabled?: boolean;
  className?: string;
  onChange?: (printerName: string | null) => void;
  /** Persist when user picks or finishes typing */
  onCommit?: (printerName: string | null) => void;
};

export function StationPrinterPicker({
  value,
  knownPrinters = [],
  disabled,
  className = '',
  onChange,
  onCommit,
}: Props) {
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const options = useMemo(
    () => mergePrinterOptions(discovered, [...knownPrinters, value]),
    [discovered, knownPrinters, value],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listLocalPrintBridgePrinters();
      setDiscovered(res.printers);
      setBridgeOnline(res.bridgeOnline);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount discover only
  }, []);

  useEffect(() => {
    setDraft(value || '');
    const v = (value || '').trim();
    if (v && options.length > 0 && !options.includes(v) && discovered.length > 0) {
      setCustomMode(true);
    }
  }, [value, options, discovered.length]);

  const selectValue = customMode
    ? CUSTOM
    : (value || '').trim() && options.includes((value || '').trim())
      ? (value || '').trim()
      : (value || '').trim()
        ? CUSTOM
        : NONE;

  const commit = (next: string | null) => {
    onChange?.(next);
    onCommit?.(next);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex gap-1.5 items-stretch">
        <select
          className="border rounded px-2 py-1.5 text-sm flex-1 min-w-0"
          disabled={disabled || loading}
          value={selectValue === CUSTOM || customMode ? CUSTOM : selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              setCustomMode(true);
              return;
            }
            setCustomMode(false);
            const next = v.trim() || null;
            setDraft(next || '');
            commit(next);
          }}
          aria-label="Printer"
        >
          <option value={NONE}>None (default bridge printer)</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={CUSTOM}>Other… (type name)</option>
        </select>
        <button
          type="button"
          className="shrink-0 text-xs px-2 py-1.5 rounded border border-stone-300 disabled:opacity-40"
          disabled={disabled || loading}
          onClick={() => void refresh()}
          title="Refresh printers from local print bridge"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>
      {(customMode || selectValue === CUSTOM) && (
        <input
          className="border rounded px-2 py-1.5 text-sm w-full"
          placeholder="Exact Windows printer name"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange?.(e.target.value.trim() || null);
          }}
          onBlur={() => commit(draft.trim() || null)}
        />
      )}
      <p className="text-[10px] text-stone-500 leading-tight">
        {bridgeOnline === null
          ? 'Looking for print bridge…'
          : bridgeOnline
            ? `Bridge online · ${discovered.length} printer${discovered.length === 1 ? '' : 's'}`
            : 'Bridge offline — select a saved name, type one, or start agent on :1811'}
      </p>
    </div>
  );
}
