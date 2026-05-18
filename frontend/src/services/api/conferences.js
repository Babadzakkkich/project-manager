import apiClient from './client';

export const conferencesAPI = {
  createRoom: async (roomData) => {
    const response = await apiClient.post('/conferences/rooms', roomData);
    return response.data;
  },

  getAvailableRooms: async (status = 'active') => {
    const response = await apiClient.get('/conferences/rooms', {
      params: { status },
    });
    return response.data;
  },

  getInvitableUsers: async (params = {}) => {
    const response = await apiClient.get('/conferences/rooms/invitable-users', {
      params,
    });
    return response.data;
  },

  getRoomById: async (roomId) => {
    const response = await apiClient.get(`/conferences/rooms/${roomId}`);
    return response.data;
  },

  joinRoom: async (roomId) => {
    const response = await apiClient.post(`/conferences/rooms/${roomId}/join`);
    return response.data;
  },

  getLeaveImpact: async (roomId) => {
    const response = await apiClient.get(`/conferences/rooms/${roomId}/leave-impact`);
    return response.data;
  },

  leaveRoom: async (roomId, options = {}) => {
    const response = await apiClient.post(`/conferences/rooms/${roomId}/leave`, {
      auto_end_if_last: Boolean(options.auto_end_if_last),
    });

    return response.data;
  },

  getRoomMessages: async (roomId, params = {}) => {
    const { limit = 50, before_id = null } = params;
    const queryParams = new URLSearchParams({ limit });

    if (before_id) {
      queryParams.append('before_id', before_id);
    }

    const response = await apiClient.get(
      `/conferences/rooms/${roomId}/messages?${queryParams}`
    );

    return response.data;
  },

  sendRoomMessage: async (roomId, message) => {
    const response = await apiClient.post(`/conferences/rooms/${roomId}/messages`, {
      message,
    });

    return response.data;
  },

  endConference: async (roomId) => {
    const response = await apiClient.delete(`/conferences/rooms/${roomId}`);
    return response.data;
  },

  getProjectConferences: async (projectId, status = 'active') => {
    const response = await apiClient.get(`/conferences/rooms/project/${projectId}`, {
      params: { status },
    });

    return response.data;
  },

  getGroupConferences: async (groupId, status = 'active') => {
    const response = await apiClient.get(`/conferences/rooms/group/${groupId}`, {
      params: { status },
    });

    return response.data;
  },

  getTaskConferences: async (taskId, status = 'active') => {
    const response = await apiClient.get(`/conferences/rooms/task/${taskId}`, {
      params: { status },
    });

    return response.data;
  },

  getRoomStats: async (roomId) => {
    const response = await apiClient.get(`/conferences/stats/${roomId}`);
    return response.data;
  },
};