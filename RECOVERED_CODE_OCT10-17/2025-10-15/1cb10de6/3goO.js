const pool = require('../pool');

const createInvoicesTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      total NUMERIC(10, 2) NOT NULL,
      invoice_no INTEGER UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1000;

    -- Function to set invoice_no from sequence
    CREATE OR REPLACE FUNCTION set_invoice_no()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.invoice_no := nextval('invoice_no_seq');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to call the function before insert
    DO
    $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trigger_set_invoice_no'
      ) THEN
        CREATE TRIGGER trigger_set_invoice_no
        BEFORE INSERT ON invoices
        FOR EACH ROW
        EXECUTE FUNCTION set_invoice_no();
      END IF;
    END;
    $$;
  `;

  try {
    await pool.query(query);
    console.log('Invoices table and sequence setup complete.');
  } catch (err) {
    console.error('Error setting up invoices table:', err);
  }
};

module.exports = { createInvoicesTable };
