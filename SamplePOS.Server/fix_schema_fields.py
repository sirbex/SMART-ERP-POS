#!/usr/bin/env python3
"""
Fix schema field references in module files to match the actual schema.
Changes:
- Product.sku -> Product.barcode
- User.name -> User.fullName
"""

import os

# File paths
base_dir = r"C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"
files_to_fix = [
    os.path.join(base_dir, "src", "modules", "purchaseOrders.ts"),
    os.path.join(base_dir, "src", "modules", "goodsReceipts.ts"),
    os.path.join(base_dir, "src", "modules", "inventoryBatches.ts"),
    os.path.join(base_dir, "src", "modules", "stockMovements.ts"),
]

def fix_file(filepath):
    """Fix field references in a single file"""
    print(f"\n🔧 Fixing: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    replacements = 0
    
    # Fix Product.sku -> Product.barcode in select statements
    if "sku: true" in content:
        count = content.count("sku: true")
        content = content.replace("sku: true", "barcode: true")
        replacements += count
        print(f"   ✓ Fixed {count} 'sku: true' -> 'barcode: true'")
    
    # Fix product.sku -> product.barcode in references
    if "product.sku" in content:
        count = content.count("product.sku")
        content = content.replace("product.sku", "product.barcode")
        replacements += count
        print(f"   ✓ Fixed {count} 'product.sku' -> 'product.barcode'")
    
    # Fix .sku || in expressions
    if ".sku ||" in content:
        count = content.count(".sku ||")
        content = content.replace(".sku ||", ".barcode ||")
        replacements += count
        print(f"   ✓ Fixed {count} '.sku ||' -> '.barcode ||'")
    
    # Fix User.name -> User.fullName in select statements
    if "name: true" in content and "User" in content:
        # Count only in createdBy/performedBy contexts
        count = content.count("            name: true")  # User context indentation
        content = content.replace("            name: true", "            fullName: true")
        replacements += count
        print(f"   ✓ Fixed {count} User 'name: true' -> 'fullName: true'")
    
    # Fix createdBy.name -> createdBy.fullName
    if "createdBy.name" in content:
        count = content.count("createdBy.name")
        content = content.replace("createdBy.name", "createdBy.fullName")
        replacements += count
        print(f"   ✓ Fixed {count} 'createdBy.name' -> 'createdBy.fullName'")
    
    # Fix performedBy.name -> performedBy.fullName
    if "performedBy.name" in content:
        count = content.count("performedBy.name")
        content = content.replace("performedBy.name", "performedBy.fullName")
        replacements += count
        print(f"   ✓ Fixed {count} 'performedBy.name' -> 'performedBy.fullName'")
    
    # Fix receivedBy.name -> receivedBy.fullName
    if "receivedBy.name" in content:
        count = content.count("receivedBy.name")
        content = content.replace("receivedBy.name", "receivedBy.fullName")
        replacements += count
        print(f"   ✓ Fixed {count} 'receivedBy.name' -> 'receivedBy.fullName'")
    
    if replacements > 0:
        # Create backup
        backup_path = filepath + ".beforefieldfix"
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(original_content)
        
        # Write fixed content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"   💾 Backup: {os.path.basename(backup_path)}")
        print(f"   ✅ Total replacements: {replacements}")
    else:
        print(f"   ℹ️  No changes needed")
    
    return replacements

def main():
    print("=" * 60)
    print("  FIXING SCHEMA FIELD REFERENCES")
    print("=" * 60)
    print("\nChanges:")
    print("  • Product.sku -> Product.barcode")
    print("  • User.name -> User.fullName")
    
    total_replacements = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            total_replacements += fix_file(filepath)
        else:
            print(f"\n❌ Not found: {filepath}")
    
    print("\n" + "=" * 60)
    print(f"  COMPLETE - {total_replacements} total replacements made")
    print("=" * 60)

if __name__ == "__main__":
    main()
