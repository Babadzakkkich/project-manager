import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { tasksAPI } from '../../../services/api/tasks';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { TaskCard } from '../../../components/ui/TaskCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import styles from './Tasks.module.css';

export const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const [viewMode, setViewMode] = useState('my'); // 'my' или 'all' для администраторов
  const [adminGroups, setAdminGroups] = useState([]);
  const [groupUsers, setGroupUsers] = useState([]);
  const [projectOptions, setProjectOptions] = useState([]);
  
  const { user } = useAuthContext();

  // Определяем, является ли пользователь администратором каких-либо групп
  const isAdmin = useMemo(() => {
    return adminGroups.length > 0;
  }, [adminGroups]);

  // Опции фильтрации
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

    // Добавляем фильтр по пользователям для администраторов в режиме "все задачи"
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

  // Загрузка групп, где пользователь является администратором
  const loadAdminGroups = useCallback(async () => {
    try {
      console.log('Загрузка моих групп для проверки прав администратора...');
      const groups = await groupsAPI.getMyGroups();
      console.log('Полученные группы:', groups);
      const adminGroups = groups.filter(group => 
        group.users?.some(u => u.id === user.id && u.role === 'admin')
      );
      console.log('Админские группы:', adminGroups);
      setAdminGroups(adminGroups);
      
      // Собираем всех пользователей из админских групп
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
      console.log('Все пользователи из админских групп:', allUsers);
      setGroupUsers(allUsers);
    } catch (err) {
      console.error('Error loading admin groups:', err);
    }
  }, [user]);

  // Загрузка задач
  const loadTasks = useCallback(async () => {
    try {
      console.log('Загрузка задач, isAdmin:', isAdmin, 'viewMode:', viewMode);
      setLoading(true);
      
      if (isAdmin && viewMode === 'all') {
        // Для администраторов в режиме "все задачи" - используем новый эндпоинт
        console.log('Запрашиваем задачи команды...');
        const teamTasks = await tasksAPI.getTeamTasks();
        console.log('Полученные задачи команды:', teamTasks);
        setTasks(teamTasks);
      } else {
        // Обычный режим - только мои задачи
        console.log('Запрашиваем мои задачи...');
        const tasksData = await tasksAPI.getMyTasks();
        console.log('Полученные мои задачи:', tasksData);
        setTasks(tasksData);
      }
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError('Не удалось загрузить задачи');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, viewMode]);

  // Обновление опций проектов при изменении задач
  useEffect(() => {
    if (tasks.length > 0) {
      const uniqueProjects = [...new Set(tasks.map(task => task.project?.title).filter(Boolean))];
      const newProjectOptions = uniqueProjects.map(projectTitle => ({
        value: projectTitle,
        label: projectTitle
      }));
      setProjectOptions(newProjectOptions);
    } else {
      setProjectOptions([]);
    }
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
      setError('Не удалось удалить задачу: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  // Функция определения роли пользователя в задаче
  const getUserRoleInTask = (task) => {
    console.log('getUserRoleInTask вызвана для задачи:', task.title, 'ID:', task.id);
    if (!user || !task.group) {
        console.log('getUserRoleInTask: нет user или task.group');
        return 'member';
    }
    
    // Проверяем, является ли пользователь администратором группы
    if (task.group.users && Array.isArray(task.group.users)) {
      const userInGroup = task.group.users.find(u => u.id === user.id);
      console.log('getUserRoleInTask: пользователь в группе задачи:', userInGroup);
      if (userInGroup && userInGroup.role === 'admin') {
        console.log('getUserRoleInTask: пользователь является админом группы задачи');
        return 'admin';
      }
    } else {
        console.log('getUserRoleInTask: task.group.users отсутствует или не массив');
    }
    
    // Проверяем, является ли пользователь исполнителем задачи
    const isAssignee = task.assignees?.some(assignee => assignee.id === user.id);
    if (isAssignee) {
      console.log('getUserRoleInTask: пользователь является исполнителем задачи');
      return 'assignee';
    }
    
    console.log('getUserRoleInTask: пользователь является обычным участником');
    return 'member';
  };

  // Фильтрация и сортировка
  const filteredAndSortedTasks = useMemo(() => {
    console.log('Фильтрация и сортировка задач начата. Всего задач:', tasks.length);
    let result = [...tasks];

    // Фильтры
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

    // Сортировка
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
    console.log('Фильтрация и сортировка завершена. Результат:', result);
    return result;
  }, [tasks, filters, sort, isAdmin, viewMode]);

  // Группировка задач по пользователям для режима "Задачи команды"
  const groupedTasks = useMemo(() => {
    console.log('Начинается группировка задач. isAdmin:', isAdmin, 'viewMode:', viewMode);
    if (viewMode !== 'all' || !isAdmin) {
      console.log('Группировка не требуется, возвращаем null.');
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
        // Задачи без исполнителей
        if (!grouped['unassigned']) {
          grouped['unassigned'] = {
            user: { id: 'unassigned', login: 'Без исполнителя', email: '' },
            tasks: []
          };
        }
        grouped['unassigned'].tasks.push(task);
      }
    });
    console.log('Сгруппированные задачи:', grouped);
    return Object.values(grouped);
  }, [filteredAndSortedTasks, viewMode, isAdmin]);

  // Статистика для отображения
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

  // Функция для определения, может ли пользователь удалить задачу
  const canDeleteTask = (task) => {
    const userRole = getUserRoleInTask(task);
    const canDelete = userRole === 'admin' || userRole === 'assignee';
    console.log('canDeleteTask: для задачи', task.title, 'роль:', userRole, 'canDelete:', canDelete);
    return canDelete;
  };

  // Переключение режима просмотра для администраторов
  const handleViewModeChange = (newMode) => {
    console.log('Переключение режима просмотра на:', newMode);
    setViewMode(newMode);
    setFilters({}); // Сбрасываем фильтры при смене режима
  };

  // Получаем заголовок в зависимости от режима просмотра
  const getPageTitle = () => {
    if (viewMode === 'my') {
      return 'Мои задачи';
    } else {
      return 'Задачи команды';
    }
  };

  // Получаем подзаголовок в зависимости от режима просмотра
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
          {/* Переключатель режимов для администраторов */}
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

      {/* Статистика */}
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
              <Button 
                to="/tasks/create" 
                variant="primary" 
                size="large"
              >
                Создать первую задачу
              </Button>
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

          {/* Отображение задач в зависимости от режима */}
          {viewMode === 'all' && isAdmin ? (
            // Группировка по пользователям для режима "Задачи команды"
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
                      console.log('Отрисовка TaskCard для задачи:', task.title, 'ID:', task.id);
                      const userRole = getUserRoleInTask(task); // Вызов с отладкой
                      const canDelete = canDeleteTask(task); // Вызов с отладкой
                      
                      console.log('TaskCard props - task:', task, 'userRole:', userRole, 'canDelete:', canDelete, 'currentUserId:', user.id);
                      
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
            // Обычный список для режима "Мои задачи"
            <div className={styles.tasksGrid}>
              {filteredAndSortedTasks.map((task) => {
                console.log('Отрисовка TaskCard (обычный список) для задачи:', task.title, 'ID:', task.id);
                const userRole = getUserRoleInTask(task); // Вызов с отладкой
                const canDelete = canDeleteTask(task); // Вызов с отладкой
                
                console.log('TaskCard props (обычный список) - task:', task, 'userRole:', userRole, 'canDelete:', canDelete, 'currentUserId:', user.id);
                
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

export default Tasks; // Не забудьте экспорт, если используется