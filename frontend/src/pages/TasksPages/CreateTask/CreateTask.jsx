import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Plus,
  ShieldCheck,
  Tag,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

import { tasksAPI } from '../../../services/api/tasks';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import {
  getTaskStatusTranslation,
  getTaskStatusIcon,
  getTaskPriorityTranslation,
  getTaskPriorityIcon,
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '../../../utils/taskStatus';
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
} from '../../../utils/constants';
import {
  formatDateForInput,
  formatRussianCount,
  getDefaultTaskTags,
  getRussianPluralForm,
  handleApiError,
  isValidDateRange,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './CreateTask.module.css';

const DESCRIPTION_LIMIT = 1000;
const TITLE_LIMIT = 200;

const ASSIGNEE_FORMS = ['исполнитель', 'исполнителя', 'исполнителей'];

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getUserInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

const getUserRoleLabel = (role) => {
  if (role === 'admin') {
    return 'Администратор';
  }

  return 'Участник';
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

const getStatusClass = (status) => {
  const statusClasses = {
    backlog: styles.statusBacklog,
    todo: styles.statusTodo,
    in_progress: styles.statusInProgress,
    review: styles.statusReview,
    done: styles.statusDone,
    completed: styles.statusDone,
    cancelled: styles.statusCancelled,
    planned: styles.statusPlanned,
    on_hold: styles.statusHold,
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

export const CreateTask = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useAuthContext();

  const today = useMemo(() => formatDateForInput(new Date()), []);
  const defaultTags = useMemo(() => getDefaultTaskTags(), []);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today,
    deadline: '',
    status: TASK_STATUSES.BACKLOG,
    priority: TASK_PRIORITIES.MEDIUM,
    project_id: '',
    group_id: '',
    tags: [],
  });

  const [assigneeIds, setAssigneeIds] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  const [customTag, setCustomTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const {
    notification,
    showSuccess,
    showError,
    hideNotification,
  } = useNotification();

  const selectedProject = useMemo(() => {
    if (!formData.project_id) return null;

    return availableProjects.find(
      (project) => project.id === Number(formData.project_id)
    ) || null;
  }, [availableProjects, formData.project_id]);

  const filteredGroups = useMemo(() => {
    if (!selectedProject?.groups) return [];

    return selectedProject.groups;
  }, [selectedProject]);

  const selectedGroup = useMemo(() => {
    if (!formData.group_id) return null;

    return filteredGroups.find(
      (group) => group.id === Number(formData.group_id)
    ) || null;
  }, [filteredGroups, formData.group_id]);

  const selectedAssignees = useMemo(() => {
    return availableUsers.filter((userItem) => assigneeIds.includes(userItem.id));
  }, [availableUsers, assigneeIds]);

  const durationDays = useMemo(() => {
    return getDateDiffDays(formData.start_date, formData.deadline);
  }, [formData.start_date, formData.deadline]);

  const loadAvailableProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);

      const projectsData = await projectsAPI.getMyProjects();
      setAvailableProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (err) {
      console.error('Error loading projects:', err);

      const errorMessage = handleApiError(err);
      showError('Не удалось загрузить список проектов');
      setErrors((prev) => ({
        ...prev,
        projects: errorMessage,
      }));
      setAvailableProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [showError]);

  const loadGroupUsers = useCallback(async (groupId) => {
    if (!groupId) {
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      return;
    }

    try {
      setUsersLoading(true);

      const groupData = await groupsAPI.getById(groupId);
      const groupUsers = Array.isArray(groupData.users) ? groupData.users : [];

      setAvailableUsers(groupUsers);

      const currentUserInGroup = groupUsers.find((groupUser) => groupUser.id === user?.id);
      const isAdmin = currentUserInGroup?.role === 'admin';

      setIsAdminMode(isAdmin);

      if (isAdmin) {
        setAssigneeIds([]);
      } else if (user?.id) {
        setAssigneeIds([user.id]);
      } else {
        setAssigneeIds([]);
      }
    } catch (err) {
      console.error('Error loading group users:', err);

      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      showError(`Не удалось загрузить участников группы: ${handleApiError(err)}`);
    } finally {
      setUsersLoading(false);
    }
  }, [showError, user]);

  useEffect(() => {
    loadAvailableProjects();
  }, [loadAvailableProjects]);

  useEffect(() => {
    const projectIdFromUrl = searchParams.get('projectId');

    if (!projectIdFromUrl || projectsLoading || formData.project_id) return;

    const projectExists = availableProjects.some(
      (project) => project.id === Number(projectIdFromUrl)
    );

    if (!projectExists) return;

    setFormData((prev) => ({
      ...prev,
      project_id: projectIdFromUrl,
      group_id: '',
    }));
  }, [availableProjects, formData.project_id, projectsLoading, searchParams]);

  useEffect(() => {
    const groupIdFromUrl = searchParams.get('groupId');

    if (!groupIdFromUrl || !formData.project_id || formData.group_id) return;

    const groupExists = filteredGroups.some(
      (group) => group.id === Number(groupIdFromUrl)
    );

    if (!groupExists) return;

    setFormData((prev) => ({
      ...prev,
      group_id: groupIdFromUrl,
    }));
  }, [filteredGroups, formData.group_id, formData.project_id, searchParams]);

  useEffect(() => {
    if (!formData.project_id) {
      setFormData((prev) => ({
        ...prev,
        group_id: '',
      }));
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      return;
    }

    if (
      formData.group_id &&
      !filteredGroups.some((group) => group.id === Number(formData.group_id))
    ) {
      setFormData((prev) => ({
        ...prev,
        group_id: '',
      }));
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
    }
  }, [filteredGroups, formData.group_id, formData.project_id]);

  useEffect(() => {
    if (formData.group_id) {
      loadGroupUsers(Number(formData.group_id));
      return;
    }

    setAvailableUsers([]);
    setAssigneeIds([]);
    setIsAdminMode(false);
  }, [formData.group_id, loadGroupUsers]);

  const clearFieldError = (fieldName) => {
    if (!errors[fieldName] && !errors.submit) return;

    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next.submit;
      return next;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      if (name === 'project_id') {
        return {
          ...prev,
          project_id: value,
          group_id: '',
        };
      }

      if (name === 'group_id') {
        return {
          ...prev,
          group_id: value,
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });

    if (name === 'project_id') {
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      clearFieldError('project_id');
      clearFieldError('group_id');
      clearFieldError('assignees');
      return;
    }

    if (name === 'group_id') {
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      clearFieldError('group_id');
      clearFieldError('assignees');
      return;
    }

    clearFieldError(name);
  };

  const handleAssigneeToggle = (userId) => {
    setAssigneeIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }

      return [...prev, userId];
    });

    clearFieldError('assignees');
  };

  const handleSelectAllUsers = () => {
    setAssigneeIds((prev) => {
      if (prev.length === availableUsers.length) {
        return [];
      }

      return availableUsers.map((userItem) => userItem.id);
    });

    clearFieldError('assignees');
  };

  const handleTagToggle = (tag) => {
    setFormData((prev) => {
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

    if (!preparedTag || formData.tags.includes(preparedTag)) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      tags: [...prev.tags, preparedTag],
    }));

    setCustomTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    const title = formData.title.trim();

    if (!title) {
      newErrors.title = 'Название задачи обязательно';
    } else if (title.length < 2) {
      newErrors.title = 'Название должно содержать минимум 2 символа';
    } else if (title.length > TITLE_LIMIT) {
      newErrors.title = `Название не должно превышать ${TITLE_LIMIT} символов`;
    }

    if (formData.description.length > DESCRIPTION_LIMIT) {
      newErrors.description = `Описание не должно превышать ${DESCRIPTION_LIMIT} символов`;
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    }

    if (!formData.deadline) {
      newErrors.deadline = 'Дата окончания обязательна';
    } else {
      const validation = isValidDateRange(formData.start_date, formData.deadline);

      if (!validation.isValid) {
        newErrors.deadline = validation.error;
      }
    }

    if (!formData.project_id) {
      newErrors.project_id = 'Выберите проект';
    }

    if (!formData.group_id) {
      newErrors.group_id = 'Выберите группу';
    }

    if (assigneeIds.length === 0) {
      newErrors.assignees = 'Выберите хотя бы одного исполнителя';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildTaskData = () => ({
    title: formData.title.trim(),
    description: formData.description.trim(),
    start_date: formData.start_date
      ? new Date(formData.start_date).toISOString()
      : null,
    deadline: formData.deadline
      ? new Date(formData.deadline).toISOString()
      : null,
    status: formData.status,
    priority: formData.priority,
    project_id: Number(formData.project_id),
    group_id: Number(formData.group_id),
    tags: formData.tags,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      let task;

      if (isAdminMode && assigneeIds.length > 0) {
        task = await tasksAPI.createForUsers({
          ...buildTaskData(),
          assignee_ids: assigneeIds,
        });
      } else {
        task = await tasksAPI.create(buildTaskData());
      }

      setCreatedTask(task);

      const successMessage =
        isAdminMode && assigneeIds.length > 0
          ? `Задача "${formData.title}" создана и назначена ${formatRussianCount(assigneeIds.length, ASSIGNEE_FORMS)}`
          : `Задача "${formData.title}" успешно создана`;

      showSuccess(successMessage);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error creating task:', error);

      const errorMessage = handleApiError(error);
      showError(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/tasks');
  };

  const handleNavigateToTaskDetail = () => {
    if (createdTask?.id) {
      navigate(`/tasks/${createdTask.id}`);
      return;
    }

    navigate('/tasks');
  };

  const handleContinueCreating = () => {
    setFormData({
      title: '',
      description: '',
      start_date: today,
      deadline: '',
      status: TASK_STATUSES.BACKLOG,
      priority: TASK_PRIORITIES.MEDIUM,
      project_id: '',
      group_id: '',
      tags: [],
    });

    setAssigneeIds([]);
    setAvailableUsers([]);
    setCreatedTask(null);
    setShowSuccessModal(false);
    setErrors({});
    setIsAdminMode(false);
    setCustomTag('');
  };

  const hasAvailableProjects = availableProjects.length > 0 && !projectsLoading;

  const hasEmptyRequiredFields =
    !formData.title.trim() ||
    !formData.start_date ||
    !formData.deadline ||
    !formData.project_id ||
    !formData.group_id ||
    assigneeIds.length === 0;

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
            onClick={handleCancel}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            К задачам
          </button>

          <h1 className={styles.title}>Создание задачи</h1>

          <p className={styles.subtitle}>
            Создайте задачу, укажите проект, группу, сроки, приоритет и исполнителей.
          </p>

          {isAdminMode && (
            <div className={styles.adminBadge}>
              <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
              Режим администратора: вы можете назначить задачу участникам выбранной группы
            </div>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formHeader}>
          <div>
            <h2 className={styles.formTitle}>Параметры задачи</h2>
            <p className={styles.formSubtitle}>
              Заполните основные сведения и выберите связанный проект с группой.
            </p>
          </div>

          <span className={styles.formBadge}>
            {formatRussianCount(assigneeIds.length, ASSIGNEE_FORMS)}
          </span>
        </div>

        <div className={styles.formBody}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <ClipboardList size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Основная информация</h3>
                <p className={styles.sectionSubtitle}>
                  Название и описание помогают понять содержание задачи без перехода в детали.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <Input
                label="Название задачи"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                error={errors.title}
                placeholder="Например: Подготовить структуру страницы"
                disabled={loading}
                autoComplete="off"
                maxLength={TITLE_LIMIT}
                required
              />

              <div className={styles.textareaGroup}>
                <label className={styles.label} htmlFor="task-description">
                  Описание задачи
                </label>

                <textarea
                  id="task-description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Опишите детали задачи, ожидаемый результат или контекст"
                  disabled={loading}
                  className={`${styles.textarea} ${errors.description ? styles.textareaError : ''}`}
                  rows={5}
                  maxLength={DESCRIPTION_LIMIT}
                />

                <div className={styles.textareaFooter}>
                  {errors.description ? (
                    <span className={styles.errorMessage}>{errors.description}</span>
                  ) : (
                    <span className={styles.helperText}>Необязательное поле</span>
                  )}

                  <span className={styles.charCount}>
                    {formData.description.length}/{DESCRIPTION_LIMIT}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Статус и приоритет</h3>
                <p className={styles.sectionSubtitle}>
                  Эти параметры используются в списках задач, карточках и доске.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <div className={styles.taskProperties}>
                <div className={styles.propertyGroup}>
                  <label className={styles.label} htmlFor="task-status">
                    Статус
                  </label>

                  <select
                    id="task-status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className={styles.select}
                    disabled={loading}
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className={styles.statusPreview}>
                    <span className={`${styles.statusBadge} ${getStatusClass(formData.status)}`}>
                      <span className={styles.badgeIcon}>
                        {getTaskStatusIcon(formData.status)}
                      </span>
                      {getTaskStatusTranslation(formData.status)}
                    </span>
                  </div>
                </div>

                <div className={styles.propertyGroup}>
                  <label className={styles.label} htmlFor="task-priority">
                    Приоритет
                  </label>

                  <select
                    id="task-priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className={styles.select}
                    disabled={loading}
                  >
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className={styles.priorityPreview}>
                    <span className={`${styles.priorityBadge} ${getPriorityClass(formData.priority)}`}>
                      <span className={styles.badgeIcon}>
                        {getTaskPriorityIcon(formData.priority)}
                      </span>
                      {getTaskPriorityTranslation(formData.priority)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Tag size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Теги</h3>
                <p className={styles.sectionSubtitle}>
                  Используйте теги для дополнительной классификации задачи.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <div className={styles.tagsContainer}>
                <div className={styles.availableTags}>
                  {defaultTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`${styles.tagButton} ${
                        formData.tags.includes(tag) ? styles.tagSelected : ''
                      }`}
                      onClick={() => handleTagToggle(tag)}
                      disabled={loading}
                    >
                      #{tag}
                      {formData.tags.includes(tag) && (
                        <span className={styles.tagCheck}>
                          <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden="true" />
                        </span>
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
                    disabled={loading}
                    className={styles.customTagInput}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || loading}
                  >
                    Добавить
                  </Button>
                </div>

                {formData.tags.length > 0 && (
                  <div className={styles.selectedTags}>
                    <span className={styles.selectedTagsLabel}>Выбранные теги</span>

                    <div className={styles.selectedTagsList}>
                      {formData.tags.map((tag) => (
                        <span key={tag} className={styles.selectedTag}>
                          #{tag}

                          <button
                            type="button"
                            className={styles.removeTag}
                            onClick={() => handleRemoveTag(tag)}
                            disabled={loading}
                            aria-label={`Удалить тег ${tag}`}
                          >
                            <X size={14} strokeWidth={2.4} aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Сроки выполнения</h3>
                <p className={styles.sectionSubtitle}>
                  Даты используются для определения просрочки и отображения задач по срокам.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <div className={styles.dateFields}>
                <Input
                  label="Дата начала"
                  name="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={handleChange}
                  error={errors.start_date}
                  disabled={loading}
                  min={today}
                  required
                />

                <Input
                  label="Дата окончания"
                  name="deadline"
                  type="date"
                  value={formData.deadline}
                  onChange={handleChange}
                  error={errors.deadline}
                  disabled={loading}
                  min={formData.start_date || today}
                  required
                />
              </div>

              <div className={styles.dateSummary}>
                <span className={styles.dateSummaryLabel}>Плановая длительность</span>
                <span className={styles.dateSummaryValue}>
                  {durationDays === null
                    ? 'Не рассчитана'
                    : formatRussianCount(durationDays, RUSSIAN_PLURAL_FORMS.DAY)}
                </span>
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <FolderKanban size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Проект и группа</h3>
                <p className={styles.sectionSubtitle}>
                  Задача должна быть связана с проектом и одной из его групп.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              {projectsLoading ? (
                <div className={styles.loadingProjects}>
                  <div className={styles.spinner}></div>
                  <p>Загрузка списка проектов...</p>
                </div>
              ) : availableProjects.length === 0 ? (
                <div className={styles.noProjects}>
                  <div className={styles.noProjectsIcon}>
                    <FolderKanban size={42} strokeWidth={1.8} aria-hidden="true" />
                  </div>

                  <h4>Нет доступных проектов</h4>

                  <p>
                    Создайте проект или попросите администратора добавить вас
                    в существующий проект.
                  </p>

                  <Button
                    to="/projects/create"
                    variant="primary"
                    size="medium"
                  >
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    Создать проект
                  </Button>
                </div>
              ) : (
                <>
                  <div className={styles.selectionFields}>
                    <div className={styles.selectGroup}>
                      <label className={styles.label} htmlFor="task-project">
                        Проект
                      </label>

                      <select
                        id="task-project"
                        name="project_id"
                        value={formData.project_id}
                        onChange={handleChange}
                        className={`${styles.select} ${errors.project_id ? styles.error : ''}`}
                        disabled={loading || projectsLoading || !hasAvailableProjects}
                      >
                        <option value="">Выберите проект</option>

                        {availableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>

                      {errors.project_id && (
                        <span className={styles.errorMessage}>{errors.project_id}</span>
                      )}
                    </div>

                    <div className={styles.selectGroup}>
                      <label className={styles.label} htmlFor="task-group">
                        Группа
                      </label>

                      <select
                        id="task-group"
                        name="group_id"
                        value={formData.group_id}
                        onChange={handleChange}
                        className={`${styles.select} ${errors.group_id ? styles.error : ''}`}
                        disabled={loading || !formData.project_id || filteredGroups.length === 0}
                      >
                        <option value="">Выберите группу</option>

                        {filteredGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>

                      {errors.group_id && (
                        <span className={styles.errorMessage}>{errors.group_id}</span>
                      )}

                      {formData.project_id && filteredGroups.length === 0 && (
                        <div className={styles.groupError}>
                          В выбранном проекте нет доступных групп.
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedProject && (
                    <div className={styles.projectSummary}>
                      <span className={styles.projectSummaryTitle}>
                        Выбран проект: {selectedProject.title}
                      </span>

                      <span className={styles.projectSummaryMeta}>
                        {formatRussianCount(filteredGroups.length, RUSSIAN_PLURAL_FORMS.GROUP)}
                      </span>
                    </div>
                  )}

                  {selectedGroup && (
                    <div className={styles.projectSummary}>
                      <span className={styles.projectSummaryTitle}>
                        Выбрана группа: {selectedGroup.name}
                      </span>

                      <span className={styles.projectSummaryMeta}>
                        {formatRussianCount(availableUsers.length, RUSSIAN_PLURAL_FORMS.PARTICIPANT)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {formData.group_id && (
            <section className={styles.formSection}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <UserCheck size={20} strokeWidth={2} aria-hidden="true" />
                </div>

                <div>
                  <h3 className={styles.sectionTitle}>Исполнители</h3>
                  <p className={styles.sectionSubtitle}>
                    {isAdminMode
                      ? 'Выберите участников группы, которым будет назначена задача.'
                      : 'Задача будет назначена вам как создателю.'}
                  </p>
                </div>
              </div>

              <div className={styles.sectionContent}>
                {usersLoading ? (
                  <div className={styles.loadingProjects}>
                    <div className={styles.spinner}></div>
                    <p>Загрузка участников группы...</p>
                  </div>
                ) : isAdminMode && availableUsers.length > 0 ? (
                  <div className={styles.assigneesSection}>
                    <div className={styles.assigneesHeader}>
                      <div>
                        <span className={styles.assigneesTitle}>
                          Выберите исполнителей задачи
                        </span>

                        <span className={styles.assigneesSubtitle}>
                          {formatRussianCount(availableUsers.length, RUSSIAN_PLURAL_FORMS.PARTICIPANT)} доступно
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        onClick={handleSelectAllUsers}
                        disabled={loading}
                      >
                        {assigneeIds.length === availableUsers.length
                          ? 'Снять всех'
                          : 'Выбрать всех'}
                      </Button>
                    </div>

                    {errors.assignees && (
                      <div className={styles.assigneesError} role="alert">
                        {errors.assignees}
                      </div>
                    )}

                    <div className={styles.usersGrid}>
                      {availableUsers.map((userItem) => {
                        const isSelected = assigneeIds.includes(userItem.id);

                        return (
                          <label
                            key={userItem.id}
                            className={`${styles.userCard} ${isSelected ? styles.selected : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleAssigneeToggle(userItem.id)}
                              className={styles.checkboxInput}
                              disabled={loading}
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
                              <span className={styles.userMain}>
                                <span className={styles.userLogin}>{getUserName(userItem)}</span>

                                {userItem.id === user?.id && (
                                  <span className={styles.currentUserBadge}>Вы</span>
                                )}
                              </span>

                              {userItem.email && (
                                <span className={styles.userEmail}>{userItem.email}</span>
                              )}

                              <span className={styles.userRole}>
                                {getUserRoleLabel(userItem.role)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className={styles.selectedCount}>
                      <span>
                        Выбрано: {formatRussianCount(assigneeIds.length, ASSIGNEE_FORMS)}
                      </span>

                      {selectedAssignees.length > 0 && (
                        <span>
                          {selectedAssignees.map((item) => getUserName(item)).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.userInfoCard}>
                    <div className={styles.userInfoIcon}>
                      <Users size={26} strokeWidth={2} aria-hidden="true" />
                    </div>

                    <div>
                      <h4>Задача будет назначена вам</h4>

                      <p>
                        Только администраторы выбранной группы могут назначать задачи
                        другим участникам.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {errors.submit && (
          <div className={styles.submitError} role="alert">
            {errors.submit}
          </div>
        )}

        <div className={styles.submitActions}>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={handleCancel}
            disabled={loading}
          >
            Отмена
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="large"
            loading={loading}
            disabled={!hasAvailableProjects || loading || projectsLoading || hasEmptyRequiredFields}
            className={styles.submitButton}
          >
            {isAdminMode && assigneeIds.length > 1
              ? `Создать задачу для ${assigneeIds.length} пользователей`
              : 'Создать задачу'}
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={handleContinueCreating}
        onConfirm={handleNavigateToTaskDetail}
        title="Задача создана"
        message={
          isAdminMode && assigneeIds.length > 0
            ? `Задача "${createdTask?.title || formData.title}" успешно создана и назначена ${getRussianPluralForm(assigneeIds.length, ASSIGNEE_FORMS)}.`
            : `Задача "${createdTask?.title || formData.title}" успешно создана.`
        }
        confirmText="Перейти к задаче"
        cancelText="Создать ещё"
        variant="success"
        isLoading={false}
      />
    </div>
  );
};