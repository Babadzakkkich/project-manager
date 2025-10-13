import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const tasksAPI = {
  // Получить все задачи
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.TASKS);
    return response.data;
  },

  // Получить задачи текущего пользователя
  getMyTasks: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/my`);
    return response.data;
  },

  // Получить задачи команды (для администраторов)
  getTeamTasks: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/team`);
    return response.data;
  },

  // Получить задачу по ID
  getById: async (taskId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/${taskId}`);
    return response.data;
  },

  // Создать задачу
  create: async (taskData) => {
    const response = await apiClient.post(API_ENDPOINTS.TASKS, taskData);
    return response.data;
  },

  // Обновить задачу
  update: async (taskId, taskData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.TASKS}/${taskId}`, taskData);
    return response.data;
  },

  // Удалить задачу
  delete: async (taskId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.TASKS}/${taskId}`);
    return response.data;
  },

  // Добавить пользователей к задаче
  addUsers: async (taskId, userData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.TASKS}/${taskId}/add_users`, userData);
    return response.data;
  },

  // Удалить пользователей из задачи
  removeUsers: async (taskId, userData) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.TASKS}/${taskId}/remove_users`, { data: userData });
    return response.data;
  }
};