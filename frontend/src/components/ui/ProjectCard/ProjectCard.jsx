import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckSquare,
  ExternalLink,
  FolderKanban,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import { getProjectStatusTranslation } from '../../../utils/projectStatus';
import {
  formatRussianCount,
  getRussianPluralForm,
  RUSSIAN_PLURAL_FORMS
} from '../../../utils/helpers';
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
    if (!dateString) return 'Не указано';

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return 'Не указано';
    }

    return date.toLocaleDateString('ru-RU');
  };

  const getStatusClass = (status) => {
    const statusClasses = {
      in_progress: styles.statusInProgress,
      completed: styles.statusCompleted,
      planned: styles.statusPlanned,
      on_hold: styles.statusOnHold,
      cancelled: styles.statusCancelled,
    };

    return statusClasses[status] || styles.statusDefault;
  };

  const getRoleTranslation = (role) => {
    const roleTranslations = {
      admin: 'Администратор',
      member: 'Участник',
      super_admin: 'Супер-администратор',
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

  const getDeadlineLabel = () => {
    if (!project.end_date) return 'Срок не указан';

    const deadline = new Date(project.end_date);

    if (Number.isNaN(deadline.getTime())) {
      return 'Срок не указан';
    }

    const now = new Date();
    const diffMs = deadline.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);

      return `Просрочен на ${formatRussianCount(overdueDays, RUSSIAN_PLURAL_FORMS.DAY)}`;
    }
    if (diffDays === 0) return 'Срок сегодня';
    if (diffDays === 1) return 'Срок завтра';

    return `Осталось ${formatRussianCount(diffDays, RUSSIAN_PLURAL_FORMS.DAY)}`;
  };

  const statusLabel = getProjectStatusTranslation(project.status);
  const tasksCount = getTasksCount();
  const groupsCount = getGroupsCount();

  if (compact) {
    return (
      <>
        <article className={styles.cardCompact}>
          <div className={styles.compactMain}>
            <div className={styles.compactIcon}>
              <FolderKanban size={18} strokeWidth={2} aria-hidden="true" />
            </div>

            <div className={styles.compactContent}>
              <div className={styles.compactHeader}>
                <h4 className={styles.compactTitle}>{project.title}</h4>

                <span className={`${styles.status} ${getStatusClass(project.status)}`}>
                  {statusLabel}
                </span>
              </div>

              {project.description && (
                <p className={styles.compactDescription}>{project.description}</p>
              )}

              <div className={styles.compactMeta}>
                <span>
                  <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
                  до {formatDate(project.end_date)}
                </span>

                <span>
                  <CheckSquare size={14} strokeWidth={2} aria-hidden="true" />
                  {formatRussianCount(tasksCount, ['задача', 'задачи', 'задач'])}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.compactFooter}>
            {userRole && (
              <span className={`${styles.userRole} ${styles[userRole] || ''}`}>
                {getRoleTranslation(userRole)}
              </span>
            )}

            <div className={styles.compactActions}>
              {showDetailsButton && (
                <Link
                  to={`/projects/${project.id}`}
                  className={styles.viewButton}
                >
                  Открыть
                  <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                </Link>
              )}

              {showDeleteButton && (
                <button
                  type="button"
                  className={styles.iconDeleteButton}
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  aria-label="Удалить проект"
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </article>

        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Удаление проекта"
          message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
          confirmText={isDeleting ? 'Удаление...' : 'Удалить проект'}
          cancelText="Отмена"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  }

  return (
    <>
      <article className={styles.card}>
        <div className={styles.topLine}>
          <div className={styles.projectIcon}>
            <FolderKanban size={22} strokeWidth={2} aria-hidden="true" />
          </div>

          <div className={styles.titleSection}>
            <h3 className={styles.title}>{project.title}</h3>

            <div className={styles.badges}>
              <span className={`${styles.status} ${getStatusClass(project.status)}`}>
                {statusLabel}
              </span>

              {userRole && (
                <span className={`${styles.userRole} ${styles[userRole] || ''}`}>
                  {getRoleTranslation(userRole)}
                </span>
              )}
            </div>
          </div>
        </div>

        {project.description ? (
          <p className={styles.description}>{project.description}</p>
        ) : (
          <p className={styles.descriptionMuted}>Описание проекта не указано</p>
        )}

        <div className={styles.metaPanel}>
          <div className={styles.metaItem}>
            <span className={styles.metaIcon}>
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.metaContent}>
              <span className={styles.metaLabel}>Начало</span>
              <span className={styles.metaValue}>{formatDate(project.start_date)}</span>
            </span>
          </div>

          <div className={styles.metaItem}>
            <span className={styles.metaIcon}>
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.metaContent}>
              <span className={styles.metaLabel}>Окончание</span>
              <span className={styles.metaValue}>{formatDate(project.end_date)}</span>
            </span>
          </div>
        </div>

        <div className={styles.deadlineStrip}>
          <span className={styles.deadlineLabel}>{getDeadlineLabel()}</span>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statIcon}>
              <CheckSquare size={18} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.statText}>
              <span className={styles.statNumber}>{tasksCount}</span>
              <span className={styles.statLabel}>
                {getRussianPluralForm(tasksCount, RUSSIAN_PLURAL_FORMS.TASK)}
              </span>
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statIcon}>
              <Users size={18} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.statText}>
              <span className={styles.statNumber}>{groupsCount}</span>
              <span className={styles.statLabel}>
                {getRussianPluralForm(groupsCount, RUSSIAN_PLURAL_FORMS.GROUP)}
              </span>
            </span>
          </div>
        </div>

        <div className={styles.footer}>
          {showDetailsButton && (
            <Link
              to={`/projects/${project.id}`}
              className={styles.viewButton}
            >
              Открыть проект
              <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
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
              <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </Button>
          )}
        </div>
      </article>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Удаление проекта"
        message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
        confirmText={isDeleting ? 'Удаление...' : 'Удалить проект'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};