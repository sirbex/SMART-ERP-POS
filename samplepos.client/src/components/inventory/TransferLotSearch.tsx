import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchSoftKeyboardInput } from '@/components/keyboard/SearchSoftKeyboardInput';
import { Label } from '@/components/ui/label';
import type { WarehouseLotRow } from '../../hooks/useWarehouse';

export interface TransferLotSearchResult extends WarehouseLotRow {
  sku?: string | null;
  barcode?: string | null;
}

interface TransferLotSearchProps {
  storeLocationId: string;
  onSearch: (query: string) => Promise<TransferLotSearchResult[]>;
  onSelect: (lot: TransferLotSearchResult) => void;
  disabled?: boolean;
}

/**
 * Phase 5 — keyboard + barcode lot search for transfers (zero-qty hidden server-side).
 */
export function TransferLotSearch({
  storeLocationId,
  onSearch,
  onSelect,
  disabled = false,
}: TransferLotSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TransferLotSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed || !storeLocationId) {
        setResults([]);
        setSelectedIndex(0);
        return;
      }
      setIsSearching(true);
      try {
        const rows = await onSearch(trimmed);
        setResults(rows);
        setSelectedIndex(0);

        const exact = trimmed.toLowerCase();
        const barcodeHit = rows.find(
          (row) =>
            row.barcode?.toLowerCase() === exact || row.sku?.toLowerCase() === exact,
        );
        if (barcodeHit && rows.length === 1) {
          onSelect(barcodeHit);
          setQuery('');
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    },
    [onSearch, onSelect, storeLocationId],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, runSearch]);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, [storeLocationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const lot = results[selectedIndex];
      if (lot) {
        onSelect(lot);
        setQuery('');
        setResults([]);
        inputRef.current?.focus();
      } else if (query.trim()) {
        void runSearch(query);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
    }
  };

  const hint = useMemo(
    () => 'Type name, SKU, barcode, or lot · ↑↓ navigate · Enter to select',
    [],
  );

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="transfer-lot-search">Search lots</Label>
        <SearchSoftKeyboardInput
          id="transfer-lot-search"
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          disabled={disabled}
          autoComplete="off"
          placeholder="Search or scan barcode…"
          className="mt-1 pr-11"
          onKeyDown={handleKeyDown}
          aria-label="Search lots"
        />
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      </div>

      {isSearching && <p className="text-xs text-gray-500">Searching…</p>}

      {!isSearching && query.trim() && results.length === 0 && (
        <p className="text-sm text-gray-500">No lots with available stock match your search.</p>
      )}

      {results.length > 0 && (
        <ul
          className="border rounded-lg divide-y max-h-48 overflow-y-auto text-sm"
          role="listbox"
          aria-label="Transfer lot search results"
        >
          {results.map((lot, index) => (
            <li key={lot.productLotId}>
              <button
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${
                  index === selectedIndex ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''
                }`}
                onClick={() => {
                  onSelect(lot);
                  setQuery('');
                  setResults([]);
                  inputRef.current?.focus();
                }}
              >
                <div className="font-medium text-gray-900">{lot.productName}</div>
                <div className="text-xs text-gray-500">
                  {lot.lotNumber}
                  {lot.sku ? ` · ${lot.sku}` : ''}
                  {lot.barcode ? ` · ${lot.barcode}` : ''}
                  {' · '}
                  avail {lot.availableQuantity}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
