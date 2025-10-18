/**
 * Anti-Freezing Script
 * This script helps detect and recover from browser hangs.
 */

(function() {
  console.log('Anti-freezing script loaded');
  
  // Keep track of execution times to detect UI freezes
  let lastHeartbeat = Date.now();
  let freezeDetected = false;
  let hangCount = 0;
  
  // Create a hidden diagnostic div
  const diagnosticDiv = document.createElement('div');
  diagnosticDiv.style.position = 'fixed';
  diagnosticDiv.style.bottom = '10px';
  diagnosticDiv.style.right = '10px';
  diagnosticDiv.style.background = 'rgba(0,0,0,0.7)';
  diagnosticDiv.style.color = 'white';
  diagnosticDiv.style.padding = '5px';
  diagnosticDiv.style.borderRadius = '3px';
  diagnosticDiv.style.fontSize = '10px';
  diagnosticDiv.style.zIndex = '9999';
  diagnosticDiv.style.display = 'none';
  document.body.appendChild(diagnosticDiv);
  
  // Show diagnostic info
  function updateDiagnostics(message) {
    diagnosticDiv.textContent = message;
    diagnosticDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      diagnosticDiv.style.display = 'none';
    }, 5000);
  }

  // Create a heartbeat to detect freezes
  function setupHeartbeat() {
    setInterval(() => {
      lastHeartbeat = Date.now();
    }, 500);
  }
  
  // Monitoring function
  function monitorPerformance() {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - lastHeartbeat;
    
    // If more than 2 seconds have passed since last heartbeat, UI might be frozen
    if (timeSinceLastHeartbeat > 2000) {
      if (!freezeDetected) {
        freezeDetected = true;
        hangCount++;
        console.warn(`Possible UI freeze detected (${hangCount}): ${timeSinceLastHeartbeat}ms since last heartbeat`);
        
        // Try to recover
        if (hangCount <= 3) {
          updateDiagnostics(`Recovering from freeze... (Attempt ${hangCount})`);
          attemptRecovery();
        } else {
          updateDiagnostics(`Multiple freezes detected. Try refreshing the page.`);
        }
      }
    } else if (freezeDetected) {
      freezeDetected = false;
      updateDiagnostics(`UI responsive again after freeze`);
    }
  }
  
  // Try to recover from a freeze
  function attemptRecovery() {
    try {
      // Force garbage collection hint (not guaranteed to run)
      if (window.gc) {
        window.gc();
      }
      
      // Check for any intensive operations that might be causing the hang
      if (window.UNSAFE_detachAndCleanupEventListeners) {
        window.UNSAFE_detachAndCleanupEventListeners();
      }
      
      // Reset React component state if possible
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('Attempting to reset React component state');
      }
      
      // Clear some caches
      if (window.caches) {
        window.caches.keys().then(keys => {
          keys.forEach(key => {
            window.caches.delete(key);
          });
        });
      }
      
      // Reset our tracker
      lastHeartbeat = Date.now();
    } catch (e) {
      console.error('Recovery attempt failed:', e);
    }
  }
  
  // Set up the necessary monitoring
  window.addEventListener('load', () => {
    console.log('Setting up anti-freezing monitors');
    setupHeartbeat();
    
    // Check for freezes every 2 seconds
    setInterval(monitorPerformance, 2000);
    
    // Enable diagnostic display on key press (Ctrl+Alt+D)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key === 'd') {
        diagnosticDiv.style.display = diagnosticDiv.style.display === 'none' ? 'block' : 'none';
      }
    });
  });
  
  // Make these functions available globally
  window.UNSAFE_detachAndCleanupEventListeners = function() {
    // Try to clean up known problematic event listeners
    try {
      const root = document.getElementById('root');
      if (root) {
        // Create a clone to replace the root element, removing all event listeners
        const newRoot = root.cloneNode(true);
        if (root.parentNode) {
          root.parentNode.replaceChild(newRoot, root);
        }
      }
      
      // Remove any global click listeners that might be causing problems
      document.body.onclick = null;
      
      console.log('Event listeners cleanup attempted');
      return true;
    } catch (e) {
      console.error('Failed to clean up event listeners:', e);
      return false;
    }
  };
  
  // Setup a debugging console
  window.debugFreezeIssues = function() {
    console.log('Memory usage:', performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB / ${Math.round(performance.memory.jsHeapSizeLimit / 1048576)}MB` : 'Not available');
    console.log('Hang count:', hangCount);
    console.log('Last heartbeat:', new Date(lastHeartbeat).toISOString());
    return 'Debug info logged to console';
  };
})();