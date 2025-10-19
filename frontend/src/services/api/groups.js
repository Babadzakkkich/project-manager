import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const groupsAPI = {
  // Получить все группы (только для супер-админа)
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.GROUPS);
    return response.data;
  },

  // Получить группы текущего пользователя - ОБНОВЛЕНО
  getMyGroups: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.GROUPS}/my`);
    return response.data;
  },

  // Создать новую группу
  create: async (groupData) => {
    const response = await apiClient.post(API_ENDPOINTS.GROUPS, groupData);
    return response.data;
  },

  getById: async (groupId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.GROUPS}/${groupId}`);
    return response.data;
  },

  update: async (groupId, groupData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.GROUPS}/${groupId}`, groupData);
    return response.data;
  },

  delete: async (groupId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.GROUPS}/${groupId}`);
    return response.data;
  },

  addUsers: async (groupId, usersData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.GROUPS}/${groupId}/add_users`, usersData);
    return response.data;
  },

  removeUsers: async (groupId, usersData) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.GROUPS}/${groupId}/remove_users`, {
      data: usersData
    });
    return response.data;
  },

  getMyRole: async (groupId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.GROUPS}/${groupId}/my_role`);
    return response.data;
  },

  changeUserRole: async (groupId, roleData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.GROUPS}/${groupId}/change_role`, roleData);
    return response.data;
  }
};