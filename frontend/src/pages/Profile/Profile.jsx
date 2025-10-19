import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersAPI } from '../../services/api/users';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Notification } from '../../components/ui/Notification';
import { useAuthContext } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { handleApiError, formatDate } from '../../utils/helpers';
import styles from './Profile.module.css';

export const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const {
    notification,
    showSuccess,
    showError,
    hideNotification
  } = useNotification();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    login: '',
    email: '',
    name: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const userData = await usersAPI.getProfile();
      setUser(userData);
      setEditForm({
        login: userData.login,
        email: userData.email,
        name: userData.name
      });
    } catch (err) {
      console.error('Error loading profile:', err);
      const errorMessage = handleApiError(err);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      setUpdating(true);
      
      // Обновляем только основные данные
      const updatedUser = await usersAPI.updateProfile(editForm);
      
      // Сохраняем статистику из предыдущего состояния
      setUser(prevUser => ({
        ...updatedUser,
        groups: prevUser?.groups || [],
        assigned_tasks: prevUser?.assigned_tasks || []
      }));
      
      setEditing(false);
      showSuccess('Профиль успешно обновлен');
    } catch (err) {
      console.error('Error updating profile:', err);
      const errorMessage = handleApiError(err);
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
      const errorMessage = handleApiError(err);
      showError(errorMessage);
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm({
      login: user.login,
      email: user.email,
      name: user.name
    });
  };

  // Статистика пользователя
  const getUserStats = () => {
    if (!user) return null;
    
    return {
      groupsCount: user.groups?.length || 0,
      tasksCount: user.assigned_tasks?.length || 0,
      completedTasks: user.assigned_tasks?.filter(task => task.status === 'completed').length || 0,
      inProgressTasks: user.assigned_tasks?.filter(task => task.status === 'in_progress').length || 0,
      overdueTasks: user.assigned_tasks?.filter(task => {
        if (!task.deadline || task.status === 'completed') return false;
        const deadline = new Date(task.deadline);
        const today = new Date();
        return deadline < today;
      }).length || 0
    };
  };

  const stats = getUserStats();

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
        <h2>Ошибка</h2>
        <p>Не удалось загрузить профиль</p>
        <Button onClick={() => navigate('/workspace')}>Вернуться в рабочее пространство</Button>
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
          onClick={() => navigate('/workspace')}
          className={styles.backButton}
        >
          ← Назад
        </Button>
        <h1 className={styles.title}>Мой профиль</h1>
      </div>

      <div className={styles.content}>
        {/* Основная информация */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Основная информация</h2>
            {!editing && (
              <Button 
                variant="secondary" 
                onClick={() => setEditing(true)}
              >
                Редактировать
              </Button>
            )}
          </div>

          {editing ? (
            <form onSubmit={handleUpdateProfile} className={styles.editForm}>
              <Input
                label="Логин"
                value={editForm.login}
                onChange={(e) => setEditForm(prev => ({ ...prev, login: e.target.value }))}
                placeholder="Введите логин"
                required
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Введите email"
                required
              />
              <Input
                label="Имя"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Введите ваше имя"
                required
              />
              <div className={styles.editActions}>
                <Button 
                  type="submit" 
                  variant="primary" 
                  loading={updating}
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
            <div className={styles.profileInfo}>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Логин:</span>
                  <span className={styles.infoValue}>{user.login}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Email:</span>
                  <span className={styles.infoValue}>{user.email}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Имя:</span>
                  <span className={styles.infoValue}>{user.name}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Дата регистрации:</span>
                  <span className={styles.infoValue}>{formatDate(user.created_at)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Статистика */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Статистика</h2>
          </div>
          
          {stats && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.groupsCount}</div>
                <div className={styles.statLabel}>Групп</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.tasksCount}</div>
                <div className={styles.statLabel}>Всего задач</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.completedTasks}</div>
                <div className={styles.statLabel}>Завершено</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{stats.inProgressTasks}</div>
                <div className={styles.statLabel}>В процессе</div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statNumber} ${stats.overdueTasks > 0 ? styles.statDanger : ''}`}>
                  {stats.overdueTasks}
                </div>
                <div className={styles.statLabel}>Просрочено</div>
              </div>
            </div>
          )}
        </div>

        {/* Опасная зона */}
        <div className={`${styles.section} ${styles.dangerZone}`}>
          <div className={styles.sectionHeader}>
            <h2>Опасная зона</h2>
          </div>
          
          <div className={styles.dangerContent}>
            <div className={styles.dangerInfo}>
              <h3>Удаление аккаунта</h3>
              <p>
                Это действие невозможно отменить. Все ваши данные, включая группы, проекты и задачи, 
                будут безвозвратно удалены. Вы потеряете доступ ко всем вашим ресурсам в системе.
              </p>
            </div>
            <Button 
              variant="danger"
              onClick={() => setShowDeleteModal(true)}
            >
              Удалить аккаунт
            </Button>
          </div>
        </div>
      </div>

      {/* Модальное окно подтверждения удаления */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        title="Удаление аккаунта"
        message={
          <div>
            <p><strong>Внимание! Это действие невозможно отменить.</strong></p>
            <p>Вы уверены, что хотите продолжить?</p>
          </div>
        }
        confirmText={deleting ? "Удаление..." : "Да, удалить аккаунт"}
        cancelText="Отмена"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
};