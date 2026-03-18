import axios from 'axios';
import { API_BASE_URL } from '../../utils/constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Переменная для отслеживания состояния редиректа
let isRedirecting = false;

// Функция для перенаправления на страницу входа
const redirectToLogin = () => {
  if (isRedirecting) return;
  isRedirecting = true;
  
  // Очищаем состояние пользователя через событие
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  
  // Перенаправляем на страницу входа, если мы не там уже
  if (!window.location.pathname.includes('/login') && 
      !window.location.pathname.includes('/register') &&
      !window.location.pathname.includes('/')) {
    window.location.href = '/login';
  }
  
  // Сбрасываем флаг через некоторое время
  setTimeout(() => {
    isRedirecting = false;
  }, 1000);
};

// Request interceptor больше не нужен, так как токен автоматически отправляется в cookies

// Response interceptor для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Игнорируем ошибки валидации (400) - они обрабатываются в компонентах
    if (error.response?.status === 400) {
      return Promise.reject(error);
    }

    // Если ошибка 401 (неавторизован) и это не повторный запрос
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Проверяем, не является ли это запросом на логин или проверку auth
      const isAuthEndpoint = originalRequest.url?.includes('/auth/');
      
      if (!isAuthEndpoint) {
        // Для всех защищенных эндпоинтов перенаправляем на логин
        redirectToLogin();
      }
      
      return Promise.reject(error);
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