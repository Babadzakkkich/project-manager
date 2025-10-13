export const getTaskStatusTranslation = (status) => {
  const statusTranslations = {
    'in_progress': 'В процессе',
    'completed': 'Завершена',
    'planned': 'Запланирована',
    'on_hold': 'Приостановлена',
    'cancelled': 'Отменена'
  };
  
  return statusTranslations[status] || status;
};

export const TASK_STATUSES = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PLANNED: 'planned',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled'
};

export const getAutoTaskStatus = (startDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const taskStartDate = new Date(startDate);
  taskStartDate.setHours(0, 0, 0, 0);
  
  if (taskStartDate > today) {
    return TASK_STATUSES.PLANNED;
  } else {
    return TASK_STATUSES.IN_PROGRESS;
  }
};