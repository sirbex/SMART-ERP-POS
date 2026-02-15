#!/usr/bin/env node

/**
 * Create Test User Script
 * Creates a test admin user for authentication testing
 */

import pkg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, 'SamplePOS.Server', '.env') });

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function createTestUser() {
    try {
        console.log('🔐 Creating test admin user...');

        const email = 'admin@test.com';
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await pool.query(
            `INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()
       RETURNING id, email, full_name, role, is_active`,
            [email, hashedPassword, 'Test Admin', 'ADMIN', true]
        );

        console.log('✅ Test user created/updated successfully:');
        console.log(`   Email: ${user.rows[0].email}`);
        console.log(`   Name: ${user.rows[0].full_name}`);
        console.log(`   Role: ${user.rows[0].role}`);
        console.log(`   Active: ${user.rows[0].is_active}`);
        console.log(`   ID: ${user.rows[0].id}`);

        // Test login
        console.log('\n🔐 Testing login...');
        const loginResult = await testLogin(email, password);
        if (loginResult) {
            console.log('✅ Login test successful!');
            console.log(`   Token: ${loginResult.substring(0, 30)}...`);
        }

    } catch (error) {
        console.error('❌ Error creating test user:', error.message);
        if (error.code === '42P01') {
            console.error('   Table "users" does not exist. Please run database migrations first.');
        }
    } finally {
        await pool.end();
    }
}

async function testLogin(email, password) {
    try {
        // Test authentication logic
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        if (response.ok) {
            const data = await response.json();
            return data.data?.token;
        } else {
            const errorData = await response.text();
            console.error(`   Login failed: ${response.status} - ${errorData}`);
            return null;
        }
    } catch (error) {
        console.error(`   Login test failed: ${error.message}`);
        return null;
    }
}

createTestUser();