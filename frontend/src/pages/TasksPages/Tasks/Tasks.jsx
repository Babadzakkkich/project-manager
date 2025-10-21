import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { tasksAPI } from '../../../services/api/tasks';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { TaskCard } from '../../../components/ui/TaskCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import { handleApiError } from '../../../utils/helpers';
import styles from './Tasks.module.css';

export const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const filterOptions = useMemo(() => {
    const baseOptions = [
      {
        key: 'status',
        label: 'Статус задачи',
        options: [
          { value: 'in_progress', label: 'В процессе' },
          { value: 'completed', label: 'Завершена' },
          { value: 'planned', label: 'Запланирована' },
          { value: 'on_hold', label: 'Приостановлена' },
          { value: 'cancelled', label: 'Отменена' }
        ]
      },
      {
        key: 'project',
        label: 'Проект',
        options: projectOptions
      }
    ];

    if (isAdmin && viewMode === 'all') {
      return [
        ...baseOptions,
        {
          key: 'assignee',
          label: 'Исполнитель',
          options: [
            { value: 'all', label: 'Все исполнители' },
            ...groupUsers.map(user => ({
              value: user.id.toString(),
              label: `${user.login} (${user.email})`
            }))
          ]
        }
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
    { value: 'status', label: 'По статусу' }
  ];

  const loadAdminGroups = useCallback(async () => {
    try {
      const groups = await groupsAPI.getMyGroups();
      const adminGroups = groups.filter(group => 
        group.users?.some(u => u.id === user.id && u.role === 'admin')
      );
      setAdminGroups(adminGroups);
      
      const allUsers = [];
      adminGroups.forEach(group => {
        if (group.users) {
          group.users.forEach(user => {
            if (!allUsers.some(u => u.id === user.id)) {
              allUsers.push(user);
            }
          });
        }
      });
      setGroupUsers(allUsers);
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      // Ошибка загрузки групп не критична для основного функционала
    }
  }, [user]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      let tasksData;
      if (isAdmin && viewMode === 'all') {
        tasksData = await tasksAPI.getTeamTasks();
      } else {
        tasksData = await tasksAPI.getMyTasks();
      }
      setTasks(tasksData);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, viewMode]);

  useEffect(() => {
    const uniqueProjects = [...new Set(tasks.map(task => task.project?.title).filter(Boolean))];
    const newProjectOptions = uniqueProjects.map(projectTitle => ({
      value: projectTitle,
      label: projectTitle
    }));
    setProjectOptions(newProjectOptions);
  }, [tasks]);

  useEffect(() => {
    loadAdminGroups();
  }, [loadAdminGroups]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleDeleteTask = async (taskId, taskTitle) => {
    if (!window.confirm(`Вы уверены, что хотите удалить задачу "${taskTitle}"? Это действие нельзя отменить.`)) {
      return;
    }

    try {
      await tasksAPI.delete(taskId);
      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const getUserRoleInTask = useCallback((task) => {
    if (!user || !task.group) {
      return 'member';
    }
    
    if (task.group.users && Array.isArray(task.group.users)) {
      const userInGroup = task.group.users.find(u => u.id === user.id);
      if (userInGroup && userInGroup.role === 'admin') {
        return 'admin';
      }
    }
    
    const isAssignee = task.assignees?.some(assignee => assignee.id === user.id);
    if (isAssignee) {
      return 'assignee';
    }
    
    return 'member';
  }, [user]);

  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    if (filters.status) {
      result = result.filter(task => task.status === filters.status);
    }

    if (filters.project) {
      result = result.filter(task => task.project?.title === filters.project);
    }

    if (filters.assignee && isAdmin && viewMode === 'all' && filters.assignee !== 'all') {
      const assigneeId = parseInt(filters.assignee);
      result = result.filter(task => 
        task.assignees?.some(assignee => assignee.id === assigneeId)
      );
    }

    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'title_desc':
          result.sort((a, b) => b.title.localeCompare(a.title));
          break;
        case 'deadline_asc':
          result.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
          break;
        case 'deadline_desc':
          result.sort((a, b) => new Date(b.deadline) - new Date(a.deadline));
          break;
        case 'created_at_desc':
          result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          break;
        case 'created_at_asc':
          result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          break;
        case 'status':
          result.sort((a, b) => a.status.localeCompare(b.status));
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
    
    filteredAndSortedTasks.forEach(task => {
      if (task.assignees && task.assignees.length > 0) {
        task.assignees.forEach(assignee => {
          if (!grouped[assignee.id]) {
            grouped[assignee.id] = {
              user: assignee,
              tasks: []
            };
          }
          grouped[assignee.id].tasks.push(task);
        });
      } else {
        if (!grouped['unassigned']) {
          grouped['unassigned'] = {
            user: { id: 'unassigned', login: 'Без исполнителя', email: '' },
            tasks: []
          };
        }
        grouped['unassigned'].tasks.push(task);
      }
    });

    return Object.values(grouped);
  }, [filteredAndSortedTasks, viewMode, isAdmin]);

  const taskStats = useMemo(() => {
    const total = filteredAndSortedTasks.length;
    const completed = filteredAndSortedTasks.filter(task => task.status === 'completed').length;
    const overdue = filteredAndSortedTasks.filter(task => {
      const deadline = new Date(task.deadline);
      const today = new Date();
      return deadline < today && task.status !== 'completed';
    }).length;
    const inProgress = filteredAndSortedTasks.filter(task => task.status === 'in_progress').length;

    return { total, completed, overdue, inProgress };
  }, [filteredAndSortedTasks]);

  const canDeleteTask = useCallback((task) => {
    const userRole = getUserRoleInTask(task);
    return userRole === 'admin' || userRole === 'assignee';
  }, [getUserRoleInTask]);

  const handleViewModeChange = (newMode) => {
    setViewMode(newMode);
    setFilters({});
  };

  const getPageTitle = () => {
    return viewMode === 'my' ? 'Мои задачи' : 'Задачи команды';
  };

  const getPageSubtitle = () => {
    if (viewMode === 'my') {
      return 'Задачи, назначенные на вас';
    } else {
      return `Все задачи в ${adminGroups.length} группах, которыми вы управляете`;
    }
  };

  if (loading) {
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
        <h2>Ошибка</h2>
        <p>{error}</p>
        <Button onClick={loadTasks}>Попробовать снова</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{getPageTitle()}</h1>
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
        </div>
        <p className={styles.subtitle}>
          {getPageSubtitle()}
        </p>
        <Button 
          to="/tasks/create" 
          variant="primary" 
          size="large"
          className={styles.createButton}
        >
          Создать новую задачу
        </Button>
      </div>

      {filteredAndSortedTasks.length > 0 && (
        <div className={styles.statsContainer}>
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{taskStats.total}</span>
              <span className={styles.statLabel}>Всего</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{taskStats.inProgress}</span>
              <span className={styles.statLabel}>В работе</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{taskStats.completed}</span>
              <span className={styles.statLabel}>Завершено</span>
            </div>
            <div className={`${styles.statItem} ${taskStats.overdue > 0 ? styles.overdueStat : ''}`}>
              <span className={styles.statNumber}>{taskStats.overdue}</span>
              <span className={styles.statLabel}>Просрочено</span>
            </div>
          </div>
        </div>
      )}

      {filteredAndSortedTasks.length > 0 && (
        <FilterSort
          filters={filterOptions}
          sortOptions={sortOptions}
          selectedFilters={filters}
          selectedSort={sort}
          onFilterChange={setFilters}
          onSortChange={setSort}
        />
      )}

      {filteredAndSortedTasks.length === 0 ? (
        <div className={styles.emptyState}>
          {Object.keys(filters).length > 0 ? (
            <>
              <h2>Задачи не найдены</h2>
              <p>Попробуйте изменить параметры фильтрации</p>
              <Button 
                onClick={() => setFilters({})}
                variant="primary" 
                size="large"
              >
                Сбросить фильтры
              </Button>
            </>
          ) : (
            <>
              <h2>Задачи не найдены</h2>
              <p>
                {viewMode === 'my' 
                  ? 'Создайте свою первую задачу или дождитесь назначения'
                  : 'В ваших группах пока нет задач'
                }
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={styles.tasksInfo}>
            <span className={styles.tasksCount}>
              Найдено задач: {filteredAndSortedTasks.length}
            </span>
          </div>

          {viewMode === 'all' && isAdmin ? (
            <div className={styles.groupedTasks}>
              {groupedTasks && groupedTasks.map(group => (
                <div key={group.user.id} className={styles.userTaskGroup}>
                  <div className={styles.userHeader}>
                    <h3 className={styles.userName}>
                      {group.user.login}
                      {group.user.email && (
                        <span className={styles.userEmail}> ({group.user.email})</span>
                      )}
                    </h3>
                    <span className={styles.taskCount}>
                      {group.tasks.length} задач
                    </span>
                  </div>
                  <div className={styles.userTasksGrid}>
                    {group.tasks.map((task) => {
                      const userRole = getUserRoleInTask(task);
                      const canDelete = canDeleteTask(task);
                      
                      return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          showDetailsButton={true}
                          compact={false}
                          showDeleteButton={canDelete}
                          userRole={userRole}
                          currentUserId={user.id}
                          onDelete={() => handleDeleteTask(task.id, task.title)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.tasksGrid}>
              {filteredAndSortedTasks.map((task) => {
                const userRole = getUserRoleInTask(task);
                const canDelete = canDeleteTask(task);
                
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    showDetailsButton={true}
                    compact={false}
                    showDeleteButton={canDelete}
                    userRole={userRole}
                    currentUserId={user.id}
                    onDelete={() => handleDeleteTask(task.id, task.title)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Tasks;