/**
 * Performance Optimizer for SamplePOS
 * This script optimizes the application's performance to prevent freezes.
 */

(function() {
  console.log('Performance optimizer loaded');
  
  // Wait until the document is fully loaded
  window.addEventListener('load', function() {
    // Debounce function to limit the rate of function execution
    function debounce(func, wait, immediate) {
      let timeout;
      return function() {
        const context = this, args = arguments;
        const later = function() {
          timeout = null;
          if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
      };
    }
    
    // Optimize CPU-intensive operations
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      // Debounce scroll and resize events
      if (type === 'scroll' || type === 'resize') {
        const debouncedListener = debounce(listener, 100);
        return originalAddEventListener.call(this, type, debouncedListener, options);
      }
      
      return originalAddEventListener.call(this, type, listener, options);
    };
    
    // Optimize localStorage operations
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      // Prevent excessive writes to localStorage
      if (key && (key.includes('pos_') || key.includes('inventory') || key.includes('customer'))) {
        if (localStorage.getItem(key) === value) {
          return; // Skip if value hasn't changed
        }
      }
      
      return originalSetItem.call(this, key, value);
    };
    
    // Throttle UI updates
    let lastUIUpdate = 0;
    const THROTTLE_DELAY = 100; // ms
    
    // Intercept React's setState through monkey patching
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const origInject = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject;
      if (origInject) {
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function(injected) {
          const origEnqueueUpdate = injected.enqueueUpdate;
          if (origEnqueueUpdate) {
            injected.enqueueUpdate = function() {
              const now = Date.now();
              if (now - lastUIUpdate > THROTTLE_DELAY) {
                lastUIUpdate = now;
                return origEnqueueUpdate.apply(this, arguments);
              }
            };
          }
          return origInject.apply(this, arguments);
        };
      }
    }
    
    // Memory management - periodically clear unused memory
    setInterval(function() {
      // Clear any persisted variables that could be causing leaks
      if (window.gc) {
        window.gc();
      }
      
      // Check if browser is getting laggy and try to free up memory
      if (performance && performance.memory && 
          performance.memory.usedJSHeapSize > performance.memory.jsHeapSizeLimit * 0.8) {
        console.warn('High memory usage detected');
        
        // Force clear some caches
        if (window.caches) {
          window.caches.keys().then(function(cacheNames) {
            cacheNames.forEach(function(cacheName) {
              window.caches.delete(cacheName);
            });
          });
        }
      }
    }, 30000); // Every 30 seconds
    
    console.log('Performance optimizations applied');
  });
})();