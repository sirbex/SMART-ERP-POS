import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import inventoryRoutes from './routes/inventory-routes';
import migrationRoutes from './routes/migration-routes';
import errorHandler from './middleware/error-handler';
import pool from './db/pool';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Apply middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies
app.use(morgan('dev')); // HTTP request logger

// Health check endpoint
app.get('/api/health', (req: express.Request, res: express.Response) => {
  logger.info('HEALTH CHECK ENDPOINT HIT - Path: ' + req.path + ' - IP: ' + req.ip + ' - Time: ' + new Date().toISOString());
  res.status(200).json({
    status: 'UP',
    message: 'API server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Import additional routes
import customerRoutes from './routes/customer-routes';
import transactionRoutes from './routes/transaction-routes';

// API routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    errors: ['The requested resource does not exist or has been removed']
  });
});

// Global error handler
app.use(errorHandler);

// Start the server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(async () => {
    logger.info('Server closed');
    
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
    }
    
    process.exit(0);
  });
  
  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});

export default app;