import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { tasksAPI } from '../../../services/api/tasks';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { 
  handleApiError, 
  formatDate,
} from '../../../utils/helpers';
import {  getTaskStatusTranslation, getTaskStatusColor, isTaskOverdue} from '../../../utils/taskStatus'
import styles from './TaskDetail.module.css';

export const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ 
    title: '', 
    description: '', 
    status: '',
    start_date: '',
    deadline: ''
  });
  const [addingUsers, setAddingUsers] = useState(false);
  const [newUserIds, setNewUserIds] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [showUsersModal, setShowUsersModal] = useState(false);
  
  // Состояния для модальных окон подтверждения
  const [showDeleteTaskModal, setShowDeleteTaskModal] = useState(false);
  const [showRemoveUserModal, setShowRemoveUserModal] = useState(null);
  
  // Состояния для загрузки
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  const { user } = useAuthContext();
  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const loadTask = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const taskData = await tasksAPI.getById(taskId);
      
      setTask(taskData);
      
      setEditForm({
        title: taskData.title,
        description: taskData.description || '',
        status: taskData.status,
        start_date: taskData.start_date.split('T')[0],
        deadline: taskData.deadline.split('T')[0]
      });
    } catch (err) {
      console.error('Error loading task:', err);
      const errorMessage = handleApiError(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Загружаем доступных пользователей для добавления
  const loadAvailableUsers = useCallback(async () => {
    try {
      if (!task?.group?.id) return;
      
      // Получаем пользователей группы задачи
      const groupUsers = task.group.users || [];
      setAvailableUsers(groupUsers);
    } catch (err) {
      console.error('Error loading available users:', err);
    }
  }, [task]);

  // Определяем роль пользователя в задаче
  const determineUserRole = useCallback(() => {
    if (!task || !user) return '';
    
    // Проверяем, является ли пользователь исполнителем задачи
    const isAssignee = task.assignees?.some(assignee => assignee.id === user.id);
    
    // Проверяем, является ли пользователь администратором группы
    const isGroupAdmin = task.group?.users?.some(groupUser => 
      groupUser.id === user.id && (groupUser.role === 'admin' || groupUser.role === 'super_admin')
    );
    
    if (isGroupAdmin) return 'admin';
    if (isAssignee) return 'assignee';
    return 'viewer';
  }, [task, user]);

  useEffect(() => {
    if (taskId) {
      loadTask();
    }
  }, [loadTask, taskId]);

  useEffect(() => {
    if (task) {
      loadAvailableUsers();
      const role = determineUserRole();
      setUserRole(role);
    }
  }, [task, loadAvailableUsers, determineUserRole]);

  // Получаем первых 3 исполнителей для компактного отображения
  const getDisplayAssignees = useCallback(() => {
    if (!task?.assignees) return [];
    
    return task.assignees.slice(0, 3);
  }, [task?.assignees]);

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    try {
      await tasksAPI.update(taskId, editForm);
      // После обновления перезагружаем полные данные задачи
      await loadTask();
      setEditing(false);
      showSuccess('Задача успешно обновлена');
    } catch (err) {
      console.error('Error updating task:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить задачу: ${errorMessage}`);
    }
  };

  const handleAddUsers = async (e) => {
    e.preventDefault();
    try {
      await tasksAPI.addUsers(taskId, {
        user_ids: newUserIds.map(id => parseInt(id))
      });
      setNewUserIds([]);
      setAddingUsers(false);
      await loadTask(); // Перезагружаем данные
      showSuccess(`Добавлено ${newUserIds.length} исполнителей`);
    } catch (err) {
      console.error('Error adding users:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось добавить пользователей: ${errorMessage}`);
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
        user_ids: [showRemoveUserModal.userId]
      });
      
      // Перезагружаем данные вместо локального обновления
      await loadTask();
      
      showSuccess(`Пользователь "${showRemoveUserModal.userLogin}" удален из задачи`);
    } catch (err) {
      console.error('Error removing user:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось удалить пользователя: ${errorMessage}`);
    } finally {
      setIsRemovingUser(false);
      setShowRemoveUserModal(null);
    }
  };

  const handleDeleteTaskClick = () => {
    setShowDeleteTaskModal(true);
  };

  const handleConfirmDeleteTask = async () => {
    setIsDeletingTask(true);
    try {
      await tasksAPI.delete(taskId);
      
      showSuccess(`Задача "${task.title}" успешно удалена`);
      
      // Перенаправляем обратно к задачам или проекту
      const projectId = searchParams.get('projectId');
      if (projectId) {
        navigate(`/projects/${projectId}`);
      } else {
        navigate('/tasks');
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось удалить задачу: ${errorMessage}`);
    } finally {
      setIsDeletingTask(false);
      setShowDeleteTaskModal(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await tasksAPI.update(taskId, {
        status: newStatus
      });
      // Перезагружаем полные данные задачи после изменения статуса
      await loadTask();
      showSuccess(`Статус задачи изменен на "${getTaskStatusTranslation(newStatus)}"`);
    } catch (err) {
      console.error('Error changing task status:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось изменить статус: ${errorMessage}`);
    }
  };

  // Обновленные права доступа
  const canEdit = userRole === 'admin' || userRole === 'assignee';
  const canManageUsers = userRole === 'admin'; // Только администраторы могут управлять пользователями
  const canDelete = userRole === 'admin';
  const isOverdue = task && isTaskOverdue(task.deadline, task.status);

  const displayAssignees = getDisplayAssignees();
  const hasMoreAssignees = task?.assignees && task.assignees.length > 3;

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
        <h2>Ошибка</h2>
        <p>{error || 'Задача не найдена или у вас нет доступа'}</p>
        <Button onClick={() => navigate('/tasks')}>Вернуться к задачам</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Уведомление */}
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
        duration={5000}
      />

      <div className={styles.header}>
        <Button 
          variant="secondary" 
          onClick={() => {
            const projectId = searchParams.get('projectId');
            if (projectId) {
              navigate(`/projects/${projectId}`);
            } else {
              navigate('/tasks');
            }
          }}
          className={styles.backButton}
        >
          ← Назад
        </Button>
        
        <div className={styles.headerInfo}>
          {editing ? (
            <form onSubmit={handleUpdateTask} className={styles.editForm}>
              <Input
                label="Название задачи"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Название задачи"
                required
              />
              <Input
                label="Описание задачи"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Описание задачи"
                multiline
                rows={4}
              />
              <div className={styles.dateFields}>
                <Input
                  label="Дата начала"
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm(prev => ({ ...prev, start_date: e.target.value }))}
                  required
                />
                <Input
                  label="Срок выполнения"
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) => setEditForm(prev => ({ ...prev, deadline: e.target.value }))}
                  required
                />
              </div>
              <div className={styles.statusSelect}>
                <label>Статус:</label>
                <select 
                  value={editForm.status} 
                  onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="planned">Запланирована</option>
                  <option value="in_progress">В процессе</option>
                  <option value="on_hold">Приостановлена</option>
                  <option value="completed">Завершена</option>
                  <option value="cancelled">Отменена</option>
                </select>
              </div>
              <div className={styles.editActions}>
                <Button type="submit" variant="primary">Сохранить</Button>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => {
                    setEditing(false);
                    setEditForm({
                      title: task.title,
                      description: task.description || '',
                      status: task.status,
                      start_date: task.start_date.split('T')[0],
                      deadline: task.deadline.split('T')[0]
                    });
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles.titleSection}>
                <h1 className={styles.title}>{task.title}</h1>
                <div 
                  className={styles.statusBadge}
                  style={{ 
                    backgroundColor: getTaskStatusColor(task.status),
                    color: 'white'
                  }}
                >
                  {getTaskStatusTranslation(task.status)}
                  {isOverdue && (
                    <span className={styles.overdueIndicator}> 🔥 Просрочена</span>
                  )}
                </div>
              </div>
              
              {task.description && (
                <p className={styles.description}>{task.description}</p>
              )}
              
              <div className={styles.taskMeta}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Проект:</span>
                  <span className={styles.metaValue}>
                    {task.project ? (
                      <Button 
                        variant="link" 
                        onClick={() => navigate(`/projects/${task.project.id}`)}
                        className={styles.projectLink}
                      >
                        {task.project.title}
                      </Button>
                    ) : (
                      'Не указан'
                    )}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Группа:</span>
                  <span className={styles.metaValue}>
                    {task.group ? (
                      <Button 
                        variant="link" 
                        onClick={() => navigate(`/groups/${task.group.id}`)}
                        className={styles.groupLink}
                      >
                        {task.group.name}
                      </Button>
                    ) : (
                      'Не указана'
                    )}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Дата начала:</span>
                  <span className={styles.metaValue}>{formatDate(task.start_date)}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Срок выполнения:</span>
                  <span className={`${styles.metaValue} ${isOverdue ? styles.overdue : ''}`}>
                    {formatDate(task.deadline)}
                    {isOverdue && ' ⚠️'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {canEdit && !editing && (
          <div className={styles.headerActions}>
            <Button 
              variant="secondary" 
              onClick={() => setEditing(true)}
            >
              Редактировать
            </Button>
            {canDelete && (
              <Button 
                variant="secondary" 
                onClick={handleDeleteTaskClick}
                className={styles.deleteButton}
                disabled={isDeletingTask}
              >
                {isDeletingTask ? 'Удаление...' : 'Удалить задачу'}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={styles.content}>
        {/* Основная информация - левая колонка */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Информация о задаче</h2>
            {canEdit && !editing && (
              <div className={styles.quickActions}>
                <label>Быстрая смена статуса:</label>
                <select 
                  value={task.status} 
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value="planned">Запланирована</option>
                  <option value="in_progress">В процессе</option>
                  <option value="on_hold">Приостановлена</option>
                  <option value="completed">Завершена</option>
                  <option value="cancelled">Отменена</option>
                </select>
              </div>
            )}
          </div>

          <div className={styles.taskDetails}>
            <div className={styles.detailItem}>
              <strong>Текущий статус:</strong>
              <span 
                className={styles.statusText}
                style={{ color: getTaskStatusColor(task.status) }}
              >
                {getTaskStatusTranslation(task.status)}
              </span>
            </div>
            
            <div className={styles.detailItem}>
              <strong>Оставшееся время:</strong>
              <span className={isOverdue ? styles.overdue : ''}>
                {isOverdue ? 'Просрочено' : 'В процессе выполнения'}
              </span>
            </div>
            
            <div className={styles.detailItem}>
              <strong>Прогресс:</strong>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ 
                    width: task.status === 'completed' ? '100%' : 
                           task.status === 'in_progress' ? '50%' : '10%',
                    backgroundColor: getTaskStatusColor(task.status)
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Исполнители - правая колонка */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Исполнители</h2>
            <div className={styles.assigneesHeaderActions}>
              {canManageUsers && (
                <Button 
                  variant="primary" 
                  size="small"
                  onClick={() => setAddingUsers(!addingUsers)}
                >
                  {addingUsers ? 'Отмена' : 'Добавить исполнителя'}
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
              <div className={styles.addUsersFields}>
                <div className={styles.selectUsers}>
                  <label>Выберите исполнителей:</label>
                  <div className={styles.usersGrid}>
                    {availableUsers
                      .filter(availableUser => !task.assignees.some(assignee => assignee.id === availableUser.id))
                      .map((user) => (
                        <label key={user.id} className={styles.userCheckboxItem}>
                          <input
                            type="checkbox"
                            value={user.id}
                            checked={newUserIds.includes(user.id.toString())}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserIds(prev => [...prev, user.id.toString()]);
                              } else {
                                setNewUserIds(prev => prev.filter(id => id !== user.id.toString()));
                              }
                            }}
                            className={styles.userCheckbox}
                          />
                          <div className={styles.userInfo}>
                            <div className={styles.userAvatar}>
                              {user.login?.charAt(0).toUpperCase()}
                            </div>
                            <div className={styles.userDetails}>
                              <div className={styles.userLogin}>{user.login}</div>
                              <div className={styles.userEmail}>{user.email}</div>
                            </div>
                          </div>
                        </label>
                      ))
                    }
                  </div>
                </div>
              </div>
              <Button 
                type="submit" 
                variant="primary" 
                disabled={newUserIds.length === 0}
              >
                Добавить выбранных ({newUserIds.length})
              </Button>
            </form>
          )}

          {task.assignees?.length > 0 ? (
            <div className={styles.assigneesSection}>
              <div className={styles.assigneesListCompact}>
                {displayAssignees.map((assignee) => (
                  <div key={assignee.id} className={styles.assigneeCard}>
                    <div className={styles.assigneeInfo}>
                      <div className={styles.assigneeAvatar}>
                        {assignee.login?.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.assigneeDetails}>
                        <div className={styles.assigneeLogin}>{assignee.login}</div>
                        <div className={styles.assigneeEmail}>{assignee.email}</div>
                      </div>
                    </div>
                    {/* Убираем кнопку удаления для обычных исполнителей */}
                    {canManageUsers && task.assignees.length > 1 && (
                      <Button 
                        variant="secondary" 
                        size="small"
                        onClick={() => handleRemoveUserClick(assignee.id, assignee.login)}
                        className={styles.removeButton}
                        disabled={isRemovingUser}
                      >
                        {isRemovingUser ? 'Удаление...' : 'Удалить'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {hasMoreAssignees && (
                <div className={styles.moreItems}>
                  <p>И еще {task.assignees.length - 3} исполнителей...</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>У этой задачи пока нет исполнителей</p>
              {canManageUsers && (
                <p>Добавьте исполнителей, чтобы они могли работать над задачей</p>
              )}
            </div>
          )}
        </div>
      </div>

      <ItemsModal
        items={task.assignees || []}
        itemType="users"
        isOpen={showUsersModal}
        onClose={() => setShowUsersModal(false)}
        title={`Исполнители задачи "${task.title}"`}
        currentUserId={user?.id}
        showDeleteButton={canManageUsers}
        onDelete={(userId, userLogin) => handleRemoveUserClick(userId, userLogin)}
        customFilterOptions={[]}
        customSortOptions={[
          { value: 'login_asc', label: 'По логину (А-Я)' },
          { value: 'login_desc', label: 'По логину (Я-А)' },
        ]}
        customRenderItem={(userItem, props) => (
          <div key={userItem.id} className={styles.assigneeCard}>
            <div className={styles.assigneeInfo}>
              <div className={styles.assigneeAvatar}>
                {userItem.login?.charAt(0).toUpperCase()}
              </div>
              <div className={styles.assigneeDetails}>
                <div className={styles.assigneeLogin}>{userItem.login}</div>
                <div className={styles.assigneeEmail}>{userItem.email}</div>
              </div>
            </div>
            {props.showDeleteButton && props.onDelete && (
              <Button 
                variant="secondary" 
                size="small"
                onClick={() => props.onDelete(userItem.id, userItem.login)}
                className={styles.removeButton}
                disabled={isRemovingUser}
              >
                {isRemovingUser ? 'Удаление...' : 'Удалить'}
              </Button>
            )}
          </div>
        )}
        customEmptyMessages={{
          filtered: {
            title: 'Исполнители не найдены',
            description: 'Попробуйте изменить параметры фильтрации'
          },
          default: {
            title: 'Исполнителей пока нет',
            description: 'Здесь еще не добавлено ни одного исполнителя'
          }
        }}
      />

      {/* Модальное окно подтверждения удаления задачи */}
      <ConfirmationModal
        isOpen={showDeleteTaskModal}
        onClose={() => setShowDeleteTaskModal(false)}
        onConfirm={handleConfirmDeleteTask}
        title="Удаление задачи"
        message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
        confirmText={isDeletingTask ? "Удаление..." : "Удалить задачу"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingTask}
      />

      {/* Модальное окно подтверждения удаления пользователя */}
      <ConfirmationModal
        isOpen={!!showRemoveUserModal}
        onClose={() => setShowRemoveUserModal(null)}
        onConfirm={handleConfirmRemoveUser}
        title="Удаление исполнителя"
        message={`Вы уверены, что хотите удалить пользователя "${showRemoveUserModal?.userLogin}" из задачи?`}
        confirmText={isRemovingUser ? "Удаление..." : "Удалить"}
        cancelText="Отмена"
        variant="warning"
        isLoading={isRemovingUser}
      />
    </div>
  );
};