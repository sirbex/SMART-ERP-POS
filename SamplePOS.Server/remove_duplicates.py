#!/usr/bin/env python3
"""
Remove duplicate barcode: true lines
"""

import os
import re

base_dir = r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"
files_to_fix = [
    os.path.join(base_dir, "src", "modules", "purchaseOrders.ts"),
    os.path.join(base_dir, "src", "modules", "goodsReceipts.ts"),
    os.path.join(base_dir, "src", "modules", "inventoryBatches.ts"),
    os.path.join(base_dir, "src", "modules", "stockMovements.ts"),
]

def fix_file(filepath):
    """Remove consecutive duplicate barcode: true lines"""
    print(f"\n🔧 Fixing: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Remove consecutive duplicate "barcode: true," lines
    cleaned_lines = []
    prev_line = None
    duplicates_removed = 0
    
    for line in lines:
        # Check if this line and previous line are both "barcode: true"
        if 'barcode: true' in line and prev_line and 'barcode: true' in prev_line:
            duplicates_removed += 1
            # Skip this duplicate line
            continue
        cleaned_lines.append(line)
        prev_line = line
    
    if duplicates_removed > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(cleaned_lines)
        print(f"   ✅ Removed {duplicates_removed} duplicate barcode: true lines")
    else:
        print(f"   ℹ️  No duplicates found")
    
    return duplicates_removed

def main():
    print("=" * 60)
    print("  REMOVING DUPLICATE BARCODE: TRUE LINES")
    print("=" * 60)
    
    total = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            total += fix_file(filepath)
    
    print("\n" + "=" * 60)
    print(f"  COMPLETE - {total} duplicates removed")
    print("=" * 60)

if __name__ == "__main__":
    main()
