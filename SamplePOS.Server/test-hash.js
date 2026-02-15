import bcrypt from 'bcrypt';

// The hash from the SQL seed file
const storedHash = '$2b$10$rO5xGKZXWvwxkJQH7B7LLu8QZKZQJZFZJZFZJZFZJZFZJZFZJZFZJa';
const password = 'admin123';

console.log('Testing stored hash from SQL seed file:');
console.log('Password:', password);
console.log('Stored hash:', storedHash);

const isValid = bcrypt.compareSync(password, storedHash);
console.log('Is valid:', isValid);

if (!isValid) {
  console.log('\nGenerating a correct hash for admin123:');
  const correctHash = bcrypt.hashSync(password, 10);
  console.log('Correct hash:', correctHash);
  console.log('\nUpdate SQL with:');
  console.log(`('admin@samplepos.com', '${correctHash}', 'System Administrator', 'ADMIN');`);
}
