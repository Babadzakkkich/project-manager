// frontend/src/services/api/tasks.js
import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const tasksAPI = {
  getAll: async () => {
    const response = await apiClient.get(API_ENDPOINTS.TASKS);
    return response.data;
  },

  getMyTasks: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/my`);
    return response.data;
  },

  getTeamTasks: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/team`);
    return response.data;
  },

  getById: async (taskId) => {
    const response = await apiClient.get(`${API_ENDPOINTS.TASKS}/${taskId}`);
    return response.data;
  },

  create: async (taskData) => {
    const response = await apiClient.post(API_ENDPOINTS.TASKS, taskData);
    return response.data;
  },

  createForUsers: async (taskData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.TASKS}/create_for_users`, taskData);
    return response.data;
  },

  update: async (taskId, taskData) => {
    const response = await apiClient.put(`${API_ENDPOINTS.TASKS}/${taskId}`, taskData);
    return response.data;
  },

  delete: async (taskId) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.TASKS}/${taskId}`);
    return response.data;
  },

  addUsers: async (taskId, userData) => {
    const response = await apiClient.post(`${API_ENDPOINTS.TASKS}/${taskId}/add_users`, userData);
    return response.data;
  },

  removeUsers: async (taskId, userData) => {
    const response = await apiClient.delete(`${API_ENDPOINTS.TASKS}/${taskId}/remove_users`, { 
      data: userData 
    });
    return response.data;
  },
  
  getProjectBoard: async (projectId, groupId, viewMode = 'team') => {
    const response = await apiClient.get(
      `${API_ENDPOINTS.TASKS}/board/project/${projectId}`,
      { 
        params: { 
          group_id: groupId, 
          view_mode: viewMode 
        } 
      }
    );
    return response.data;
  },

  updateTaskStatus: async (taskId, status) => {
    const response = await apiClient.put(
      `${API_ENDPOINTS.TASKS}/${taskId}`,
      { 
        status: status.value || status
      }
    );
    return response.data;
  },

  updateTaskPosition: async (taskId, position) => {
    const response = await apiClient.put(
      `${API_ENDPOINTS.TASKS}/${taskId}/position?position=${position}`
    );
    return response.data;
  },

  updateTaskPriority: async (taskId, priority) => {
    // Согласно бэкенду, это PUT эндпоинт с параметром в пути
    const response = await apiClient.put(
      `${API_ENDPOINTS.TASKS}/${taskId}/priority`,
      { priority_update: priority }
    );
    return response.data;
  },

  bulkUpdateTasks: async (updates) => {
    const response = await apiClient.post(
      `${API_ENDPOINTS.TASKS}/bulk_update`,
      updates
    );
    return response.data;
  },

  getTaskHistory: async (taskId) => {
    const response = await apiClient.get(
      `${API_ENDPOINTS.TASKS}/${taskId}/history`
    );
    return response.data;
  },

  quickCreateTask: async (taskData) => {
    const response = await apiClient.post(
      `${API_ENDPOINTS.TASKS}/quick_create`,
      taskData
    );
    return response.data;
  }
};