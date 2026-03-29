-- Invoice Settings Table
-- Stores company information and invoice template preferences

CREATE TABLE IF NOT EXISTS invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Company Information
  company_name VARCHAR(255) NOT NULL DEFAULT 'SamplePOS',
  company_address TEXT,
  company_phone VARCHAR(50),
  company_email VARCHAR(255),
  company_tin VARCHAR(100),
  company_logo_url TEXT,
  
  -- Invoice Template Settings
  template_type VARCHAR(50) NOT NULL DEFAULT 'modern',
  -- Options: 'modern', 'classic', 'minimal', 'professional'
  
  -- Color Theme
  primary_color VARCHAR(7) DEFAULT '#2563eb',
  secondary_color VARCHAR(7) DEFAULT '#10b981',
  
  -- Display Options
  show_company_logo BOOLEAN DEFAULT false,
  show_tax_breakdown BOOLEAN DEFAULT true,
  show_payment_instructions BOOLEAN DEFAULT true,
  show_prices_on_dn_pdf BOOLEAN DEFAULT true,
  
  -- Payment Accounts (bank, mobile money, etc.)
  payment_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Payment Instructions
  payment_instructions TEXT,
  
  -- Terms and Conditions
  terms_and_conditions TEXT,
  
  -- Footer Text
  footer_text TEXT DEFAULT 'Thank you for your business!',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO invoice_settings (
  company_name,
  company_address,
  company_phone,
  company_email,
  company_tin,
  template_type,
  primary_color,
  secondary_color,
  payment_instructions,
  footer_text
) VALUES (
  'SamplePOS',
  'Kampala, Uganda',
  NULL, -- User must configure in system settings
  'info@samplepos.com',
  NULL, -- User must configure in system settings
  'modern',
  '#2563eb',
  '#10b981',
  'Payment can be made via Mobile Money, Bank Transfer, or Cash.',
  'Thank you for your business!'
) ON CONFLICT DO NOTHING;

-- Ensure only one settings record exists (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_settings_singleton ON invoice_settings ((1));

-- Comments
COMMENT ON TABLE invoice_settings IS 'Stores invoice configuration and company details';
COMMENT ON COLUMN invoice_settings.template_type IS 'Invoice template style: modern, classic, minimal, professional';
COMMENT ON COLUMN invoice_settings.primary_color IS 'Hex color for primary elements (headers, buttons)';
COMMENT ON COLUMN invoice_settings.secondary_color IS 'Hex color for secondary elements (accents)';
