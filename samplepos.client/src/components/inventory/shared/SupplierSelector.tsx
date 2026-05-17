import { useState, useRef, useEffect, useCallback, useId } from "react";
import { ChevronDown, X } from "lucide-react";
import { useSuppliers } from "@/hooks/useSuppliers";

interface SupplierSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** When false, hides the built-in label and helper text (caller renders its own). Defaults to true. */
  showLabel?: boolean;
}

type Supplier = { id: string; name: string };

/**
 * Searchable Supplier Combobox
 * Used in: Purchase Orders, Manual Goods Receipt
 *
 * - Type to filter by name
 * - ↑ ↓ arrows to navigate, Enter to confirm, Esc to close
 * - Click × to clear selection
 * - Falls back to full list when no query entered (like a regular dropdown)
 */
export function SupplierSelector({
  value,
  onChange,
  disabled = false,
  required = true,
  className = "",
  showLabel = true,
}: SupplierSelectorProps) {
  const inputId = useId();
  const listboxId = useId();

  // Fetch all active suppliers (limit:200 covers realistic catalogue size)
  const { data: suppliersData, isLoading } = useSuppliers({ limit: 200 });
  const rawData = suppliersData?.data;
  const suppliers = (Array.isArray(rawData) ? rawData : []) as Supplier[];

  // ── local state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Derive the currently selected supplier name for display
  const selectedSupplier = suppliers.find((s) => s.id === value) ?? null;

  // Filtered list: when open & query is set, filter; otherwise show all
  const filtered: Supplier[] = query.trim()
    ? suppliers.filter((s) =>
      s.name.toLowerCase().includes(query.trim().toLowerCase())
    )
    : suppliers;

  // ── helpers ───────────────────────────────────────────────────────────────
  const openDropdown = useCallback(() => {
    if (!disabled) {
      setOpen(true);
      setActiveIndex(-1);
    }
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    // Restore display to the selected supplier name (or empty)
    setQuery("");
  }, []);

  const selectSupplier = useCallback(
    (supplier: Supplier) => {
      onChange(supplier.id);
      closeDropdown();
      inputRef.current?.blur();
    },
    [onChange, closeDropdown]
  );

  const clearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      setQuery("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange]
  );

  // ── scroll active item into view ──────────────────────────────────────────
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // ── close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // ── keyboard handling ─────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) { openDropdown(); break; }
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (open && activeIndex >= 0 && filtered[activeIndex]) {
          selectSupplier(filtered[activeIndex]);
        }
        break;
      case "Escape":
        closeDropdown();
        break;
      case "Tab":
        // Allow normal tab flow — close dropdown but don't prevent default
        closeDropdown();
        break;
    }
  };

  // ── display value shown in the input ─────────────────────────────────────
  // When open: show the live query text so the user can type.
  // When closed: show the selected supplier name (or empty).
  const inputValue = open ? query : (selectedSupplier?.name ?? "");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveIndex(-1);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    openDropdown();
    // Pre-fill query with current display so the user can refine
    setQuery("");
  };

  return (
    <div className={className} ref={containerRef}>
      {showLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          Supplier {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Combobox input wrapper */}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `supplier-option-${activeIndex}` : undefined
          }
          aria-required={required}
          autoComplete="off"
          spellCheck={false}
          type="text"
          placeholder={isLoading ? "Loading suppliers…" : "Select a supplier…"}
          value={inputValue}
          disabled={disabled || isLoading}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          className={[
            "w-full pl-3 pr-9 py-2 border rounded-lg text-sm",
            "focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none",
            "disabled:bg-gray-100 disabled:cursor-not-allowed",
            value ? "border-gray-300" : open ? "border-blue-400" : "border-gray-300",
          ].join(" ")}
        />

        {/* Right-side icon: × to clear when selected, ▼ otherwise */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-0.5 pointer-events-none">
          {value && !disabled && (
            <button
              type="button"
              onMouseDown={clearSelection}
              className="pointer-events-auto p-0.5 text-gray-400 hover:text-gray-600 rounded"
              tabIndex={-1}
              aria-label="Clear supplier"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={[
              "h-4 w-4 text-gray-400 transition-transform duration-150",
              open ? "rotate-180" : "",
            ].join(" ")}
          />
        </div>

        {/* Dropdown listbox */}
        {open && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Suppliers"
            className={[
              "absolute z-50 mt-1 w-full max-h-60 overflow-y-auto",
              "bg-white border border-gray-200 rounded-lg shadow-lg",
              "py-1 text-sm",
            ].join(" ")}
          >
            {isLoading ? (
              <li className="px-3 py-2 text-gray-400 text-xs">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-gray-400 text-xs">No suppliers found</li>
            ) : (
              filtered.map((supplier, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = supplier.id === value;
                return (
                  <li
                    key={supplier.id}
                    id={`supplier-option-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur before click registers
                      selectSupplier(supplier);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={[
                      "px-3 py-2 cursor-pointer flex items-center justify-between",
                      isActive ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-50",
                      isSelected ? "font-medium" : "",
                    ].join(" ")}
                  >
                    <span>{supplier.name}</span>
                    {isSelected && (
                      <span className="text-blue-600 text-xs font-semibold ml-2">✓</span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {showLabel && required && (
        <p className="mt-1 text-xs text-gray-500">BR-PO-001: Supplier validation required</p>
      )}
    </div>
  );
}
