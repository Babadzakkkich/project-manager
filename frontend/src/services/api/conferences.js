import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const conferencesAPI = {
  // Создание комнаты
  createRoom: async (roomData) => {
    const response = await apiClient.post('/conferences/rooms', roomData);
    return response.data;
  },

  // Получение списка доступных комнат
  getAvailableRooms: async () => {
    const response = await apiClient.get('/conferences/rooms');
    return response.data;
  },

  // Получение информации о комнате
  getRoomById: async (roomId) => {
    const response = await apiClient.get(`/conferences/rooms/${roomId}`);
    return response.data;
  },

  // Подключение к комнате (получение токена)
  joinRoom: async (roomId) => {
    const response = await apiClient.post(`/conferences/rooms/${roomId}/join`);
    return response.data;
  },

  // Выход из комнаты
  leaveRoom: async (roomId) => {
    const response = await apiClient.post(`/conferences/rooms/${roomId}/leave`);
    return response.data;
  },

  // Завершение конференции (только для модератора)
  endConference: async (roomId) => {
    const response = await apiClient.delete(`/conferences/rooms/${roomId}`);
    return response.data;
  },

  // Получение созвонов проекта
  getProjectConferences: async (projectId) => {
    const response = await apiClient.get(`/conferences/rooms/project/${projectId}`);
    return response.data;
  },

  // Получение созвонов группы
  getGroupConferences: async (groupId) => {
    const response = await apiClient.get(`/conferences/rooms/group/${groupId}`);
    return response.data;
  },

  // Получение созвонов задачи
  getTaskConferences: async (taskId) => {
    const response = await apiClient.get(`/conferences/rooms/task/${taskId}`);
    return response.data;
  },

  // Получение статистики комнаты
  getRoomStats: async (roomId) => {
    const response = await apiClient.get(`/conferences/stats/${roomId}`);
    return response.data;
  }
};