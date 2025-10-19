import { 
  USER_ROLE_TRANSLATIONS, 
  PROJECT_STATUS_TRANSLATIONS, 
  TASK_STATUS_TRANSLATIONS,
  VALIDATION_PATTERNS,
  TASK_STATUSES
} from './constants';

// Функция для объединения классов CSS
export const classNames = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

// Форматирование даты для input[type="date"]
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

// Форматирование даты
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

// Форматирование даты и времени
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

// Относительное время (например, "2 дня назад")
export const formatRelativeTime = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Сегодня';
    } else if (diffDays === 1) {
      return 'Вчера';
    } else if (diffDays < 7) {
      return `${diffDays} дня назад`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} ${weeks === 1 ? 'неделю' : 'недели'} назад`;
    } else {
      return formatDate(dateString);
    }
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '-';
  }
};

// Получение перевода роли пользователя
export const getUserRoleTranslation = (role) => {
  return USER_ROLE_TRANSLATIONS[role] || role;
};

// Получение перевода статуса проекта
export const getProjectStatusTranslation = (status) => {
  return PROJECT_STATUS_TRANSLATIONS[status] || status;
};

// Получение перевода статуса задачи
export const getTaskStatusTranslation = (status) => {
  return TASK_STATUS_TRANSLATIONS[status] || status;
};

// Валидация email
export const isValidEmail = (email) => {
  return VALIDATION_PATTERNS.EMAIL.test(email);
};

// Валидация логина
export const isValidLogin = (login) => {
  return VALIDATION_PATTERNS.LOGIN.test(login);
};

// Валидация имени
export const isValidName = (name) => {
  return VALIDATION_PATTERNS.NAME.test(name);
};

// Валидация пароля
export const isValidPassword = (password) => {
  return VALIDATION_PATTERNS.PASSWORD.test(password);
};

// Валидация диапазона дат
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

// Обрезка текста
export const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Генерация случайного цвета (для аватаров и т.д.)
export const generateRandomColor = () => {
  const colors = [
    '#004B23', '#006400', '#007200', '#38B000', '#70E000',
    '#9EF01A', '#CCFF33', '#FF6B6B', '#4ECDC4', '#45B7D1',
    '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Получение инициалов для аватара
export const getInitials = (name) => {
  if (!name) return '?';
  
  const names = name.split(' ');
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase();
  }
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

// Форматирование числа с разделителями тысяч
export const formatNumber = (number) => {
  return new Intl.NumberFormat('ru-RU').format(number);
};

// Проверка, является ли пользователь администратором
export const isAdmin = (role) => {
  return role === 'admin' || role === 'super_admin';
};

// Проверка, является ли пользователь супер-администратором
export const isSuperAdmin = (role) => {
  return role === 'super_admin';
};

// Обработка ошибок API
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

// Дебаунс функция
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

// Автоматическое определение статуса задачи
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