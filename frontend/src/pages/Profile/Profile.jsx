import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Mail,
  Pencil,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';

import { usersAPI } from '../../services/api/users';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Notification } from '../../components/ui/Notification';
import { useAuthContext } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import {
  formatDate,
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../utils/helpers';
import { isTaskOverdue } from '../../utils/taskStatus';
import styles from './Profile.module.css';

const TASK_DONE_STATUSES = ['done', 'completed'];
const TASK_CANCELLED_STATUSES = ['cancelled'];

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getUserInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

export const Profile = () => {
  const navigate = useNavigate();

  const { logout } = useAuthContext();

  const {
    notification,
    showSuccess,
    showError,
    hideNotification,
  } = useNotification();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);

  const [editForm, setEditForm] = useState({
    login: '',
    email: '',
    name: '',
  });

  const [errors, setErrors] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const userData = await usersAPI.getProfile();

      setUser(userData);
      setEditForm({
        login: userData.login || '',
        email: userData.email || '',
        name: userData.name || '',
      });
    } catch (err) {
      console.error('Error loading profile:', err);
      showError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const stats = useMemo(() => {
    if (!user) return null;

    const assignedTasks = Array.isArray(user.assigned_tasks)
      ? user.assigned_tasks
      : [];

    const completedTasks = assignedTasks.filter((task) =>
      TASK_DONE_STATUSES.includes(task.status)
    ).length;

    const activeTasks = assignedTasks.filter((task) =>
      !TASK_DONE_STATUSES.includes(task.status) &&
      !TASK_CANCELLED_STATUSES.includes(task.status)
    ).length;

    const overdueTasks = assignedTasks.filter((task) =>
      isTaskOverdue(task.deadline, task.status)
    ).length;

    return {
      groupsCount: user.groups?.length || 0,
      tasksCount: assignedTasks.length,
      activeTasks,
      completedTasks,
      overdueTasks,
    };
  }, [user]);

  const clearError = (fieldName) => {
    if (!errors[fieldName] && !errors.submit) return;

    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next.submit;
      return next;
    });
  };

  const handleFormChange = (fieldName, value) => {
    setEditForm((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    clearError(fieldName);
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!editForm.login.trim()) {
      nextErrors.login = 'Логин обязателен';
    } else if (editForm.login.trim().length < 3) {
      nextErrors.login = 'Логин должен содержать минимум 3 символа';
    }

    if (!editForm.email.trim()) {
      nextErrors.email = 'Email обязателен';
    } else if (!/\S+@\S+\.\S+/.test(editForm.email)) {
      nextErrors.email = 'Введите корректный email';
    }

    if (!editForm.name.trim()) {
      nextErrors.name = 'Имя обязательно';
    } else if (editForm.name.trim().length < 2) {
      nextErrors.name = 'Имя должно содержать минимум 2 символа';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setUpdating(true);

      const updatedUser = await usersAPI.updateProfile({
        login: editForm.login.trim(),
        email: editForm.email.trim(),
        name: editForm.name.trim(),
      });

      setUser((prevUser) => ({
        ...updatedUser,
        groups: prevUser?.groups || [],
        assigned_tasks: prevUser?.assigned_tasks || [],
      }));

      setEditing(false);
      setErrors({});
      showSuccess('Профиль успешно обновлён');
    } catch (err) {
      console.error('Error updating profile:', err);

      const errorMessage = handleApiError(err);
      setErrors({ submit: errorMessage });
      showError(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);

      await usersAPI.deleteProfile();
      await logout();

      navigate('/');
    } catch (err) {
      console.error('Error deleting account:', err);

      showError(handleApiError(err));
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setErrors({});

    setEditForm({
      login: user.login || '',
      email: user.email || '',
      name: user.name || '',
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка профиля...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Не удалось загрузить профиль</h2>
        <p>Повторите попытку или вернитесь в рабочее пространство.</p>

        <Button onClick={() => navigate('/workspace')} variant="primary">
          Вернуться в рабочее пространство
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
            onClick={() => navigate('/workspace')}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            В рабочее пространство
          </button>

          <h1 className={styles.title}>{getUserName(user)}</h1>

          <p className={styles.subtitle}>
            Управляйте основными данными аккаунта и просматривайте краткую
            сводку по вашим группам и задачам.
          </p>
        </div>

        <div className={styles.profileCard}>
          <div className={styles.avatar}>{getUserInitial(user)}</div>

          <div className={styles.profileMeta}>
            <span className={styles.profileName}>{getUserName(user)}</span>
            <span className={styles.profileLogin}>@{user.login}</span>

            <span className={styles.profileDate}>
              <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
              Зарегистрирован: {formatDate(user.created_at)}
            </span>
          </div>
        </div>
      </section>

      {stats && (
        <section className={styles.statsGrid} aria-label="Сводка профиля">
          <article className={styles.statCard}>
            <span className={styles.statValue}>{stats.groupsCount}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(stats.groupsCount, RUSSIAN_PLURAL_FORMS.GROUP)}
            </span>
          </article>

          <article className={styles.statCard}>
            <span className={styles.statValue}>{stats.tasksCount}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(stats.tasksCount, RUSSIAN_PLURAL_FORMS.TASK)} всего
            </span>
          </article>

          <article className={styles.statCard}>
            <span className={styles.statValue}>{stats.activeTasks}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(stats.activeTasks, [
                'задача в работе',
                'задачи в работе',
                'задач в работе',
              ])}
            </span>
          </article>

          <article className={styles.statCard}>
            <span className={styles.statValue}>{stats.completedTasks}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(stats.completedTasks, [
                'задача выполнена',
                'задачи выполнены',
                'задач выполнено',
              ])}
            </span>
          </article>

          <article
            className={`${styles.statCard} ${
              stats.overdueTasks > 0 ? styles.warningCard : ''
            }`}
          >
            <span className={styles.statValue}>{stats.overdueTasks}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(stats.overdueTasks, [
                'задача просрочена',
                'задачи просрочены',
                'задач просрочено',
              ])}
            </span>
          </article>
        </section>
      )}

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Основная информация</h2>
              <p>Данные, которые используются для входа и отображения пользователя.</p>
            </div>

            {!editing && (
              <Button
                variant="secondary"
                size="small"
                onClick={() => setEditing(true)}
              >
                <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                Редактировать
              </Button>
            )}
          </div>

          {editing ? (
            <form onSubmit={handleUpdateProfile} className={styles.editForm}>
              <Input
                label="Логин"
                value={editForm.login}
                onChange={(e) => handleFormChange('login', e.target.value)}
                error={errors.login}
                placeholder="Введите логин"
                disabled={updating}
                required
              />

              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => handleFormChange('email', e.target.value)}
                error={errors.email}
                placeholder="Введите email"
                disabled={updating}
                required
              />

              <Input
                label="Имя"
                value={editForm.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                error={errors.name}
                placeholder="Введите ваше имя"
                disabled={updating}
                required
              />

              {errors.submit && (
                <div className={styles.submitError} role="alert">
                  {errors.submit}
                </div>
              )}

              <div className={styles.editActions}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={updating}
                  disabled={updating}
                >
                  Сохранить
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelEdit}
                  disabled={updating}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <div className={styles.infoGrid}>
              <article className={styles.infoItem}>
                <span className={styles.infoIcon}>
                  <UserRound size={18} strokeWidth={2} aria-hidden="true" />
                </span>

                <span className={styles.infoText}>
                  <span className={styles.infoLabel}>Логин</span>
                  <span className={styles.infoValue}>{user.login}</span>
                </span>
              </article>

              <article className={styles.infoItem}>
                <span className={styles.infoIcon}>
                  <Mail size={18} strokeWidth={2} aria-hidden="true" />
                </span>

                <span className={styles.infoText}>
                  <span className={styles.infoLabel}>Email</span>
                  <span className={styles.infoValue}>{user.email}</span>
                </span>
              </article>

              <article className={styles.infoItem}>
                <span className={styles.infoIcon}>
                  <UserRound size={18} strokeWidth={2} aria-hidden="true" />
                </span>

                <span className={styles.infoText}>
                  <span className={styles.infoLabel}>Имя</span>
                  <span className={styles.infoValue}>{user.name}</span>
                </span>
              </article>

              <article className={styles.infoItem}>
                <span className={styles.infoIcon}>
                  <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                </span>

                <span className={styles.infoText}>
                  <span className={styles.infoLabel}>Дата регистрации</span>
                  <span className={styles.infoValue}>{formatDate(user.created_at)}</span>
                </span>
              </article>
            </div>
          )}
        </section>

        <aside className={`${styles.section} ${styles.dangerZone}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Опасная зона</h2>
              <p>Действия, влияющие на доступ к аккаунту и данным.</p>
            </div>
          </div>

          <div className={styles.dangerContent}>
            <div className={styles.dangerIcon}>
              <ShieldAlert size={26} strokeWidth={2} aria-hidden="true" />
            </div>

            <div className={styles.dangerInfo}>
              <h3>Удаление аккаунта</h3>

              <p>
                Это действие невозможно отменить. После удаления аккаунта вы
                потеряете доступ к связанным данным и рабочему пространству.
              </p>

              <Button
                variant="danger"
                onClick={() => setShowDeleteModal(true)}
                className={styles.deleteAccountButton}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                Удалить аккаунт
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        title="Удаление аккаунта"
        message={
          <div className={styles.deleteMessage}>
            <p>
              <strong>Внимание! Это действие невозможно отменить.</strong>
            </p>

            <p>
              Вы уверены, что хотите удалить аккаунт и выйти из системы?
            </p>
          </div>
        }
        confirmText={deleting ? 'Удаление...' : 'Да, удалить аккаунт'}
        cancelText="Отмена"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
};

export default Profile;