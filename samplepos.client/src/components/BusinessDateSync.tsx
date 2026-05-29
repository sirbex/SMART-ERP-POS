import { useEffect } from 'react';
import { useServerDate } from '../hooks/useServerDate';
import { setServerBusinessDate } from '../utils/businessDateCache';

/** Prefetch server business date on app load — single source of truth for "today". */
export default function BusinessDateSync() {
  const { businessDate, isFallback } = useServerDate();

  useEffect(() => {
    if (!isFallback && businessDate) {
      setServerBusinessDate(businessDate);
    }
  }, [businessDate, isFallback]);

  return null;
}
