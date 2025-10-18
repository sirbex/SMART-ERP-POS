import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // HTTP request logger
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Health check endpoint
app.get('/api/health', (req: express.Request, res: express.Response) => {
  console.log('HEALTH CHECK ENDPOINT HIT - Path:', req.path, '- IP:', req.ip, '- Time:', new Date().toISOString());
  res.status(200).json({
    status: 'UP',
    message: 'API server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (_req: express.Request, res: express.Response) => {
  res.json({ message: 'SamplePOS API Server is running' });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    errors: ['The requested resource does not exist or has been removed']
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;