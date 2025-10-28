-- STEP 5: SEED TEST DATA FOR API TESTING
-- This script inserts test data for purchase receiving system testing
-- Run this in PostgreSQL before running API tests

-- Insert test supplier if doesn't exist
INSERT INTO "Supplier" (id, name, email, phone, address, "contactPerson", "paymentTerms", "isActive", "createdAt", "updatedAt")
VALUES (
  'test-supplier-001',
  'Test Supplier Inc.',
  'test@supplier.com',
  '+1-555-0100',
  '123 Test Street, Test City, TC 12345',
  'John Test',
  'NET30',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Insert test product if doesn't exist
INSERT INTO "Product" (id, name, barcode, description, category, "baseUnit", "currentStock", "reorderLevel", "costPrice", "sellingPrice", "hasMultipleUnits", "taxRate", "isActive", "createdAt", "updatedAt")
VALUES (
  'test-product-001',
  'Test Product Alpha',
  'TEST-001',
  'Test product for receiving system integration',
  'Test Category',
  'PIECE',
  0,
  10,
  25.50,
  35.00,
  false,
  0.12,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Insert test user if doesn't exist
INSERT INTO "User" (id, username, email, "passwordHash", "fullName", role, "isActive", "createdAt", "updatedAt")
VALUES (
  'test-user-001',
  'testuser',
  'test@user.com',
  '$2b$10$abcdefghijklmnopqrstuv',  -- hashed password (not real)
  'Test User',
  'ADMIN',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Display inserted data
SELECT 'Supplier:' as type, id, name FROM "Supplier" WHERE id = 'test-supplier-001'
UNION ALL
SELECT 'Product:', id, name FROM "Product" WHERE id = 'test-product-001'
UNION ALL
SELECT 'User:', id, "fullName" FROM "User" WHERE id = 'test-user-001';
