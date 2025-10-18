import { useState, useEffect, useCallback } from 'react';
import { debounce, SearchIndex } from '../utils/performance';

/**
 * Custom hook for efficient, non-blocking search functionality
 * 
 * @param items Array of items to search through
 * @param keyFn Function that returns the string to search on for each item
 * @param options Configuration options
 * @returns Object containing search state and methods
 */
export function useSearchable<T>(
  items: T[],
  keyFn: (item: T) => string,
  options: {
    debounceMs?: number;
    minQueryLength?: number;
    maxResults?: number;
  } = {}
) {
  const {
    debounceMs = 300,
    minQueryLength = 1,
    maxResults = 10
  } = options;
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  // Initialize search index
  const [searchIndex] = useState(() => new SearchIndex<T>(items, keyFn));
  
  // Update search index when items change
  useEffect(() => {
    searchIndex.updateItems(items);
  }, [items, searchIndex]);
  
  // Debounced search function
  const performSearch = useCallback(
    debounce((searchTerm: string) => {
      if (!searchTerm || searchTerm.length < minQueryLength) {
        setResults([]);
        setLoading(false);
        return;
      }
      
      // Use setTimeout to avoid blocking the UI thread
      setTimeout(() => {
        const searchResults = searchIndex.search(searchTerm, maxResults);
        setResults(searchResults);
        setLoading(false);
        setSelectedIndex(-1); // Reset selection on new results
      }, 0);
    }, debounceMs),
    [searchIndex, minQueryLength, maxResults, debounceMs]
  );
  
  // Trigger search when query changes
  useEffect(() => {
    if (query.length >= minQueryLength) {
      setLoading(true);
      performSearch(query);
    } else {
      setResults([]);
    }
  }, [query, performSearch, minQueryLength]);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          return nextIndex >= results.length ? 0 : nextIndex;
        });
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prevIndex => {
          const nextIndex = prevIndex - 1;
          return nextIndex < 0 ? results.length - 1 : nextIndex;
        });
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          // Return selected item
          return results[selectedIndex];
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setQuery('');
        setResults([]);
        break;
    }
    
    return null;
  }, [results, selectedIndex]);
  
  const setSearchQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);
  
  const selectItem = useCallback((index: number) => {
    if (index >= 0 && index < results.length) {
      return results[index];
    }
    return null;
  }, [results]);
  
  return {
    query,
    results,
    loading,
    selectedIndex,
    setSearchQuery,
    handleKeyDown,
    selectItem
  };
}