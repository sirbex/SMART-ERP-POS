import { useRef, useEffect, RefObject } from 'react';
import POSButton from './POSButton';

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
    if (autoFocus && refToUse.current) refToUse.current.focus();
  }, [autoFocus, refToUse]);
  
  return (
    <div className="flex items-center gap-2">
      <input
        ref={refToUse}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (onKeyDown) onKeyDown(e);
          if (e.key === 'Enter' && onSearch) onSearch();
        }}
        autoComplete="off"
        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
        placeholder={placeholder}
        aria-label="POS product search"
      />
      <POSButton variant="primary" onClick={onSearch}>Search</POSButton>
    </div>
  );
}
