export const getProjectStatusTranslation = (status) => {
  const statusTranslations = {
    'in_progress': 'В процессе',
    'completed': 'Завершен',
    'planned': 'Запланирован',
    'on_hold': 'Приостановлен',
    'cancelled': 'Отменен'
  };
  
  return statusTranslations[status] || status;
};

export const PROJECT_STATUSES = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PLANNED: 'planned',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled'
};