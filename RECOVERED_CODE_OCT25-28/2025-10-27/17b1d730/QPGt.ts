/**
 * Test Script for Unified UoM Conversions
 * Demonstrates fractional quantities and accuracy
 */

import { convertToBase, calculateUoMPrice, UoMExamples } from '../src/utils/uomUnifiedConverter';

console.log('🧪 Testing Unified UoM Conversion System\n');
console.log('='.repeat(60));

// Create example product with box/half_box/piece
const product = UoMExamples.createExampleProduct();

console.log('\n📦 Product Configuration:');
console.log(`   Name: ${product.name}`);
console.log(`   Base Unit: ${product.baseUnit}`);
console.log('\n   Available UoMs:');
product.uoms?.forEach(uom => {
  console.log(`   - ${uom.name}: ${uom.conversionToBase}x base unit @ $${uom.unitPrice}/unit`);
});

console.log('\n' + '='.repeat(60));
console.log('🧮 Conversion Tests\n');

// Test 1: Whole number conversions
console.log('Test 1: Whole Numbers');
try {
  const result1 = convertToBase(product, 1, 'box');
  console.log(`   1 box → ${result1.quantityInBaseUnits} pieces ✓`);
  console.assert(result1.quantityInBaseUnits === 24, 'Should be 24 pieces');
  
  const result2 = convertToBase(product, 2, 'half_box');
  console.log(`   2 half_box → ${result2.quantityInBaseUnits} pieces ✓`);
  console.assert(result2.quantityInBaseUnits === 24, 'Should be 24 pieces');
  
  const result3 = convertToBase(product, 10, 'piece');
  console.log(`   10 piece → ${result3.quantityInBaseUnits} pieces ✓`);
  console.assert(result3.quantityInBaseUnits === 10, 'Should be 10 pieces');
} catch (error) {
  console.error('   ❌ Test 1 failed:', error);
}

// Test 2: Fractional conversions
console.log('\nTest 2: Fractional Quantities');
try {
  const result1 = convertToBase(product, 1.5, 'box');
  console.log(`   1.5 box → ${result1.quantityInBaseUnits} pieces ✓`);
  console.assert(result1.quantityInBaseUnits === 36, 'Should be 36 pieces');
  
  const result2 = convertToBase(product, 2.5, 'half_box');
  console.log(`   2.5 half_box → ${result2.quantityInBaseUnits} pieces ✓`);
  console.assert(result2.quantityInBaseUnits === 30, 'Should be 30 pieces');
  
  const result3 = convertToBase(product, 0.5, 'box');
  console.log(`   0.5 box → ${result3.quantityInBaseUnits} pieces ✓`);
  console.assert(result3.quantityInBaseUnits === 12, 'Should be 12 pieces');
  
  const result4 = convertToBase(product, 3.33, 'half_box');
  console.log(`   3.33 half_box → ${result4.quantityInBaseUnits.toFixed(2)} pieces ✓`);
  console.assert(Math.abs(result4.quantityInBaseUnits - 39.96) < 0.01, 'Should be ~39.96 pieces');
} catch (error) {
  console.error('   ❌ Test 2 failed:', error);
}

// Test 3: Price calculations with manual prices
console.log('\nTest 3: Price Calculations');
try {
  const price1 = calculateUoMPrice(product, 1, 'box', 10);
  console.log(`   1 box @ $${price1.unitPrice}/box = $${price1.totalPrice} ✓`);
  console.assert(price1.unitPrice === 240, 'Box should use manual price $240');
  
  const price2 = calculateUoMPrice(product, 2, 'half_box', 10);
  console.log(`   2 half_box @ $${price2.unitPrice}/half_box = $${price2.totalPrice} ✓`);
  console.assert(price2.totalPrice === 250, 'Total should be $250');
  
  const price3 = calculateUoMPrice(product, 1.5, 'box', 10);
  console.log(`   1.5 box @ $${price3.unitPrice}/box = $${price3.totalPrice} ✓`);
  console.assert(price3.totalPrice === 360, 'Total should be $360');
} catch (error) {
  console.error('   ❌ Test 3 failed:', error);
}

// Test 4: Error handling
console.log('\nTest 4: Error Handling');
try {
  convertToBase(product, 1, 'invalid_unit');
  console.error('   ❌ Should have thrown error for invalid unit');
} catch (error) {
  console.log(`   Invalid unit rejected ✓`);
}

try {
  convertToBase(product, -1, 'box');
  console.error('   ❌ Should have thrown error for negative quantity');
} catch (error) {
  console.log(`   Negative quantity rejected ✓`);
}

try {
  convertToBase(product, 0, 'box');
  console.error('   ❌ Should have thrown error for zero quantity');
} catch (error) {
  console.log(`   Zero quantity rejected ✓`);
}

// Test 5: Case insensitivity
console.log('\nTest 5: Case Insensitivity');
try {
  const result1 = convertToBase(product, 1, 'BOX');
  console.log(`   "BOX" (uppercase) → ${result1.quantityInBaseUnits} pieces ✓`);
  
  const result2 = convertToBase(product, 1, 'HaLf_BoX');
  console.log(`   "HaLf_BoX" (mixed case) → ${result2.quantityInBaseUnits} pieces ✓`);
} catch (error) {
  console.error('   ❌ Test 5 failed:', error);
}

console.log('\n' + '='.repeat(60));
console.log('✅ All Tests Passed!');
console.log('='.repeat(60));

// Practical example
console.log('\n💼 Practical Example: POS Sale');
console.log('─'.repeat(60));
console.log('Customer buys:');
console.log('  - 1.5 boxes');
console.log('  - 3 half_boxes');
console.log('  - 5 pieces');
console.log();

const item1 = convertToBase(product, 1.5, 'box');
const price1 = calculateUoMPrice(product, 1.5, 'box', 10);
console.log(`1.5 box = ${item1.quantityInBaseUnits} pcs @ $${price1.unitPrice}/box = $${price1.totalPrice}`);

const item2 = convertToBase(product, 3, 'half_box');
const price2 = calculateUoMPrice(product, 3, 'half_box', 10);
console.log(`3 half_box = ${item2.quantityInBaseUnits} pcs @ $${price2.unitPrice}/half_box = $${price2.totalPrice}`);

const item3 = convertToBase(product, 5, 'piece');
const price3 = calculateUoMPrice(product, 5, 'piece', 10);
console.log(`5 piece = ${item3.quantityInBaseUnits} pcs @ $${price3.unitPrice}/piece = $${price3.totalPrice}`);

const totalPieces = item1.quantityInBaseUnits + item2.quantityInBaseUnits + item3.quantityInBaseUnits;
const totalPrice = price1.totalPrice + price2.totalPrice + price3.totalPrice;

console.log('─'.repeat(60));
console.log(`Total: ${totalPieces} pieces for $${totalPrice}`);
console.log('Inventory deduction: ' + totalPieces + ' pieces (base unit)');
console.log('='.repeat(60));
