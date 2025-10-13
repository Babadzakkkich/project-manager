// projects.js
import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const projectsAPI = {
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.PROJECTS);
    return response.data;
  },

  getMyProjects: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.PROJECTS}/my`);
    return response.data;
  },

  getById: async (projectId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.PROJECTS}/${projectId}`);
    return response.data;
  },

  create: async (projectData) => {
    const response = await apiClient.post(API_ENDPOINTS.PROJECTS, projectData);
    return response.data;
  },

  update: async (projectId, projectData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.PROJECTS}/${projectId}`, projectData);
    return response.data;
  },

  delete: async (projectId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.PROJECTS}/${projectId}`);
    return response.data;
  },

  addGroups: async (projectId, groupsData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.PROJECTS}/${projectId}/add_groups`, groupsData);
    return response.data;
  },

  removeGroups: async (projectId, groupsData) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.PROJECTS}/${projectId}/remove_groups`, {
      data: groupsData
    });
    return response.data;
  }
};