/**
 * Responsive Table Utilities
 * 
 * This file contains utilities for enhancing tables on mobile devices.
 */

/**
 * Transforms a standard table into a responsive card-based layout on mobile
 * @param {string} tableSelector - The CSS selector for the table to transform
 */
export function initResponsiveTable(tableSelector: string): void {
  const tables = document.querySelectorAll(tableSelector);
  
  tables.forEach((table: HTMLTableElement) => {
    // Add responsive class
    table.classList.add('table-responsive-card');
    
    // Get all headers
    const headers = Array.from(table.querySelectorAll('thead th')).map((th: HTMLTableCellElement) => 
      th.textContent?.trim() || ''
    );
    
    // Process all table rows
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach((row: HTMLTableRowElement) => {
      // Get title for this row (usually first or second cell)
      const firstCell = row.querySelector('td');
      const titleText = firstCell?.textContent?.trim() || '';
      row.setAttribute('data-title', titleText);
      
      // Add data-label attributes to each cell based on header
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, index) => {
        if (index < headers.length) {
          cell.setAttribute('data-label', headers[index]);
        }
        
        // Handle action cells special styling
        if (cell.querySelector('button, a, .btn')) {
          cell.classList.add('actions-cell');
        }
      });
    });
  });
}

/**
 * Adds horizontal scroll indicators to tables
 * @param {string} containerSelector - The CSS selector for table containers
 */
export function addTableScrollIndicators(containerSelector) {
  const containers = document.querySelectorAll(containerSelector);
  
  containers.forEach(container => {
    container.classList.add('table-scroll-container');
    
    // Create scroll indicator
    const indicator = document.createElement('div');
    indicator.className = 'table-scroll-indicator';
    container.appendChild(indicator);
    
    // Handle scroll event
    container.addEventListener('scroll', () => {
      const scrollLeft = container.scrollLeft;
      const maxScroll = container.scrollWidth - container.clientWidth;
      
      if (maxScroll <= 5 || scrollLeft >= maxScroll - 5) {
        container.classList.add('scrolled-to-end');
      } else {
        container.classList.remove('scrolled-to-end');
      }
    });
    
    // Initial check
    if (container.scrollWidth <= container.clientWidth) {
      container.classList.add('scrolled-to-end');
    }
  });
}

/**
 * Makes tables more touch-friendly on mobile
 * @param {string} tableSelector - The CSS selector for tables to enhance
 */
export function enhanceTableTouchability(tableSelector) {
  const tables = document.querySelectorAll(tableSelector);
  
  tables.forEach(table => {
    // Add touch classes
    table.classList.add('touch-friendly');
    
    // Increase touch target size for interactive elements
    const interactiveElements = table.querySelectorAll('button, a, input, select');
    interactiveElements.forEach(el => {
      el.classList.add('touch-target');
    });
    
    // Add ripple effect to rows for touch feedback
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      row.addEventListener('touchstart', function() {
        this.classList.add('touch-active');
      });
      
      row.addEventListener('touchend', function() {
        this.classList.remove('touch-active');
        // Add a small delay before removing the class completely
        setTimeout(() => {
          this.classList.remove('touch-active');
        }, 300);
      });
    });
  });
}