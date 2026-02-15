UPDATE users SET password_hash = '$2b$10$CDa/2yDxiwf9pqZFbWvJLuiPxlgOypZpTKi2HPRLbocTvebohBLWC' WHERE email = 'admin@samplepos.com';
SELECT 'Password updated successfully!' as status;
SELECT email, full_name, role FROM users WHERE email = 'admin@samplepos.com';
