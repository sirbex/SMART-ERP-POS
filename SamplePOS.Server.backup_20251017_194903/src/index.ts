import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middlewares/error-handler';
import { logger } from './utils/logger';
import { apiRouter } from './routes';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan('dev')); // HTTP request logging

// API routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: 'UP' });
});

// Error handling
app.use(errorHandler);

// Start the server
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

export default app;