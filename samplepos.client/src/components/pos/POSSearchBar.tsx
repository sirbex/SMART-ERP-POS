import { useRef, useEffect, RefObject } from 'react';
import POSButton from './POSButton';
import { requestSoftKeyboard } from '../../lib/softKeyboard';
import { SearchSoftKeyboardInput } from '../keyboard/SearchSoftKeyboardInput';

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

  useEffect(() => {
    if (autoFocus && refToUse.current) requestSoftKeyboard(refToUse.current);
  }, [autoFocus, refToUse]);

  return (
    <div className="flex items-center gap-2">
      <SearchSoftKeyboardInput
        inputRef={refToUse}
        value={value}
        onChange={onChange}
        onEnter={onSearch}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="POS product search"
        wrapClassName="min-w-0 flex-1"
        className="w-full px-3 py-2 pr-11 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
      />
      <POSButton variant="primary" onClick={onSearch}>Search</POSButton>
    </div>
  );
}
