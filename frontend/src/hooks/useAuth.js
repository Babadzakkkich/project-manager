import { useState, useEffect, useRef } from 'react';
import { authAPI } from '../services/api/auth';
import { usersAPI } from '../services/api/users';
import { tokenService } from '../services/auth/tokenService';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const refreshIntervalRef = useRef();

  const checkAuth = async () => {
    const token = tokenService.getToken();
    
    if (!token) {
      setUser(null);
      setLoading(false);
      setAuthChecked(true);
      return;
    }

    try {
      const userProfile = await usersAPI.getProfile();
      setUser({ 
        isAuthenticated: true,
        ...userProfile 
      });
    } catch (error) {
      console.warn('Auth check failed, clearing tokens:', error);
      
      if (error.response?.status === 401) {
        tokenService.clearTokens();
      }
      
      setUser(null);
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const checkTokenPeriodically = () => {
      if (user?.isAuthenticated && tokenService.shouldRefreshToken()) {
        const refreshToken = tokenService.getRefreshToken();
        if (refreshToken) {
          authAPI.refresh(refreshToken)
            .then((data) => {
              tokenService.setTokens(data.access_token, data.refresh_token);
              console.log('Token silently refreshed');
            })
            .catch((error) => {
              console.warn('Silent refresh failed:', error);
              if (error.response?.status === 401) {
                tokenService.clearTokens();
                setUser(null);
              }
            });
        }
      }
    };

    refreshIntervalRef.current = setInterval(checkTokenPeriodically, 60000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [user]);

  const login = async (credentials) => {
    try {
      tokenService.clearTokens();
      
      const data = await authAPI.login(credentials);
      tokenService.setTokens(data.access_token, data.refresh_token);
      
      const userProfile = await usersAPI.getProfile();
      setUser({ 
        isAuthenticated: true,
        ...userProfile 
      });
      
      return { success: true };
    } catch (error) {
      tokenService.clearTokens();
      setUser(null);
      
      const errorDetail = error.response?.data?.detail;
      let errorMessage = 'Ошибка авторизации';
      
      if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (Array.isArray(errorDetail)) {
        errorMessage = errorDetail.map(err => err.msg).join(', ');
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      tokenService.clearTokens();
      setUser(null);
      
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    }
  };

  return {
    user,
    loading,
    authChecked,
    login,
    logout,
    isAuthenticated: !!user?.isAuthenticated,
  };
};