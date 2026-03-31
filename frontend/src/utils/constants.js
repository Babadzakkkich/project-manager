// utils/constants.js - ОБНОВЛЕННАЯ ВЕРСИЯ

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
    600: '#718096',
    700: '#4a5568',
    800: '#2d3748',
    900: '#1a202c',
  },
  error: '#e53e3e',
  warning: '#dd6b20',
  info: '#3182ce'
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
  NOTIFICATIONS: '/notifications',
};

// Добавляем типы уведомлений
export const NOTIFICATION_TYPES = {
  // Групповые
  GROUP_CREATED: 'group_created',
  GROUP_UPDATED: 'group_updated',
  GROUP_DELETED: 'group_deleted',
  USER_ADDED_TO_GROUP: 'user_added_to_group',
  USER_REMOVED_FROM_GROUP: 'user_removed_from_group',
  USER_ROLE_CHANGED: 'user_role_changed',
  
  // Проектные
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  GROUP_ADDED_TO_PROJECT: 'group_added_to_project',
  GROUP_REMOVED_FROM_PROJECT: 'group_removed_from_project',
  
  // Задачные
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_DELETED: 'task_deleted',
  TASK_STATUS_CHANGED: 'task_status_changed',
  TASK_PRIORITY_CHANGED: 'task_priority_changed',
  USER_ASSIGNED_TO_TASK: 'user_assigned_to_task',
  USER_UNASSIGNED_FROM_TASK: 'user_unassigned_from_task',
  TASK_DEADLINE_APPROACHING: 'task_deadline_approaching',
  TASK_OVERDUE: 'task_overdue',

  // Приглашения
  GROUP_INVITATION: 'group_invitation',
  GROUP_INVITATION_ACCEPTED: 'group_invitation_accepted',
  GROUP_INVITATION_DECLINED: 'group_invitation_declined',
};

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

export const NOTIFICATION_ICONS = {
  [NOTIFICATION_TYPES.GROUP_CREATED]: '👥',
  [NOTIFICATION_TYPES.GROUP_UPDATED]: '✏️',
  [NOTIFICATION_TYPES.GROUP_DELETED]: '🗑️',
  [NOTIFICATION_TYPES.USER_ADDED_TO_GROUP]: '➕',
  [NOTIFICATION_TYPES.USER_REMOVED_FROM_GROUP]: '➖',
  [NOTIFICATION_TYPES.USER_ROLE_CHANGED]: '🔄',
  [NOTIFICATION_TYPES.PROJECT_CREATED]: '📁',
  [NOTIFICATION_TYPES.PROJECT_UPDATED]: '📝',
  [NOTIFICATION_TYPES.PROJECT_DELETED]: '🗑️',
  [NOTIFICATION_TYPES.GROUP_ADDED_TO_PROJECT]: '🔗',
  [NOTIFICATION_TYPES.GROUP_REMOVED_FROM_PROJECT]: '🔗',
  [NOTIFICATION_TYPES.TASK_CREATED]: '✅',
  [NOTIFICATION_TYPES.TASK_UPDATED]: '✏️',
  [NOTIFICATION_TYPES.TASK_DELETED]: '🗑️',
  [NOTIFICATION_TYPES.TASK_STATUS_CHANGED]: '🔄',
  [NOTIFICATION_TYPES.TASK_PRIORITY_CHANGED]: '⚡',
  [NOTIFICATION_TYPES.USER_ASSIGNED_TO_TASK]: '👤',
  [NOTIFICATION_TYPES.USER_UNASSIGNED_FROM_TASK]: '👤',
  [NOTIFICATION_TYPES.TASK_DEADLINE_APPROACHING]: '⏰',
  [NOTIFICATION_TYPES.TASK_OVERDUE]: '⚠️',
  [NOTIFICATION_TYPES.GROUP_INVITATION]: '📧',
  [NOTIFICATION_TYPES.GROUP_INVITATION_ACCEPTED]: '✅',
  [NOTIFICATION_TYPES.GROUP_INVITATION_DECLINED]: '❌',
};

export const NOTIFICATION_PRIORITY_COLORS = {
  low: '#718096',
  medium: '#3182ce',
  high: '#dd6b20',
  urgent: '#e53e3e'
};

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MEMBER: 'member',
};

export const USER_ROLE_TRANSLATIONS = {
  super_admin: 'Супер-администратор',
  admin: 'Администратор',
  member: 'Участник',
};

export const PROJECT_STATUSES = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled',
};

export const PROJECT_STATUS_TRANSLATIONS = {
  planned: 'Запланирован',
  in_progress: 'В процессе',
  completed: 'Завершен',
  on_hold: 'Приостановлен',
  cancelled: 'Отменен',
};

export const TASK_STATUSES = {
  BACKLOG: 'backlog',
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

export const TASK_STATUS_TRANSLATIONS = {
  backlog: 'Бэклог',
  todo: 'К выполнению',
  in_progress: 'В процессе',
  review: 'На проверке',
  done: 'Выполнена',
  cancelled: 'Отменена',
};

export const TASK_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

export const TASK_PRIORITY_TRANSLATIONS = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
};

export const BOARD_VIEW_MODES = {
  TEAM: 'team',
  PERSONAL: 'personal',
};

export const BOARD_VIEW_TRANSLATIONS = {
  team: 'Команда',
  personal: 'Личный',
};

export const ROLE_OPTIONS = [
  { value: 'member', label: 'Участник' },
  { value: 'admin', label: 'Администратор' },
];

export const PROJECT_STATUS_OPTIONS = [
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'completed', label: 'Завершен' },
  { value: 'on_hold', label: 'Приостановлен' },
  { value: 'cancelled', label: 'Отменен' },
];

export const TASK_STATUS_OPTIONS = [
  { value: 'backlog', label: 'Бэклог' },
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Выполнена' },
  { value: 'cancelled', label: 'Отменена' },
];

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'urgent', label: 'Срочный' },
];

export const BOARD_VIEW_OPTIONS = [
  { value: 'team', label: 'Командная доска' },
  { value: 'personal', label: 'Личная доска' },
];

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZES: [10, 25, 50, 100],
};

export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  LOGIN: /^[a-zA-Z0-9_]{3,50}$/,
  NAME: /^[a-zA-Zа-яА-ЯёЁ\s]{2,100}$/,
  PASSWORD: /^.{6,}$/,
};

export const KANBAN_CONFIG = {
  COLUMNS: [
    { id: 'backlog', status: 'backlog', title: 'Бэклог', maxTasks: 50 },
    { id: 'todo', status: 'todo', title: 'К выполнению', maxTasks: 20 },
    { id: 'in_progress', status: 'in_progress', title: 'В процессе', maxTasks: 10 },
    { id: 'review', status: 'review', title: 'На проверке', maxTasks: 10 },
    { id: 'done', status: 'done', title: 'Выполнена', maxTasks: 50 },
  ],
  DEFAULT_POSITION_STEP: 1000,
};

export const PRIORITY_COLORS = {
  low: '#38a169',    
  medium: '#d69e2e',
  high: '#dd6b20', 
  urgent: '#e53e3e',
};

export const PRIORITY_ICONS = {
  low: '⬇️',
  medium: '➡️',
  high: '⬆️',
  urgent: '🚨',
};