import axios from 'axios';
import { logApiRequest } from '@/utils/errorHandler';

// Use environment variable for production, fallback to proxy for development
// In dev: '/api' uses Vite proxy (vite.config.ts proxies /api to http://localhost:3001)
// In prod: VITE_API_URL can be set to full backend URL (e.g., https://api.example.com)
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL,
  timeout: 30000,
  withCredentials: true, // Enable cookies/sessions for authentication
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log(`[API] ✅ Request to ${config.url} WITH token`);
  } else {
    console.warn(`[API] ⚠️ Request to ${config.url} WITHOUT token`);
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Log API errors in development
    logApiRequest(err.config);

    if (err.response?.status === 401) {
      console.error('[API] Unauthorized - token missing or expired');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      // Redirect to login if available
      try {
        const currentPath = window.location.pathname || '';
        if (!currentPath.includes('/login')) {
          // Show a lightweight notice first
          console.warn('[API] Redirecting to /login due to 401');
          window.location.href = '/login';
        }
      } catch (_) {
        // noop in non-browser contexts
      }
    }

    // Log full error details for debugging
    if (import.meta.env.DEV) {
      console.error('[API Error]', {
        url: err.config?.url,
        method: err.config?.method,
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      // Log response data separately for easier inspection
      if (err.response?.data) {
        console.error('[API Error Response Data]:', err.response.data);
      }
    }

    return Promise.reject(err);
  }
);

export default api;
