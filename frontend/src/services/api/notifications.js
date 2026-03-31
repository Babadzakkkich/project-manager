import apiClient from './client';
import { API_ENDPOINTS } from '../../utils/constants';

export const notificationsAPI = {
  // Получение списка уведомлений
  getNotifications: async (params = {}) => {
    const { limit = 50, offset = 0, unread_only = false, type = null } = params;
    const queryParams = new URLSearchParams({
      limit,
      offset,
      unread_only,
      ...(type && { notification_type: type })
    });
    const response = await apiClient.get(`${API_ENDPOINTS.NOTIFICATIONS}/?${queryParams}`);
    return response.data;
  },

  // Получение количества непрочитанных уведомлений
  getUnreadCount: async () => {
    const response = await apiClient.get(`${API_ENDPOINTS.NOTIFICATIONS}/unread/count`);
    return response.data;
  },

  // Отметить уведомление как прочитанное
  markAsRead: async (notificationId) => {
    const response = await apiClient.post(`${API_ENDPOINTS.NOTIFICATIONS}/${notificationId}/read`);
    return response.data;
  },

  // Отметить все уведомления как прочитанные
  markAllAsRead: async () => {
    const response = await apiClient.post(`${API_ENDPOINTS.NOTIFICATIONS}/read-all`);
    return response.data;
  }
};