import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pricingApi } from '../../api/pricing';
import type { ProductCategory } from '../../types/pricing';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function CategoryCombobox({ value, onChange, disabled = false }: CategoryComboboxProps) {
  const [search, setSearch] = useState(value);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queryClient = useQueryClient();

  // Sync external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  // Fetch categories
  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ['product-categories-search', debouncedSearch],
    queryFn: () => pricingApi.listCategories({ search: debouncedSearch, isActive: true, limit: 20 }),
    enabled: isOpen,
    staleTime: 30_000,
  });

  const categories = categoriesData?.data ?? [];

  // Check if typed text exactly matches an existing category
  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === search.trim().toLowerCase()
  );
  const showCreateOption = search.trim().length > 0 && !exactMatch && !isLoading;

  // Total selectable items (categories + optional create)
  const totalItems = categories.length + (showCreateOption ? 1 : 0);

  // Create category mutation
  const createMutation = useMutation({
    mutationFn: (name: string) => pricingApi.createCategory({ name }),
    onSuccess: (created: ProductCategory) => {
      queryClient.invalidateQueries({ queryKey: ['product-categories-search'] });
      selectCategory(created.name);
      setIsCreating(false);
    },
    onError: () => {
      setIsCreating(false);
    },
  });

  const selectCategory = useCallback((name: string) => {
    setSearch(name);
    onChange(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleCreateNew = useCallback(() => {
    const trimmed = search.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    createMutation.mutate(trimmed);
  }, [search, isCreating, createMutation]);

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        inputRef.current && !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
        // If user typed something but didn't select, keep typed value
        if (search.trim() !== value) {
          onChange(search.trim());
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [search, value, onChange]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < categories.length) {
          selectCategory(categories[highlightedIndex].name);
        } else if (highlightedIndex === categories.length && showCreateOption) {
          handleCreateNew();
        } else if (categories.length === 1) {
          selectCategory(categories[0].name);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        if (search.trim() !== value) {
          onChange(search.trim());
        }
        break;
    }
  };

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('[data-combobox-item]');
    items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id="product-category"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="category-listbox"
        aria-activedescendant={highlightedIndex >= 0 ? `category-option-${highlightedIndex}` : undefined}
        autoComplete="off"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
        placeholder="Search or create category..."
      />
      {/* Dropdown chevron */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => { setIsOpen(!isOpen); inputRef.current?.focus(); }}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label="Toggle category list"
      >
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          id="category-listbox"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
          )}

          {!isLoading && categories.length === 0 && !showCreateOption && (
            <div className="px-3 py-2 text-sm text-gray-500">
              {search.trim() ? 'No matching categories' : 'Type to search categories'}
            </div>
          )}

          {categories.map((cat, index) => (
            <div
              key={cat.id}
              id={`category-option-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              data-combobox-item
              onClick={() => selectCategory(cat.name)}
              className={`px-3 py-2 cursor-pointer text-sm ${
                highlightedIndex === index
                  ? 'bg-blue-50 text-blue-900'
                  : 'text-gray-900 hover:bg-gray-50'
              } ${cat.name.toLowerCase() === search.trim().toLowerCase() ? 'font-medium' : ''}`}
            >
              {cat.name}
            </div>
          ))}

          {showCreateOption && (
            <div
              id={`category-option-${categories.length}`}
              role="option"
              aria-selected={highlightedIndex === categories.length}
              data-combobox-item
              onClick={handleCreateNew}
              className={`px-3 py-2 cursor-pointer text-sm border-t border-gray-100 flex items-center gap-1.5 ${
                highlightedIndex === categories.length
                  ? 'bg-blue-50 text-blue-900'
                  : 'text-blue-600 hover:bg-blue-50'
              }`}
            >
              {isCreating ? (
                <span className="text-gray-500">Creating...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create &ldquo;{search.trim()}&rdquo;
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
