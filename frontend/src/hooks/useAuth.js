import { useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api/auth';
import { usersAPI } from '../services/api/users';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const mountedRef = useRef(true);

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      
      // Сначала проверяем статус аутентификации
      const authStatus = await authAPI.checkAuth();
      
      if (authStatus.authenticated && authStatus.user) {
        // Если пользователь аутентифицирован, устанавливаем его данные
        if (mountedRef.current) {
          setUser({ 
            isAuthenticated: true,
            ...authStatus.user 
          });
        }
      } else {
        if (mountedRef.current) {
          setUser(null);
        }
      }
    } catch (error) {
      console.warn('Auth check failed:', error);
      if (mountedRef.current) {
        setUser(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setAuthChecked(true);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    checkAuth();

    // Подписываемся на событие неавторизованного доступа
    const handleUnauthorized = () => {
      if (mountedRef.current) {
        setUser(null);
        setAuthChecked(true);
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [checkAuth]);

  const login = useCallback(async (credentials) => {
    try {
      // Очищаем предыдущее состояние
      setUser(null);
      
      // Отправляем запрос на логин
      const response = await authAPI.login(credentials);
      
      // Проверяем, что получили refresh token (опционально)
      if (!response.refresh_token) {
        console.warn('No refresh token received, but login successful');
      }
      
      // После успешного логина проверяем статус аутентификации
      // Бэкенд сам установил cookie, нам нужно только получить профиль
      const authStatus = await authAPI.checkAuth();
      
      if (authStatus.authenticated && authStatus.user) {
        if (mountedRef.current) {
          setUser({ 
            isAuthenticated: true,
            ...authStatus.user 
          });
        }
        return { success: true };
      } else {
        // Если аутентификация не подтвердилась через checkAuth,
        // пробуем загрузить профиль напрямую (только если есть основания полагать,
        // что пользователь аутентифицирован)
        try {
          const userProfile = await usersAPI.getProfile();
          if (mountedRef.current) {
            setUser({ 
              isAuthenticated: true,
              ...userProfile 
            });
          }
          return { success: true };
        } catch (profileError) {
          console.error('Failed to load profile after login:', profileError);
          if (mountedRef.current) {
            setUser(null);
          }
          return { 
            success: false, 
            error: 'Не удалось загрузить профиль после авторизации' 
          };
        }
      }
      
    } catch (error) {
      console.error('Login error:', error);
      
      // Очищаем состояние при ошибке
      if (mountedRef.current) {
        setUser(null);
      }
      
      // Форматируем сообщение об ошибке
      let errorMessage = 'Ошибка авторизации';
      
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Всегда очищаем состояние, даже если запрос не удался
      if (mountedRef.current) {
        setUser(null);
      }
    }
  }, []);

  return {
    user,
    loading,
    authChecked,
    login,
    logout,
    isAuthenticated: !!user,
  };
};