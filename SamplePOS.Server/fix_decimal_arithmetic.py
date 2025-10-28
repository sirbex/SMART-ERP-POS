#!/usr/bin/env python3
"""
Fix Decimal arithmetic - convert + and += to Decimal methods
"""

import os
import re

base_dir = r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"

def fix_inventory_batches():
    """Fix inventoryBatches.ts Decimal issues"""
    filepath = os.path.join(base_dir, "src", "modules", "inventoryBatches.ts")
    print(f"\n🔧 Fixing: inventoryBatches.ts")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = 0
    
    # Line 180: return sum + batch.quantity; -> return sum.plus(batch.quantity);
    if "return sum + batch.quantity;" in content:
        content = content.replace(
            "return sum + batch.quantity;",
            "return new Decimal(sum).plus(batch.quantity);"
        )
        replacements += 1
        print("   ✓ Fixed line 180: sum + batch.quantity")
    
    # Line 184: return sum + batch.remainingQuantity; -> return sum.plus(batch.remainingQuantity);
    if "return sum + batch.remainingQuantity;" in content:
        content = content.replace(
            "return sum + batch.remainingQuantity;",
            "return new Decimal(sum).plus(batch.remainingQuantity);"
        )
        replacements += 1
        print("   ✓ Fixed line 184: sum + batch.remainingQuantity")
    
    # Line 267-268: Utilization rate calculation
    pattern1 = r'utilizationRate: batch\.quantity > 0\s+\?\s+\(\(batch\.quantity - batch\.remainingQuantity\) / batch\.quantity \* 100\)\.toFixed\(2\)'
    replacement1 = """utilizationRate: new Decimal(batch.quantity).greaterThan(0)
          ? new Decimal(batch.quantity).minus(batch.remainingQuantity)
              .dividedBy(batch.quantity).times(100).toFixed(2)"""
    if re.search(pattern1, content, re.DOTALL):
        content = re.sub(pattern1, replacement1, content, flags=re.DOTALL)
        replacements += 1
        print("   ✓ Fixed line 267-268: utilizationRate calculation")
    
    # Line 422: batches.reduce((sum, b) => sum + b.remainingQuantity, 0)
    if "batches.reduce((sum, b) => sum + b.remainingQuantity, 0)" in content:
        content = content.replace(
            "batches.reduce((sum, b) => sum + b.remainingQuantity, 0)",
            "batches.reduce((sum, b) => new Decimal(sum).plus(b.remainingQuantity), new Decimal(0)).toNumber()"
        )
        replacements += 1
        print("   ✓ Fixed line 422: reduce with remainingQuantity")
    
    if replacements > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} fixes")
    
    return replacements

def fix_stock_movements():
    """Fix stockMovements.ts Decimal issues"""
    filepath = os.path.join(base_dir, "src", "modules", "stockMovements.ts")
    print(f"\n🔧 Fixing: stockMovements.ts")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = 0
    
    # Line 200: summary.totalIn += movement.quantity;
    if "summary.totalIn += movement.quantity;" in content:
        content = content.replace(
            "summary.totalIn += movement.quantity;",
            "summary.totalIn = new Decimal(summary.totalIn).plus(movement.quantity).toNumber();"
        )
        replacements += 1
        print("   ✓ Fixed line 200: totalIn += movement.quantity")
    
    # Line 202: summary.totalOut += movement.quantity;
    if "summary.totalOut += movement.quantity;" in content:
        content = content.replace(
            "summary.totalOut += movement.quantity;",
            "summary.totalOut = new Decimal(summary.totalOut).plus(movement.quantity).toNumber();"
        )
        replacements += 1
        print("   ✓ Fixed line 202: totalOut += movement.quantity")
    
    if replacements > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} fixes")
    
    return replacements

def fix_fefo_logic():
    """Fix fefoLogic.ts Decimal issues"""
    filepath = os.path.join(base_dir, "src", "utils", "fefoLogic.ts")
    print(f"\n🔧 Fixing: fefoLogic.ts")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = 0
    
    # Line 110: (sum, batch) => sum + batch.remainingQuantity
    if "(sum, batch) => sum + batch.remainingQuantity," in content:
        content = content.replace(
            "(sum, batch) => sum + batch.remainingQuantity,",
            "(sum, batch) => new Decimal(sum).plus(batch.remainingQuantity),"
        )
        replacements += 1
        print("   ✓ Fixed line 110: sum + batch.remainingQuantity")
    
    # Need to also change the initial value and final conversion
    pattern1 = r'reduce\(\s*\(sum, batch\) => new Decimal\(sum\)\.plus\(batch\.remainingQuantity\),\s*0\s*\)'
    if re.search(pattern1, content):
        content = re.sub(
            pattern1,
            'reduce((sum, batch) => new Decimal(sum).plus(batch.remainingQuantity), new Decimal(0)).toNumber()',
            content
        )
        replacements += 1
        print("   ✓ Fixed reduce initial value and conversion")
    
    # Line 134: costPrice: batch.costPrice -> costPrice: batch.costPrice.toNumber()
    # This is in BatchAllocation interface usage
    pattern2 = r'(\s+)costPrice: batch\.costPrice,'
    if re.search(pattern2, content):
        content = re.sub(pattern2, r'\1costPrice: new Decimal(batch.costPrice).toNumber(),', content)
        replacements += 1
        print("   ✓ Fixed line 134: costPrice conversion")
    
    # Line 263: batches.reduce((sum, b) => sum + b.quantity, 0)
    if "batches.reduce((sum, b) => sum + b.quantity, 0)" in content:
        content = content.replace(
            "batches.reduce((sum, b) => sum + b.quantity, 0)",
            "batches.reduce((sum, b) => new Decimal(sum).plus(b.quantity), new Decimal(0)).toNumber()"
        )
        replacements += 1
        print("   ✓ Fixed line 263: reduce quantity")
    
    # Line 264: batches.reduce((sum, b) => sum + b.remainingQuantity, 0)
    if "batches.reduce((sum, b) => sum + b.remainingQuantity, 0)" in content:
        content = content.replace(
            "batches.reduce((sum, b) => sum + b.remainingQuantity, 0)",
            "batches.reduce((sum, b) => new Decimal(sum).plus(b.remainingQuantity), new Decimal(0)).toNumber()"
        )
        replacements += 1
        print("   ✓ Fixed line 264: reduce remainingQuantity")
    
    if replacements > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} fixes")
    
    return replacements

def main():
    print("=" * 70)
    print("  FIXING DECIMAL ARITHMETIC OPERATIONS")
    print("=" * 70)
    print("\nConverting:")
    print("  • sum + decimal -> new Decimal(sum).plus(decimal)")
    print("  • sum += decimal -> sum = new Decimal(sum).plus(decimal).toNumber()")
    print("  • decimal > 0 -> new Decimal(decimal).greaterThan(0)")
    print("  • decimal / decimal -> dividedBy()")
    
    total = 0
    total += fix_inventory_batches()
    total += fix_stock_movements()
    total += fix_fefo_logic()
    
    print("\n" + "=" * 70)
    print(f"  COMPLETE - {total} Decimal arithmetic fixes")
    print("=" * 70)

if __name__ == "__main__":
    main()
