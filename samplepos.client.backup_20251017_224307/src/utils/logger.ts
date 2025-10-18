/**
 * Simple logger utility with different log levels
 */
export const logger = {
  /**
   * Log an informational message
   */
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  },
  
  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  },
  
  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  },
  
  /**
   * Log a debug message (only in development)
   */
  debug(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }
};