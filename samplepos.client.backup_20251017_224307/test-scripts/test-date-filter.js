// Test date filtering behavior for dashboard
console.log('=== Dashboard Date Filter Test ===');

// Simulate the current date and transaction dates
const currentDate = new Date();
console.log('Current date:', currentDate.toDateString());

// Test transaction with today's timestamp
const todayTimestamp = "2025-10-05T20:23:11.991Z";
const todayDate = new Date(todayTimestamp);
console.log('Today transaction date:', todayDate.toDateString());
console.log('Is same day as current:', todayDate.toDateString() === currentDate.toDateString());

// Test yesterday filtering
const yesterdayDate = new Date(currentDate);
yesterdayDate.setDate(currentDate.getDate() - 1);
console.log('Yesterday date string:', yesterdayDate.toDateString());

// Test transaction from yesterday (simulate)
const yesterdayTimestamp = "2025-10-04T20:23:11.991Z";
const testYesterdayDate = new Date(yesterdayTimestamp);
console.log('Yesterday transaction would be:', testYesterdayDate.toDateString());
console.log('Matches yesterday filter:', testYesterdayDate.toDateString() === yesterdayDate.toDateString());

console.log('');
console.log('=== Expected Behavior ===');
console.log('- When "Today" filter selected: Show all current transactions (6 transactions)');
console.log('- When "Yesterday" filter selected: Show 0 transactions (no transactions from yesterday)');
console.log('- Recent Transactions section: Should respect the selected date filter');
console.log('- If no transactions for selected period: Show "No transactions found" message');