import axios from 'axios';
import { API_BASE_URL } from '../../utils/constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const PUBLIC_ROUTES = ['/', '/login', '/register', '/privacy'];

const isPublicRoute = (pathname) => (
  PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
);

const redirectToLogin = () => {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));

  if (!isPublicRoute(window.location.pathname)) {
    window.location.href = '/login';
  }
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Игнорируем ошибки валидации
    if (error.response?.status === 400) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const isCheckEndpoint = originalRequest.url?.includes('/auth/check');
      const isRefreshEndpoint = originalRequest.url?.includes('/auth/refresh');
      
      if (isRefreshEndpoint || isCheckEndpoint) {
        redirectToLogin();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return apiClient(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post('/auth/refresh');
        
        processQueue(null);
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 403) {
      console.error('Access forbidden:', error);
    }

    if (error.response?.status === 404) {
      console.error('Resource not found:', error);
    }

    if (error.response?.status === 500) {
      console.error('Server error:', error);
    }

    return Promise.reject(error);
  }
);

export default apiClient;