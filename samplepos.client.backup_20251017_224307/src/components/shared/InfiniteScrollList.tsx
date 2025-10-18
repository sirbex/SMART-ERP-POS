import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

interface InfiniteScrollListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore: () => void;
  emptyMessage?: string;
  loadingMessage?: string;
  threshold?: number;
  className?: string;
  autoLoad?: boolean;
  compact?: boolean;
}

/**
 * InfiniteScrollList - Infinite scroll with lazy loading
 * 
 * Automatically loads more items when the user scrolls near the bottom.
 * Uses Intersection Observer API for efficient scroll detection.
 * Can also be used with a "Load More" button.
 * 
 * @example
 * ```tsx
 * const [items, setItems] = useState<Product[]>([]);
 * const [page, setPage] = useState(1);
 * const [hasMore, setHasMore] = useState(true);
 * const [loading, setLoading] = useState(false);
 * 
 * const loadMore = async () => {
 *   setLoading(true);
 *   const newItems = await fetchProducts(page);
 *   setItems(prev => [...prev, ...newItems]);
 *   setPage(prev => prev + 1);
 *   setHasMore(newItems.length > 0);
 *   setLoading(false);
 * };
 * 
 * <InfiniteScrollList
 *   items={items}
 *   loading={loading}
 *   hasMore={hasMore}
 *   onLoadMore={loadMore}
 *   renderItem={(product) => <ProductCard product={product} />}
 * />
 * ```
 */
export function InfiniteScrollList<T>({
  items,
  renderItem,
  loading = false,
  hasMore = true,
  onLoadMore,
  emptyMessage = 'No items to display',
  loadingMessage = 'Loading more items...',
  threshold = 200,
  className = '',
  autoLoad = true,
  compact = false
}: InfiniteScrollListProps<T>) {
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Handle intersection observer
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    setIsIntersecting(target.isIntersecting);
  }, []);

  useEffect(() => {
    const element = observerTarget.current;
    if (!element || !autoLoad) return;

    const option = {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0
    };

    const observer = new IntersectionObserver(handleObserver, option);
    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [handleObserver, threshold, autoLoad]);

  // Auto-load when intersecting and not already loading
  useEffect(() => {
    if (isIntersecting && !loading && hasMore && autoLoad) {
      onLoadMore();
    }
  }, [isIntersecting, loading, hasMore, onLoadMore, autoLoad]);

  // Initial load if empty
  useEffect(() => {
    if (items.length === 0 && !loading && hasMore) {
      onLoadMore();
    }
  }, []);

  return (
    <div className={`space-y-${compact ? '1' : '2'} ${className}`}>
      {/* Items list */}
      {items.length === 0 && !loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className={compact ? 'space-y-1' : 'space-y-2'}>
            {items.map((item, index) => (
              <div key={index}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>

          {/* Loading indicator or intersection target */}
          <div 
            ref={observerTarget} 
            className="flex justify-center py-4"
          >
            {loading && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
                  {loadingMessage}
                </p>
              </div>
            )}

            {/* Load more button (when autoLoad is false) */}
            {!autoLoad && !loading && hasMore && (
              <Button
                onClick={onLoadMore}
                variant="outline"
                size={compact ? 'sm' : 'default'}
                className="w-full sm:w-auto"
              >
                Load More
              </Button>
            )}

            {/* End message */}
            {!loading && !hasMore && items.length > 0 && (
              <p className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
                No more items to load
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
