import axios from 'axios';
import { API_BASE_URL } from '../../utils/constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Переменная для отслеживания состояния обновления
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

// Функция для перенаправления на страницу входа
const redirectToLogin = () => {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  
  if (!window.location.pathname.includes('/login') && 
      !window.location.pathname.includes('/register') &&
      !window.location.pathname !== '/') {
    window.location.href = '/login';
  }
};

// Response interceptor с автоматическим обновлением
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Игнорируем ошибки валидации
    if (error.response?.status === 400) {
      return Promise.reject(error);
    }

    // Если ошибка 401 и это не запрос на обновление
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Проверяем, не является ли это запросом на проверку auth
      const isCheckEndpoint = originalRequest.url?.includes('/auth/check');
      const isRefreshEndpoint = originalRequest.url?.includes('/auth/refresh');
      
      if (isRefreshEndpoint || isCheckEndpoint) {
        // Если refresh не сработал или check вернул 401, перенаправляем на логин
        redirectToLogin();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Если уже идет обновление, добавляем в очередь
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
        // Пытаемся обновить токены
        await apiClient.post('/auth/refresh');
        
        // Обрабатываем очередь запросов
        processQueue(null);
        
        // Повторяем оригинальный запрос
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Обработка других ошибок
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