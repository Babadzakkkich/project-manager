import {
  TASK_STATUSES,
  TASK_STATUS_TRANSLATIONS,
  TASK_PRIORITIES,
  TASK_PRIORITY_TRANSLATIONS,
  PRIORITY_COLORS,
} from './constants';

import {
  TASK_STATUS_ICON_COMPONENTS,
  TASK_PRIORITY_ICON_COMPONENTS,
  DEFAULT_TASK_STATUS_ICON,
  DEFAULT_TASK_PRIORITY_ICON,
  TASK_OVERDUE_ICON_COMPONENT,
  renderIconComponent,
} from './icons';

export const getTaskStatusTranslation = (status) => {
  return TASK_STATUS_TRANSLATIONS[status] || status;
};

export const TASK_STATUS_OPTIONS = [
  { value: 'backlog', label: 'Бэклог' },
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Выполнена' },
  { value: 'cancelled', label: 'Отменена' },
];

export const getTaskStatusColor = (status) => {
  const colors = {
    backlog: '#a0aec0',
    todo: '#3182ce',
    in_progress: '#dd6b20',
    review: '#d69e2e',
    done: '#38a169',
    cancelled: '#e53e3e',
  };

  return colors[status] || '#a0aec0';
};

export const getTaskStatusIcon = (status, props = {}) => {
  const Icon = TASK_STATUS_ICON_COMPONENTS[status] || DEFAULT_TASK_STATUS_ICON;

  return renderIconComponent(Icon, {
    size: 15,
    strokeWidth: 2,
    ...props,
  });
};

export const getAutoTaskStatus = (startDate, deadline) => {
  if (!startDate || !deadline) return TASK_STATUSES.BACKLOG;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskStartDate = new Date(startDate);
  taskStartDate.setHours(0, 0, 0, 0);

  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);

  if (taskStartDate > today) {
    return TASK_STATUSES.TODO;
  }

  if (taskDeadline < today) {
    return TASK_STATUSES.DONE;
  }

  return TASK_STATUSES.IN_PROGRESS;
};

export const isTaskOverdue = (deadline, status) => {
  if (status === TASK_STATUSES.DONE || status === TASK_STATUSES.CANCELLED) {
    return false;
  }

  if (!deadline) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);

  return taskDeadline < today;
};

export const canChangeTaskStatus = (currentStatus, newStatus) => {
  const allowedTransitions = {
    backlog: ['todo', 'cancelled'],
    todo: ['in_progress', 'backlog', 'cancelled'],
    in_progress: ['review', 'todo', 'cancelled'],
    review: ['done', 'in_progress', 'cancelled'],
    done: ['in_progress', 'review'],
    cancelled: ['todo', 'backlog'],
  };

  return allowedTransitions[currentStatus]?.includes(newStatus) || false;
};

export const getNextStatusOptions = (currentStatus) => {
  const transitions = {
    backlog: ['todo', 'cancelled'],
    todo: ['in_progress', 'backlog', 'cancelled'],
    in_progress: ['review', 'todo', 'cancelled'],
    review: ['done', 'in_progress', 'cancelled'],
    done: ['in_progress', 'review'],
    cancelled: ['todo', 'backlog'],
  };

  return (transitions[currentStatus] || []).map(status => ({
    value: status,
    label: getTaskStatusTranslation(status),
    color: getTaskStatusColor(status),
  }));
};

export const getTaskPriorityTranslation = (priority) => {
  return TASK_PRIORITY_TRANSLATIONS[priority] || priority;
};

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'urgent', label: 'Срочный' },
];

export const getTaskPriorityColor = (priority) => {
  return PRIORITY_COLORS[priority] || '#a0aec0';
};

export const getTaskPriorityIcon = (priority, props = {}) => {
  const Icon = TASK_PRIORITY_ICON_COMPONENTS[priority] || DEFAULT_TASK_PRIORITY_ICON;

  return renderIconComponent(Icon, {
    size: 15,
    strokeWidth: 2,
    ...props,
  });
};

export const getTaskOverdueIcon = (props = {}) => {
  return renderIconComponent(TASK_OVERDUE_ICON_COMPONENT, {
    size: 15,
    strokeWidth: 2,
    ...props,
  });
};

export const getAutoTaskPriority = (deadline) => {
  if (!deadline) return TASK_PRIORITIES.MEDIUM;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskDeadline = new Date(deadline);
  taskDeadline.setHours(0, 0, 0, 0);

  const diffTime = taskDeadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return TASK_PRIORITIES.URGENT;
  }

  if (diffDays <= 1) {
    return TASK_PRIORITIES.URGENT;
  }

  if (diffDays <= 3) {
    return TASK_PRIORITIES.HIGH;
  }

  if (diffDays <= 7) {
    return TASK_PRIORITIES.MEDIUM;
  }

  return TASK_PRIORITIES.LOW;
};

export const getColumnOrder = () => {
  return ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'];
};

export const getColumnByStatus = (status) => {
  const columns = {
    backlog: { id: 'backlog', title: 'Бэклог', status: 'backlog' },
    todo: { id: 'todo', title: 'К выполнению', status: 'todo' },
    in_progress: { id: 'in_progress', title: 'В процессе', status: 'in_progress' },
    review: { id: 'review', title: 'На проверке', status: 'review' },
    done: { id: 'done', title: 'Выполнена', status: 'done' },
    cancelled: { id: 'cancelled', title: 'Отменена', status: 'cancelled' },
  };

  return columns[status] || columns.backlog;
};

export const getAllColumns = () => {
  return [
    getColumnByStatus('backlog'),
    getColumnByStatus('todo'),
    getColumnByStatus('in_progress'),
    getColumnByStatus('review'),
    getColumnByStatus('done'),
    getColumnByStatus('cancelled'),
  ];
};

export const getActiveColumns = () => {
  return [
    getColumnByStatus('backlog'),
    getColumnByStatus('todo'),
    getColumnByStatus('in_progress'),
    getColumnByStatus('review'),
    getColumnByStatus('done'),
  ];
};

export const isFinalStatus = (status) => {
  return status === TASK_STATUSES.DONE || status === TASK_STATUSES.CANCELLED;
};

export const getTasksProgress = (tasks = []) => {
  const total = tasks.length;

  if (total === 0) {
    return 0;
  }

  const completed = tasks.filter(task => task.status === TASK_STATUSES.DONE).length;
  return Math.round((completed / total) * 100);
};

export const sortTasksByPosition = (tasks = []) => {
  return [...tasks].sort((a, b) => {
    const positionA = Number.isFinite(a.position) ? a.position : 0;
    const positionB = Number.isFinite(b.position) ? b.position : 0;

    return positionA - positionB;
  });
};

export const generateNewPosition = (tasksInColumn = []) => {
  if (tasksInColumn.length === 0) {
    return 0;
  }

  const maxPosition = Math.max(
    ...tasksInColumn.map(task =>
      Number.isFinite(task.position) ? task.position : 0
    )
  );

  return maxPosition + 1000;
};

export const filterTasksByStatus = (tasks = [], status) => {
  return tasks.filter(task => task.status === status);
};

export const filterTasksByPriority = (tasks = [], priority) => {
  return tasks.filter(task => task.priority === priority);
};

export const filterTasksByAssignee = (tasks = [], userId) => {
  return tasks.filter(task =>
    task.assignees &&
    task.assignees.some(assignee => assignee.id === userId)
  );
};

export const searchTasks = (tasks = [], searchText) => {
  if (!searchText) return tasks;

  const lowerSearch = searchText.toLowerCase();

  return tasks.filter(task =>
    task.title.toLowerCase().includes(lowerSearch) ||
    (task.description && task.description.toLowerCase().includes(lowerSearch))
  );
};