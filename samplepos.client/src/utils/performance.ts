/**
 * Performance utility functions to prevent browser freezing
 */

/**
 * Creates a debounced version of a function that delays execution until
 * after the specified delay has elapsed since the last time it was invoked.
 * 
 * @param func The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T, 
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    
    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Creates a throttled version of a function that limits how often the function can be called.
 * 
 * @param func The function to throttle
 * @param limit The minimum time between function executions in milliseconds
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T, 
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: number | null = null;
  
  return function(...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= limit) {
      // If enough time has passed, execute immediately
      lastCall = now;
      func(...args);
    } else if (timeoutId === null) {
      // Otherwise schedule execution for when the limit has passed
      timeoutId = window.setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        func(...args);
      }, limit - timeSinceLastCall);
    }
  };
}

/**
 * Chunks an array into smaller pieces to process them incrementally.
 * Useful for processing large arrays without blocking the UI.
 * 
 * @param array The array to process
 * @param chunkSize The size of each chunk
 * @param processFn Function to process each chunk
 * @param completeFn Optional function to call when all chunks are processed
 */
export function processArrayInChunks<T>(
  array: T[],
  chunkSize: number,
  processFn: (chunk: T[]) => void,
  completeFn?: () => void
): void {
  let index = 0;
  
  function processNextChunk() {
    const chunk = array.slice(index, index + chunkSize);
    index += chunkSize;
    
    if (chunk.length > 0) {
      processFn(chunk);
      
      if (index < array.length) {
        // Schedule next chunk with setTimeout to allow UI updates
        setTimeout(processNextChunk, 0);
      } else if (completeFn) {
        completeFn();
      }
    } else if (completeFn) {
      completeFn();
    }
  }
  
  processNextChunk();
}

/**
 * Safely access localStorage with error handling and performance optimization
 */
export const safeStorage = {
  get<T>(key: string, defaultValue: T): T {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`Error retrieving ${key} from localStorage:`, error);
      return defaultValue;
    }
  },
  
  set(key: string, value: any): boolean {
    try {
      // Use requestAnimationFrame to avoid blocking the UI thread
      requestAnimationFrame(() => {
        localStorage.setItem(key, JSON.stringify(value));
      });
      return true;
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
      return false;
    }
  },
  
  remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key} from localStorage:`, error);
      return false;
    }
  }
};

/**
 * Detects browser freezes and can attempt recovery
 */
export class FreezeDectector {
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: number = Date.now();
  private freezeThreshold: number;
  private checkInterval: number;
  private onFreeze: () => void;
  
  constructor(
    freezeThreshold: number = 2000, // Default: 2 seconds without response = freeze
    checkInterval: number = 1000,   // Check every second
    onFreeze: () => void = () => console.warn('Browser freeze detected')
  ) {
    this.freezeThreshold = freezeThreshold;
    this.checkInterval = checkInterval;
    this.onFreeze = onFreeze;
  }
  
  /**
   * Start monitoring for browser freezes
   */
  start(): void {
    if (this.heartbeatInterval) {
      this.stop();
    }
    
    // Set up heartbeat to update timestamp
    const heartbeat = () => {
      this.lastHeartbeat = Date.now();
      setTimeout(heartbeat, this.checkInterval / 2);
    };
    
    // Start heartbeat
    heartbeat();
    
    // Set up monitor to check for freezes
    this.heartbeatInterval = window.setInterval(() => {
      const now = Date.now();
      const timeSinceHeartbeat = now - this.lastHeartbeat;
      
      if (timeSinceHeartbeat > this.freezeThreshold) {
        console.warn(`Possible freeze detected: UI unresponsive for ${timeSinceHeartbeat}ms`);
        this.onFreeze();
      }
    }, this.checkInterval);
  }
  
  /**
   * Stop monitoring for freezes
   */
  stop(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

/**
 * Create optimized search index for quick lookups
 */
export class SearchIndex<T> {
  private items: T[];
  private keyFn: (item: T) => string;
  private index: Map<string, T[]>;
  
  constructor(items: T[] = [], keyFn: (item: T) => string) {
    this.items = items;
    this.keyFn = keyFn;
    this.index = new Map();
    this.buildIndex();
  }
  
  /**
   * Build the search index
   */
  private buildIndex(): void {
    this.index.clear();
    
    // Process the array in chunks to prevent UI freezing for large arrays
    processArrayInChunks<T>(
      this.items,
      100, // Process 100 items at a time
      (chunk) => {
        for (const item of chunk) {
          const key = this.keyFn(item).toLowerCase();
          // Index each word separately for better search
          const words = key.split(/\s+/);
          
          for (const word of words) {
            if (word.length < 2) continue; // Skip very short words
            
            // Index each substring of the word
            for (let i = 1; i <= word.length; i++) {
              const substring = word.substring(0, i);
              
              if (!this.index.has(substring)) {
                this.index.set(substring, []);
              }
              
              const indexedItems = this.index.get(substring)!;
              if (!indexedItems.includes(item)) {
                indexedItems.push(item);
              }
            }
          }
        }
      }
    );
  }
  
  /**
   * Update the items in the index
   */
  updateItems(items: T[]): void {
    this.items = items;
    // Build index in a non-blocking way using setTimeout
    setTimeout(() => this.buildIndex(), 0);
  }
  
  /**
   * Add a single item to the index
   */
  addItem(item: T): void {
    this.items.push(item);
    
    const key = this.keyFn(item).toLowerCase();
    const words = key.split(/\s+/);
    
    for (const word of words) {
      if (word.length < 2) continue;
      
      for (let i = 1; i <= word.length; i++) {
        const substring = word.substring(0, i);
        
        if (!this.index.has(substring)) {
          this.index.set(substring, []);
        }
        
        const indexedItems = this.index.get(substring)!;
        if (!indexedItems.includes(item)) {
          indexedItems.push(item);
        }
      }
    }
  }
  
  /**
   * Search for items matching the query
   */
  search(query: string, limit: number = 10): T[] {
    if (!query || query.length < 1) {
      return this.items.slice(0, limit);
    }
    
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length === 0) {
      return this.items.slice(0, limit);
    }
    
    // For single-word queries, use the index
    if (words.length === 1 && this.index.has(words[0])) {
      return this.index.get(words[0])!.slice(0, limit);
    }
    
    // For multi-word or unindexed queries, do a linear search
    // but with optimizations to avoid freezing
    const results: T[] = [];
    const maxItemsToCheck = Math.min(1000, this.items.length);
    
    for (let i = 0; i < maxItemsToCheck && results.length < limit; i++) {
      const item = this.items[i];
      const key = this.keyFn(item).toLowerCase();
      
      if (words.every(word => key.includes(word))) {
        results.push(item);
      }
    }
    
    return results;
  }
}