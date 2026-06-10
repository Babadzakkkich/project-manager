import { useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api/auth';
import { usersAPI } from '../services/api/users';

const DEFAULT_SYSTEM_ROLE = 'user';
const GLOBAL_ADMIN_ROLE = 'global_admin';

const normalizeUser = (userData) => {
  if (!userData) return null;

  return {
    ...userData,
    isAuthenticated: true,
    system_role: userData.system_role || DEFAULT_SYSTEM_ROLE,
    is_blocked: Boolean(userData.is_blocked),
  };
};

const getErrorMessage = (error, fallback = 'Ошибка авторизации') => {
  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }

  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.message) {
    return error.message;
  }

  return fallback;
};

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const mountedRef = useRef(true);

  const setNormalizedUser = useCallback((userData) => {
    if (!mountedRef.current) return;
    setUser(normalizeUser(userData));
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);

      const authStatus = await authAPI.checkAuth();

      if (!authStatus.authenticated) {
        if (mountedRef.current) {
          setUser(null);
        }
        return;
      }

      if (authStatus.user) {
        setNormalizedUser(authStatus.user);
        return;
      }

      const userProfile = await usersAPI.getProfile();
      setNormalizedUser(userProfile);
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
  }, [setNormalizedUser]);

  useEffect(() => {
    mountedRef.current = true;
    checkAuth();

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
      setUser(null);

      const response = await authAPI.login(credentials);

      if (!response.refresh_token) {
        console.warn('No refresh token received, but login successful');
      }

      const authStatus = await authAPI.checkAuth();

      if (authStatus.authenticated && authStatus.user) {
        setNormalizedUser(authStatus.user);
        return { success: true };
      }

      try {
        const userProfile = await usersAPI.getProfile();
        setNormalizedUser(userProfile);
        return { success: true };
      } catch (profileError) {
        console.error('Failed to load profile after login:', profileError);
        if (mountedRef.current) {
          setUser(null);
        }

        return {
          success: false,
          error: 'Не удалось загрузить профиль после авторизации',
        };
      }
    } catch (error) {
      console.error('Login error:', error);

      if (mountedRef.current) {
        setUser(null);
      }

      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }, [setNormalizedUser]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      if (mountedRef.current) {
        setUser(null);
      }
    }
  }, []);

  const isBlocked = Boolean(user?.is_blocked);
  const isGlobalAdmin = user?.system_role === GLOBAL_ADMIN_ROLE;
  const isAuthenticated = Boolean(user) && !isBlocked;

  return {
    user,
    loading,
    authChecked,
    login,
    logout,
    checkAuth,
    isAuthenticated,
    isBlocked,
    isGlobalAdmin,
    systemRole: user?.system_role || DEFAULT_SYSTEM_ROLE,
  };
};
