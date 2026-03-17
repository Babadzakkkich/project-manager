import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const usersAPI = {
  register: async (userData) => {
    const response = await apiClient.post(API_ENDPOINTS.USERS, userData);
    return response.data;
  },

  getProfile: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.USERS}/me`);
    return response.data;
  },

  updateProfile: async (userData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.USERS}/me`, userData);
    return response.data;
  },

  deleteProfile: async () => {
    const response = await apiClient.delete(`${API_ENDPOINTS.USERS}/me`);
    return response.data;
  },

  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.USERS);
    return response.data;
  },

  getById: async (userId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.USERS}/${userId}`);
    return response.data;
  },

  updateById: async (userId, userData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.USERS}/${userId}`, userData);
    return response.data;
  },

  deleteById: async (userId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.USERS}/${userId}`);
    return response.data;
  }
};