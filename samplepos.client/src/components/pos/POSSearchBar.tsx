import { useRef, useEffect, RefObject } from 'react';
import { Search } from 'lucide-react';
import POSButton from './POSButton';
import { requestSoftKeyboard } from '../../lib/softKeyboard';
import { SearchSoftKeyboardInput } from '../keyboard/SearchSoftKeyboardInput';
import { useLayoutTier } from '../../hooks/useLayoutTier';
import { resolvePosSearchButtonMode } from '../../lib/posAdaptiveLayout';

interface POSSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export default function POSSearchBar({
  value,
  onChange,
  onSearch,
  onKeyDown,
  placeholder = 'Search products...',
  autoFocus,
  inputRef
}: POSSearchBarProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const refToUse = inputRef || internalRef;
  const { tier } = useLayoutTier();
  const searchButtonMode = resolvePosSearchButtonMode(tier);
  const compactPlaceholder = placeholder.length > 14 ? 'Search…' : placeholder;

  useEffect(() => {
    if (autoFocus && refToUse.current) requestSoftKeyboard(refToUse.current);
  }, [autoFocus, refToUse]);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
      <SearchSoftKeyboardInput
        inputRef={refToUse}
        value={value}
        onChange={onChange}
        onEnter={onSearch}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        placeholder={searchButtonMode === 'icon' ? compactPlaceholder : placeholder}
        aria-label="POS product search"
        wrapClassName="min-w-0 flex-1"
        className="w-full px-3 py-2 pr-11 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-sm"
      />
      {searchButtonMode === 'label' ? (
        <POSButton variant="primary" onClick={onSearch} className="shrink-0 whitespace-nowrap">
          Search
        </POSButton>
      ) : (
        <POSButton
          variant="primary"
          onClick={onSearch}
          aria-label="Search products"
          title="Search"
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center px-0 py-0 min-w-0 min-h-0"
        >
          <Search className="h-5 w-5" aria-hidden />
        </POSButton>
      )}
    </div>
  );
}
