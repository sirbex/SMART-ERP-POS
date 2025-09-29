/**
 * Fix for the browser freezing issue in POSScreen
 * This script patches the CustomerSearch functionality to be more efficient
 * and prevents the browser from freezing during search operations.
 */

// Debounce function to avoid too frequent function execution
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Initialize once the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing POS optimization fixes...');
  
  // Function to optimize customer search behavior
  const optimizeCustomerSearch = () => {
    // Wait for the component to be fully rendered
    setTimeout(() => {
      // Find all customer search inputs
      const customerInputs = document.querySelectorAll('.pos-customer-input, .customer-search-input');
      
      if (customerInputs.length > 0) {
        console.log(`Found ${customerInputs.length} customer search inputs to optimize`);
        
        customerInputs.forEach((input, index) => {
          // Store original event handlers
          const originalEvents = {
            change: input.onchange,
            keydown: input.onkeydown,
            keyup: input.onkeyup,
            input: input.oninput
          };
          
          // Debounce input and change events
          if (originalEvents.input) {
            input.oninput = debounce(function(e) {
              originalEvents.input.call(this, e);
            }, 300);
          }
          
          if (originalEvents.change) {
            input.onchange = debounce(function(e) {
              originalEvents.change.call(this, e);
            }, 300);
          }
          
          console.log(`Optimized customer search input #${index + 1}`);
        });
      } else {
        // Retry if elements aren't found yet
        setTimeout(optimizeCustomerSearch, 500);
      }
    }, 1000);
  };
  
  // Start optimization process
  optimizeCustomerSearch();
  
  // Set up periodic check for localStorage operations
  setInterval(() => {
    // Check if localStorage is being accessed frequently
    const originalSetItem = localStorage.setItem;
    let setItemCounter = 0;
    
    // Replace setItem with monitored version
    localStorage.setItem = function(key, value) {
      setItemCounter++;
      
      // If too many localStorage operations in a short time, throttle them
      if (setItemCounter > 10) {
        console.warn('Too many localStorage operations detected, throttling');
        setTimeout(() => {
          originalSetItem.call(localStorage, key, value);
        }, 100);
      } else {
        originalSetItem.call(localStorage, key, value);
      }
      
      // Reset counter every second
      setTimeout(() => { setItemCounter = 0; }, 1000);
    };
  }, 10000); // Check every 10 seconds
  
  console.log('POS optimization fixes initialized successfully');
});