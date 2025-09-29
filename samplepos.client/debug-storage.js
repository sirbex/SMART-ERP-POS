/**
 * Debug script to see what's actually in localStorage
 * Run this in browser console to see all stored keys and their data
 */

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
      
      try {
        parsedValue = JSON.parse(value);
        if (Array.isArray(parsedValue)) {
          console.log(`${index + 1}. "${key}" -> Array with ${parsedValue.length} items`);
          if (parsedValue.length > 0) {
            console.log(`   First item:`, parsedValue[0]);
          }
        } else if (typeof parsedValue === 'object') {
          console.log(`${index + 1}. "${key}" -> Object with keys:`, Object.keys(parsedValue));
        } else {
          console.log(`${index + 1}. "${key}" -> ${typeof parsedValue}:`, parsedValue);
        }
      } catch (parseError) {
        console.log(`${index + 1}. "${key}" -> String (${value.length} chars):`, value.substring(0, 100));
      }
    } catch (error) {
      console.log(`${index + 1}. "${key}" -> Error reading:`, error.message);
    }
    console.log('');
  });
}

console.log('='.repeat(60));
console.log('🎯 SPECIFIC KEYS THE DASHBOARD LOOKS FOR:');
console.log('');

const dashboardKeys = [
  'pos_transaction_history_v1',
  'pos_inventory_v1'
];

dashboardKeys.forEach(key => {
  const value = localStorage.getItem(key);
  if (value) {
    try {
      const parsed = JSON.parse(value);
      console.log(`✅ "${key}" -> Found:`, Array.isArray(parsed) ? `Array with ${parsed.length} items` : typeof parsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`   Sample item:`, parsed[0]);
      }
    } catch (error) {
      console.log(`✅ "${key}" -> Raw data (${value.length} chars)`);
    }
  } else {
    console.log(`❌ "${key}" -> Not found`);
  }
});

console.log('');
console.log('='.repeat(60));