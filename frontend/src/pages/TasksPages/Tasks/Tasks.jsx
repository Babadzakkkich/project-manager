import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  RotateCcw,
} from 'lucide-react';

import { tasksAPI } from '../../../services/api/tasks';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { TaskCard } from '../../../components/ui/TaskCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  formatRussianCount,
  handleApiError,
  RUSSIAN_CASE_FORMS,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  getTaskPriorityTranslation,
  getTaskStatusTranslation,
} from '../../../utils/taskStatus';
import styles from './Tasks.module.css';

const GROUP_PREPOSITIONAL_FORMS = RUSSIAN_CASE_FORMS.GROUP.PREPOSITIONAL;

const GROUP_BY_OPTIONS = [
  { value: 'none', label: 'Без группировки' },
  { value: 'project', label: 'По проектам' },
  { value: 'group', label: 'По группам' },
  { value: 'assignee', label: 'По исполнителям' },
];

const DEFAULT_TEAM_GROUP_BY = 'project';

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const compareText = (a = '', b = '') => {
  return String(a || '').localeCompare(String(b || ''), 'ru-RU');
};

const getProjectFilterValue = (task) => {
  return String(task.project?.id || task.project_id || task.project?.title || '');
};

const getGroupFilterValue = (task) => {
  return String(task.group?.id || task.group_id || task.group?.name || '');
};

const getUserLabel = (user) => {
  if (!user) return 'Пользователь';
  return user.name || user.login || user.email || 'Пользователь';
};

const getUserOptionLabel = (user) => {
  const label = getUserLabel(user);
  return user?.email ? `${label} (${user.email})` : label;
};

const getInitial = (value) => {
  return String(value || '?').trim().charAt(0).toUpperCase() || '?';
};

export const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamGroupsLoading, setTeamGroupsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const [viewMode, setViewMode] = useState('my');
  const [groupBy, setGroupBy] = useState(DEFAULT_TEAM_GROUP_BY);

  const [teamGroups, setTeamGroups] = useState([]);
  const [groupUsers, setGroupUsers] = useState([]);

  const { user } = useAuthContext();

  const hasTeamGroups = useMemo(() => {
    return teamGroups.length > 0;
  }, [teamGroups]);

  const loadTeamGroups = useCallback(async () => {
    if (!user?.id) {
      setTeamGroups([]);
      setGroupUsers([]);
      setTeamGroupsLoading(false);
      return;
    }

    try {
      setTeamGroupsLoading(true);

      const groupsData = await groupsAPI.getMyGroups();
      const safeGroups = Array.isArray(groupsData) ? groupsData : [];

      const userTeamGroups = safeGroups.filter((group) =>
        group.users?.some((groupUser) => groupUser.id === user.id)
      );

      setTeamGroups(userTeamGroups);

      const uniqueUsers = [];

      userTeamGroups.forEach((group) => {
        if (!Array.isArray(group.users)) return;

        group.users.forEach((groupUser) => {
          if (!uniqueUsers.some((item) => item.id === groupUser.id)) {
            uniqueUsers.push(groupUser);
          }
        });
      });

      setGroupUsers(uniqueUsers);
    } catch (err) {
      console.error('Error loading user groups:', err);
      setTeamGroups([]);
      setGroupUsers([]);
    } finally {
      setTeamGroupsLoading(false);
    }
  }, [user?.id]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const tasksData =
        hasTeamGroups && viewMode === 'all'
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
  }, [hasTeamGroups, viewMode]);

  useEffect(() => {
    loadTeamGroups();
  }, [loadTeamGroups]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const projectOptions = useMemo(() => {
    const projectsMap = new Map();

    tasks.forEach((task) => {
      const projectValue = getProjectFilterValue(task);

      if (!projectValue) return;

      projectsMap.set(projectValue, {
        value: projectValue,
        label: task.project?.title || 'Проект без названия',
      });
    });

    return Array.from(projectsMap.values()).sort((a, b) => compareText(a.label, b.label));
  }, [tasks]);

  const groupOptions = useMemo(() => {
    const groupsMap = new Map();

    teamGroups.forEach((group) => {
      if (!group?.id && !group?.name) return;

      groupsMap.set(String(group.id || group.name), {
        value: String(group.id || group.name),
        label: group.name || 'Группа без названия',
      });
    });

    tasks.forEach((task) => {
      const groupValue = getGroupFilterValue(task);

      if (!groupValue) return;

      groupsMap.set(groupValue, {
        value: groupValue,
        label: task.group?.name || 'Группа без названия',
      });
    });

    return Array.from(groupsMap.values()).sort((a, b) => compareText(a.label, b.label));
  }, [tasks, teamGroups]);

  const assigneeOptions = useMemo(() => {
    const usersMap = new Map();

    groupUsers.forEach((groupUser) => {
      if (!groupUser?.id) return;

      usersMap.set(String(groupUser.id), {
        value: String(groupUser.id),
        label: getUserOptionLabel(groupUser),
      });
    });

    tasks.forEach((task) => {
      task.assignees?.forEach((assignee) => {
        if (!assignee?.id) return;

        usersMap.set(String(assignee.id), {
          value: String(assignee.id),
          label: getUserOptionLabel(assignee),
        });
      });
    });

    return Array.from(usersMap.values()).sort((a, b) => compareText(a.label, b.label));
  }, [groupUsers, tasks]);

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

    if (userInGroup && userInGroup.role === 'admin') {
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

    if (filters.group && hasTeamGroups && viewMode === 'all') {
      result = result.filter((task) => getGroupFilterValue(task) === filters.group);
    }

    if (filters.assignee && hasTeamGroups && viewMode === 'all') {
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
  }, [tasks, filters, sort, hasTeamGroups, viewMode]);

  const groupedTasks = useMemo(() => {
    if (viewMode !== 'all' || groupBy === 'none') {
      return [];
    }

    const grouped = new Map();

    const pushTaskToGroup = (key, title, subtitle, task) => {
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          title,
          subtitle,
          tasks: [],
        });
      }

      grouped.get(key).tasks.push(task);
    };

    filteredAndSortedTasks.forEach((task) => {
      if (groupBy === 'project') {
        const projectKey = getProjectFilterValue(task) || 'without-project';
        pushTaskToGroup(
          `project:${projectKey}`,
          task.project?.title || 'Без проекта',
          '',
          task
        );
        return;
      }

      if (groupBy === 'group') {
        const groupKey = getGroupFilterValue(task) || 'without-group';
        pushTaskToGroup(
          `group:${groupKey}`,
          task.group?.name || 'Без группы',
          '',
          task
        );
        return;
      }

      if (groupBy === 'assignee') {
        if (task.assignees && task.assignees.length > 0) {
          task.assignees.forEach((assignee) => {
            pushTaskToGroup(
              `assignee:${assignee.id}`,
              getUserLabel(assignee),
              assignee.email || '',
              task
            );
          });

          return;
        }

        pushTaskToGroup('assignee:unassigned', 'Без исполнителя', '', task);
      }
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.key.includes('unassigned')) return 1;
      if (b.key.includes('unassigned')) return -1;
      return compareText(a.title, b.title);
    });
  }, [filteredAndSortedTasks, groupBy, viewMode]);

  const hasActiveFilters = Object.keys(filters).some((key) => {
    return filters[key] && filters[key] !== '';
  });

  const hasActiveControls = hasActiveFilters || Boolean(sort) || (
    viewMode === 'all' && groupBy !== DEFAULT_TEAM_GROUP_BY
  );

  const showSidebar = tasks.length > 0 || hasActiveControls;
  const shouldGroupTasks = viewMode === 'all' && groupBy !== 'none';

  const handleViewModeChange = (newMode) => {
    setViewMode(newMode);
    setFilters({});
    setSort('');
  };

  const resetControls = () => {
    setFilters({});
    setSort('');
    setGroupBy(DEFAULT_TEAM_GROUP_BY);
  };

  const getPageTitle = () => {
    return viewMode === 'my' ? 'Мои задачи' : 'Задачи команды';
  };

  const getPageSubtitle = () => {
    if (viewMode === 'my') {
      return 'Назначенные на вас задачи и быстрый доступ к их статусам.';
    }

    return `Все задачи в ${formatRussianCount(teamGroups.length, GROUP_PREPOSITIONAL_FORMS)}, в которых вы состоите.`;
  };

  const renderSelect = ({ label, value, onChange, options, placeholder = 'Все' }) => (
    <label className={styles.controlGroup}>
      <span className={styles.controlLabel}>{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={styles.controlSelect}
      >
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const renderTaskCard = (task) => {
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
  };

  if (loading || teamGroupsLoading) {
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
      <header className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <div>
            <h1 className={styles.title}>{getPageTitle()}</h1>
            <p className={styles.subtitle}>{getPageSubtitle()}</p>
          </div>
        </div>

        <div className={styles.headerActions}>
          {hasTeamGroups && (
            <div className={styles.viewModeSwitcher} aria-label="Режим просмотра задач">
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
                Команда
              </Button>
            </div>
          )}

          <Button to="/tasks/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать задачу
          </Button>
        </div>
      </header>

      <div className={`${styles.workspaceLayout} ${!showSidebar ? styles.workspaceLayoutSingle : ''}`}>
        {showSidebar && (
          <aside className={styles.sidebar} aria-label="Фильтры задач">
            <div className={styles.sidebarHeader}>
              <span>Параметры</span>

              {hasActiveControls && (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={resetControls}
                >
                  <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                  Сбросить
                </button>
              )}
            </div>

            <div className={styles.sidebarBody}>
              <section className={styles.controlsSection}>
                <h2 className={styles.controlsTitle}>Фильтры</h2>

                {renderSelect({
                  label: 'Статус',
                  value: filters.status || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, status: value })),
                  options: TASK_STATUS_OPTIONS,
                })}

                {renderSelect({
                  label: 'Приоритет',
                  value: filters.priority || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, priority: value })),
                  options: TASK_PRIORITY_OPTIONS,
                })}

                {renderSelect({
                  label: 'Проект',
                  value: filters.project || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, project: value })),
                  options: projectOptions,
                })}

                {viewMode === 'all' && hasTeamGroups && renderSelect({
                  label: 'Группа',
                  value: filters.group || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, group: value })),
                  options: groupOptions,
                })}

                {viewMode === 'all' && hasTeamGroups && renderSelect({
                  label: 'Исполнитель',
                  value: filters.assignee || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, assignee: value })),
                  options: assigneeOptions,
                })}
              </section>

              <section className={styles.controlsSection}>
                <h2 className={styles.controlsTitle}>Вид</h2>

                {viewMode === 'all' && hasTeamGroups && renderSelect({
                  label: 'Группировка',
                  value: groupBy,
                  onChange: setGroupBy,
                  options: GROUP_BY_OPTIONS,
                  placeholder: null,
                })}

                {renderSelect({
                  label: 'Сортировка',
                  value: sort,
                  onChange: setSort,
                  options: sortOptions,
                  placeholder: 'По умолчанию',
                })}
              </section>
            </div>
          </aside>
        )}

        <main className={styles.tasksPanel}>
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
                    onClick={resetControls}
                    variant="primary"
                    size="medium"
                  >
                    <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
                    Сбросить параметры
                  </Button>
                </>
              ) : (
                <>
                  <h2>Задач пока нет</h2>

                  <p>
                    {viewMode === 'my'
                      ? 'Создайте первую задачу или дождитесь назначения от администратора группы.'
                      : 'В ваших группах пока нет задач.'}
                  </p>

                  <Button to="/tasks/create" variant="primary" size="medium">
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    Создать задачу
                  </Button>
                </>
              )}
            </div>
          ) : shouldGroupTasks ? (
            <div className={styles.groupedTasks}>
              {groupedTasks.map((group) => (
                <section key={group.key} className={styles.taskGroup}>
                  <div className={styles.groupHeader}>
                    <div className={styles.groupHeaderMain}>
                      <div className={styles.groupMarker} aria-hidden="true">
                        {getInitial(group.title)}
                      </div>

                      <div className={styles.groupTitleBlock}>
                        <h2 className={styles.groupTitle}>{group.title}</h2>
                        {group.subtitle && (
                          <p className={styles.groupSubtitle}>{group.subtitle}</p>
                        )}
                      </div>
                    </div>

                    <span className={styles.taskCount}>
                      {formatRussianCount(group.tasks.length, RUSSIAN_PLURAL_FORMS.TASK)}
                    </span>
                  </div>

                  <div className={styles.groupTasksGrid}>
                    {group.tasks.map(renderTaskCard)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.tasksGrid}>
              {filteredAndSortedTasks.map(renderTaskCard)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Tasks;