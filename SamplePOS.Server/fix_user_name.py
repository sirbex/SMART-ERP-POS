#!/usr/bin/env python3
"""
Fix User.name -> User.fullName in select statements
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
    """Fix User.name references"""
    print(f"\n🔧 Fixing: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    replacements = 0
    
    # Pattern 1: createdBy: { name: true } -> createdBy: { fullName: true }
    pattern1 = r'(createdBy:\s*\{\s*)name(\s*:\s*true)'
    if re.search(pattern1, content):
        content, count = re.subn(pattern1, r'\1fullName\2', content)
        replacements += count
        print(f"   ✓ Fixed {count} createdBy.name -> createdBy.fullName")
    
    # Pattern 2: receivedBy: { name: true } -> receivedBy: { fullName: true }
    pattern2 = r'(receivedBy:\s*\{\s*)name(\s*:\s*true)'
    if re.search(pattern2, content):
        content, count = re.subn(pattern2, r'\1fullName\2', content)
        replacements += count
        print(f"   ✓ Fixed {count} receivedBy.name -> receivedBy.fullName")
    
    # Pattern 3: performedBy: { name: true } -> performedBy: { fullName: true }
    pattern3 = r'(performedBy:\s*\{\s*)name(\s*:\s*true)'
    if re.search(pattern3, content):
        content, count = re.subn(pattern3, r'\1fullName\2', content)
        replacements += count
        print(f"   ✓ Fixed {count} performedBy.name -> performedBy.fullName")
    
    if replacements > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} replacements")
    else:
        print(f"   ℹ️  No changes needed")
    
    return replacements

def main():
    print("=" * 60)
    print("  FIXING USER.NAME -> USER.FULLNAME")
    print("=" * 60)
    
    total = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            total += fix_file(filepath)
    
    print("\n" + "=" * 60)
    print(f"  COMPLETE - {total} total replacements")
    print("=" * 60)

if __name__ == "__main__":
    main()
