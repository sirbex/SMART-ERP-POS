-- Add default expense categories to the database
-- Run this after creating the expense tables

INSERT INTO expense_categories (id, name, code, description, is_active, created_at, updated_at) VALUES
    (gen_random_uuid(), 'Office Supplies', 'OFFICE', 'General office supplies and materials', true, NOW(), NOW()),
    (gen_random_uuid(), 'Travel', 'TRAVEL', 'Business travel expenses including flights, hotels, and transportation', true, NOW(), NOW()),
    (gen_random_uuid(), 'Meals & Entertainment', 'MEALS', 'Business meals and client entertainment expenses', true, NOW(), NOW()),
    (gen_random_uuid(), 'Fuel & Transportation', 'FUEL', 'Vehicle fuel and transportation costs', true, NOW(), NOW()),
    (gen_random_uuid(), 'Utilities', 'UTILITIES', 'Office utilities including electricity, water, internet', true, NOW(), NOW()),
    (gen_random_uuid(), 'Maintenance & Repairs', 'MAINTENANCE', 'Equipment and facility maintenance costs', true, NOW(), NOW()),
    (gen_random_uuid(), 'Marketing & Advertising', 'MARKETING', 'Marketing campaigns and advertising expenses', true, NOW(), NOW()),
    (gen_random_uuid(), 'Equipment', 'EQUIPMENT', 'Office and business equipment purchases', true, NOW(), NOW()),
    (gen_random_uuid(), 'Software & Licenses', 'SOFTWARE', 'Software subscriptions and license fees', true, NOW(), NOW()),
    (gen_random_uuid(), 'Professional Services', 'PROFESSIONAL', 'Consulting, legal, and other professional services', true, NOW(), NOW()),
    (gen_random_uuid(), 'Accommodation', 'ACCOMMODATION', 'Hotel and accommodation expenses', true, NOW(), NOW()),
    (gen_random_uuid(), 'Training & Development', 'TRAINING', 'Employee training and development costs', true, NOW(), NOW()),
    (gen_random_uuid(), 'Other', 'OTHER', 'Miscellaneous business expenses', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;