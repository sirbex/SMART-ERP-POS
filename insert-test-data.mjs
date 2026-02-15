import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const insertTestData = async () => {
    try {
        // Insert a test sale for November 27, 2025
        const result = await pool.query(`
      INSERT INTO sales (
        sale_number, 
        total_amount, 
        amount_paid, 
        total_cost, 
        profit, 
        payment_method, 
        sale_date, 
        status,
        cashier_id
      ) VALUES (
        'SALE-2025-0001', 
        100.00, 
        100.00, 
        60.00, 
        40.00, 
        'CASH', 
        '2025-11-27', 
        'COMPLETED',
        '1cb55ec4-7188-45bb-a8fc-75369181cb21'
      ) ON CONFLICT (sale_number) DO NOTHING 
      RETURNING id, sale_number
    `);

        console.log('Inserted test sale:', result.rows);

        // Insert another sale for November 28
        const result2 = await pool.query(`
      INSERT INTO sales (
        sale_number, 
        total_amount, 
        amount_paid, 
        total_cost, 
        profit, 
        payment_method, 
        sale_date, 
        status,
        cashier_id
      ) VALUES (
        'SALE-2025-0002', 
        150.00, 
        150.00, 
        90.00, 
        60.00, 
        'CARD', 
        '2025-11-28', 
        'COMPLETED',
        '1cb55ec4-7188-45bb-a8fc-75369181cb21'
      ) ON CONFLICT (sale_number) DO NOTHING 
      RETURNING id, sale_number
    `);

        console.log('Inserted second test sale:', result2.rows);

        console.log('Test data inserted successfully!');
    } catch (error) {
        console.error('Error inserting test data:', error.message);
    } finally {
        await pool.end();
    }
};

insertTestData();