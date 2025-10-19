import { PROJECT_STATUSES, PROJECT_STATUS_TRANSLATIONS } from './constants';

export const getProjectStatusTranslation = (status) => {
  return PROJECT_STATUS_TRANSLATIONS[status] || status;
};

export const PROJECT_STATUS_OPTIONS = [
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'completed', label: 'Завершен' },
  { value: 'on_hold', label: 'Приостановлен' },
  { value: 'cancelled', label: 'Отменен' },
];

// Получение цвета для статуса проекта
export const getProjectStatusColor = (status) => {
  const colors = {
    planned: '#3182ce',
    in_progress: '#dd6b20',
    completed: '#38a169',
    on_hold: '#d69e2e',
    cancelled: '#e53e3e',
  };
  
  return colors[status] || '#a0aec0';
};

// Автоматическое определение статуса проекта на основе дат
export const getAutoProjectStatus = (startDate, endDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const projectStartDate = new Date(startDate);
  projectStartDate.setHours(0, 0, 0, 0);
  
  const projectEndDate = new Date(endDate);
  projectEndDate.setHours(0, 0, 0, 0);
  
  if (projectStartDate > today) {
    return PROJECT_STATUSES.PLANNED;
  } else if (projectEndDate < today) {
    return PROJECT_STATUSES.COMPLETED;
  } else {
    return PROJECT_STATUSES.IN_PROGRESS;
  }
};

// Проверка, можно ли изменить статус проекта
export const canChangeProjectStatus = (currentStatus, newStatus) => {
  const allowedTransitions = {
    planned: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'on_hold', 'cancelled'],
    on_hold: ['in_progress', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  
  return allowedTransitions[currentStatus]?.includes(newStatus) || false;
};