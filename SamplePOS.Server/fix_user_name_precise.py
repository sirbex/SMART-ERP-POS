#!/usr/bin/env python3
"""
Fix ONLY User.name -> User.fullName in createdBy/receivedBy/performedBy contexts
DO NOT change Product.name or Supplier.name
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
    """Fix User.name references ONLY"""
    print(f"\n🔧 Fixing: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    replacements = 0
    
    # Pattern: Find "createdBy: { select: { id: true, name: true" and replace name with fullName
    pattern1 = r'(createdBy:\s*\{\s*select:\s*\{[^}]*?id:\s*true,\s*)name(\s*:\s*true)'
    matches = re.findall(pattern1, content, re.DOTALL)
    if matches:
        content, count = re.subn(pattern1, r'\1fullName\2', content, flags=re.DOTALL)
        replacements += count
        print(f"   ✓ Fixed {count} createdBy select {{... name: true}} -> fullName")
    
    # Pattern: receivedBy
    pattern2 = r'(receivedBy:\s*\{\s*select:\s*\{[^}]*?id:\s*true,\s*)name(\s*:\s*true)'
    matches = re.findall(pattern2, content, re.DOTALL)
    if matches:
        content, count = re.subn(pattern2, r'\1fullName\2', content, flags=re.DOTALL)
        replacements += count
        print(f"   ✓ Fixed {count} receivedBy select {{... name: true}} -> fullName")
    
    # Pattern: performedBy
    pattern3 = r'(performedBy:\s*\{\s*select:\s*\{[^}]*?id:\s*true,\s*)name(\s*:\s*true)'
    matches = re.findall(pattern3, content, re.DOTALL)
    if matches:
        content, count = re.subn(pattern3, r'\1fullName\2', content, flags=re.DOTALL)
        replacements += count
        print(f"   ✓ Fixed {count} performedBy select {{... name: true}} -> fullName")
    
    if replacements > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} User.name -> User.fullName")
    else:
        print(f"   ℹ️  No User.name fields to fix")
    
    return replacements

def main():
    print("=" * 70)
    print("  FIXING USER.NAME -> USER.FULLNAME (ONLY IN USER CONTEXTS)")
    print("=" * 70)
    print("\n📝 Note: Product.name and Supplier.name will NOT be changed")
    
    total = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            total += fix_file(filepath)
    
    print("\n" + "=" * 70)
    print(f"  COMPLETE - {total} User.name fields fixed")
    print("=" * 70)

if __name__ == "__main__":
    main()
