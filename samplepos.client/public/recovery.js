/**
 * Enhanced recovery system for React applications
 * This script diagnoses rendering issues, prevents freezes, and fixes common problems
 */

(function() {
  console.log('Recovery system initializing...');
  
  // Track script start time for performance metrics
  const scriptStartTime = performance.now();

  // Performance monitoring variables
  let longTasksDetected = 0;
  let lastResponseTime = Date.now();
  let frozenUIDetected = false;
  const FREEZE_THRESHOLD = 3000; // 3 seconds without response = freeze
  
  // Store original console methods
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  // Error tracking
  const errorLog = [];
  const MAX_ERRORS = 50;
  
  // Enhanced console error to track React errors
  console.error = function(...args) {
    // Call original method first
    originalConsoleError.apply(console, args);
    
    // Check if this is a React error
    const errorString = args.map(arg => String(arg)).join(' ');
    
    // Log for diagnostics
    if (errorLog.length < MAX_ERRORS) {
      errorLog.push({
        type: 'error',
        message: errorString,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check for specific React errors that might indicate rendering problems
    if (
      errorString.includes('Minified React error') ||
      errorString.includes('Uncaught Error: Invariant Violation') ||
      errorString.includes('Maximum update depth exceeded') ||
      errorString.includes('Too many re-renders')
    ) {
      console.warn('Critical React error detected - preparing recovery options');
    }
  };
  
  // Enhanced console warn to track potential issues
  console.warn = function(...args) {
    // Call original method
    originalConsoleWarn.apply(console, args);
    
    // Log warning
    const warningString = args.map(arg => String(arg)).join(' ');
    if (errorLog.length < MAX_ERRORS) {
      errorLog.push({
        type: 'warning',
        message: warningString,
        timestamp: new Date().toISOString()
      });
    }
  };
  
  // Check for React loading
  window.checkReactLoaded = function() {
    return window.React !== undefined;
  };

  // Memory usage monitoring
  function checkMemoryUsage() {
    if (window.performance && window.performance.memory) {
      const memory = window.performance.memory;
      const usedHeapSize = memory.usedJSHeapSize;
      const totalHeapSize = memory.totalJSHeapSize;
      const usageRatio = usedHeapSize / totalHeapSize;
      
      if (usageRatio > 0.9) {
        console.warn(`High memory usage detected: ${Math.round(usageRatio * 100)}% of heap used`);
        return true;
      }
    }
    return false;
  }
  
  // Detect long running tasks with PerformanceObserver
  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // A task that blocks the main thread for more than 50ms
          if (entry.duration > 100) {
            longTasksDetected++;
            console.warn(`Long task detected: ${Math.round(entry.duration)}ms`);
            
            // Update heartbeat to avoid false freeze detection during known long tasks
            lastResponseTime = Date.now();
          }
        }
      });
      
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      console.warn('PerformanceObserver not supported:', e);
    }
  }
  
  // Heartbeat to detect completely frozen UI
  function setupHeartbeatMonitor() {
    // Update timestamp on various user interactions
    ['click', 'keypress', 'mousemove', 'touchstart'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        lastResponseTime = Date.now();
        if (frozenUIDetected) {
          console.log('UI responsive again after freeze');
          frozenUIDetected = false;
        }
      }, { passive: true });
    });
    
    // Check heartbeat every 1 second
    return setInterval(() => {
      const now = Date.now();
      if (now - lastResponseTime > FREEZE_THRESHOLD) {
        if (!frozenUIDetected) {
          frozenUIDetected = true;
          console.warn(`UI freeze detected - unresponsive for ${Math.round((now - lastResponseTime)/1000)}s`);
          
          // Check memory usage during freeze
          checkMemoryUsage();
          
          // After certain time, try emergency recovery
          if (now - lastResponseTime > FREEZE_THRESHOLD * 2) {
            emergencyRecovery();
          }
        }
      }
    }, 1000);
  }
  
  // Enhanced recovery function with diagnostics
  window.recoverFromRenderFailure = function() {
    try {
      console.log('Running enhanced recovery process...');
      const rootElement = document.getElementById('root');
      
      if (!rootElement) {
        console.error('Root element not found during recovery');
        return false;
      }
      
      // First try to diagnose the problem
      const diagnostics = {
        reactLoaded: checkReactLoaded(),
        rootEmpty: !rootElement.hasChildNodes() || rootElement.children.length === 0,
        memoryIssue: checkMemoryUsage(),
        errorCount: errorLog.length,
        longTasks: longTasksDetected,
        frozenUI: frozenUIDetected,
        loadTime: Math.round((performance.now() - scriptStartTime) / 1000)
      };
      
      console.log('Diagnostics:', diagnostics);
      
      // Check if root is empty
      if (diagnostics.rootEmpty) {
        console.warn('Root element is empty - rendering recovery UI');
        
        rootElement.innerHTML = `
          <div style="padding: 20px; font-family: sans-serif; max-width: 600px; margin: 100px auto; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="color: #d32f2f;">Application Recovery</h2>
            <p>The application encountered an issue and is attempting to recover.</p>
            <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
              <p><strong>Diagnostic Information:</strong></p>
              <ul style="margin-top: 5px;">
                <li>React loaded: ${diagnostics.reactLoaded ? 'Yes' : 'No'}</li>
                <li>Memory issues: ${diagnostics.memoryIssue ? 'Yes' : 'No'}</li>
                <li>Errors detected: ${diagnostics.errorCount}</li>
                <li>UI responsiveness: ${diagnostics.frozenUI ? 'Poor' : 'Good'}</li>
              </ul>
            </div>
            <p>Please try one of these recovery options:</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button onclick="window.location.reload()" style="background: #0078d4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                Reload Application
              </button>
              <button onclick="localStorage.removeItem('pos_persisted_cart_v1'); window.location.reload();" style="background: #107c10; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                Clear Cart & Reload
              </button>
              <button onclick="localStorage.clear(); window.location.reload();" style="background: #d83b01; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                Reset All Data & Reload
              </button>
            </div>
          </div>
        `;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Recovery script failed:', error);
      return false;
    }
  };
  
  // Last resort emergency recovery for complete freeze
  function emergencyRecovery() {
    console.warn('Emergency recovery triggered due to complete UI freeze');
    
    // Check localStorage for cart (often the cause of freezes)
    try {
      const cartData = localStorage.getItem('pos_persisted_cart_v1');
      if (cartData && cartData.length > 10000) {
        console.warn('Excessively large cart data detected, clearing');
        localStorage.removeItem('pos_persisted_cart_v1');
      }
    } catch (e) {
      console.error('Error checking cart data:', e);
    }
    
    // Last resort: reload the page
    if (frozenUIDetected) {
      console.warn('UI still frozen, reloading application');
      window.location.reload();
    }
  }

  // Monitor for render completion
  let renderMonitorTimeout;
  let heartbeatInterval;
  
  window.startRenderMonitor = function() {
    console.log('Starting enhanced application monitoring...');
    
    // Clear any existing timers
    if (renderMonitorTimeout) {
      clearTimeout(renderMonitorTimeout);
    }
    
    // Set up UI freeze detection
    heartbeatInterval = setupHeartbeatMonitor();
    
    // Check for React content after reasonable timeout
    renderMonitorTimeout = setTimeout(function() {
      const rootElement = document.getElementById('root');
      
      // Check if root element has React-managed content
      if (rootElement && (!rootElement.hasChildNodes() || rootElement.children.length === 0)) {
        console.warn('No React content detected after timeout - running recovery');
        window.recoverFromRenderFailure();
      } else {
        console.log('Application appears to have rendered successfully');
        // Additional check after successful render
        setTimeout(() => {
          if (checkMemoryUsage() || longTasksDetected > 5) {
            console.warn('Potential performance issues detected after initial render');
          }
        }, 5000);
      }
    }, 3000); // 3 second initial render timeout
  };
  
  // Expose diagnostics
  window.getRecoveryDiagnostics = function() {
    return {
      errorLog,
      longTasksDetected,
      frozenUIDetected,
      lastResponseTime,
      memoryIssues: checkMemoryUsage(),
      uptime: Math.round((performance.now() - scriptStartTime) / 1000)
    };
  };
  
  // Start monitoring when the page loads
  window.addEventListener('load', function() {
    console.log('Page loaded, starting application monitoring');
    window.startRenderMonitor();
  });
  
  // Report success
  console.log(`Recovery system initialized in ${Math.round(performance.now() - scriptStartTime)}ms`);
})();