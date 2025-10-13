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

  refresh: async (refreshToken) => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH, {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    return response.data;
  },
};