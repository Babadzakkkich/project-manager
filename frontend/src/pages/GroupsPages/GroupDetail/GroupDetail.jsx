import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Crown,
  FolderKanban,
  MailPlus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';

import { groupsAPI } from '../../../services/api/groups';
import { projectsAPI } from '../../../services/api/projects';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { StartConferenceButton } from '../../../components/ui/StartConferenceButton';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import {
  formatDate,
  getRussianPluralForm,
  getUserRoleTranslation,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import { CONFERENCE_ROOM_TYPES } from '../../../utils/constants';
import styles from './GroupDetail.module.css';

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

export const GroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  const [userRole, setUserRole] = useState('');

  const [invitingUser, setInvitingUser] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [showRemoveUserModal, setShowRemoveUserModal] = useState(null);

  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  const { user } = useAuthContext();

  const {
    notification,
    showSuccess,
    showError,
    hideNotification,
  } = useNotification();

  const loadGroup = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const groupData = await groupsAPI.getById(groupId);
      const projectRefs = Array.isArray(groupData.projects) ? groupData.projects : [];

      const projectsWithDetails = await Promise.all(
        projectRefs.map(async (project) => {
          try {
            return await projectsAPI.getById(project.id);
          } catch (err) {
            console.error(`Error loading project ${project.id}:`, err);
            return project;
          }
        })
      );

      setGroup({
        ...groupData,
        projects: projectsWithDetails,
      });

      setEditForm({
        name: groupData.name,
        description: groupData.description || '',
      });
    } catch (err) {
      console.error('Error loading group:', err);
      setError(handleApiError(err));
      setGroup(null);
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
      setError(handleApiError(err));
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      loadGroup();
      loadUserRole();
    }
  }, [groupId, loadGroup, loadUserRole]);

  const displayProjects = useMemo(() => {
    if (!group?.projects) return [];

    return [...group.projects]
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru-RU'))
      .slice(0, 3);
  }, [group?.projects]);

  const handleUpdateGroup = async (e) => {
    e.preventDefault();

    if (!editForm.name.trim()) {
      showError('Название группы обязательно');
      return;
    }

    try {
      await groupsAPI.update(groupId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
      });

      await loadGroup();
      setEditing(false);
      showSuccess('Группа успешно обновлена');
    } catch (err) {
      console.error('Error updating group:', err);
      showError(`Не удалось обновить группу: ${handleApiError(err)}`);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();

    if (!inviteEmail.trim()) {
      showError('Введите email пользователя');
      return;
    }

    setInviting(true);

    try {
      await groupsAPI.inviteUser(groupId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      showSuccess(`Приглашение отправлено на ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('member');
      setInvitingUser(false);
    } catch (err) {
      console.error('Error inviting user:', err);
      showError(`Не удалось отправить приглашение: ${handleApiError(err)}`);
    } finally {
      setInviting(false);
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
        user_ids: [showRemoveUserModal.userId],
      });

      await loadGroup();
      showSuccess(`Пользователь ${showRemoveUserModal.userLogin} удалён из группы`);
    } catch (err) {
      console.error('Error removing user:', err);
      showError(`Не удалось удалить пользователя из группы: ${handleApiError(err)}`);
    } finally {
      setIsRemovingUser(false);
      setShowRemoveUserModal(null);
    }
  };

  const handleChangeUserRole = async (userId, newRole) => {
    try {
      const userToUpdate = group.users.find((item) => item.id === userId);

      if (!userToUpdate) return;

      await groupsAPI.changeUserRole(groupId, {
        user_email: userToUpdate.email,
        role: newRole,
      });

      setEditingUser(null);
      await loadGroup();
      showSuccess(`Роль пользователя ${userToUpdate.login} изменена`);
    } catch (err) {
      console.error('Error changing user role:', err);
      showError(`Не удалось изменить роль пользователя: ${handleApiError(err)}`);
    }
  };

  const handleConfirmDeleteGroup = async () => {
    setIsDeletingGroup(true);

    try {
      await groupsAPI.delete(groupId);
      showSuccess(`Группа "${group.name}" успешно удалена`);
      navigate('/groups');
    } catch (err) {
      console.error('Error deleting group:', err);
      showError(`Не удалось удалить группу: ${handleApiError(err)}`);
    } finally {
      setIsDeletingGroup(false);
      setShowDeleteGroupModal(false);
    }
  };

  const handleCreateProject = () => {
    navigate('/projects/create', {
      state: {
        preselectedGroup: {
          id: group.id,
          name: group.name,
        },
      },
    });
  };

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isCurrentUser = (item) => item.id === user?.id;
  const hasAccessToGroup = group && group.users?.some((item) => item.id === user?.id);
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
        <h2>Не удалось открыть группу</h2>
        <p>{error || 'Группа не найдена или у вас нет доступа.'}</p>

        <Button onClick={() => navigate('/groups')} variant="primary">
          Вернуться к группам
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
            onClick={() => navigate('/groups')}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            К группам
          </button>

          {editing ? (
            <form onSubmit={handleUpdateGroup} className={styles.editForm}>
              <Input
                label="Название группы"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Название группы"
                required
              />

              <div className={styles.textareaGroup}>
                <label className={styles.label} htmlFor="group-description">
                  Описание группы
                </label>

                <textarea
                  id="group-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Описание группы"
                  className={styles.textarea}
                  rows={4}
                  maxLength={500}
                />
              </div>

              <div className={styles.editActions}>
                <Button type="submit" variant="primary">
                  Сохранить
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditing(false);
                    setEditForm({
                      name: group.name,
                      description: group.description || '',
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

              <p className={styles.subtitle}>
                {group.description || 'Описание группы не указано.'}
              </p>
            </>
          )}
        </div>

        {isAdmin && !editing && (
          <div className={styles.heroActions}>
            <StartConferenceButton
              type={CONFERENCE_ROOM_TYPES.GROUP}
              id={group.id}
              title={`Созвон группы ${group.name}`}
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
              onClick={() => setShowDeleteGroupModal(true)}
              className={styles.deleteButton}
              disabled={isDeletingGroup}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              {isDeletingGroup ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.statsGrid} aria-label="Сводка группы">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{group.users?.length || 0}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(group.users?.length || 0, RUSSIAN_PLURAL_FORMS.PARTICIPANT)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{group.projects?.length || 0}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(group.projects?.length || 0, RUSSIAN_PLURAL_FORMS.PROJECT)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{getUserRoleTranslation(userRole)}</span>
          <span className={styles.statLabel}>ваша роль</span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{formatDate(group.created_at)}</span>
          <span className={styles.statLabel}>дата создания</span>
        </article>
      </section>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Участники</h2>
              <p>Состав группы и роли пользователей.</p>
            </div>

            {isAdmin && (
              <Button
                variant="primary"
                size="small"
                onClick={() => setInvitingUser((value) => !value)}
              >
                <MailPlus size={16} strokeWidth={2} aria-hidden="true" />
                {invitingUser ? 'Скрыть форму' : 'Пригласить'}
              </Button>
            )}
          </div>

          {invitingUser && (
            <form onSubmit={handleInviteUser} className={styles.inviteForm}>
              <div className={styles.inviteFields}>
                <Input
                  label="Email пользователя"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  disabled={inviting}
                />

                <div className={styles.selectGroup}>
                  <label htmlFor="invite-role">Роль</label>

                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    disabled={inviting}
                    className={styles.select}
                  >
                    <option value="member">Участник</option>
                    <option value="admin">Администратор</option>
                  </select>
                </div>
              </div>

              <p className={styles.formHint}>
                Приглашение появится у пользователя в разделе уведомлений и приглашений.
              </p>

              <Button
                type="submit"
                variant="primary"
                loading={inviting}
                disabled={!inviteEmail.trim() || inviting}
              >
                Отправить приглашение
              </Button>
            </form>
          )}

          <div className={styles.usersList}>
            {group.users?.map((userItem) => (
              <article key={userItem.id} className={styles.userCard}>
                <div className={styles.userMain}>
                  <div className={styles.avatar}>{getInitial(userItem)}</div>

                  <div className={styles.userInfo}>
                    <div className={styles.userName}>
                      {getUserName(userItem)}
                      {isCurrentUser(userItem) && (
                        <span className={styles.currentUserBadge}>Вы</span>
                      )}
                    </div>

                    <div className={styles.userMeta}>
                      {userItem.login && <span>@{userItem.login}</span>}
                      {userItem.email && <span>{userItem.email}</span>}
                    </div>
                  </div>
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
                      >
                        Отмена
                      </Button>
                    </div>
                  ) : (
                    <span className={`${styles.userRole} ${styles[userItem.role] || ''}`}>
                      {userItem.role === 'super_admin' && (
                        <Crown size={13} strokeWidth={2} aria-hidden="true" />
                      )}
                      {getUserRoleTranslation(userItem.role)}
                    </span>
                  )}

                  {isAdmin && !isCurrentUser(userItem) && (
                    <div className={styles.actionButtons}>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditingUser(userItem.id)}
                      >
                        <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
                        Роль
                      </Button>

                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleRemoveUserClick(userItem.id, userItem.login)}
                        className={styles.removeButton}
                        disabled={isRemovingUser}
                      >
                        <UserMinus size={15} strokeWidth={2} aria-hidden="true" />
                        Удалить
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Проекты группы</h2>
              <p>Проекты, связанные с этой группой.</p>
            </div>

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
              <div className={styles.projectsList}>
                {displayProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    showDetailsButton
                    compact
                  />
                ))}
              </div>

              {hasMoreProjects && (
                <button
                  type="button"
                  className={styles.moreProjects}
                  onClick={() => setShowProjectsModal(true)}
                >
                  Ещё {group.projects.length - 3} проектов
                  <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className={styles.emptyProjects}>
              <div className={styles.emptyProjectsIcon}>
                <FolderKanban size={46} strokeWidth={1.8} aria-hidden="true" />
              </div>

              <h3>Проектов пока нет</h3>

              <p>
                Создайте первый проект для этой группы, чтобы начать работу.
              </p>

              <Button
                variant="primary"
                onClick={handleCreateProject}
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Создать проект
              </Button>
            </div>
          )}
        </section>
      </div>

      <ItemsModal
        items={group.projects || []}
        itemType="projects"
        isOpen={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        title={`Проекты группы "${group.name}"`}
        showDeleteButton={false}
      />

      <ConfirmationModal
        isOpen={showDeleteGroupModal}
        onClose={() => setShowDeleteGroupModal(false)}
        onConfirm={handleConfirmDeleteGroup}
        title="Удаление группы"
        message={`Вы уверены, что хотите удалить группу "${group.name}"? Это действие нельзя отменить. Все проекты и данные группы будут потеряны.`}
        confirmText={isDeletingGroup ? 'Удаление...' : 'Удалить группу'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingGroup}
      />

      <ConfirmationModal
        isOpen={!!showRemoveUserModal}
        onClose={() => setShowRemoveUserModal(null)}
        onConfirm={handleConfirmRemoveUser}
        title="Удаление пользователя из группы"
        message={`Вы уверены, что хотите удалить пользователя "${showRemoveUserModal?.userLogin}" из группы?`}
        confirmText={isRemovingUser ? 'Удаление...' : 'Удалить'}
        cancelText="Отмена"
        variant="warning"
        isLoading={isRemovingUser}
      />
    </div>
  );
};