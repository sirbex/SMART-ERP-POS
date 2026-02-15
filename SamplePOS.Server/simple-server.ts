// Quick server test without problematic modules
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(cors());
app.use(express.json());

// Simple health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    status: 'ok'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Simple Node.js server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});