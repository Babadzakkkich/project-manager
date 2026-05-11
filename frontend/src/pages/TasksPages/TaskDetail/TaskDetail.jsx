import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FolderKanban,
  Pencil,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { tasksAPI } from '../../../services/api/tasks';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { StartConferenceButton } from '../../../components/ui/StartConferenceButton';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { CONFERENCE_ROOM_TYPES } from '../../../utils/constants';
import {
  formatDate,
  formatDateForInput,
  formatRussianCount,
  getDefaultTaskTags,
  getRussianPluralForm,
  handleApiError,
  isValidDateRange,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import {
  getTaskStatusTranslation,
  getTaskStatusIcon,
  getTaskPriorityTranslation,
  getTaskPriorityIcon,
  isTaskOverdue,
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '../../../utils/taskStatus';
import styles from './TaskDetail.module.css';

const TITLE_LIMIT = 200;
const DESCRIPTION_LIMIT = 1000;
const ASSIGNEE_FORMS = ['исполнитель', 'исполнителя', 'исполнителей'];

const TASK_PROGRESS = {
  backlog: 0,
  todo: 25,
  in_progress: 50,
  review: 75,
  done: 100,
  cancelled: 0,
  completed: 100,
};

const getDateDiffDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((end - start) / 86400000));
};

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getUserInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

export const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useAuthContext();

  const {
    notification,
    showSuccess,
    showError,
    hideNotification,
  } = useNotification();

  const defaultTags = useMemo(() => getDefaultTaskTags(), []);

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: '',
    priority: '',
    start_date: '',
    deadline: '',
    tags: [],
  });
  const [editErrors, setEditErrors] = useState({});

  const [addingUsers, setAddingUsers] = useState(false);
  const [newUserIds, setNewUserIds] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  const [userRole, setUserRole] = useState('');
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [customTag, setCustomTag] = useState('');

  const [showDeleteTaskModal, setShowDeleteTaskModal] = useState(false);
  const [showRemoveUserModal, setShowRemoveUserModal] = useState(null);

  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [isAddingUsers, setIsAddingUsers] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  const loadTask = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const taskData = await tasksAPI.getById(taskId);

      setTask(taskData);
      setEditForm({
        title: taskData.title || '',
        description: taskData.description || '',
        status: taskData.status || 'backlog',
        priority: taskData.priority || 'medium',
        start_date: taskData.start_date
          ? formatDateForInput(new Date(taskData.start_date))
          : '',
        deadline: taskData.deadline
          ? formatDateForInput(new Date(taskData.deadline))
          : '',
        tags: Array.isArray(taskData.tags) ? taskData.tags : [],
      });
    } catch (err) {
      console.error('Error loading task:', err);
      setError(handleApiError(err));
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const loadAvailableUsers = useCallback(() => {
    if (!task?.group?.users) {
      setAvailableUsers([]);
      return;
    }

    setAvailableUsers(task.group.users);
  }, [task]);

  const determineUserRole = useCallback(() => {
    if (!task || !user) return '';

    const isAssignee = task.assignees?.some((assignee) => assignee.id === user.id);

    const isGroupAdmin = task.group?.users?.some((groupUser) =>
      groupUser.id === user.id &&
      (groupUser.role === 'admin' || groupUser.role === 'super_admin')
    );

    if (isGroupAdmin) return 'admin';
    if (isAssignee) return 'assignee';
    return 'viewer';
  }, [task, user]);

  useEffect(() => {
    if (taskId) {
      loadTask();
    }
  }, [taskId, loadTask]);

  useEffect(() => {
    if (!task) return;

    loadAvailableUsers();
    setUserRole(determineUserRole());
  }, [task, loadAvailableUsers, determineUserRole]);

  const displayAssignees = useMemo(() => {
    return Array.isArray(task?.assignees) ? task.assignees.slice(0, 3) : [];
  }, [task?.assignees]);

  const usersAvailableToAdd = useMemo(() => {
    const assignedIds = new Set((task?.assignees || []).map((assignee) => assignee.id));

    return availableUsers.filter((availableUser) => !assignedIds.has(availableUser.id));
  }, [availableUsers, task?.assignees]);

  const selectedUsersToAdd = useMemo(() => {
    return availableUsers.filter((availableUser) => newUserIds.includes(availableUser.id));
  }, [availableUsers, newUserIds]);

  const isOverdue = task ? isTaskOverdue(task.deadline, task.status) : false;
  const durationDays = task ? getDateDiffDays(task.start_date, task.deadline) : null;
  const hasMoreAssignees = (task?.assignees?.length || 0) > 3;

  const canEdit = userRole === 'admin' || userRole === 'assignee';
  const canManageUsers = userRole === 'admin';
  const canDelete = userRole === 'admin';

  const getStatusClass = (status) => {
    const statusClasses = {
      backlog: styles.statusBacklog,
      todo: styles.statusTodo,
      in_progress: styles.statusInProgress,
      review: styles.statusReview,
      done: styles.statusDone,
      completed: styles.statusDone,
      cancelled: styles.statusCancelled,
    };

    return statusClasses[status] || styles.statusDefault;
  };

  const getPriorityClass = (priority) => {
    const priorityClasses = {
      low: styles.priorityLow,
      medium: styles.priorityMedium,
      high: styles.priorityHigh,
      urgent: styles.priorityUrgent,
    };

    return priorityClasses[priority] || styles.priorityMedium;
  };

  const getRoleClass = (role) => {
    const roleClasses = {
      admin: styles.roleAdmin,
      assignee: styles.roleAssignee,
      viewer: styles.roleViewer,
    };

    return roleClasses[role] || styles.roleViewer;
  };

  const handleBack = () => {
    const projectId = searchParams.get('projectId');

    if (projectId) {
      navigate(`/projects/${projectId}`);
      return;
    }

    navigate('/tasks');
  };

  const clearEditError = (fieldName) => {
    if (!editErrors[fieldName] && !editErrors.submit) return;

    setEditErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next.submit;
      return next;
    });
  };

  const handleEditChange = (fieldName, value) => {
    setEditForm((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    clearEditError(fieldName);
  };

  const validateEditForm = () => {
    const newErrors = {};
    const title = editForm.title.trim();

    if (!title) {
      newErrors.title = 'Название задачи обязательно';
    } else if (title.length < 2) {
      newErrors.title = 'Название должно содержать минимум 2 символа';
    } else if (title.length > TITLE_LIMIT) {
      newErrors.title = `Название не должно превышать ${TITLE_LIMIT} символов`;
    }

    if (editForm.description.length > DESCRIPTION_LIMIT) {
      newErrors.description = `Описание не должно превышать ${DESCRIPTION_LIMIT} символов`;
    }

    if (!editForm.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    }

    if (!editForm.deadline) {
      newErrors.deadline = 'Дата окончания обязательна';
    } else {
      const validation = isValidDateRange(editForm.start_date, editForm.deadline);

      if (!validation.isValid) {
        newErrors.deadline = validation.error;
      }
    }

    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();

    if (!validateEditForm()) return;

    setIsUpdatingTask(true);

    try {
      const updateData = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        status: editForm.status,
        priority: editForm.priority,
        start_date: editForm.start_date
          ? new Date(editForm.start_date).toISOString()
          : null,
        deadline: editForm.deadline
          ? new Date(editForm.deadline).toISOString()
          : null,
        tags: editForm.tags,
      };

      await tasksAPI.update(taskId, updateData);
      await loadTask();

      setEditing(false);
      setEditErrors({});
      showSuccess('Задача успешно обновлена');
    } catch (err) {
      console.error('Error updating task:', err);

      const errorMessage = handleApiError(err);
      setEditErrors({ submit: errorMessage });
      showError(`Не удалось обновить задачу: ${errorMessage}`);
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const handleCancelEditing = () => {
    setEditing(false);
    setEditErrors({});
    setCustomTag('');

    setEditForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'backlog',
      priority: task.priority || 'medium',
      start_date: task.start_date
        ? formatDateForInput(new Date(task.start_date))
        : '',
      deadline: task.deadline
        ? formatDateForInput(new Date(task.deadline))
        : '',
      tags: Array.isArray(task.tags) ? task.tags : [],
    });
  };

  const handleNewUserToggle = (userId) => {
    setNewUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }

      return [...prev, userId];
    });
  };

  const handleSelectAllNewUsers = () => {
    setNewUserIds((prev) => {
      if (prev.length === usersAvailableToAdd.length) {
        return [];
      }

      return usersAvailableToAdd.map((userItem) => userItem.id);
    });
  };

  const handleAddUsers = async (e) => {
    e.preventDefault();

    if (newUserIds.length === 0) return;

    setIsAddingUsers(true);

    try {
      await tasksAPI.addUsers(taskId, {
        user_ids: newUserIds.map(Number),
      });

      showSuccess(`Добавлено ${formatRussianCount(newUserIds.length, ASSIGNEE_FORMS)}`);

      setNewUserIds([]);
      setAddingUsers(false);
      await loadTask();
    } catch (err) {
      console.error('Error adding users:', err);
      showError(`Не удалось добавить исполнителей: ${handleApiError(err)}`);
    } finally {
      setIsAddingUsers(false);
    }
  };

  const handleRemoveUserClick = (userId, userLogin) => {
    setShowRemoveUserModal({ userId, userLogin });
  };

  const handleConfirmRemoveUser = async () => {
    if (!showRemoveUserModal) return;

    setIsRemovingUser(true);

    try {
      await tasksAPI.removeUsers(taskId, {
        user_ids: [showRemoveUserModal.userId],
      });

      await loadTask();
      showSuccess(`Пользователь "${showRemoveUserModal.userLogin}" удалён из задачи`);
    } catch (err) {
      console.error('Error removing user:', err);
      showError(`Не удалось удалить исполнителя: ${handleApiError(err)}`);
    } finally {
      setIsRemovingUser(false);
      setShowRemoveUserModal(null);
    }
  };

  const handleConfirmDeleteTask = async () => {
    setIsDeletingTask(true);

    try {
      await tasksAPI.delete(taskId);

      showSuccess(`Задача "${task.title}" успешно удалена`);
      handleBack();
    } catch (err) {
      console.error('Error deleting task:', err);
      showError(`Не удалось удалить задачу: ${handleApiError(err)}`);
    } finally {
      setIsDeletingTask(false);
      setShowDeleteTaskModal(false);
    }
  };

  const handleTagToggle = (tag) => {
    setEditForm((prev) => {
      const currentTags = prev.tags || [];

      if (currentTags.includes(tag)) {
        return {
          ...prev,
          tags: currentTags.filter((item) => item !== tag),
        };
      }

      return {
        ...prev,
        tags: [...currentTags, tag],
      };
    });
  };

  const handleAddCustomTag = () => {
    const preparedTag = customTag.trim();

    if (!preparedTag || editForm.tags.includes(preparedTag)) {
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      tags: [...prev.tags, preparedTag],
    }));

    setCustomTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setEditForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка задачи...</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Не удалось открыть задачу</h2>
        <p>{error || 'Задача не найдена или у вас нет доступа.'}</p>

        <Button onClick={handleBack} variant="primary">
          Вернуться к задачам
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
        duration={5000}
      />

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            Назад
          </button>

          {editing ? (
            <form onSubmit={handleUpdateTask} className={styles.editForm}>
              <Input
                label="Название задачи"
                value={editForm.title}
                onChange={(e) => handleEditChange('title', e.target.value)}
                error={editErrors.title}
                placeholder="Название задачи"
                disabled={isUpdatingTask}
                maxLength={TITLE_LIMIT}
                required
              />

              <div className={styles.textareaGroup}>
                <label className={styles.label} htmlFor="task-description">
                  Описание задачи
                </label>

                <textarea
                  id="task-description"
                  value={editForm.description}
                  onChange={(e) => handleEditChange('description', e.target.value)}
                  placeholder="Описание задачи"
                  className={`${styles.textarea} ${editErrors.description ? styles.textareaError : ''}`}
                  rows={5}
                  maxLength={DESCRIPTION_LIMIT}
                  disabled={isUpdatingTask}
                />

                <div className={styles.textareaFooter}>
                  {editErrors.description ? (
                    <span className={styles.errorMessage}>{editErrors.description}</span>
                  ) : (
                    <span className={styles.helperText}>Необязательное поле</span>
                  )}

                  <span className={styles.charCount}>
                    {editForm.description.length}/{DESCRIPTION_LIMIT}
                  </span>
                </div>
              </div>

              <div className={styles.dateFields}>
                <Input
                  label="Дата начала"
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => handleEditChange('start_date', e.target.value)}
                  error={editErrors.start_date}
                  disabled={isUpdatingTask}
                  required
                />

                <Input
                  label="Дата окончания"
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) => handleEditChange('deadline', e.target.value)}
                  error={editErrors.deadline}
                  min={editForm.start_date}
                  disabled={isUpdatingTask}
                  required
                />
              </div>

              <div className={styles.taskProperties}>
                <div className={styles.propertyGroup}>
                  <label className={styles.label} htmlFor="task-status">
                    Статус
                  </label>

                  <select
                    id="task-status"
                    value={editForm.status}
                    onChange={(e) => handleEditChange('status', e.target.value)}
                    className={styles.select}
                    disabled={isUpdatingTask}
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.propertyGroup}>
                  <label className={styles.label} htmlFor="task-priority">
                    Приоритет
                  </label>

                  <select
                    id="task-priority"
                    value={editForm.priority}
                    onChange={(e) => handleEditChange('priority', e.target.value)}
                    className={styles.select}
                    disabled={isUpdatingTask}
                  >
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.tagsEditSection}>
                <div className={styles.tagsEditHeader}>
                  <Tag size={17} strokeWidth={2} aria-hidden="true" />
                  <span>Теги задачи</span>
                </div>

                <div className={styles.availableTags}>
                  {defaultTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`${styles.tagButton} ${
                        editForm.tags.includes(tag) ? styles.tagSelected : ''
                      }`}
                      onClick={() => handleTagToggle(tag)}
                      disabled={isUpdatingTask}
                    >
                      #{tag}
                      {editForm.tags.includes(tag) && (
                        <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>

                <div className={styles.customTag}>
                  <Input
                    placeholder="Добавить свой тег..."
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                    disabled={isUpdatingTask}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || isUpdatingTask}
                  >
                    Добавить
                  </Button>
                </div>

                {editForm.tags.length > 0 && (
                  <div className={styles.selectedTags}>
                    {editForm.tags.map((tag) => (
                      <span key={tag} className={styles.selectedTag}>
                        #{tag}

                        <button
                          type="button"
                          className={styles.removeTag}
                          onClick={() => handleRemoveTag(tag)}
                          disabled={isUpdatingTask}
                          aria-label={`Удалить тег ${tag}`}
                        >
                          <X size={14} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {editErrors.submit && (
                <div className={styles.submitError} role="alert">
                  {editErrors.submit}
                </div>
              )}

              <div className={styles.editActions}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isUpdatingTask}
                  disabled={isUpdatingTask}
                >
                  Сохранить
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelEditing}
                  disabled={isUpdatingTask}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{task.title}</h1>

                <div className={styles.badges}>
                  <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>
                    <span className={styles.badgeIcon}>
                      {getTaskStatusIcon(task.status)}
                    </span>
                    {getTaskStatusTranslation(task.status)}
                  </span>

                  <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>
                    <span className={styles.badgeIcon}>
                      {getTaskPriorityIcon(task.priority)}
                    </span>
                    {getTaskPriorityTranslation(task.priority)}
                  </span>

                  {isOverdue && (
                    <span className={styles.overdueBadge}>
                      <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
                      Просрочена
                    </span>
                  )}

                  {userRole && (
                    <span className={`${styles.roleBadge} ${getRoleClass(userRole)}`}>
                      {userRole === 'admin' && 'Администратор'}
                      {userRole === 'assignee' && 'Исполнитель'}
                      {userRole === 'viewer' && 'Наблюдатель'}
                    </span>
                  )}
                </div>
              </div>

              <p className={styles.subtitle}>
                {task.description || 'Описание задачи не указано.'}
              </p>

              {task.tags && task.tags.length > 0 && (
                <div className={styles.tagsList}>
                  {task.tags.map((tag, index) => (
                    <span key={`${tag}-${index}`} className={styles.taskTag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {canEdit && !editing && (
          <div className={styles.heroActions}>
            <StartConferenceButton
              type={CONFERENCE_ROOM_TYPES.TASK}
              id={task.id}
              title={`Обсуждение задачи ${task.title}`}
              variant="primary"
              size="medium"
            />

            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              <Pencil size={16} strokeWidth={2} aria-hidden="true" />
              Редактировать
            </Button>

            {canDelete && (
              <Button
                variant="secondary"
                onClick={() => setShowDeleteTaskModal(true)}
                className={styles.deleteButton}
                disabled={isDeletingTask}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                {isDeletingTask ? 'Удаление...' : 'Удалить'}
              </Button>
            )}
          </div>
        )}
      </section>

      <section className={styles.statsGrid} aria-label="Сводка задачи">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{task.assignees?.length || 0}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(task.assignees?.length || 0, ASSIGNEE_FORMS)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>
            {durationDays === null ? '—' : durationDays}
          </span>
          <span className={styles.statLabel}>
            {durationDays === null
              ? 'дней'
              : getRussianPluralForm(durationDays, RUSSIAN_PLURAL_FORMS.DAY)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{formatDate(task.start_date)}</span>
          <span className={styles.statLabel}>дата начала</span>
        </article>

        <article className={`${styles.statCard} ${isOverdue ? styles.warningCard : ''}`}>
          <span className={styles.statValue}>{formatDate(task.deadline)}</span>
          <span className={styles.statLabel}>дата окончания</span>
        </article>
      </section>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Контекст задачи</h2>
              <p>Проект, группа, статус выполнения и прогресс.</p>
            </div>
          </div>

          <div className={styles.contextGrid}>
            <button
              type="button"
              className={styles.contextItem}
              onClick={() => task.project?.id && navigate(`/projects/${task.project.id}`)}
              disabled={!task.project?.id}
            >
              <span className={styles.contextIcon}>
                <FolderKanban size={19} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.contextText}>
                <span className={styles.contextLabel}>Проект</span>
                <span className={styles.contextValue}>
                  {task.project?.title || 'Не указан'}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={styles.contextItem}
              onClick={() => task.group?.id && navigate(`/groups/${task.group.id}`)}
              disabled={!task.group?.id}
            >
              <span className={styles.contextIcon}>
                <Users size={19} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.contextText}>
                <span className={styles.contextLabel}>Группа</span>
                <span className={styles.contextValue}>
                  {task.group?.name || 'Не указана'}
                </span>
              </span>
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Исполнители</h2>
              <p>Пользователи, назначенные на выполнение задачи.</p>
            </div>

            <div className={styles.sectionActions}>
              {canManageUsers && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => setAddingUsers((value) => !value)}
                >
                  <UserPlus size={16} strokeWidth={2} aria-hidden="true" />
                  {addingUsers ? 'Скрыть форму' : 'Добавить'}
                </Button>
              )}

              {task.assignees?.length > 0 && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowUsersModal(true)}
                >
                  Показать всех ({task.assignees.length})
                </Button>
              )}
            </div>
          </div>

          {addingUsers && (
            <form onSubmit={handleAddUsers} className={styles.addUsersForm}>
              {usersAvailableToAdd.length === 0 ? (
                <div className={styles.emptyInline}>
                  Все участники выбранной группы уже назначены на задачу.
                </div>
              ) : (
                <>
                  <div className={styles.addUsersHeader}>
                    <div>
                      <span className={styles.addUsersTitle}>Выберите исполнителей</span>
                      <span className={styles.addUsersSubtitle}>
                        {formatRussianCount(usersAvailableToAdd.length, RUSSIAN_PLURAL_FORMS.PARTICIPANT)} доступно
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      onClick={handleSelectAllNewUsers}
                    >
                      {newUserIds.length === usersAvailableToAdd.length
                        ? 'Снять всех'
                        : 'Выбрать всех'}
                    </Button>
                  </div>

                  <div className={styles.usersGrid}>
                    {usersAvailableToAdd.map((userItem) => {
                      const isSelected = newUserIds.includes(userItem.id);

                      return (
                        <label
                          key={userItem.id}
                          className={`${styles.userSelectCard} ${isSelected ? styles.selected : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleNewUserToggle(userItem.id)}
                            className={styles.checkboxInput}
                            disabled={isAddingUsers}
                          />

                          <span className={styles.checkboxCustom}>
                            {isSelected && (
                              <CheckCircle2 size={18} strokeWidth={2.4} aria-hidden="true" />
                            )}
                          </span>

                          <span className={styles.userAvatar}>
                            {getUserInitial(userItem)}
                          </span>

                          <span className={styles.userInfo}>
                            <span className={styles.userNameLine}>
                              <span className={styles.userLogin}>{getUserName(userItem)}</span>
                              {userItem.id === user?.id && (
                                <span className={styles.currentUserBadge}>Вы</span>
                              )}
                            </span>

                            {userItem.email && (
                              <span className={styles.userEmail}>{userItem.email}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {newUserIds.length > 0 && (
                    <div className={styles.selectedUsers}>
                      <span>
                        Выбрано: {formatRussianCount(newUserIds.length, ASSIGNEE_FORMS)}
                      </span>

                      <span>
                        {selectedUsersToAdd.map((item) => getUserName(item)).join(', ')}
                      </span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    loading={isAddingUsers}
                    disabled={newUserIds.length === 0 || isAddingUsers}
                  >
                    Добавить выбранных
                  </Button>
                </>
              )}
            </form>
          )}

          {task.assignees?.length > 0 ? (
            <div className={styles.assigneesSection}>
              <div className={styles.assigneesList}>
                {displayAssignees.map((assignee) => (
                  <article key={assignee.id} className={styles.assigneeCard}>
                    <div className={styles.assigneeMain}>
                      <div className={styles.assigneeAvatar}>
                        {getUserInitial(assignee)}
                      </div>

                      <div className={styles.assigneeInfo}>
                        <div className={styles.assigneeName}>
                          {getUserName(assignee)}
                          {assignee.id === user?.id && (
                            <span className={styles.currentUserBadge}>Вы</span>
                          )}
                        </div>

                        {assignee.email && (
                          <div className={styles.assigneeEmail}>
                            {assignee.email}
                          </div>
                        )}
                      </div>
                    </div>

                    {canManageUsers && task.assignees.length > 1 && (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleRemoveUserClick(assignee.id, getUserName(assignee))}
                        className={styles.removeButton}
                        disabled={isRemovingUser}
                      >
                        {isRemovingUser ? 'Удаление...' : 'Удалить'}
                      </Button>
                    )}
                  </article>
                ))}
              </div>

              {hasMoreAssignees && (
                <button
                  type="button"
                  className={styles.moreItems}
                  onClick={() => setShowUsersModal(true)}
                >
                  Ещё {formatRussianCount(
                    task.assignees.length - 3,
                    ASSIGNEE_FORMS
                  )}
                  <Users size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Users size={44} strokeWidth={1.8} aria-hidden="true" />
              </div>

              <h3>Исполнителей пока нет</h3>

              <p>
                {canManageUsers
                  ? 'Добавьте исполнителей, чтобы участники могли работать над задачей.'
                  : 'У задачи пока нет назначенных исполнителей.'}
              </p>
            </div>
          )}
        </section>
      </div>

      <ItemsModal
        items={task.assignees || []}
        itemType="users"
        isOpen={showUsersModal}
        onClose={() => setShowUsersModal(false)}
        title={`Исполнители задачи "${task.title}"`}
        currentUserId={user?.id}
        showDeleteButton={canManageUsers && task.assignees?.length > 1}
        onDelete={(userId, userLogin) => handleRemoveUserClick(userId, userLogin)}
      />

      <ConfirmationModal
        isOpen={showDeleteTaskModal}
        onClose={() => setShowDeleteTaskModal(false)}
        onConfirm={handleConfirmDeleteTask}
        title="Удаление задачи"
        message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
        confirmText={isDeletingTask ? 'Удаление...' : 'Удалить задачу'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingTask}
      />

      <ConfirmationModal
        isOpen={!!showRemoveUserModal}
        onClose={() => setShowRemoveUserModal(null)}
        onConfirm={handleConfirmRemoveUser}
        title="Удаление исполнителя"
        message={`Вы уверены, что хотите удалить пользователя "${showRemoveUserModal?.userLogin}" из задачи?`}
        confirmText={isRemovingUser ? 'Удаление...' : 'Удалить'}
        cancelText="Отмена"
        variant="warning"
        isLoading={isRemovingUser}
      />
    </div>
  );
};