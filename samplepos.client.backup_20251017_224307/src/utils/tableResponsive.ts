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
  
  tables.forEach((table) => {
    const htmlTable = table as HTMLTableElement;
    // Add responsive class
    htmlTable.classList.add('table-responsive-card');
    
    // Get all headers
    const headers = Array.from(htmlTable.querySelectorAll('thead th')).map((th) => 
      (th as HTMLTableCellElement).textContent?.trim() || ''
    );
    
    // Process all table rows
    const rows = htmlTable.querySelectorAll('tbody tr');
    
    rows.forEach((row) => {
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
export function addTableScrollIndicators(containerSelector: string): void {
  const containers = document.querySelectorAll(containerSelector);
  
  containers.forEach((container) => {
    const htmlContainer = container as HTMLElement;
    htmlContainer.classList.add('table-scroll-container');
    
    // Create scroll indicator
    const indicator = document.createElement('div');
    indicator.className = 'table-scroll-indicator';
    htmlContainer.appendChild(indicator);
    
    // Handle scroll event
    htmlContainer.addEventListener('scroll', () => {
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
export function enhanceTableTouchability(tableSelector: string): void {
  const tables = document.querySelectorAll(tableSelector);
  
  tables.forEach((table) => {
    const htmlTable = table as HTMLElement;
    // Add touch classes
    htmlTable.classList.add('touch-friendly');
    
    // Increase touch target size for interactive elements
    const interactiveElements = htmlTable.querySelectorAll('button, a, input, select');
    interactiveElements.forEach((el) => {
      (el as HTMLElement).classList.add('touch-target');
    });
    
    // Add ripple effect to rows for touch feedback
    const rows = htmlTable.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const htmlRow = row as HTMLElement;
      htmlRow.addEventListener('touchstart', function(this: HTMLElement) {
        this.classList.add('touch-active');
      });
      
      htmlRow.addEventListener('touchend', function(this: HTMLElement) {
        this.classList.remove('touch-active');
        // Add a small delay before removing the class completely
        setTimeout(() => {
          htmlRow.classList.remove('touch-active');
        }, 300);
      });
    });
  });
}