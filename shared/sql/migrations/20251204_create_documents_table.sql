-- Migration: Add documents table for document management system
-- Date: 2025-12-04
-- Description: Creates documents table to support file uploads and attachments for expenses, invoices, etc.

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL CHECK (size > 0),
    path TEXT NOT NULL,
    entity_type VARCHAR(50), -- 'EXPENSE', 'INVOICE', 'JOURNAL', 'PURCHASE_ORDER', 'SALE'
    entity_id UUID,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON documents(mime_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename) WHERE is_active = true;

-- Create GIN index for tags search
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags) WHERE is_active = true;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at_trigger
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Add comments for documentation
COMMENT ON TABLE documents IS 'Stores uploaded documents and their metadata for various business entities';
COMMENT ON COLUMN documents.entity_type IS 'Type of business entity this document is attached to';
COMMENT ON COLUMN documents.entity_id IS 'ID of the specific business entity this document is attached to';
COMMENT ON COLUMN documents.tags IS 'JSON array of tags for categorization and search';
COMMENT ON COLUMN documents.metadata IS 'Additional metadata about the document (upload source, processing info, etc.)';
COMMENT ON COLUMN documents.is_active IS 'Soft delete flag - false means document is deleted';

-- Insert sample data for testing (optional)
-- This can be removed in production
/*
INSERT INTO documents (
    filename, 
    original_name, 
    mime_type, 
    size, 
    path, 
    entity_type, 
    uploaded_by,
    tags,
    metadata
) VALUES 
(
    'sample_receipt_2025_1234.pdf',
    'receipt.pdf',
    'application/pdf',
    1024000,
    '2025/12/sample_receipt_2025_1234.pdf',
    'EXPENSE',
    (SELECT id FROM users WHERE email = 'admin@samplepos.com' LIMIT 1),
    '["receipt", "office-supplies"]',
    '{"category": "office", "department": "admin"}'
);
*/