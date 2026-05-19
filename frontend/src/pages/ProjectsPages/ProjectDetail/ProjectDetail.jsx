import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { tasksAPI } from '../../../services/api/tasks';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { GroupCard } from '../../../components/ui/GroupCard';
import { TaskCard } from '../../../components/ui/TaskCard';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { StartConferenceButton } from '../../../components/ui/StartConferenceButton';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { CONFERENCE_ROOM_TYPES, PROJECT_STATUS_OPTIONS } from '../../../utils/constants';
import {
  formatDate,
  formatDateForInput,
  formatRussianCount,
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import { getProjectStatusTranslation } from '../../../utils/projectStatus';
import { showGlobalSuccess } from '../../../utils/globalToast';
import {
  FIELD_LIMITS,
  validateOptionalTextField,
  validateTextField,
} from '../../../utils/validation';
import styles from './ProjectDetail.module.css';

const TITLE_LIMIT = FIELD_LIMITS.PROJECT_TITLE;
const DESCRIPTION_LIMIT = FIELD_LIMITS.PROJECT_DESCRIPTION;

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getProjectDurationDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((end - start) / 86400000));
};

export const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: '',
    start_date: '',
    end_date: '',
  });
  const [editErrors, setEditErrors] = useState({});

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupError, setNewGroupError] = useState('');
  const [availableGroups, setAvailableGroups] = useState([]);

  const [userRole, setUserRole] = useState('');
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);

  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  const { user } = useAuthContext();

  const {
    notification,
    showSuccess,
    showError,
    hideNotification,
  } = useNotification();

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const projectData = await projectsAPI.getById(projectId);
      const projectGroups = Array.isArray(projectData.groups) ? projectData.groups : [];
      const projectTasks = Array.isArray(projectData.tasks) ? projectData.tasks : [];

      const groupsWithDetails = await Promise.all(
        projectGroups.map(async (group) => {
          try {
            return await groupsAPI.getById(group.id);
          } catch (err) {
            console.error(`Error loading group ${group.id}:`, err);
            return { ...group, projects: [] };
          }
        })
      );

      const tasksWithDetails = await Promise.all(
        projectTasks.map(async (task) => {
          try {
            return await tasksAPI.getById(task.id);
          } catch (err) {
            console.error(`Error loading task ${task.id}:`, err);
            return task;
          }
        })
      );

      setProject({
        ...projectData,
        groups: groupsWithDetails,
        tasks: tasksWithDetails,
      });

      setEditForm({
        title: projectData.title || '',
        description: projectData.description || '',
        status: projectData.status || 'planned',
        start_date: projectData.start_date
          ? formatDateForInput(new Date(projectData.start_date))
          : '',
        end_date: projectData.end_date
          ? formatDateForInput(new Date(projectData.end_date))
          : '',
      });
    } catch (err) {
      console.error('Error loading project:', err);
      setError(handleApiError(err));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadAvailableGroups = useCallback(async () => {
    try {
      const groupsData = await groupsAPI.getMyGroups();
      const safeGroups = Array.isArray(groupsData) ? groupsData : [];

      const adminGroups = safeGroups.filter((group) =>
        group.users?.some((groupUser) =>
          groupUser.id === user?.id &&
          groupUser.role === 'admin'
        )
      );

      setAvailableGroups(adminGroups);
    } catch (err) {
      console.error('Error loading available groups:', err);
      setAvailableGroups([]);
    }
  }, [user?.id]);

  const determineUserRole = useCallback(() => {
    if (!project || !user) return '';

    const isAdminInAnyGroup = project.groups?.some((group) =>
      group.users?.some((groupUser) =>
        groupUser.id === user.id &&
        groupUser.role === 'admin'
      )
    );

    return isAdminInAnyGroup ? 'admin' : 'member';
  }, [project, user]);

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadAvailableGroups();
    }
  }, [projectId, loadProject, loadAvailableGroups]);

  useEffect(() => {
    if (project) {
      setUserRole(determineUserRole());
    }
  }, [project, determineUserRole]);

  const displayGroups = useMemo(() => {
    if (!project?.groups) return [];

    return [...project.groups]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru-RU'))
      .slice(0, 3);
  }, [project?.groups]);

  const displayTasks = useMemo(() => {
    if (!project?.tasks) return [];

    return [...project.tasks]
      .sort((a, b) => getDateMs(a.deadline) - getDateMs(b.deadline))
      .slice(0, 4);
  }, [project?.tasks]);

  const groupsToAdd = useMemo(() => {
    if (!project?.groups) return availableGroups;

    const linkedGroupIds = new Set(project.groups.map((group) => group.id));
    return availableGroups.filter((group) => !linkedGroupIds.has(group.id));
  }, [availableGroups, project?.groups]);

  const durationDays = useMemo(() => {
    return getProjectDurationDays(project?.start_date, project?.end_date);
  }, [project?.start_date, project?.end_date]);

  const validateEditForm = () => {
    const newErrors = {};

    const titleError = validateTextField(editForm.title, {
      label: 'Название проекта',
      min: 2,
      max: TITLE_LIMIT,
    });

    if (titleError) {
      newErrors.title = titleError;
    }

    const descriptionError = validateOptionalTextField(editForm.description, {
      label: 'Описание проекта',
      max: DESCRIPTION_LIMIT,
      requireMeaningful: false,
    });

    if (descriptionError) {
      newErrors.description = descriptionError;
    }

    if (!editForm.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    }

    if (!editForm.end_date) {
      newErrors.end_date = 'Дата окончания обязательна';
    } else if (editForm.start_date) {
      const startDate = new Date(editForm.start_date);
      const endDate = new Date(editForm.end_date);

      if (endDate <= startDate) {
        newErrors.end_date = 'Дата окончания должна быть позже даты начала';
      }
    }

    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (editErrors[field] || editErrors.submit) {
      setEditErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        delete next.submit;
        return next;
      });
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();

    if (!validateEditForm()) return;

    setIsUpdatingProject(true);

    try {
      const updateData = {
        ...editForm,
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        start_date: editForm.start_date
          ? new Date(editForm.start_date).toISOString()
          : null,
        end_date: editForm.end_date
          ? new Date(editForm.end_date).toISOString()
          : null,
      };

      await projectsAPI.update(projectId, updateData);
      await loadProject();

      setEditing(false);
      setEditErrors({});
      showSuccess('Проект успешно обновлён');
    } catch (err) {
      console.error('Error updating project:', err);
      const errorMessage = handleApiError(err);

      setEditErrors({ submit: errorMessage });
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const handleCancelEditing = () => {
    setEditing(false);
    setEditErrors({});

    setEditForm({
      title: project.title || '',
      description: project.description || '',
      status: project.status || 'planned',
      start_date: project.start_date
        ? formatDateForInput(new Date(project.start_date))
        : '',
      end_date: project.end_date
        ? formatDateForInput(new Date(project.end_date))
        : '',
    });
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();

    if (!newGroupId) {
      setNewGroupError('Выберите группу');
      return;
    }

    setIsAddingGroup(true);

    try {
      await projectsAPI.addGroups(projectId, {
        group_ids: [Number(newGroupId)],
      });

      setNewGroupId('');
      setNewGroupError('');
      setAddingGroup(false);

      await loadProject();
      await loadAvailableGroups();

      showSuccess('Группа успешно добавлена в проект');
    } catch (err) {
      console.error('Error adding group:', err);
      setNewGroupError(`Не удалось добавить группу: ${handleApiError(err)}`);
    } finally {
      setIsAddingGroup(false);
    }
  };

  const handleRemoveGroup = async (groupId, groupName) => {
    try {
      await projectsAPI.removeGroups(projectId, {
        group_ids: [groupId],
      });

      await loadProject();

      showSuccess(`Группа "${groupName}" удалена из проекта`);
    } catch (err) {
      console.error('Error removing group:', err);

      if (err.response?.status === 400) {
        showError(
          'Не удалось удалить группу из проекта. Возможно, группа уже была удалена или у вас недостаточно прав.'
        );
      } else {
        showError(`Не удалось удалить группу из проекта: ${handleApiError(err)}`);
      }
    }
  };

  const handleConfirmDeleteProject = async () => {
    setIsDeletingProject(true);

    const projectTitle = project?.title || 'Проект';

    try {
      await projectsAPI.delete(projectId);

      showGlobalSuccess(`Проект "${projectTitle}" успешно удалён`);
      navigate('/projects', { replace: true });
    } catch (err) {
      console.error('Error deleting project:', err);
      showError(`Не удалось удалить проект: ${handleApiError(err)}`);
    } finally {
      setIsDeletingProject(false);
      setShowDeleteProjectModal(false);
    }
  };

  const handleDeleteTask = async (taskId, taskTitle) => {
    try {
      await tasksAPI.delete(taskId);

      setProject((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((task) => task.id !== taskId),
      }));

      setShowTasksModal(false);

      showSuccess(`Задача "${taskTitle}" успешно удалена`);
    } catch (err) {
      console.error('Error deleting task:', err);

      if (err.response?.status === 403) {
        showError('У вас нет прав для удаления этой задачи');
      } else {
        showError(`Не удалось удалить задачу: ${handleApiError(err)}`);
      }
    }
  };

  const getStatusClass = (status) => {
    const statusClasses = {
      planned: styles.statusPlanned,
      in_progress: styles.statusInProgress,
      completed: styles.statusCompleted,
      on_hold: styles.statusOnHold,
      cancelled: styles.statusCancelled,
    };

    return statusClasses[status] || styles.statusDefault;
  };

  const isAdmin = userRole === 'admin';

  const hasAccessToProject = project && project.groups?.some((group) =>
    group.users?.some((groupUser) => groupUser.id === user?.id)
  );

  const hasMoreGroups = project?.groups && project.groups.length > 3;
  const hasMoreTasks = project?.tasks && project.tasks.length > 4;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка проекта...</p>
      </div>
    );
  }

  if (error || !project || !hasAccessToProject) {
    return (
      <div className={styles.errorContainer}>
        <h2>Не удалось открыть проект</h2>
        <p>{error || 'Проект не найден или у вас нет доступа.'}</p>

        <Button onClick={() => navigate('/projects')} variant="primary">
          Вернуться к проектам
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
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            К проектам
          </button>

          {editing ? (
            <form onSubmit={handleUpdateProject} className={styles.editForm}>
              <Input
                label="Название проекта"
                value={editForm.title}
                onChange={(e) => handleEditFieldChange('title', e.target.value)}
                error={editErrors.title}
                placeholder="Название проекта"
                maxLength={TITLE_LIMIT}
                helperText={`От 2 до ${TITLE_LIMIT} символов`}
                required
              />

              <div className={styles.textareaGroup}>
                <label className={styles.label} htmlFor="project-description">
                  Описание проекта
                </label>

                <textarea
                  id="project-description"
                  value={editForm.description}
                  onChange={(e) => handleEditFieldChange('description', e.target.value)}
                  placeholder="Описание проекта"
                  className={`${styles.textarea} ${editErrors.description ? styles.textareaError : ''}`}
                  rows={4}
                  maxLength={DESCRIPTION_LIMIT}
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
                  onChange={(e) => handleEditFieldChange('start_date', e.target.value)}
                  error={editErrors.start_date}
                  required
                />

                <Input
                  label="Дата окончания"
                  type="date"
                  value={editForm.end_date}
                  onChange={(e) => handleEditFieldChange('end_date', e.target.value)}
                  error={editErrors.end_date}
                  min={editForm.start_date}
                  required
                />
              </div>

              <div className={styles.selectGroup}>
                <label htmlFor="project-status">Статус проекта</label>

                <select
                  id="project-status"
                  value={editForm.status}
                  onChange={(e) => handleEditFieldChange('status', e.target.value)}
                  className={styles.select}
                >
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  loading={isUpdatingProject}
                  disabled={isUpdatingProject}
                >
                  Сохранить
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelEditing}
                  disabled={isUpdatingProject}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{project.title}</h1>

                <span className={`${styles.statusBadge} ${getStatusClass(project.status)}`}>
                  {getProjectStatusTranslation(project.status)}
                </span>
              </div>

              <p className={styles.subtitle}>
                {project.description || 'Описание проекта не указано.'}
              </p>
            </>
          )}
        </div>

        {isAdmin && !editing && (
          <div className={styles.heroActions}>
            <StartConferenceButton
              type={CONFERENCE_ROOM_TYPES.PROJECT}
              id={project.id}
              title={`Созвон проекта ${project.title}`}
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

            <Button
              variant="secondary"
              onClick={() => setShowDeleteProjectModal(true)}
              className={styles.deleteButton}
              disabled={isDeletingProject}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              {isDeletingProject ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.statsGrid} aria-label="Сводка проекта">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{project.groups?.length || 0}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(project.groups?.length || 0, RUSSIAN_PLURAL_FORMS.GROUP)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{project.tasks?.length || 0}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(project.tasks?.length || 0, RUSSIAN_PLURAL_FORMS.TASK)}
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
          <span className={styles.statValue}>{formatDate(project.end_date)}</span>
          <span className={styles.statLabel}>дата окончания</span>
        </article>
      </section>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Группы проекта</h2>
              <p>Команды, которые участвуют в проектной работе.</p>
            </div>

            <div className={styles.sectionActions}>
              {isAdmin && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => setAddingGroup((value) => !value)}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden="true" />
                  {addingGroup ? 'Скрыть форму' : 'Добавить группу'}
                </Button>
              )}

              {project.groups?.length > 0 && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowGroupsModal(true)}
                >
                  Показать все ({project.groups.length})
                </Button>
              )}
            </div>
          </div>

          {addingGroup && (
            <form onSubmit={handleAddGroup} className={styles.addGroupForm}>
              <div className={styles.selectGroup}>
                <label htmlFor="new-group">Группа для добавления</label>

                <select
                  id="new-group"
                  value={newGroupId}
                  onChange={(e) => {
                    setNewGroupId(e.target.value);
                    setNewGroupError('');
                  }}
                  className={`${styles.select} ${newGroupError ? styles.selectError : ''}`}
                  required
                  disabled={isAddingGroup}
                >
                  <option value="">Выберите группу</option>
                  {groupsToAdd.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>

                {newGroupError && (
                  <span className={styles.errorMessage} role="alert">
                    {newGroupError}
                  </span>
                )}
              </div>

              {groupsToAdd.length === 0 && (
                <p className={styles.formHint}>
                  Нет доступных групп для добавления. Все группы, где у вас есть
                  права администратора, уже связаны с проектом.
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                loading={isAddingGroup}
                disabled={!newGroupId || isAddingGroup || groupsToAdd.length === 0}
              >
                Добавить
              </Button>
            </form>
          )}

          {project.groups?.length > 0 ? (
            <div className={styles.itemsSection}>
              <div className={styles.groupsList}>
                {displayGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    currentUserId={user?.id}
                    showDeleteButton={isAdmin}
                    onDelete={handleRemoveGroup}
                  />
                ))}
              </div>

              {hasMoreGroups && (
                <button
                  type="button"
                  className={styles.moreItems}
                  onClick={() => setShowGroupsModal(true)}
                >
                  Ещё {formatRussianCount(
                    project.groups.length - 3,
                    RUSSIAN_PLURAL_FORMS.GROUP
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

              <h3>Группы не добавлены</h3>

              <p>
                Добавьте группы, чтобы участники могли работать над задачами проекта.
              </p>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Задачи проекта</h2>
              <p>Задачи, связанные с данным проектом.</p>
            </div>

            <div className={styles.sectionActions}>
              <Button
                to={`/tasks/create?projectId=${projectId}`}
                variant="primary"
                size="small"
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Создать задачу
              </Button>

              {project.tasks?.length > 0 && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowTasksModal(true)}
                >
                  Показать все ({project.tasks.length})
                </Button>
              )}
            </div>
          </div>

          {project.tasks?.length > 0 ? (
            <div className={styles.itemsSection}>
              <div className={styles.tasksList}>
                {displayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    currentUserId={user?.id}
                    showDetailsButton
                    compact
                    showDeleteButton={isAdmin}
                    onDelete={() => handleDeleteTask(task.id, task.title)}
                  />
                ))}
              </div>

              {hasMoreTasks && (
                <button
                  type="button"
                  className={styles.moreItems}
                  onClick={() => setShowTasksModal(true)}
                >
                  Ещё {formatRussianCount(
                    project.tasks.length - 4,
                    RUSSIAN_PLURAL_FORMS.TASK
                  )}
                  <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FolderKanban size={44} strokeWidth={1.8} aria-hidden="true" />
              </div>

              <h3>Задач пока нет</h3>

              <p>
                Создайте первую задачу, чтобы начать работу над проектом.
              </p>

              <Button
                to={`/tasks/create?projectId=${projectId}`}
                variant="primary"
                size="medium"
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Создать задачу
              </Button>
            </div>
          )}
        </section>
      </div>

      <ItemsModal
        items={project.groups || []}
        itemType="groups"
        isOpen={showGroupsModal}
        onClose={() => setShowGroupsModal(false)}
        title={`Группы проекта "${project.title}"`}
        currentUserId={user?.id}
        showDeleteButton={isAdmin}
        onDelete={(groupId, groupName) => handleRemoveGroup(groupId, groupName)}
      />

      <ItemsModal
        items={project.tasks || []}
        itemType="tasks"
        isOpen={showTasksModal}
        onClose={() => setShowTasksModal(false)}
        title={`Задачи проекта "${project.title}"`}
        currentUserId={user?.id}
        showDeleteButton={isAdmin}
        onDelete={(taskId, taskTitle) => handleDeleteTask(taskId, taskTitle)}
      />

      <ConfirmationModal
        isOpen={showDeleteProjectModal}
        onClose={() => setShowDeleteProjectModal(false)}
        onConfirm={handleConfirmDeleteProject}
        title="Удаление проекта"
        message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
        confirmText={isDeletingProject ? 'Удаление...' : 'Удалить проект'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingProject}
      />
    </div>
  );
};