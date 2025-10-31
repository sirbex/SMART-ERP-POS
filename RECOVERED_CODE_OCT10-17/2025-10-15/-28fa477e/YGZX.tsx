import React, { useRef, useEffect } from 'react';
// @ts-ignore - react-window types may not be perfect
import { FixedSizeList as List } from 'react-window';
import { Loader2 } from 'lucide-react';

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  onScroll?: (offset: number) => void;
  className?: string;
  loadingMessage?: string;
}

/**
 * VirtualizedList - High-performance list component for large datasets
 * 
 * Uses react-window to render only visible items in the viewport.
 * Reduces DOM nodes and improves performance significantly for lists with 1000+ items.
 * 
 * @example
 * ```tsx
 * <VirtualizedList
 *   items={products}
 *   height={600}
 *   itemHeight={80}
 *   renderItem={(product) => (
 *     <div className="p-4 border-b">
 *       <h3>{product.name}</h3>
 *       <p>${product.price}</p>
 *     </div>
 *   )}
 * />
 * ```
 */
export function VirtualizedList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  loading = false,
  emptyMessage = 'No items to display',
  onScroll,
  className = '',
  loadingMessage = 'Loading...'
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo(0);
    }
  }, [items.length]);

  if (loading) {
    return (
      <div 
        className={`flex flex-col items-center justify-center ${className}`}
        style={{ height: `${height}px` }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{loadingMessage}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div 
        className={`flex items-center justify-center text-muted-foreground ${className}`}
        style={{ height: `${height}px` }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style} className="virtualized-row">
      {renderItem(items[index], index)}
    </div>
  );

  return (
    // @ts-ignore - react-window types
    <List
      ref={listRef}
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
      onScroll={({ scrollOffset }: { scrollOffset: number }) => onScroll?.(scrollOffset)}
      className={className}
    >
      {Row}
    </List>
  );
}
