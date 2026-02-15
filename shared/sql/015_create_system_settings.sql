-- System Settings Table
-- Stores application-wide configuration including tax and printing settings

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- General Settings
  business_name VARCHAR(255) NOT NULL DEFAULT 'SamplePOS',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'UGX',
  currency_symbol VARCHAR(10) NOT NULL DEFAULT 'UGX',
  date_format VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
  time_format VARCHAR(20) NOT NULL DEFAULT '24h',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Kampala',
  
  -- Tax Settings
  tax_enabled BOOLEAN NOT NULL DEFAULT false,
  default_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- e.g., 18.00 for 18%
  tax_name VARCHAR(100) DEFAULT 'VAT', -- VAT, GST, Sales Tax, etc.
  tax_number VARCHAR(100), -- Business tax registration number
  tax_inclusive BOOLEAN NOT NULL DEFAULT true, -- Prices include tax by default
  
  -- Multiple Tax Rates (JSON array for flexibility)
  tax_rates JSONB DEFAULT '[]'::jsonb, -- [{"name": "Standard VAT", "rate": 18, "default": true}, {"name": "Zero Rated", "rate": 0}]
  
  -- Printing Settings - Receipt
  receipt_printer_enabled BOOLEAN NOT NULL DEFAULT true,
  receipt_printer_name VARCHAR(255),
  receipt_paper_width INTEGER NOT NULL DEFAULT 80, -- mm (58, 80)
  receipt_auto_print BOOLEAN NOT NULL DEFAULT false,
  receipt_show_logo BOOLEAN NOT NULL DEFAULT true,
  receipt_logo_url TEXT,
  receipt_header_text TEXT,
  receipt_footer_text TEXT DEFAULT 'Thank you for your business!',
  receipt_show_tax_breakdown BOOLEAN NOT NULL DEFAULT true,
  receipt_show_qr_code BOOLEAN NOT NULL DEFAULT false,
  
  -- Printing Settings - Invoice
  invoice_printer_enabled BOOLEAN NOT NULL DEFAULT true,
  invoice_printer_name VARCHAR(255),
  invoice_paper_size VARCHAR(10) NOT NULL DEFAULT 'A4', -- A4, Letter, A5
  invoice_template VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, minimal, detailed
  invoice_show_logo BOOLEAN NOT NULL DEFAULT true,
  invoice_show_payment_terms BOOLEAN NOT NULL DEFAULT true,
  invoice_default_payment_terms TEXT DEFAULT 'Payment due within 30 days',
  
  -- Low Stock Alerts
  low_stock_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  
  -- Audit Fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id UUID REFERENCES users(id)
);

-- Create index on updated_at for audit queries
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at DESC);

-- Insert default settings (singleton pattern - only one row)
INSERT INTO system_settings (
  business_name,
  currency_code,
  currency_symbol,
  tax_enabled,
  default_tax_rate,
  tax_name,
  tax_inclusive,
  receipt_footer_text,
  invoice_default_payment_terms
) VALUES (
  'SamplePOS',
  'UGX',
  'UGX',
  false,
  18.00,
  'VAT',
  true,
  'Thank you for your business!',
  'Payment due within 30 days'
)
ON CONFLICT DO NOTHING;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_timestamp
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_timestamp();

COMMENT ON TABLE system_settings IS 'Application-wide configuration including tax and printing settings (singleton table)';
COMMENT ON COLUMN system_settings.tax_rates IS 'JSON array of tax rates: [{"name": "Standard VAT", "rate": 18, "default": true}]';
COMMENT ON COLUMN system_settings.tax_inclusive IS 'If true, displayed prices include tax; if false, tax is added at checkout';
COMMENT ON COLUMN system_settings.receipt_paper_width IS 'Thermal printer paper width in millimeters (58mm or 80mm)';
