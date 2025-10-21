import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import { getProjectStatusTranslation } from '../../../utils/projectStatus';
import styles from './ProjectCard.module.css';

export const ProjectCard = ({
  project,
  showDetailsButton = true,
  compact = false,
  showDeleteButton = false,
  userRole,
  onDelete
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showSuccess, showError } = useNotification();

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusClass = (status) => {
    const statusClasses = {
      'in_progress': styles.statusInProgress,
      'completed': styles.statusCompleted,
      'planned': styles.statusPlanned,
      'on_hold': styles.statusOnHold,
      'cancelled': styles.statusCancelled
    };
    return statusClasses[status] || styles.statusDefault;
  };

  const getRoleTranslation = (role) => {
    const roleTranslations = {
      'admin': 'Администратор',
      'member': 'Участник'
    };
    return roleTranslations[role] || role;
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
      showSuccess(`Проект "${project.title}" успешно удален`);
    } catch (error) {
      console.error('Error deleting project:', error);
      showError('Не удалось удалить проект');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
  };

  const getTasksCount = () => {
    if (Array.isArray(project.tasks)) {
      return project.tasks.length;
    }
    if (project.tasks_count !== undefined) {
      return project.tasks_count;
    }
    return 0;
  };

  const getGroupsCount = () => {
    if (Array.isArray(project.groups)) {
      return project.groups.length;
    }
    if (project.groups_count !== undefined) {
      return project.groups_count;
    }
    return 0;
  };

  if (compact) {
    return (
      <>
        <div className={styles.cardCompact}>
          <div className={styles.compactHeader}>
            <div className={styles.compactTitleSection}>
              <h4 className={styles.compactTitle}>{project.title}</h4>
              {userRole && (
                <span className={`${styles.userRole} ${styles[userRole]}`}>
                  {getRoleTranslation(userRole)}
                </span>
              )}
            </div>
            <span className={`${styles.status} ${getStatusClass(project.status)}`}>
              {getProjectStatusTranslation(project.status)}
            </span>
          </div>
          {project.description && (
            <p className={styles.compactDescription}>{project.description}</p>
          )}
          <div className={styles.compactDates}>
            <span>до {formatDate(project.end_date)}</span>
          </div>
          {showDetailsButton && (
            <Link 
              to={`/projects/${project.id}`} 
              className={styles.viewButton}
            >
              Подробнее
            </Link>
          )}
        </div>

        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Удаление проекта"
          message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
          confirmText={isDeleting ? "Удаление..." : "Удалить проект"}
          cancelText="Отмена"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h3 className={styles.title}>{project.title}</h3>
            {userRole && (
              <span className={`${styles.userRole} ${styles[userRole]}`}>
                {getRoleTranslation(userRole)}
              </span>
            )}
          </div>
          <span className={`${styles.status} ${getStatusClass(project.status)}`}>
            {getProjectStatusTranslation(project.status)}
          </span>
        </div>
        
        {project.description && (
          <p className={styles.description}>{project.description}</p>
        )}
        
        <div className={styles.dates}>
          <div className={styles.dateItem}>
            <span className={styles.dateLabel}>Начало:</span>
            <span className={styles.dateValue}>{formatDate(project.start_date)}</span>
          </div>
          <div className={styles.dateItem}>
            <span className={styles.dateLabel}>Окончание:</span>
            <span className={styles.dateValue}>{formatDate(project.end_date)}</span>
          </div>
        </div>
        
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{getTasksCount()}</span>
            <span className={styles.statLabel}>задач</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{getGroupsCount()}</span>
            <span className={styles.statLabel}>групп</span>
          </div>
        </div>
        
        <div className={styles.footer}>
          <div className={styles.footerActions}>
            {showDetailsButton && (
              <Link 
                to={`/projects/${project.id}`} 
                className={styles.viewButton}
              >
                Подробнее
              </Link>
            )}
            {showDeleteButton && (
              <Button
                variant="secondary"
                size="small"
                onClick={handleDeleteClick}
                className={styles.deleteButton}
                disabled={isDeleting}
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Удаление проекта"
        message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
        confirmText={isDeleting ? "Удаление..." : "Удалить проект"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};