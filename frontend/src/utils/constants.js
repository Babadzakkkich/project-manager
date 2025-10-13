export const API_BASE_URL = 'http://localhost:8000';
export const COLORS = {
  primary: '#004B23',
  secondary: '#006400',
  accent: '#007200',
  success: '#008000',
  highlight: '#38B000',
  white: '#FFFFFF',
  gray: {
    100: '#f7fafc',
    200: '#edf2f7',
    300: '#e2e8f0',
    400: '#cbd5e0',
    500: '#a0aec0',
  }
};

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
  },
  USERS: '/users',
  GROUPS: '/groups',
  PROJECTS: '/projects',
  TASKS: '/tasks',
};