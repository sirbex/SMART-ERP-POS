import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../utils/logger';

/**
 * RESILIENT API CLIENT
 * - Automatic retry with exponential backoff
 * - Request/response interceptors
 * - Global error handling
 * - Timeout management
 * - Request deduplication
 * 
 * Retry configuration is inline in retry methods (no separate interface needed)
 */

class ResilientApiClient {
    private client: AxiosInstance;
    private pendingRequests: Map<string, Promise<unknown>> = new Map();

    constructor(baseURL: string) {
        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.setupInterceptors();
    }

    private setupInterceptors() {
        // Request interceptor
        this.client.interceptors.request.use(
            (config) => {
                // Add auth token
                const token = localStorage.getItem('auth_token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }

                // Add request ID for tracing
                config.headers['X-Request-ID'] = this.generateRequestId();

                return config;
            },
            (error) => {
                logger.error('Request error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.client.interceptors.response.use(
            (response) => {
                return response;
            },
            async (error: AxiosError) => {
                const config = error.config as AxiosRequestConfig & { _retry?: boolean; _retryCount?: number };

                // Retry logic
                if (this.shouldRetry(error) && config && !config._retry) {
                    config._retryCount = config._retryCount || 0;
                    config._retryCount++;

                    if (config._retryCount <= 3) {
                        config._retry = true;

                        // Exponential backoff
                        const delay = Math.min(1000 * Math.pow(2, config._retryCount), 10000);
                        await this.sleep(delay);

                        logger.warn(`Retrying request (attempt ${config._retryCount}):`, {
                            url: config.url,
                            method: config.method,
                        });

                        return this.client(config);
                    }
                }

                // Handle specific error cases
                if (error.response?.status === 401) {
                    // Token expired - redirect to login
                    this.handleUnauthorized();
                }

                return Promise.reject(this.normalizeError(error));
            }
        );
    }

    private shouldRetry(error: AxiosError): boolean {
        // Retry on network errors or 5xx errors
        if (!error.response) return true; // Network error
        const status = error.response.status;
        return status >= 500 && status < 600; // Server error
    }

    private handleUnauthorized() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }

    private normalizeError(error: AxiosError): Error {
        if (error.response?.data && typeof error.response.data === 'object') {
            const data = error.response.data as { error?: string; message?: string };
            return new Error(data.error || data.message || 'An error occurred');
        }
        return new Error(error.message || 'An error occurred');
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Request deduplication - prevents duplicate concurrent requests
     */
    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const key = `GET:${url}`;

        // Check if request is already in progress
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key) as Promise<T>;
        }

        // Create new request
        const promise = this.client.get<T>(url, config).then((res) => {
            this.pendingRequests.delete(key);
            return res.data;
        }).catch((error) => {
            this.pendingRequests.delete(key);
            throw error;
        });

        this.pendingRequests.set(key, promise);
        return promise;
    }

    async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.post<T>(url, data, config);
        return response.data;
    }

    async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.put<T>(url, data, config);
        return response.data;
    }

    async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.delete<T>(url, config);
        return response.data;
    }

    /**
     * Batch requests into single call
     */
    async batchGet<T>(urls: string[]): Promise<T[]> {
        const promises = urls.map((url) => this.get<T>(url));
        return Promise.all(promises);
    }
}

// Singleton instance
export const resilientApiClient = new ResilientApiClient(
    import.meta.env.VITE_API_URL || '/api'
);

/**
 * Circuit breaker pattern for critical operations
 */
class CircuitBreaker {
    private failures = 0;
    private successCount = 0;
    private lastFailureTime = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

    constructor(
        private threshold: number = 5,
        private timeout: number = 60000,
        private successThreshold: number = 2
    ) { }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess() {
        this.failures = 0;

        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
            }
        }
    }

    private onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
            logger.error('Circuit breaker opened due to failures');
        }
    }

    getState() {
        return this.state;
    }
}

export const circuitBreaker = new CircuitBreaker();
