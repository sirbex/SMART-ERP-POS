/**
 * POS Storage Debugging Utility
 * 
 * This script helps diagnose and fix issues with localStorage data in the POS system.
 * It provides tools to:
 * 1. List all localStorage keys and their sizes
 * 2. View the content of specific keys
 * 3. Diagnose common issues like malformed JSON or large storage size
 * 4. Fix common issues such as removing corrupt data or compressing large datasets
 */

// Storage keys commonly used in the POS system
const POS_KEYS = {
  // Core data
  TRANSACTIONS: 'pos_transaction_history_v1',
  INVENTORY: 'inventory_items',
  INVENTORY_PRODUCTS: 'inventory_products',
  INVENTORY_LEGACY: 'pos_inventory_v3',
  INVENTORY_MOVEMENTS: 'inventory_movements',
  INVENTORY_HISTORY: 'inventory_history',
  
  // Customer data
  CUSTOMERS: 'customers', // Modern format
  CUSTOMERS_LEGACY: 'pos_customers', // Legacy format
  CUSTOMER_LEDGER: 'pos_ledger',
  
  // Payment data
  SCHEDULED_PAYMENTS: 'pos_scheduled_payments',
  INSTALLMENT_PLANS: 'installmentPlans',
  
  // Settings
  SETTINGS: 'pos_settings',
  THEME: 'theme',
};

// Utility functions
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
  if (!timestamp) return 'unknown';
  return new Date(timestamp).toLocaleString();
}

function getSeverityClass(percentage) {
  if (percentage > 80) return 'high';
  if (percentage > 50) return 'medium';
  return 'low';
}

function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

// Create and append the UI components
function createDebugUI() {
  // Create container
  const container = document.createElement('div');
  container.id = 'pos-debug-container';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.backgroundColor = '#f8f9fa';
  container.style.padding = '20px';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.right = '0';
  container.style.bottom = '0';
  container.style.zIndex = '9999';
  container.style.overflow = 'auto';
  
  // Add header
  container.innerHTML = `
    <div style="background-color: #343a40; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <h1 style="margin: 0;">POS Storage Debugger</h1>
      <button id="close-debug" style="background-color: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Close</button>
    </div>
    
    <div style="margin-bottom: 20px; display: flex; gap: 10px;">
      <button id="refresh-storage" style="background-color: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Refresh</button>
      <button id="analyze-storage" style="background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Analyze All</button>
      <button id="clean-storage" style="background-color: #fd7e14; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Clean Storage</button>
      <button id="console-view" style="background-color: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Console View</button>
    </div>
    
    <div id="storage-summary" style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #dee2e6;"></div>
    
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
      <div id="storage-list" style="background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #dee2e6; overflow: auto; max-height: 600px;"></div>
      <div id="storage-content" style="background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #dee2e6; overflow: auto; max-height: 600px;">
        <div style="color: #6c757d; text-align: center; padding: 50px 0;">Select a storage item to view its content</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // Add event listeners
  document.getElementById('close-debug').addEventListener('click', () => {
    document.body.removeChild(container);
  });
  
  document.getElementById('refresh-storage').addEventListener('click', () => {
    refreshStorage();
  });
  
  document.getElementById('analyze-storage').addEventListener('click', () => {
    analyzeStorage();
  });
  
  document.getElementById('clean-storage').addEventListener('click', () => {
    cleanStorage();
  });
  
  document.getElementById('console-view').addEventListener('click', () => {
    showConsoleView();
  });
}

// List all localStorage items with sizes
function refreshStorage() {
  const storageList = document.getElementById('storage-list');
  const storageSummary = document.getElementById('storage-summary');
  
  // Calculate total storage usage
  let totalSize = 0;
  let itemCount = 0;
  const storageLimit = 5 * 1024 * 1024; // 5MB typical limit
  
  // Get all keys and their sizes
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    const size = new Blob([value]).size;
    totalSize += size;
    itemCount++;
    
    // Identify if this is a known POS key
    let isPosKey = false;
    let keyDescription = '';
    
    for (const [type, posKey] of Object.entries(POS_KEYS)) {
      if (posKey === key) {
        isPosKey = true;
        keyDescription = type.toLowerCase().replace('_', ' ');
        break;
      }
    }
    
    items.push({
      key,
      size,
      isPosKey,
      keyDescription
    });
  }
  
  // Sort by size (largest first)
  items.sort((a, b) => b.size - a.size);
  
  // Calculate usage percentage
  const usagePercentage = Math.round((totalSize / storageLimit) * 100);
  
  // Update summary
  storageSummary.innerHTML = `
    <h2 style="margin-top: 0;">Storage Summary</h2>
    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
      <div>
        <strong>Total Items:</strong> ${itemCount}
      </div>
      <div>
        <strong>Total Size:</strong> ${formatSize(totalSize)} / 5MB
      </div>
      <div>
        <strong>Usage:</strong> 
        <span style="color: ${usagePercentage > 80 ? '#dc3545' : usagePercentage > 50 ? '#fd7e14' : '#28a745'}">
          ${usagePercentage}%
        </span>
      </div>
    </div>
    
    <div style="width: 100%; height: 20px; background-color: #e9ecef; border-radius: 10px; overflow: hidden;">
      <div style="height: 100%; width: ${usagePercentage}%; background-color: ${
        usagePercentage > 80 ? '#dc3545' : usagePercentage > 50 ? '#fd7e14' : '#28a745'
      };"></div>
    </div>
    ${usagePercentage > 80 ? '<p style="color: #dc3545; margin-top: 10px;">⚠️ Warning: Storage is nearly full!</p>' : ''}
  `;
  
  // Update list
  storageList.innerHTML = `<h2 style="margin-top: 0;">Storage Items</h2>`;
  
  items.forEach((item) => {
    const sizePercentage = Math.round((item.size / totalSize) * 100);
    const listItem = document.createElement('div');
    listItem.style.padding = '10px';
    listItem.style.borderBottom = '1px solid #dee2e6';
    listItem.style.cursor = 'pointer';
    
    // Add POS key indicator and styling
    const backgroundColor = item.isPosKey ? '#e8f4fe' : 'transparent';
    
    listItem.innerHTML = `
      <div style="display: flex; justify-content: space-between; background-color: ${backgroundColor}; padding: 5px;">
        <div>
          <strong>${item.key}</strong>
          ${item.isPosKey ? `<span style="background-color: #007bff; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px; margin-left: 5px;">POS ${item.keyDescription}</span>` : ''}
        </div>
        <div>${formatSize(item.size)}</div>
      </div>
      <div style="width: 100%; height: 4px; background-color: #e9ecef; margin-top: 5px;">
        <div style="height: 100%; width: ${sizePercentage}%; background-color: ${
          sizePercentage > 30 ? '#fd7e14' : '#6c757d'
        };"></div>
      </div>
    `;
    
    listItem.addEventListener('click', () => {
      viewStorageItem(item.key);
    });
    
    storageList.appendChild(listItem);
  });
}

// View a specific localStorage item
function viewStorageItem(key) {
  const storageContent = document.getElementById('storage-content');
  const value = localStorage.getItem(key);
  
  if (!value) {
    storageContent.innerHTML = `<div style="color: #dc3545; text-align: center;">Key "${key}" not found</div>`;
    return;
  }
  
  const size = new Blob([value]).size;
  let validJson = isValidJSON(value);
  
  storageContent.innerHTML = `
    <h2 style="margin-top: 0; display: flex; justify-content: space-between;">
      <span>${key}</span>
      <span style="font-size: 14px; color: #6c757d;">${formatSize(size)}</span>
    </h2>
    
    <div style="margin-bottom: 15px; display: flex; gap: 10px;">
      <button id="btn-copy" style="background-color: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Copy</button>
      <button id="btn-delete" style="background-color: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
      ${validJson ? `<button id="btn-analyze" style="background-color: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Analyze</button>` : ''}
    </div>
    
    ${validJson ? 
      '<div id="json-stats"></div>' : 
      '<div style="color: #dc3545; margin-bottom: 10px;">⚠️ Invalid JSON data</div>'
    }
    
    <div style="font-weight: bold; margin-bottom: 5px;">Content:</div>
    <pre id="content-display" style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; max-height: 400px;"></pre>
  `;
  
  // Set content with some protection for large data
  const contentDisplayElement = document.getElementById('content-display');
  if (size > 100000) {
    // For large content, show truncated version
    contentDisplayElement.textContent = value.substring(0, 10000) + '\n\n... [Content truncated, too large to display] ...';
    
    // Add button to show full content
    const showFullBtn = document.createElement('button');
    showFullBtn.textContent = 'Show Full Content';
    showFullBtn.style.marginTop = '10px';
    showFullBtn.style.backgroundColor = '#007bff';
    showFullBtn.style.color = 'white';
    showFullBtn.style.border = 'none';
    showFullBtn.style.padding = '5px 10px';
    showFullBtn.style.borderRadius = '4px';
    showFullBtn.style.cursor = 'pointer';
    
    showFullBtn.addEventListener('click', () => {
      contentDisplayElement.textContent = value;
    });
    
    contentDisplayElement.parentNode.insertBefore(showFullBtn, contentDisplayElement.nextSibling);
  } else {
    // For smaller content, show everything
    contentDisplayElement.textContent = value;
  }
  
  // Add event listeners for buttons
  document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(value).then(() => {
      alert('Content copied to clipboard');
    });
  });
  
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (confirm(`Are you sure you want to delete "${key}" from localStorage?`)) {
      localStorage.removeItem(key);
      refreshStorage();
      storageContent.innerHTML = '<div style="color: #28a745; text-align: center;">Item deleted successfully</div>';
    }
  });
  
  if (validJson) {
    document.getElementById('btn-analyze').addEventListener('click', () => {
      analyzeStorageItem(key, value);
    });
    
    // Show quick stats for JSON data
    try {
      const jsonData = JSON.parse(value);
      let statsHtml = '<div style="margin-bottom: 15px; padding: 10px; background-color: #e8f4fe; border-radius: 5px;">';
      
      if (Array.isArray(jsonData)) {
        statsHtml += `<div><strong>Type:</strong> Array with ${jsonData.length} items</div>`;
        
        if (jsonData.length > 0) {
          statsHtml += `<div><strong>First item type:</strong> ${typeof jsonData[0]}</div>`;
          
          if (typeof jsonData[0] === 'object' && jsonData[0] !== null) {
            statsHtml += '<div><strong>Sample keys:</strong> ';
            const keys = Object.keys(jsonData[0]).slice(0, 5);
            statsHtml += keys.join(', ');
            if (Object.keys(jsonData[0]).length > 5) statsHtml += ', ...';
            statsHtml += '</div>';
          }
        }
      } else if (typeof jsonData === 'object' && jsonData !== null) {
        const keyCount = Object.keys(jsonData).length;
        statsHtml += `<div><strong>Type:</strong> Object with ${keyCount} keys</div>`;
        
        if (keyCount > 0) {
          statsHtml += '<div><strong>Keys:</strong> ';
          const keys = Object.keys(jsonData).slice(0, 5);
          statsHtml += keys.join(', ');
          if (keyCount > 5) statsHtml += ', ...';
          statsHtml += '</div>';
        }
      }
      
      statsHtml += '</div>';
      document.getElementById('json-stats').innerHTML = statsHtml;
    } catch (e) {
      // This shouldn't happen since we already checked isValidJSON
    }
  }
}

// Analyze all localStorage items
function analyzeStorage() {
  const storageContent = document.getElementById('storage-content');
  storageContent.innerHTML = '<h2 style="margin-top: 0;">Storage Analysis</h2>';
  
  const issues = [];
  let totalSize = 0;
  
  // Check each item
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    const size = new Blob([value]).size;
    totalSize += size;
    
    // Check for large items
    if (size > 500000) {
      issues.push({
        type: 'large-item',
        key,
        size,
        message: `Large storage item (${formatSize(size)})`
      });
    }
    
    // Check for invalid JSON in POS keys
    let isPosKey = false;
    for (const posKey of Object.values(POS_KEYS)) {
      if (posKey === key) {
        isPosKey = true;
        break;
      }
    }
    
    if (isPosKey && !isValidJSON(value)) {
      issues.push({
        type: 'invalid-json',
        key,
        message: 'Invalid JSON in POS storage key'
      });
    }
    
    // Check for empty arrays or objects
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length === 0) {
        issues.push({
          type: 'empty-array',
          key,
          message: 'Empty array'
        });
      } else if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
        issues.push({
          type: 'empty-object',
          key,
          message: 'Empty object'
        });
      }
    } catch (e) {
      // Already caught by the invalid JSON check
    }
    
    // Check for duplicate inventory items
    if (key === POS_KEYS.INVENTORY || key === POS_KEYS.INVENTORY_PRODUCTS || key === POS_KEYS.INVENTORY_LEGACY) {
      try {
        const items = JSON.parse(value);
        if (Array.isArray(items)) {
          const names = {};
          items.forEach(item => {
            if (item && item.name) {
              names[item.name] = (names[item.name] || 0) + 1;
            }
          });
          
          const duplicates = Object.entries(names)
            .filter(([name, count]) => count > 1)
            .map(([name, count]) => ({ name, count }));
          
          if (duplicates.length > 0) {
            issues.push({
              type: 'duplicate-items',
              key,
              message: `Found ${duplicates.length} duplicate product names`,
              details: duplicates
            });
          }
        }
      } catch (e) {
        // Already caught by the invalid JSON check
      }
    }
  }
  
  // Check total storage usage
  const storageLimit = 5 * 1024 * 1024; // 5MB typical limit
  const usagePercentage = Math.round((totalSize / storageLimit) * 100);
  
  if (usagePercentage > 80) {
    issues.push({
      type: 'storage-full',
      message: `Storage is nearly full (${usagePercentage}% used)`,
      size: totalSize,
      percentage: usagePercentage
    });
  }
  
  // Display results
  if (issues.length === 0) {
    storageContent.innerHTML += '<div style="color: #28a745; padding: 15px; background-color: #d4edda; border-radius: 5px; margin-bottom: 15px;">No issues found! Your storage is healthy.</div>';
  } else {
    storageContent.innerHTML += `<div style="color: #856404; padding: 15px; background-color: #fff3cd; border-radius: 5px; margin-bottom: 15px;">Found ${issues.length} potential issues:</div>`;
    
    const issueList = document.createElement('div');
    issues.forEach((issue, index) => {
      const issueItem = document.createElement('div');
      issueItem.style.marginBottom = '15px';
      issueItem.style.padding = '10px';
      issueItem.style.backgroundColor = '#f8f9fa';
      issueItem.style.borderLeft = '4px solid';
      
      switch (issue.type) {
        case 'large-item':
          issueItem.style.borderLeftColor = '#fd7e14';
          break;
        case 'invalid-json':
          issueItem.style.borderLeftColor = '#dc3545';
          break;
        case 'storage-full':
          issueItem.style.borderLeftColor = '#dc3545';
          break;
        case 'empty-array':
        case 'empty-object':
          issueItem.style.borderLeftColor = '#ffc107';
          break;
        case 'duplicate-items':
          issueItem.style.borderLeftColor = '#17a2b8';
          break;
      }
      
      let issueContent = `
        <div style="font-weight: bold;">${index + 1}. ${issue.message}</div>
      `;
      
      if (issue.key) {
        issueContent += `<div>Key: <a href="#" class="view-key" data-key="${issue.key}">${issue.key}</a></div>`;
      }
      
      if (issue.size) {
        issueContent += `<div>Size: ${formatSize(issue.size)}</div>`;
      }
      
      if (issue.details) {
        issueContent += '<div style="margin-top: 5px;">Details: ';
        if (Array.isArray(issue.details)) {
          issueContent += `<ul style="margin: 5px 0;">`;
          issue.details.forEach(detail => {
            issueContent += `<li>${detail.name}: ${detail.count} occurrences</li>`;
          });
          issueContent += `</ul>`;
        } else {
          issueContent += JSON.stringify(issue.details);
        }
        issueContent += '</div>';
      }
      
      // Add fix button if applicable
      if (issue.type === 'large-item' || issue.type === 'empty-array' || issue.type === 'empty-object') {
        issueContent += `
          <button class="fix-issue" data-issue-type="${issue.type}" data-key="${issue.key}" 
            style="background-color: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-top: 5px;">
            ${issue.type === 'large-item' ? 'Compress' : 'Remove'}
          </button>
        `;
      }
      
      issueItem.innerHTML = issueContent;
      issueList.appendChild(issueItem);
    });
    
    storageContent.appendChild(issueList);
    
    // Add event listeners for view keys
    document.querySelectorAll('.view-key').forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        viewStorageItem(element.getAttribute('data-key'));
      });
    });
    
    // Add event listeners for fix buttons
    document.querySelectorAll('.fix-issue').forEach(element => {
      element.addEventListener('click', () => {
        const issueType = element.getAttribute('data-issue-type');
        const key = element.getAttribute('data-key');
        
        if (issueType === 'empty-array' || issueType === 'empty-object') {
          if (confirm(`Remove empty ${issueType === 'empty-array' ? 'array' : 'object'} "${key}"?`)) {
            localStorage.removeItem(key);
            refreshStorage();
            analyzeStorage();
          }
        } else if (issueType === 'large-item') {
          compressStorageItem(key);
        }
      });
    });
  }
  
  // Add recommendations
  storageContent.innerHTML += `
    <h3 style="margin-top: 20px;">Recommendations</h3>
    <ul style="padding-left: 20px;">
      <li>Use <strong>Clean Storage</strong> to remove unused POS data</li>
      <li>Compress large transaction history by removing old transactions</li>
      <li>Consider clearing browser data periodically</li>
      <li>Export important data before clearing storage</li>
    </ul>
  `;
}

// Analyze a specific localStorage item
function analyzeStorageItem(key, value) {
  try {
    const storageContent = document.getElementById('storage-content');
    const jsonData = JSON.parse(value);
    
    let analysisHTML = `
      <h2 style="margin-top: 0;">Analysis of "${key}"</h2>
    `;
    
    // Check data type
    if (Array.isArray(jsonData)) {
      analysisHTML += `
        <div style="padding: 10px; background-color: #e8f4fe; border-radius: 5px; margin-bottom: 15px;">
          <div><strong>Type:</strong> Array</div>
          <div><strong>Length:</strong> ${jsonData.length} items</div>
        </div>
      `;
      
      // Array analysis
      if (jsonData.length === 0) {
        analysisHTML += `
          <div style="padding: 10px; background-color: #fff3cd; border-radius: 5px; margin-bottom: 15px;">
            <strong>Note:</strong> This array is empty. It may be safe to remove it.
          </div>
        `;
      } else {
        // Check for object items
        if (typeof jsonData[0] === 'object' && jsonData[0] !== null) {
          // Get sample item structure
          const sampleItem = jsonData[0];
          const keys = Object.keys(sampleItem);
          
          analysisHTML += `
            <h3>Array Structure</h3>
            <div style="margin-bottom: 15px;">
              <div><strong>Items appear to be objects with these properties:</strong></div>
              <ul style="padding-left: 20px;">
                ${keys.map(key => `<li>${key}: ${typeof sampleItem[key]}</li>`).join('')}
              </ul>
            </div>
          `;
          
          // Look for duplicate items
          const uniqueCheck = {};
          const uniqueKeys = [];
          let duplicates = 0;
          
          // Find potential ID fields
          const potentialIdFields = ['id', 'ID', '_id', 'uuid', 'name'].filter(key => keys.includes(key));
          
          if (potentialIdFields.length > 0) {
            const idField = potentialIdFields[0];
            uniqueKeys.push(idField);
            
            jsonData.forEach(item => {
              const id = item[idField];
              if (id && uniqueCheck[id]) {
                duplicates++;
              } else if (id) {
                uniqueCheck[id] = true;
              }
            });
            
            if (duplicates > 0) {
              analysisHTML += `
                <div style="padding: 10px; background-color: #f8d7da; border-radius: 5px; margin-bottom: 15px;">
                  <strong>Warning:</strong> Found ${duplicates} duplicate items based on "${idField}" field.
                </div>
              `;
            } else {
              analysisHTML += `
                <div style="padding: 10px; background-color: #d4edda; border-radius: 5px; margin-bottom: 15px;">
                  <strong>Good:</strong> No duplicate items found based on "${idField}" field.
                </div>
              `;
            }
          }
          
          // Calculate array size stats
          const totalArraySize = new Blob([value]).size;
          const avgItemSize = totalArraySize / jsonData.length;
          
          analysisHTML += `
            <h3>Size Analysis</h3>
            <div style="margin-bottom: 15px;">
              <div><strong>Total size:</strong> ${formatSize(totalArraySize)}</div>
              <div><strong>Average item size:</strong> ${formatSize(avgItemSize)}</div>
            </div>
          `;
          
          // Check if dates exist
          const dateFields = keys.filter(key => 
            key.toLowerCase().includes('date') || 
            key.toLowerCase().includes('time') || 
            key === 'createdAt' || 
            key === 'updatedAt'
          );
          
          if (dateFields.length > 0) {
            const dateField = dateFields[0];
            let oldestDate = new Date();
            let newestDate = new Date(0);
            
            jsonData.forEach(item => {
              const dateValue = item[dateField];
              if (dateValue) {
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) {
                  if (date < oldestDate) oldestDate = date;
                  if (date > newestDate) newestDate = date;
                }
              }
            });
            
            if (oldestDate.getTime() !== new Date().getTime() && newestDate.getTime() !== new Date(0).getTime()) {
              analysisHTML += `
                <h3>Date Range</h3>
                <div style="margin-bottom: 15px;">
                  <div><strong>Date field:</strong> ${dateField}</div>
                  <div><strong>Oldest:</strong> ${formatDate(oldestDate)}</div>
                  <div><strong>Newest:</strong> ${formatDate(newestDate)}</div>
                </div>
              `;
            }
          }
        }
      }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
      const keys = Object.keys(jsonData);
      
      analysisHTML += `
        <div style="padding: 10px; background-color: #e8f4fe; border-radius: 5px; margin-bottom: 15px;">
          <div><strong>Type:</strong> Object</div>
          <div><strong>Properties:</strong> ${keys.length} keys</div>
        </div>
      `;
      
      if (keys.length === 0) {
        analysisHTML += `
          <div style="padding: 10px; background-color: #fff3cd; border-radius: 5px; margin-bottom: 15px;">
            <strong>Note:</strong> This object is empty. It may be safe to remove it.
          </div>
        `;
      } else {
        // Show object structure
        analysisHTML += `
          <h3>Object Structure</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #dee2e6;">Key</th>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #dee2e6;">Type</th>
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #dee2e6;">Sample</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        keys.forEach(key => {
          const value = jsonData[key];
          const type = typeof value;
          let sample = '';
          
          if (type === 'object') {
            if (value === null) {
              sample = 'null';
            } else if (Array.isArray(value)) {
              sample = `Array(${value.length})`;
            } else {
              sample = `Object with ${Object.keys(value).length} keys`;
            }
          } else if (type === 'string') {
            sample = value.length > 50 ? value.substring(0, 50) + '...' : value;
          } else {
            sample = String(value);
          }
          
          analysisHTML += `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${key}</td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${type}</td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${sample}</td>
            </tr>
          `;
        });
        
        analysisHTML += `
            </tbody>
          </table>
        `;
      }
    } else {
      // Primitive value
      analysisHTML += `
        <div style="padding: 10px; background-color: #e8f4fe; border-radius: 5px; margin-bottom: 15px;">
          <div><strong>Type:</strong> ${typeof jsonData}</div>
          <div><strong>Value:</strong> ${jsonData}</div>
        </div>
      `;
    }
    
    // Add recommendations
    analysisHTML += `
      <h3>Recommendations</h3>
      <div id="recommendations" style="margin-bottom: 15px;"></div>
    `;
    
    // Add actions
    analysisHTML += `
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button id="btn-back-to-view" style="background-color: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Back</button>
        ${Array.isArray(jsonData) && jsonData.length > 100 ? 
          `<button id="btn-compress" style="background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Compress Data</button>` 
          : ''
        }
      </div>
    `;
    
    storageContent.innerHTML = analysisHTML;
    
    // Add recommendations based on data type
    const recommendationsContainer = document.getElementById('recommendations');
    const recommendations = [];
    
    if (Array.isArray(jsonData)) {
      if (jsonData.length === 0) {
        recommendations.push('Consider removing this empty array to save storage space.');
      } else if (jsonData.length > 1000) {
        recommendations.push(`This array is large (${jsonData.length} items). Consider limiting it to the most recent items only.`);
      }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
      if (Object.keys(jsonData).length === 0) {
        recommendations.push('Consider removing this empty object to save storage space.');
      }
    }
    
    // Add general recommendations
    const size = new Blob([value]).size;
    if (size > 1000000) { // 1MB
      recommendations.push(`This item is very large (${formatSize(size)}). Consider compressing or archiving older data.`);
    }
    
    if (recommendations.length === 0) {
      recommendationsContainer.innerHTML = '<div style="color: #28a745;">No issues found with this data.</div>';
    } else {
      recommendationsContainer.innerHTML = `
        <ul style="padding-left: 20px;">
          ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      `;
    }
    
    // Add event listeners
    document.getElementById('btn-back-to-view').addEventListener('click', () => {
      viewStorageItem(key);
    });
    
    if (Array.isArray(jsonData) && jsonData.length > 100) {
      document.getElementById('btn-compress').addEventListener('click', () => {
        compressStorageItem(key);
      });
    }
    
  } catch (e) {
    // This shouldn't happen since we already checked isValidJSON
    console.error('Error analyzing JSON:', e);
  }
}

// Compress a large storage item
function compressStorageItem(key) {
  const value = localStorage.getItem(key);
  if (!value) return;
  
  try {
    const data = JSON.parse(value);
    
    // Different compression strategies based on data type
    if (Array.isArray(data)) {
      const compressionOptions = document.createElement('div');
      compressionOptions.innerHTML = `
        <div style="padding: 15px; background-color: #f8f9fa; border-radius: 5px; margin-bottom: 15px;">
          <h3 style="margin-top: 0;">Compress Array Data</h3>
          <p>Select a compression strategy:</p>
          
          <div style="margin-bottom: 10px;">
            <input type="radio" id="option-limit" name="compression-option" value="limit" checked>
            <label for="option-limit">Limit to most recent items</label>
            <div style="margin: 5px 0 5px 25px;">
              <label for="limit-count">Number of items to keep:</label>
              <input type="number" id="limit-count" value="${Math.min(data.length, 100)}" min="1" max="${data.length}" style="width: 80px; padding: 5px;">
            </div>
          </div>
          
          ${key.includes('transaction') || key.includes('TRANSACTIONS') ? `
          <div style="margin-bottom: 10px;">
            <input type="radio" id="option-date" name="compression-option" value="date">
            <label for="option-date">Keep items after date</label>
            <div style="margin: 5px 0 5px 25px;">
              <label for="date-filter">Minimum date:</label>
              <input type="date" id="date-filter" value="${new Date().toISOString().split('T')[0]}" style="padding: 5px;">
            </div>
            <div style="margin: 5px 0 5px 25px;">
              <label for="date-field">Date field:</label>
              <select id="date-field" style="padding: 5px;">
                <option value="timestamp">timestamp</option>
                <option value="date">date</option>
                <option value="createdAt">createdAt</option>
                <option value="updatedAt">updatedAt</option>
                <option value="transactionDate">transactionDate</option>
              </select>
            </div>
          </div>
          ` : ''}
          
          <div style="margin-bottom: 10px;">
            <input type="radio" id="option-export" name="compression-option" value="export">
            <label for="option-export">Export before compression</label>
          </div>
          
          <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button id="btn-apply-compression" style="background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Apply Compression</button>
            <button id="btn-cancel-compression" style="background-color: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Cancel</button>
          </div>
        </div>
      `;
      
      document.getElementById('storage-content').innerHTML = '';
      document.getElementById('storage-content').appendChild(compressionOptions);
      
      // Add event listeners
      document.getElementById('btn-cancel-compression').addEventListener('click', () => {
        viewStorageItem(key);
      });
      
      document.getElementById('btn-apply-compression').addEventListener('click', () => {
        const option = document.querySelector('input[name="compression-option"]:checked').value;
        
        // Export if selected
        if (option === 'export' || document.getElementById('option-export').checked) {
          const blob = new Blob([value], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${key}_export_${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        
        let compressedData = [...data]; // Create a copy
        
        if (option === 'limit') {
          const limitCount = parseInt(document.getElementById('limit-count').value);
          if (!isNaN(limitCount) && limitCount > 0) {
            compressedData = data.slice(-limitCount); // Keep the most recent N items
          }
        } else if (option === 'date' && document.getElementById('option-date')) {
          const dateField = document.getElementById('date-field').value;
          const dateFilter = document.getElementById('date-filter').value;
          const filterDate = new Date(dateFilter);
          
          if (!isNaN(filterDate.getTime())) {
            compressedData = data.filter(item => {
              if (item && item[dateField]) {
                const itemDate = new Date(item[dateField]);
                return !isNaN(itemDate.getTime()) && itemDate >= filterDate;
              }
              return false;
            });
          }
        }
        
        // Save the compressed data
        const beforeSize = new Blob([value]).size;
        const afterSize = new Blob([JSON.stringify(compressedData)]).size;
        const savedBytes = beforeSize - afterSize;
        const savedPercentage = Math.round((savedBytes / beforeSize) * 100);
        
        localStorage.setItem(key, JSON.stringify(compressedData));
        
        document.getElementById('storage-content').innerHTML = `
          <h2 style="margin-top: 0;">Compression Results</h2>
          <div style="padding: 15px; background-color: #d4edda; border-radius: 5px; margin-bottom: 15px;">
            <div><strong>Compression successful!</strong></div>
            <div style="margin-top: 10px;"><strong>Items before:</strong> ${data.length}</div>
            <div><strong>Items after:</strong> ${compressedData.length}</div>
            <div style="margin-top: 10px;"><strong>Size before:</strong> ${formatSize(beforeSize)}</div>
            <div><strong>Size after:</strong> ${formatSize(afterSize)}</div>
            <div><strong>Space saved:</strong> ${formatSize(savedBytes)} (${savedPercentage}%)</div>
          </div>
          
          <button id="btn-back-to-view" style="background-color: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">View Item</button>
        `;
        
        document.getElementById('btn-back-to-view').addEventListener('click', () => {
          viewStorageItem(key);
        });
        
        refreshStorage();
      });
    } else {
      // For non-array data, just show information
      document.getElementById('storage-content').innerHTML = `
        <div style="padding: 15px; background-color: #f8f9fa; border-radius: 5px; margin-bottom: 15px;">
          <h3 style="margin-top: 0;">Compression Not Available</h3>
          <p>Compression is only available for array data.</p>
          
          <button id="btn-back-to-view" style="background-color: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-top: 10px;">Back</button>
        </div>
      `;
      
      document.getElementById('btn-back-to-view').addEventListener('click', () => {
        viewStorageItem(key);
      });
    }
  } catch (e) {
    console.error('Error compressing item:', e);
    alert('Error compressing item: ' + e.message);
  }
}

// Clean up storage
function cleanStorage() {
  const storageContent = document.getElementById('storage-content');
  
  // Create options for cleaning
  storageContent.innerHTML = `
    <h2 style="margin-top: 0;">Clean Storage</h2>
    <div style="padding: 15px; background-color: #f8f9fa; border-radius: 5px; margin-bottom: 15px;">
      <p>Select options for cleaning localStorage:</p>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 10px 0;">Inventory Data</h3>
        <div style="margin-bottom: 5px;">
          <input type="checkbox" id="clean-legacy-inventory" checked>
          <label for="clean-legacy-inventory">Clean legacy inventory (pos_inventory_v3)</label>
        </div>
        <div style="margin-bottom: 5px;">
          <input type="checkbox" id="clean-empty-inventory">
          <label for="clean-empty-inventory">Remove empty inventory arrays</label>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 10px 0;">Transaction Data</h3>
        <div style="margin-bottom: 5px;">
          <input type="checkbox" id="clean-old-transactions">
          <label for="clean-old-transactions">Limit transaction history</label>
        </div>
        <div style="margin-left: 25px;">
          <label for="transaction-limit">Keep last:</label>
          <input type="number" id="transaction-limit" value="100" min="1" style="width: 80px; padding: 5px;">
          <label for="transaction-limit">transactions</label>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 10px 0;">Other Data</h3>
        <div style="margin-bottom: 5px;">
          <input type="checkbox" id="clean-empty-objects">
          <label for="clean-empty-objects">Remove empty objects and arrays</label>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <button id="btn-run-clean" style="background-color: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Clean Storage</button>
        <button id="btn-cancel-clean" style="background-color: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-left: 10px;">Cancel</button>
      </div>
    </div>
  `;
  
  // Add event listeners
  document.getElementById('btn-cancel-clean').addEventListener('click', () => {
    storageContent.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 50px 0;">Select a storage item to view its content</div>';
  });
  
  document.getElementById('btn-run-clean').addEventListener('click', () => {
    const cleanLegacyInventory = document.getElementById('clean-legacy-inventory').checked;
    const cleanEmptyInventory = document.getElementById('clean-empty-inventory').checked;
    const cleanOldTransactions = document.getElementById('clean-old-transactions').checked;
    const transactionLimit = parseInt(document.getElementById('transaction-limit').value);
    const cleanEmptyObjects = document.getElementById('clean-empty-objects').checked;
    
    // Confirm before proceeding
    if (!confirm('Are you sure you want to clean the storage? This operation cannot be undone.')) {
      return;
    }
    
    // Keep track of changes
    const changes = [];
    
    // Clean legacy inventory
    if (cleanLegacyInventory) {
      try {
        const legacyInventory = localStorage.getItem(POS_KEYS.INVENTORY_LEGACY);
        if (legacyInventory) {
          localStorage.removeItem(POS_KEYS.INVENTORY_LEGACY);
          changes.push(`Removed legacy inventory data (${formatSize(new Blob([legacyInventory]).size)})`);
        }
      } catch (e) {
        console.error('Error cleaning legacy inventory:', e);
      }
    }
    
    // Clean empty inventory arrays
    if (cleanEmptyInventory) {
      [POS_KEYS.INVENTORY, POS_KEYS.INVENTORY_PRODUCTS].forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const data = JSON.parse(value);
            if (Array.isArray(data) && data.length === 0) {
              localStorage.removeItem(key);
              changes.push(`Removed empty inventory array (${key})`);
            }
          }
        } catch (e) {
          console.error(`Error cleaning empty inventory (${key}):`, e);
        }
      });
    }
    
    // Clean old transactions
    if (cleanOldTransactions && !isNaN(transactionLimit) && transactionLimit > 0) {
      try {
        const value = localStorage.getItem(POS_KEYS.TRANSACTIONS);
        if (value) {
          const data = JSON.parse(value);
          if (Array.isArray(data) && data.length > transactionLimit) {
            const beforeSize = new Blob([value]).size;
            const trimmedData = data.slice(-transactionLimit); // Keep only the most recent N
            localStorage.setItem(POS_KEYS.TRANSACTIONS, JSON.stringify(trimmedData));
            const afterSize = new Blob([JSON.stringify(trimmedData)]).size;
            changes.push(`Limited transactions from ${data.length} to ${trimmedData.length} (saved ${formatSize(beforeSize - afterSize)})`);
          }
        }
      } catch (e) {
        console.error('Error cleaning old transactions:', e);
      }
    }
    
    // Clean empty objects and arrays
    if (cleanEmptyObjects) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const data = JSON.parse(value);
            
            if ((Array.isArray(data) && data.length === 0) || 
                (typeof data === 'object' && data !== null && Object.keys(data).length === 0)) {
              localStorage.removeItem(key);
              changes.push(`Removed empty ${Array.isArray(data) ? 'array' : 'object'} (${key})`);
              i--; // Adjust index after removal
            }
          }
        } catch (e) {
          // Not JSON data or other error, skip
        }
      }
    }
    
    // Show results
    refreshStorage();
    
    storageContent.innerHTML = `
      <h2 style="margin-top: 0;">Cleaning Results</h2>
      <div style="padding: 15px; background-color: ${changes.length > 0 ? '#d4edda' : '#fff3cd'}; border-radius: 5px; margin-bottom: 15px;">
        ${changes.length > 0 ? 
          `<div style="margin-bottom: 10px;"><strong>Successfully cleaned storage:</strong></div>
           <ul style="padding-left: 20px;">
             ${changes.map(change => `<li>${change}</li>`).join('')}
           </ul>` : 
          '<div>No items were cleaned based on your criteria.</div>'
        }
      </div>
      
      <button id="btn-back-to-main" style="background-color: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Back</button>
    `;
    
    document.getElementById('btn-back-to-main').addEventListener('click', () => {
      storageContent.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 50px 0;">Select a storage item to view its content</div>';
    });
  });
}

// Show the traditional console view
function showConsoleView() {
  console.log('🔍 DEBUGGING LOCALSTORAGE CONTENTS...');
  console.log('='.repeat(60));

  if (localStorage.length === 0) {
    console.log('❌ localStorage is empty');
  } else {
    console.log(`📦 Found ${localStorage.length} items in localStorage:`);
    console.log('');
    
    // List all keys
    Object.keys(localStorage).forEach((key, index) => {
      try {
        const value = localStorage.getItem(key);
        let parsedValue;
        const size = new Blob([value]).size;
        
        try {
          parsedValue = JSON.parse(value);
          if (Array.isArray(parsedValue)) {
            console.log(`${index + 1}. "${key}" -> Array with ${parsedValue.length} items (${formatSize(size)})`);
            if (parsedValue.length > 0) {
              console.log(`   First item:`, parsedValue[0]);
            }
          } else if (typeof parsedValue === 'object') {
            console.log(`${index + 1}. "${key}" -> Object with keys: ${Object.keys(parsedValue)} (${formatSize(size)})`);
          } else {
            console.log(`${index + 1}. "${key}" -> ${typeof parsedValue}: ${parsedValue} (${formatSize(size)})`);
          }
        } catch (parseError) {
          console.log(`${index + 1}. "${key}" -> String (${value.length} chars, ${formatSize(size)}):`, value.substring(0, 100));
        }
      } catch (error) {
        console.log(`${index + 1}. "${key}" -> Error reading:`, error.message);
      }
      console.log('');
    });
  }

  console.log('='.repeat(60));
  console.log('🎯 POS KEY SUMMARY:');
  console.log('');

  Object.entries(POS_KEYS).forEach(([keyName, key]) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        const size = new Blob([value]).size;
        const parsed = JSON.parse(value);
        console.log(`✅ "${key}" (${keyName}) -> Found: ${Array.isArray(parsed) ? `Array with ${parsed.length} items` : typeof parsed} (${formatSize(size)})`);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`   Sample item:`, parsed[0]);
        }
      } catch (error) {
        console.log(`✅ "${key}" (${keyName}) -> Raw data (${value.length} chars)`);
      }
    } else {
      console.log(`❌ "${key}" (${keyName}) -> Not found`);
    }
  });

  console.log('');
  console.log('='.repeat(60));
  
  alert('Storage information has been logged to the console. Press F12 to view it.');
}

// Main function to initialize the debug tool
function initDebugStorage() {
  createDebugUI();
  refreshStorage();
}

// Auto-execute when script is loaded
initDebugStorage();