import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsAPI } from '../../../services/api/groups';
import { projectsAPI } from '../../../services/api/projects';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { handleApiError, getUserRoleTranslation } from '../../../utils/helpers';
import styles from './GroupDetail.module.css';

export const GroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [userRole, setUserRole] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('member');
  const [editingUser, setEditingUser] = useState(null);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  
  // Состояния для модальных окон подтверждения
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [showRemoveUserModal, setShowRemoveUserModal] = useState(null);
  
  // Состояния для загрузки
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  const { user } = useAuthContext();
  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const loadGroup = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const groupData = await groupsAPI.getById(groupId);
      
      // Загружаем детали проектов сразу
      const projectsWithDetails = await Promise.all(
        groupData.projects.map(async (project) => {
          try {
            const fullProject = await projectsAPI.getById(project.id);
            return fullProject;
          } catch (err) {
            console.error(`Error loading project ${project.id}:`, err);
            return project;
          }
        })
      );
      
      setGroup({
        ...groupData,
        projects: projectsWithDetails
      });
      
      setEditForm({
        name: groupData.name,
        description: groupData.description || ''
      });
    } catch (err) {
      console.error('Error loading group:', err);
      const errorMessage = handleApiError(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const loadUserRole = useCallback(async () => {
    try {
      const roleData = await groupsAPI.getMyRole(groupId);
      setUserRole(roleData.role);
    } catch (err) {
      console.error('Error loading user role:', err);
      const errorMessage = handleApiError(err);
      setError(errorMessage);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      loadGroup();
      loadUserRole();
    }
  }, [loadGroup, loadUserRole, groupId]);

  // Получаем первые 3 проекта в алфавитном порядке для компактного отображения
  const getDisplayProjects = useCallback(() => {
    if (!group?.projects) return [];
    
    return [...group.projects]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 3);
  }, [group?.projects]);

  const handleUpdateGroup = async (e) => {
    e.preventDefault();
    try {
      const updatedGroup = await groupsAPI.update(groupId, editForm);
      setGroup(updatedGroup);
      setEditing(false);
      showSuccess('Группа успешно обновлена');
    } catch (err) {
      console.error('Error updating group:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить группу: ${errorMessage}`);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await groupsAPI.addUsers(groupId, {
        users: [{ user_email: newUserEmail, role: newUserRole }]
      });
      setNewUserEmail('');
      setNewUserRole('member');
      setAddingUser(false);
      await loadGroup(); // Перезагружаем данные
      showSuccess('Пользователь успешно добавлен в группу');
    } catch (err) {
      console.error('Error adding user:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось добавить пользователя: ${errorMessage}`);
    }
  };

  const handleRemoveUserClick = (userId, userLogin) => {
    setShowRemoveUserModal({ userId, userLogin });
  };

  const handleConfirmRemoveUser = async () => {
    if (!showRemoveUserModal) return;

    setIsRemovingUser(true);
    try {
      await groupsAPI.removeUsers(groupId, {
        user_ids: [showRemoveUserModal.userId]
      });
      await loadGroup(); // Перезагружаем данные
      showSuccess(`Пользователь ${showRemoveUserModal.userLogin} удален из группы`);
    } catch (err) {
      console.error('Error removing user:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось удалить пользователя из группы: ${errorMessage}`);
    } finally {
      setIsRemovingUser(false);
      setShowRemoveUserModal(null);
    }
  };

  const handleChangeUserRole = async (userId, newRole) => {
    try {
      const userToUpdate = group.users.find(u => u.id === userId);
      if (!userToUpdate) return;

      await groupsAPI.changeUserRole(groupId, {
        user_email: userToUpdate.email,
        role: newRole
      });
      
      setEditingUser(null);
      await loadGroup(); // Перезагружаем данные
      showSuccess(`Роль пользователя ${userToUpdate.login} изменена`);
    } catch (err) {
      console.error('Error changing user role:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось изменить роль пользователя: ${errorMessage}`);
    }
  };

  const handleDeleteGroupClick = () => {
    setShowDeleteGroupModal(true);
  };

  const handleConfirmDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      await groupsAPI.delete(groupId);
      showSuccess(`Группа "${group.name}" успешно удалена`);
      navigate('/groups');
    } catch (err) {
      console.error('Error deleting group:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось удалить группу: ${errorMessage}`);
    } finally {
      setIsDeletingGroup(false);
      setShowDeleteGroupModal(false);
    }
  };

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isCurrentUser = (userItem) => userItem.id === user?.id;
  const hasAccessToGroup = group && group.users?.some(u => u.id === user?.id);

  const displayProjects = getDisplayProjects();
  const hasMoreProjects = group?.projects && group.projects.length > 3;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка группы...</p>
      </div>
    );
  }

  if (error || !group || !hasAccessToGroup) {
    return (
      <div className={styles.errorContainer}>
        <h2>Ошибка</h2>
        <p>{error || 'Группа не найдена или у вас нет доступа'}</p>
        <Button onClick={() => navigate('/groups')}>Вернуться к группам</Button>
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
          onClick={() => navigate('/groups')}
          className={styles.backButton}
        >
          ← Назад к группам
        </Button>
        
        <div className={styles.headerInfo}>
          {editing ? (
            <form onSubmit={handleUpdateGroup} className={styles.editForm}>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Название группы"
                required
              />
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Описание группы"
              />
              <div className={styles.editActions}>
                <Button type="submit" variant="primary">Сохранить</Button>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => {
                    setEditing(false);
                    setEditForm({
                      name: group.name,
                      description: group.description || ''
                    });
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h1 className={styles.title}>{group.name}</h1>
              {group.description && (
                <p className={styles.description}>{group.description}</p>
              )}
            </>
          )}
        </div>

        {isAdmin && !editing && (
          <div className={styles.headerActions}>
            <Button 
              variant="secondary" 
              onClick={() => setEditing(true)}
            >
              Редактировать
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleDeleteGroupClick}
              className={styles.deleteButton}
              disabled={isDeletingGroup}
            >
              {isDeletingGroup ? 'Удаление...' : 'Удалить группу'}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.content}>
        {/* Участники группы */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Участники группы</h2>
            {isAdmin && (
              <Button 
                variant="primary" 
                size="small"
                onClick={() => setAddingUser(!addingUser)}
              >
                {addingUser ? 'Отмена' : 'Добавить участника'}
              </Button>
            )}
          </div>

          {addingUser && (
            <form onSubmit={handleAddUser} className={styles.addUserForm}>
              <div className={styles.addUserFields}>
                <Input
                  label="Email пользователя"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Введите email пользователя"
                  required
                />
                <div className={styles.roleSelect}>
                  <label>Роль:</label>
                  <select 
                    value={newUserRole} 
                    onChange={(e) => setNewUserRole(e.target.value)}
                  >
                    <option value="member">Участник</option>
                    <option value="admin">Администратор</option>
                  </select>
                </div>
              </div>
              <Button type="submit" variant="primary">Добавить</Button>
            </form>
          )}

          <div className={styles.usersList}>
            {group.users?.map((userItem) => (
              <div key={userItem.id} className={styles.userCard}>
                <div className={styles.userInfo}>
                  <span className={styles.userLogin}>
                    {userItem.login}
                    {isCurrentUser(userItem) && (
                      <span className={styles.currentUserBadge}> (Вы)</span>
                    )}
                  </span>
                  <span className={styles.userEmail}>{userItem.email}</span>
                </div>
                
                <div className={styles.userActions}>
                  {editingUser === userItem.id ? (
                    <div className={styles.roleEdit}>
                      <select 
                        value={userItem.role}
                        onChange={(e) => handleChangeUserRole(userItem.id, e.target.value)}
                        className={styles.roleSelectSmall}
                      >
                        <option value="member">Участник</option>
                        <option value="admin">Администратор</option>
                      </select>
                      <Button 
                        variant="secondary" 
                        size="small"
                        onClick={() => setEditingUser(null)}
                        className={styles.cancelEditButton}
                      >
                        Отмена
                      </Button>
                    </div>
                  ) : (
                    <span className={styles.userRole}>
                      {getUserRoleTranslation(userItem.role)}
                    </span>
                  )}
                  
                  {isAdmin && (
                    <div className={styles.actionButtons}>
                      {!isCurrentUser(userItem) && (
                        <>
                          <Button 
                            variant="secondary" 
                            size="small"
                            onClick={() => setEditingUser(userItem.id)}
                            className={styles.editRoleButton}
                          >
                            Изменить роль
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="small"
                            onClick={() => handleRemoveUserClick(userItem.id, userItem.login)}
                            className={styles.removeButton}
                            disabled={isRemovingUser}
                          >
                            {isRemovingUser ? 'Удаление...' : 'Удалить'}
                          </Button>
                        </>
                      )}
                      {isCurrentUser(userItem) && (userItem.role === 'admin' || userItem.role === 'super_admin') && (
                        <span className={styles.selfAdminNote}>
                          Вы администратор
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Проекты группы */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Проекты группы</h2>
            {group.projects?.length > 0 && (
              <Button 
                variant="primary" 
                size="small"
                onClick={() => setShowProjectsModal(true)}
              >
                Показать все ({group.projects.length})
              </Button>
            )}
          </div>

          {group.projects?.length > 0 ? (
            <div className={styles.projectsSection}>
              <div className={styles.projectsListCompact}>
                {displayProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    showDetailsButton={true}
                    compact={true}
                  />
                ))}
              </div>
              {hasMoreProjects && (
                <div className={styles.moreProjects}>
                  <p>И еще {group.projects.length - 3} проектов...</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>В этой группе пока нет проектов</p>
            </div>
          )}
        </div>
      </div>

      {/* Универсальное модальное окно для проектов (без удаления) */}
      <ItemsModal
        items={group.projects || []}
        itemType="projects"
        isOpen={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        title={`Проекты группы "${group.name}"`}
        showDeleteButton={false} // Убрана возможность удаления проектов
      />

      {/* Модальное окно подтверждения удаления группы */}
      <ConfirmationModal
        isOpen={showDeleteGroupModal}
        onClose={() => setShowDeleteGroupModal(false)}
        onConfirm={handleConfirmDeleteGroup}
        title="Удаление группы"
        message={`Вы уверены, что хотите удалить группу "${group.name}"? Это действие нельзя отменить. Все проекты и данные группы будут потеряны.`}
        confirmText={isDeletingGroup ? "Удаление..." : "Удалить группу"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingGroup}
      />

      {/* Модальное окно подтверждения удаления пользователя */}
      <ConfirmationModal
        isOpen={!!showRemoveUserModal}
        onClose={() => setShowRemoveUserModal(null)}
        onConfirm={handleConfirmRemoveUser}
        title="Удаление пользователя из группы"
        message={`Вы уверены, что хотите удалить пользователя "${showRemoveUserModal?.userLogin}" из группы?`}
        confirmText={isRemovingUser ? "Удаление..." : "Удалить"}
        cancelText="Отмена"
        variant="warning"
        isLoading={isRemovingUser}
      />
    </div>
  );
};