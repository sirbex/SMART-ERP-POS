import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export type ReportSupplierOption = {
  id: string;
  supplierNumber: string;
  name: string;
};

interface ReportSupplierComboboxProps {
  value: string;
  onChange: (supplierId: string) => void;
  suppliers: ReportSupplierOption[];
  loading?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  helperText?: string;
  id?: string;
  label?: string;
}

function labelFor(s: ReportSupplierOption): string {
  return s.supplierNumber ? `${s.supplierNumber} — ${s.name}` : s.name;
}

/**
 * Searchable supplier picker for report parameters.
 * Filters the provided list by name or supplier code as you type.
 */
export default function ReportSupplierCombobox({
  value,
  onChange,
  suppliers,
  loading = false,
  required = false,
  allowEmpty = false,
  emptyLabel = '-- Select Supplier --',
  helperText,
  id,
  label = 'Supplier',
}: ReportSupplierComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const resolvedId = id || inputId;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = suppliers.find((s) => s.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const hay = `${s.supplierNumber} ${s.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, query]);

  const openDropdown = useCallback(() => {
    if (!loading) {
      setOpen(true);
      setActiveIndex(-1);
    }
  }, [loading]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    setQuery('');
  }, []);

  const selectSupplier = useCallback(
    (supplier: ReportSupplierOption | null) => {
      onChange(supplier?.id ?? '');
      closeDropdown();
      inputRef.current?.blur();
    },
    [onChange, closeDropdown],
  );

  const clearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setQuery('');
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const optionCount = filtered.length + (allowEmpty ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          openDropdown();
          break;
        }
        setActiveIndex((i) => Math.min(i + 1, optionCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (!open) {
          openDropdown();
          break;
        }
        if (allowEmpty && activeIndex === 0) {
          selectSupplier(null);
        } else {
          const idx = allowEmpty ? activeIndex - 1 : activeIndex;
          if (idx >= 0 && filtered[idx]) selectSupplier(filtered[idx]);
        }
        break;
      case 'Escape':
        closeDropdown();
        break;
      case 'Tab':
        closeDropdown();
        break;
      default:
        break;
    }
  };

  const inputValue = open ? query : selected ? labelFor(selected) : '';

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={resolvedId} className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={resolvedId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={label}
          disabled={loading}
          value={inputValue}
          placeholder={loading ? 'Loading suppliers...' : emptyLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            openDropdown();
            setQuery('');
          }}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {value ? (
            <button
              type="button"
              onClick={clearSelection}
              className="p-1 text-gray-400 hover:text-gray-700 rounded"
              aria-label="Clear supplier"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => (open ? closeDropdown() : openDropdown())}
            className="p-1 text-gray-400 hover:text-gray-700 rounded"
            aria-label="Toggle supplier list"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && !loading ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm"
        >
          {allowEmpty ? (
            <li
              role="option"
              aria-selected={!value}
              className={`px-3 py-2 cursor-pointer ${
                activeIndex === 0 ? 'bg-blue-50 text-blue-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              onMouseEnter={() => setActiveIndex(0)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSupplier(null);
              }}
            >
              {emptyLabel}
            </li>
          ) : null}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-500">No suppliers match “{query.trim()}”</li>
          ) : (
            filtered.map((s, i) => {
              const idx = allowEmpty ? i + 1 : i;
              const active = activeIndex === idx;
              const selectedRow = s.id === value;
              return (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={selectedRow}
                  className={`px-3 py-2 cursor-pointer ${
                    active ? 'bg-blue-50 text-blue-900' : selectedRow ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'
                  }`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSupplier(s);
                  }}
                >
                  {labelFor(s)}
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {helperText ? <p className="text-xs text-gray-500 mt-1">{helperText}</p> : null}
    </div>
  );
}
