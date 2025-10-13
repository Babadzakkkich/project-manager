import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { ProjectsModal } from '../../../components/ui/ProjectsModal';
import { useAuthContext } from '../../../contexts/AuthContext';
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
  const { user } = useAuthContext();

  const loadGroup = useCallback(async () => {
    try {
      setLoading(true);
      const groupData = await groupsAPI.getById(groupId);
      setGroup(groupData);
      setEditForm({
        name: groupData.name,
        description: groupData.description || ''
      });
    } catch (err) {
      console.error('Error loading group:', err);
      setError('Не удалось загрузить информацию о группе');
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
    } catch (err) {
      console.error('Error updating group:', err);
      setError('Не удалось обновить группу');
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
      loadGroup();
    } catch (err) {
      console.error('Error adding user:', err);
      setError('Не удалось добавить пользователя: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого пользователя из группы?')) {
      return;
    }

    try {
      await groupsAPI.removeUsers(groupId, {
        user_ids: [userId]
      });
      loadGroup();
    } catch (err) {
      console.error('Error removing user:', err);
      setError('Не удалось удалить пользователя из группы: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
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
      loadGroup();
    } catch (err) {
      console.error('Error changing user role:', err);
      setError('Не удалось изменить роль пользователя: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm(`Вы уверены, что хотите удалить группу "${group.name}"? Это действие нельзя отменить.`)) {
      return;
    }

    try {
      await groupsAPI.delete(groupId);
      navigate('/groups');
    } catch (err) {
      console.error('Error deleting group:', err);
      setError('Не удалось удалить группу: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  const getRoleTranslation = (role) => {
    const roleTranslations = {
      'admin': 'Администратор',
      'member': 'Участник'
    };
    return roleTranslations[role] || role;
  };

  const isAdmin = userRole === 'admin';
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
              onClick={handleDeleteGroup}
              className={styles.deleteButton}
            >
              Удалить группу
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
                      {getRoleTranslation(userItem.role)}
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
                            onClick={() => handleRemoveUser(userItem.id)}
                            className={styles.removeButton}
                          >
                            Удалить
                          </Button>
                        </>
                      )}
                      {isCurrentUser(userItem) && userItem.role === 'admin' && (
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

        {/* Проекты группы - ОБНОВЛЕННАЯ СЕКЦИЯ */}
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

      {/* Модальное окно всех проектов */}
      <ProjectsModal
        projects={group.projects || []}
        isOpen={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        title={`Проекты группы "${group.name}"`}
      />
    </div>
  );
};