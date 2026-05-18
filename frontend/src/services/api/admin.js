import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

const buildQueryParams = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, value);
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const adminAPI = {
  getStats: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/stats`);
    return response.data;
  },

  getUsers: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/users${buildQueryParams(params)}`);
    return response.data;
  },

  blockUser: async (userId, reason = null) => {
    const response = await apiClient.patch(`${API_ENDPOINTS.ADMIN}/users/${userId}/block`, {
      reason,
    });
    return response.data;
  },

  unblockUser: async (userId) => {
    const response = await apiClient.patch(`${API_ENDPOINTS.ADMIN}/users/${userId}/unblock`);
    return response.data;
  },

  makeGlobalAdmin: async (userId) => {
    const response = await apiClient.patch(`${API_ENDPOINTS.ADMIN}/users/${userId}/make-global-admin`);
    return response.data;
  },

  getGroups: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/groups${buildQueryParams(params)}`);
    return response.data;
  },

  getGroupById: async (groupId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/groups/${groupId}`);
    return response.data;
  },

  deleteGroup: async (groupId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.ADMIN}/groups/${groupId}`);
    return response.data;
  },

  getProjects: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/projects${buildQueryParams(params)}`);
    return response.data;
  },

  getProjectById: async (projectId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/projects/${projectId}`);
    return response.data;
  },

  deleteProject: async (projectId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.ADMIN}/projects/${projectId}`);
    return response.data;
  },

  getTasks: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/tasks${buildQueryParams(params)}`);
    return response.data;
  },

  getTaskById: async (taskId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/tasks/${taskId}`);
    return response.data;
  },

  getTaskHistory: async (taskId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/tasks/${taskId}/history`);
    return response.data;
  },

  deleteTask: async (taskId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.ADMIN}/tasks/${taskId}`);
    return response.data;
  },

  getConferences: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/conferences${buildQueryParams(params)}`);
    return response.data;
  },

  getConferenceById: async (roomId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/conferences/${roomId}`);
    return response.data;
  },

  forceEndConference: async (roomId) => {
    const response = await apiClient.patch(`${API_ENDPOINTS.ADMIN}/conferences/${roomId}/force-end`);
    return response.data;
  },

  getAudit: async (params = {}) => {
    const response = await apiClient.get(`${API_ENDPOINTS.ADMIN}/audit${buildQueryParams(params)}`);
    return response.data;
  },
};