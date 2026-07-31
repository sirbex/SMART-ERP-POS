-- 579: Default guest bill printer (FOH check print target)
-- Station KOT printers stay on restaurant_stations; guest bill is one FOH destination.

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS guest_bill_printer_name VARCHAR(255);

INSERT INTO schema_version (version) VALUES (579) ON CONFLICT DO NOTHING;
