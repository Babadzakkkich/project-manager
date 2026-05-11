import { 
  USER_ROLE_TRANSLATIONS, 
  PROJECT_STATUS_TRANSLATIONS, 
  TASK_STATUS_TRANSLATIONS,
  VALIDATION_PATTERNS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  BOARD_VIEW_MODES 
} from './constants';

export const classNames = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

export const formatDateForInput = (date) => {
  if (!date) return '';
  
  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date for input:', error);
    return '';
  }
};

export const formatDate = (dateString, options = {}) => {
  if (!dateString) return '-';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { ...defaultOptions, ...options });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '-';
  }
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return '-';
  }
};

export const formatRelativeTime = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = targetDate - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Сегодня';
    } else if (diffDays === 1) {
      return 'Завтра';
    } else if (diffDays === -1) {
      return 'Вчера';
    } else if (diffDays > 1 && diffDays < 7) {
      return `Через ${diffDays} ${getDayWord(diffDays)}`;
    } else if (diffDays < 0 && diffDays > -7) {
      return `${Math.abs(diffDays)} ${getDayWord(Math.abs(diffDays))} назад`;
    } else if (diffDays >= 7 && diffDays < 14) {
      return 'Через неделю';
    } else if (diffDays <= -7 && diffDays > -14) {
      return 'Неделю назад';
    } else if (diffDays >= 14 && diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `Через ${weeks} ${getWeekWord(weeks)}`;
    } else if (diffDays <= -14 && diffDays > -30) {
      const weeks = Math.floor(Math.abs(diffDays) / 7);
      return `${weeks} ${getWeekWord(weeks)} назад`;
    } else {
      return formatDate(dateString, {
        day: 'numeric',
        month: 'short'
      });
    }
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '-';
  }
};

const getDayWord = (days) => {
  return getRussianPluralForm(days, RUSSIAN_PLURAL_FORMS.DAY);
};

const getWeekWord = (weeks) => {
  return getRussianPluralForm(weeks, RUSSIAN_PLURAL_FORMS.WEEK);
};

export const getUserRoleTranslation = (role) => {
  return USER_ROLE_TRANSLATIONS[role] || role;
};

export const getProjectStatusTranslation = (status) => {
  return PROJECT_STATUS_TRANSLATIONS[status] || status;
};

export const getTaskStatusTranslation = (status) => {
  return TASK_STATUS_TRANSLATIONS[status] || status;
};

export const isValidEmail = (email) => {
  return VALIDATION_PATTERNS.EMAIL.test(email);
};

export const isValidLogin = (login) => {
  return VALIDATION_PATTERNS.LOGIN.test(login);
};

export const isValidName = (name) => {
  return VALIDATION_PATTERNS.NAME.test(name);
};

export const isValidPassword = (password) => {
  return VALIDATION_PATTERNS.PASSWORD.test(password);
};

export const isValidDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return { isValid: false, error: 'Даты начала и окончания обязательны' };
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (end < start) {
    return { isValid: false, error: 'Дата окончания не может быть раньше даты начала' };
  }
  
  return { isValid: true };
};

export const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const generateRandomColor = () => {
  const colors = [
    '#004B23', '#006400', '#007200', '#38B000', '#70E000',
    '#9EF01A', '#CCFF33', '#FF6B6B', '#4ECDC4', '#45B7D1',
    '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export const getInitials = (name) => {
  if (!name) return '?';
  
  const names = name.split(' ');
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase();
  }
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

export const formatNumber = (number) => {
  return new Intl.NumberFormat('ru-RU').format(number);
};

export const isAdmin = (role) => {
  return role === 'admin' || role === 'super_admin';
};

export const isSuperAdmin = (role) => {
  return role === 'super_admin';
};

export const handleApiError = (error) => {
  console.error('API Error:', error);
  
  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }
  
  if (error.response?.data?.errors) {
    return Object.values(error.response.data.errors).flat().join(', ');
  }
  
  if (error.response?.status === 403) {
    return 'Доступ запрещен: недостаточно прав';
  }
  
  if (error.response?.status === 404) {
    return 'Ресурс не найден';
  }
  
  if (error.response?.status === 500) {
    return 'Внутренняя ошибка сервера';
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'Произошла неизвестная ошибка';
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const getAutoTaskStatus = (startDate, deadline) => {
  if (!startDate || !deadline) return TASK_STATUSES.PLANNED;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const taskStartDate = new Date(startDate);
  taskStartDate.setHours(0, 0, 0, 0);
  
  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);
  
  if (taskStartDate > today) {
    return TASK_STATUSES.PLANNED;
  } else if (taskDeadline < today) {
    return TASK_STATUSES.COMPLETED;
  } else {
    return TASK_STATUSES.IN_PROGRESS;
  }
};

export const isTaskAssignee = (task, userId) => {
  if (!task || !task.assignees) return false;
  return task.assignees.some(assignee => assignee.id === userId);
};

export const canEditTask = (task, user, userRoleInGroup) => {
  if (!task || !user) return false;
  
  if (isTaskAssignee(task, user.id)) {
    return true;
  }
  
  if (userRoleInGroup === 'admin' || userRoleInGroup === 'super_admin') {
    return true;
  }
  
  return false;
};

export const getDefaultTaskTags = () => {
  return ['feature', 'bug', 'improvement', 'documentation', 'urgent'];
};

export const formatTaskTags = (tags) => {
  if (!tags || !Array.isArray(tags)) return [];
  return tags.map(tag => ({
    value: tag,
    label: tag.charAt(0) + tag.slice(1)
  }));
};

export const isValidTaskStatus = (status) => {
  return Object.values(TASK_STATUSES).includes(status);
};

export const isValidTaskPriority = (priority) => {
  return Object.values(TASK_PRIORITIES).includes(priority);
};

export const isValidBoardViewMode = (mode) => {
  return Object.values(BOARD_VIEW_MODES).includes(mode);
};

export const RUSSIAN_PLURAL_FORMS = {
  TASK: ['задача', 'задачи', 'задач'],
  GROUP: ['группа', 'группы', 'групп'],
  PROJECT: ['проект', 'проекта', 'проектов'],
  USER: ['пользователь', 'пользователя', 'пользователей'],
  PARTICIPANT: ['участник', 'участника', 'участников'],
  NOTIFICATION: ['уведомление', 'уведомления', 'уведомлений'],
  INVITATION: ['приглашение', 'приглашения', 'приглашений'],
  DAY: ['день', 'дня', 'дней'],
  WEEK: ['неделя', 'недели', 'недель'],
};

export const getRussianPluralForm = (count, forms) => {
  const number = Math.abs(Number(count)) || 0;
  const lastTwoDigits = number % 100;
  const lastDigit = number % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return forms[2];
  }

  if (lastDigit === 1) {
    return forms[0];
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1];
  }

  return forms[2];
};

export const formatRussianCount = (count, forms) => {
  const number = Number(count) || 0;
  return `${number} ${getRussianPluralForm(number, forms)}`;
};