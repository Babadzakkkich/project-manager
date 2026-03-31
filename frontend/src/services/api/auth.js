import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const authAPI = {
  login: async (credentials) => {
    const formData = new URLSearchParams();
    formData.append('username', credentials.login);
    formData.append('password', credentials.password);
    
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    return response.data;
  },

  checkAuth: async () => {
    try {
      const response = await apiClient.get('/auth/check');
      return response.data;
    } catch (error) {
      console.error('Auth check failed:', error);
      return { authenticated: false };
    }
  },
};