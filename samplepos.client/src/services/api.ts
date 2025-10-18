import axios from 'axios';

/**
 * Base API instance configured for the backend
 */
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds
});

export default api;