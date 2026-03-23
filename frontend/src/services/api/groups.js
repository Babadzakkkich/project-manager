import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const groupsAPI = {
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.GROUPS);
    return response.data;
  },

  getMyGroups: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.GROUPS}/my`);
    return response.data;
  },

  create: async (groupData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.GROUPS}/`, groupData);
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

  // Новая система приглашений
  inviteUser: async (groupId, inviteData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.GROUPS}/${groupId}/invite`, inviteData);
    return response.data;
  },

  getPendingInvitations: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.GROUPS}/invitations/pending`);
    return response.data;
  },

  acceptInvitation: async (token) => {
    const response = await apiClient.post(`${API_ENDPOINTS.GROUPS}/invitations/${token}/accept`);
    return response.data;
  },

  declineInvitation: async (token) => {
    const response = await apiClient.post(`${API_ENDPOINTS.GROUPS}/invitations/${token}/decline`);
    return response.data;
  },

  // Удаление пользователей из группы (оставляем)
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