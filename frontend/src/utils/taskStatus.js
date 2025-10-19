import { TASK_STATUSES, TASK_STATUS_TRANSLATIONS } from './constants';

export const getTaskStatusTranslation = (status) => {
  return TASK_STATUS_TRANSLATIONS[status] || status;
};

export const TASK_STATUS_OPTIONS = [
  { value: 'planned', label: 'Запланирована' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'completed', label: 'Завершена' },
  { value: 'on_hold', label: 'Приостановлена' },
  { value: 'cancelled', label: 'Отменена' },
];

// Получение цвета для статуса задачи
export const getTaskStatusColor = (status) => {
  const colors = {
    planned: '#3182ce',
    in_progress: '#dd6b20',
    completed: '#38a169',
    on_hold: '#d69e2e',
    cancelled: '#e53e3e',
  };
  
  return colors[status] || '#a0aec0';
};

export const getAutoTaskStatus = (startDate, deadline) => {
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

// Проверка, является ли задача просроченной
export const isTaskOverdue = (deadline, status) => {
  if (status === TASK_STATUSES.COMPLETED || status === TASK_STATUSES.CANCELLED) {
    return false;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);
  
  return taskDeadline < today;
};

// Проверка, можно ли изменить статус задачи
export const canChangeTaskStatus = (currentStatus, newStatus) => {
  const allowedTransitions = {
    planned: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'on_hold', 'cancelled'],
    on_hold: ['in_progress', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  
  return allowedTransitions[currentStatus]?.includes(newStatus) || false;
};

// Получение приоритета задачи на основе дедлайна
export const getTaskPriority = (deadline) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);
  
  const diffTime = taskDeadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'overdue'; // Просрочено
  } else if (diffDays <= 1) {
    return 'high'; // Высокий
  } else if (diffDays <= 3) {
    return 'medium'; // Средний
  } else {
    return 'low'; // Низкий
  }
};

// Получение цвета приоритета задачи
export const getTaskPriorityColor = (priority) => {
  const colors = {
    overdue: '#e53e3e',
    high: '#dd6b20',
    medium: '#d69e2e',
    low: '#38a169',
  };
  
  return colors[priority] || '#a0aec0';
};