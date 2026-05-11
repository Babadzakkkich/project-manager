import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';

import { tasksAPI } from '../../../services/api/tasks';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { TaskCard } from '../../../components/ui/TaskCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  formatRussianCount,
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  getTaskPriorityTranslation,
  getTaskStatusTranslation,
  isTaskOverdue,
} from '../../../utils/taskStatus';
import { TASK_STATUSES } from '../../../utils/constants';
import styles from './Tasks.module.css';

const TASK_DONE_STATUSES = [TASK_STATUSES.DONE, 'completed'];
const TASK_CANCELLED_STATUSES = [TASK_STATUSES.CANCELLED];

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const compareText = (a = '', b = '') => {
  return String(a || '').localeCompare(String(b || ''), 'ru-RU');
};

const getProjectFilterValue = (task) => {
  return String(task.project?.id || task.project?.title || '');
};

export const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminGroupsLoading, setAdminGroupsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const [viewMode, setViewMode] = useState('my');

  const [adminGroups, setAdminGroups] = useState([]);
  const [groupUsers, setGroupUsers] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);

  const { user } = useAuthContext();

  const isAdmin = useMemo(() => {
    return adminGroups.length > 0;
  }, [adminGroups]);

  const loadAdminGroups = useCallback(async () => {
    if (!user?.id) return;

    try {
      setAdminGroupsLoading(true);

      const groupsData = await groupsAPI.getMyGroups();
      const safeGroups = Array.isArray(groupsData) ? groupsData : [];

      const userAdminGroups = safeGroups.filter((group) =>
        group.users?.some((groupUser) =>
          groupUser.id === user.id &&
          (groupUser.role === 'admin' || groupUser.role === 'super_admin')
        )
      );

      setAdminGroups(userAdminGroups);

      const uniqueUsers = [];

      userAdminGroups.forEach((group) => {
        if (!Array.isArray(group.users)) return;

        group.users.forEach((groupUser) => {
          if (!uniqueUsers.some((item) => item.id === groupUser.id)) {
            uniqueUsers.push(groupUser);
          }
        });
      });

      setGroupUsers(uniqueUsers);
    } catch (err) {
      console.error('Error loading admin groups:', err);
      setAdminGroups([]);
      setGroupUsers([]);
    } finally {
      setAdminGroupsLoading(false);
    }
  }, [user?.id]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const tasksData =
        isAdmin && viewMode === 'all'
          ? await tasksAPI.getTeamTasks()
          : await tasksAPI.getMyTasks();

      setTasks(Array.isArray(tasksData) ? tasksData : []);
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError(handleApiError(err));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, viewMode]);

  useEffect(() => {
    loadAdminGroups();
  }, [loadAdminGroups]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const projectsMap = new Map();

    tasks.forEach((task) => {
      const projectValue = getProjectFilterValue(task);

      if (!projectValue) return;

      projectsMap.set(projectValue, {
        value: projectValue,
        label: task.project?.title || 'Проект без названия',
      });
    });

    setProjectOptions(
      Array.from(projectsMap.values()).sort((a, b) => compareText(a.label, b.label))
    );
  }, [tasks]);

  const filterOptions = useMemo(() => {
    const baseOptions = [
      {
        key: 'status',
        label: 'Статус задачи',
        options: TASK_STATUS_OPTIONS,
      },
      {
        key: 'priority',
        label: 'Приоритет',
        options: TASK_PRIORITY_OPTIONS,
      },
      {
        key: 'project',
        label: 'Проект',
        options: projectOptions,
      },
    ];

    if (isAdmin && viewMode === 'all') {
      return [
        ...baseOptions,
        {
          key: 'assignee',
          label: 'Исполнитель',
          options: [
            { value: 'all', label: 'Все исполнители' },
            ...groupUsers.map((groupUser) => ({
              value: String(groupUser.id),
              label: groupUser.email
                ? `${groupUser.login || groupUser.name || 'Пользователь'} (${groupUser.email})`
                : groupUser.login || groupUser.name || 'Пользователь',
            })),
          ],
        },
      ];
    }

    return baseOptions;
  }, [isAdmin, viewMode, groupUsers, projectOptions]);

  const sortOptions = [
    { value: 'title_asc', label: 'По названию (А-Я)' },
    { value: 'title_desc', label: 'По названию (Я-А)' },
    { value: 'deadline_asc', label: 'Ближайшие сроки' },
    { value: 'deadline_desc', label: 'Дальние сроки' },
    { value: 'created_at_desc', label: 'Сначала новые' },
    { value: 'created_at_asc', label: 'Сначала старые' },
    { value: 'status', label: 'По статусу' },
    { value: 'priority', label: 'По приоритету' },
  ];

  const getUserRoleInTask = useCallback((task) => {
    if (!user || !task.group) {
      return 'viewer';
    }

    const userInGroup = task.group.users?.find((groupUser) => groupUser.id === user.id);

    if (
      userInGroup &&
      (userInGroup.role === 'admin' || userInGroup.role === 'super_admin')
    ) {
      return 'admin';
    }

    const isAssignee = task.assignees?.some((assignee) => assignee.id === user.id);

    if (isAssignee) {
      return 'assignee';
    }

    return 'viewer';
  }, [user]);

  const canDeleteTask = useCallback((task) => {
    const role = getUserRoleInTask(task);
    return role === 'admin' || role === 'assignee';
  }, [getUserRoleInTask]);

  const handleDeleteTask = async (taskId) => {
    await tasksAPI.delete(taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    if (filters.status) {
      result = result.filter((task) => task.status === filters.status);
    }

    if (filters.priority) {
      result = result.filter((task) => task.priority === filters.priority);
    }

    if (filters.project) {
      result = result.filter((task) => getProjectFilterValue(task) === filters.project);
    }

    if (
      filters.assignee &&
      filters.assignee !== 'all' &&
      isAdmin &&
      viewMode === 'all'
    ) {
      const assigneeId = Number(filters.assignee);

      result = result.filter((task) =>
        task.assignees?.some((assignee) => assignee.id === assigneeId)
      );
    }

    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) => compareText(a.title, b.title));
          break;

        case 'title_desc':
          result.sort((a, b) => compareText(b.title, a.title));
          break;

        case 'deadline_asc':
          result.sort((a, b) => getDateMs(a.deadline) - getDateMs(b.deadline));
          break;

        case 'deadline_desc':
          result.sort((a, b) => getDateMs(b.deadline) - getDateMs(a.deadline));
          break;

        case 'created_at_desc':
          result.sort((a, b) => getDateMs(b.created_at) - getDateMs(a.created_at));
          break;

        case 'created_at_asc':
          result.sort((a, b) => getDateMs(a.created_at) - getDateMs(b.created_at));
          break;

        case 'status':
          result.sort((a, b) =>
            compareText(getTaskStatusTranslation(a.status), getTaskStatusTranslation(b.status))
          );
          break;

        case 'priority':
          result.sort((a, b) =>
            compareText(
              getTaskPriorityTranslation(a.priority),
              getTaskPriorityTranslation(b.priority)
            )
          );
          break;

        default:
          break;
      }
    }

    return result;
  }, [tasks, filters, sort, isAdmin, viewMode]);

  const groupedTasks = useMemo(() => {
    if (viewMode !== 'all' || !isAdmin) {
      return null;
    }

    const grouped = {};

    filteredAndSortedTasks.forEach((task) => {
      if (task.assignees && task.assignees.length > 0) {
        task.assignees.forEach((assignee) => {
          if (!grouped[assignee.id]) {
            grouped[assignee.id] = {
              user: assignee,
              tasks: [],
            };
          }

          grouped[assignee.id].tasks.push(task);
        });

        return;
      }

      if (!grouped.unassigned) {
        grouped.unassigned = {
          user: {
            id: 'unassigned',
            login: 'Без исполнителя',
            email: '',
          },
          tasks: [],
        };
      }

      grouped.unassigned.tasks.push(task);
    });

    return Object.values(grouped);
  }, [filteredAndSortedTasks, viewMode, isAdmin]);

  const taskStats = useMemo(() => {
    const total = filteredAndSortedTasks.length;

    const completed = filteredAndSortedTasks.filter((task) =>
      TASK_DONE_STATUSES.includes(task.status)
    ).length;

    const active = filteredAndSortedTasks.filter((task) =>
      !TASK_DONE_STATUSES.includes(task.status) &&
      !TASK_CANCELLED_STATUSES.includes(task.status)
    ).length;

    const overdue = filteredAndSortedTasks.filter((task) =>
      isTaskOverdue(task.deadline, task.status)
    ).length;

    return {
      total,
      active,
      completed,
      overdue,
    };
  }, [filteredAndSortedTasks]);

  const hasActiveFilters = Object.keys(filters).some((key) => {
    return filters[key] && filters[key] !== '' && filters[key] !== 'all';
  });

  const handleViewModeChange = (newMode) => {
    setViewMode(newMode);
    setFilters({});
    setSort('');
  };

  const getPageTitle = () => {
    return viewMode === 'my' ? 'Мои задачи' : 'Задачи команды';
  };

  const getPageSubtitle = () => {
    if (viewMode === 'my') {
      return 'Задачи, назначенные на вас или доступные через ваши рабочие группы.';
    }

    return `Все задачи в ${formatRussianCount(adminGroups.length, RUSSIAN_PLURAL_FORMS.GROUP)}, которыми вы управляете.`;
  };

  if (loading || adminGroupsLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка задач...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Не удалось загрузить задачи</h2>
        <p>{error}</p>

        <Button onClick={loadTasks} variant="primary">
          Попробовать снова
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>{getPageTitle()}</h1>

          <p className={styles.subtitle}>
            {getPageSubtitle()}
          </p>
        </div>

        <div className={styles.heroActions}>
          {isAdmin && (
            <div className={styles.viewModeSwitcher}>
              <Button
                variant={viewMode === 'my' ? 'primary' : 'secondary'}
                size="medium"
                onClick={() => handleViewModeChange('my')}
              >
                Мои задачи
              </Button>

              <Button
                variant={viewMode === 'all' ? 'primary' : 'secondary'}
                size="medium"
                onClick={() => handleViewModeChange('all')}
              >
                Задачи команды
              </Button>
            </div>
          )}

          <Button to="/tasks/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать задачу
          </Button>
        </div>
      </section>

      <section className={styles.statsGrid} aria-label="Сводка по задачам">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{taskStats.total}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(taskStats.total, [
              'задача всего',
              'задачи всего',
              'задач всего',
            ])}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{taskStats.active}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(taskStats.active, [
              'задача в работе',
              'задачи в работе',
              'задач в работе',
            ])}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{taskStats.completed}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(taskStats.completed, [
              'задача выполнена',
              'задачи выполнены',
              'задач выполнено',
            ])}
          </span>
        </article>

        <article
          className={`${styles.statCard} ${
            taskStats.overdue > 0 ? styles.warningCard : ''
          }`}
        >
          <span className={styles.statValue}>{taskStats.overdue}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(taskStats.overdue, [
              'задача просрочена',
              'задачи просрочены',
              'задач просрочено',
            ])}
          </span>
        </article>
      </section>

      {(tasks.length > 0 || hasActiveFilters) && (
        <FilterSort
          filters={filterOptions}
          sortOptions={sortOptions}
          selectedFilters={filters}
          selectedSort={sort}
          onFilterChange={setFilters}
          onSortChange={setSort}
          className={styles.filterSort}
        />
      )}

      <div className={styles.tasksInfo}>
        <span className={styles.tasksCount}>
          Найдено: {formatRussianCount(
            filteredAndSortedTasks.length,
            RUSSIAN_PLURAL_FORMS.TASK
          )}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => setFilters({})}
          >
            <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
            Сбросить фильтры
          </button>
        )}
      </div>

      {filteredAndSortedTasks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <ClipboardList size={42} strokeWidth={1.8} aria-hidden="true" />
          </div>

          {hasActiveFilters ? (
            <>
              <h2>Задачи не найдены</h2>
              <p>Попробуйте изменить параметры фильтрации.</p>

              <Button
                onClick={() => setFilters({})}
                variant="primary"
                size="medium"
              >
                <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
                Сбросить фильтры
              </Button>
            </>
          ) : (
            <>
              <h2>Задач пока нет</h2>

              <p>
                {viewMode === 'my'
                  ? 'Создайте первую задачу или дождитесь назначения от администратора группы.'
                  : 'В группах, которыми вы управляете, пока нет задач.'}
              </p>

              <Button to="/tasks/create" variant="primary" size="medium">
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Создать задачу
              </Button>
            </>
          )}
        </div>
      ) : viewMode === 'all' && isAdmin ? (
        <div className={styles.groupedTasks}>
          {groupedTasks?.map((group) => (
            <section key={group.user.id} className={styles.userTaskGroup}>
              <div className={styles.userHeader}>
                <div className={styles.userHeaderMain}>
                  <div className={styles.userAvatar}>
                    {(group.user.name || group.user.login || '?').charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <h2 className={styles.userName}>
                      {group.user.name || group.user.login || 'Пользователь'}
                    </h2>

                    {group.user.email && (
                      <p className={styles.userEmail}>{group.user.email}</p>
                    )}
                  </div>
                </div>

                <span className={styles.taskCount}>
                  {formatRussianCount(group.tasks.length, RUSSIAN_PLURAL_FORMS.TASK)}
                </span>
              </div>

              <div className={styles.userTasksGrid}>
                {group.tasks.map((task) => {
                  const role = getUserRoleInTask(task);
                  const canDelete = canDeleteTask(task);

                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      showDetailsButton
                      compact={false}
                      showDeleteButton={canDelete}
                      userRole={role}
                      currentUserId={user?.id}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {filteredAndSortedTasks.map((task) => {
            const role = getUserRoleInTask(task);
            const canDelete = canDeleteTask(task);

            return (
              <TaskCard
                key={task.id}
                task={task}
                showDetailsButton
                compact={false}
                showDeleteButton={canDelete}
                userRole={role}
                currentUserId={user?.id}
                onDelete={() => handleDeleteTask(task.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Tasks;