import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const usersAPI = {
  // Регистрация нового пользователя
  register: async (userData) => {
    const response = await apiClient.post(API_ENDPOINTS.USERS, userData);
    return response.data;
  },

  // Получить профиль текущего пользователя
  getProfile: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.USERS}/me`);
    return response.data;
  },

  // Обновить профиль текущего пользователя
  updateProfile: async (userData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.USERS}/me`, userData);
    return response.data;
  },

  // Удалить текущего пользователя
  deleteProfile: async () => {
    const response = await apiClient.delete(`${API_ENDPOINTS.USERS}/me`);
    return response.data;
  },

  // Получить всех пользователей (только для супер-админа)
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.USERS);
    return response.data;
  },

  // Получить пользователя по ID
  getById: async (userId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.USERS}/${userId}`);
    return response.data;
  },

  // Обновить пользователя по ID (только для супер-админа)
  updateById: async (userId, userData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.USERS}/${userId}`, userData);
    return response.data;
  },

  // Удалить пользователя по ID (только для супер-админа)
  deleteById: async (userId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.USERS}/${userId}`);
    return response.data;
  }
};