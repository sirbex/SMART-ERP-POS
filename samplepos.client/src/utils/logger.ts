/**
 * FRONTEND LOGGER
 * Browser-compatible logging utility
 * Supports different log levels and structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: any;
}

class Logger {
    private isDevelopment = import.meta.env.DEV;

    private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            data,
        };
    }

    private log(level: LogLevel, message: string, data?: any) {
        const entry = this.formatMessage(level, message, data);

        // In production, only log warnings and errors
        if (!this.isDevelopment && (level === 'debug' || level === 'info')) {
            return;
        }

        // Console output
        switch (level) {
            case 'debug':
                console.debug(`[DEBUG] ${message}`, data);
                break;
            case 'info':
                console.info(`[INFO] ${message}`, data);
                break;
            case 'warn':
                console.warn(`[WARN] ${message}`, data);
                break;
            case 'error':
                console.error(`[ERROR] ${message}`, data);
                break;
        }

        // In production, send errors to monitoring service
        if (!this.isDevelopment && level === 'error') {
            this.sendToMonitoring(entry);
        }
    }

    private sendToMonitoring(entry: LogEntry) {
        // TODO: Integrate with monitoring service (Sentry, LogRocket, etc.)
        // For now, just store in localStorage for debugging
        try {
            const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
            logs.push(entry);
            // Keep only last 100 errors
            if (logs.length > 100) {
                logs.shift();
            }
            localStorage.setItem('error_logs', JSON.stringify(logs));
        } catch (e) {
            // Ignore localStorage errors
        }
    }

    debug(message: string, data?: any) {
        this.log('debug', message, data);
    }

    info(message: string, data?: any) {
        this.log('info', message, data);
    }

    warn(message: string, data?: any) {
        this.log('warn', message, data);
    }

    error(message: string, data?: any) {
        this.log('error', message, data);
    }

    // Utility to get stored error logs
    getErrorLogs(): LogEntry[] {
        try {
            return JSON.parse(localStorage.getItem('error_logs') || '[]');
        } catch {
            return [];
        }
    }

    // Clear error logs
    clearErrorLogs() {
        localStorage.removeItem('error_logs');
    }
}

// Export singleton instance
const logger = new Logger();
export default logger;
