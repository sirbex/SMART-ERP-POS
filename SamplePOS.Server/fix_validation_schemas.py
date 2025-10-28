#!/usr/bin/env python3
"""
Fix validation schemas to accept CUID instead of UUID
"""

import os
import re

base_dir = r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"
files_to_fix = [
    os.path.join(base_dir, "src", "validation", "purchaseOrder.ts"),
    os.path.join(base_dir, "src", "validation", "goodsReceipt.ts"),
    os.path.join(base_dir, "src", "validation", "stockMovement.ts"),
]

def fix_file(filepath):
    """Replace .uuid() with .cuid() in validation schemas"""
    print(f"\n🔧 Fixing: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = 0
    
    # Pattern: .uuid('...') -> .cuid('...')
    pattern = r"\.uuid\('([^']+)'\)"
    matches = re.findall(pattern, content)
    
    if matches:
        for match in matches:
            old = f".uuid('{match}')"
            new = f".cuid('{match.replace('UUID', 'CUID')}')"
            content = content.replace(old, new)
            replacements += 1
        
        print(f"   ✓ Fixed {replacements} .uuid() -> .cuid()")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   ✅ Total: {replacements} replacements")
    else:
        print(f"   ℹ️  No .uuid() calls found")
    
    return replacements

def main():
    print("=" * 60)
    print("  FIXING VALIDATION SCHEMAS: UUID → CUID")
    print("=" * 60)
    print("\nPrisma uses CUID by default, not UUID")
    print("Updating Zod validation schemas...")
    
    total = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            total += fix_file(filepath)
        else:
            print(f"\n❌ Not found: {filepath}")
    
    print("\n" + "=" * 60)
    print(f"  COMPLETE - {total} validations updated")
    print("=" * 60)

if __name__ == "__main__":
    main()
