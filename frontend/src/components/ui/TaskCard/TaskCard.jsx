import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import {
  getTaskStatusIcon,
  getTaskPriorityIcon,
  isTaskOverdue,
} from '../../../utils/taskStatus';
import {
  formatDate,
  formatRelativeTime,
  formatRussianCount,
  formatTaskTags,
  getRussianPluralForm,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import {
  USER_ROLE_TRANSLATIONS,
  TASK_STATUS_TRANSLATIONS,
  TASK_PRIORITY_TRANSLATIONS,
  TASK_STATUSES,
} from '../../../utils/constants';
import styles from './TaskCard.module.css';

const ASSIGNEE_FORMS = ['исполнитель', 'исполнителя', 'исполнителей'];

export const TaskCard = ({
  task,
  showDetailsButton = true,
  compact = false,
  showDeleteButton = false,
  userRole,
  onDelete,
  currentUserId,
  showPriority = true,
  showTags = true,
  onStatusClick,
  onPriorityClick,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showSuccess, showError } = useNotification();

  const getStatusClass = (status) => {
    const statusClasses = {
      [TASK_STATUSES.BACKLOG]: styles.statusBacklog,
      [TASK_STATUSES.TODO]: styles.statusTodo,
      [TASK_STATUSES.IN_PROGRESS]: styles.statusInProgress,
      [TASK_STATUSES.REVIEW]: styles.statusReview,
      [TASK_STATUSES.DONE]: styles.statusDone,
      [TASK_STATUSES.CANCELLED]: styles.statusCancelled,

      planned: styles.statusPlanned,
      completed: styles.statusDone,
      on_hold: styles.statusOnHold,
    };

    return statusClasses[status] || styles.statusDefault;
  };

  const getPriorityClass = (priority) => {
    const priorityClasses = {
      low: styles.priorityLow,
      medium: styles.priorityMedium,
      high: styles.priorityHigh,
      urgent: styles.priorityUrgent,
    };

    return priorityClasses[priority] || styles.priorityMedium;
  };

  const getRoleTranslation = (role) => {
    return USER_ROLE_TRANSLATIONS[role] || role;
  };

  const getTaskRoleTranslation = (role) => {
    const taskRoleTranslations = {
      assignee: 'Исполнитель',
      viewer: 'Наблюдатель',
    };

    return taskRoleTranslations[role] || getRoleTranslation(role);
  };

  const getRoleClass = (role) => {
    const roleClasses = {
      admin: styles.roleAdmin,
      super_admin: styles.roleAdmin,
      member: styles.roleMember,
      assignee: styles.roleAssignee,
      viewer: styles.roleViewer,
    };

    return roleClasses[role] || styles.roleMember;
  };

  const getUserRoleInGroup = (userId) => {
    if (!task.group?.users) return null;

    const userInGroup = task.group.users.find(u => u.id === userId);
    return userInGroup?.role || null;
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);

    try {
      await onDelete();
      showSuccess(`Задача "${task.title}" успешно удалена`);
    } catch (error) {
      console.error('Error deleting task:', error);
      showError('Не удалось удалить задачу');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
  };

  const handleStatusClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (onStatusClick) {
      onStatusClick(task);
    }
  };

  const handlePriorityClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (onPriorityClick) {
      onPriorityClick(task);
    }
  };

  const handleBadgeKeyDown = (e, callback) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback(e);
    }
  };

  const getDurationDays = () => {
    if (!task.start_date || !task.deadline) return null;

    const start = new Date(task.start_date);
    const deadline = new Date(task.deadline);

    if (Number.isNaN(start.getTime()) || Number.isNaN(deadline.getTime())) {
      return null;
    }

    return Math.max(
      0,
      Math.ceil((deadline - start) / (1000 * 60 * 60 * 24))
    );
  };

  const getAssigneeName = (assignee) => {
    return assignee.name || assignee.login || assignee.email || 'Пользователь';
  };

  const overdue = isTaskOverdue(task.deadline, task.status);
  const formattedTags = task.tags ? formatTaskTags(task.tags) : [];
  const assigneesCount = task.assignees?.length || 0;
  const durationDays = getDurationDays();

  const projectId = task.project?.id || task.project_id;
  const groupId = task.group?.id || task.group_id;

  const isDone = task.status === TASK_STATUSES.DONE || task.status === 'completed';
  const TaskStateIcon = isDone ? CheckCircle2 : overdue ? AlertTriangle : ClipboardList;

  const statusIcon = getTaskStatusIcon(task.status);
  const priorityIcon = task.priority ? getTaskPriorityIcon(task.priority) : null;

  const statusLabel = TASK_STATUS_TRANSLATIONS[task.status] || task.status;
  const priorityLabel = TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority;

  const getCardStateClass = () => {
    if (isDone) {
      return styles.cardDone;
    }

    if (overdue) {
      return styles.cardOverdue;
    }

    return '';
  };

  const renderStatusBadge = () => (
    <span
      className={`${styles.status} ${getStatusClass(task.status)} ${onStatusClick ? styles.clickable : ''}`}
      onClick={handleStatusClick}
      onKeyDown={(e) => handleBadgeKeyDown(e, handleStatusClick)}
      title={onStatusClick ? 'Изменить статус' : statusLabel}
      role={onStatusClick ? 'button' : undefined}
      tabIndex={onStatusClick ? 0 : undefined}
    >
      <span className={styles.badgeIcon}>{statusIcon}</span>
      {statusLabel}
    </span>
  );

  const renderPriorityBadge = () => {
    if (!showPriority || !task.priority) return null;

    return (
      <span
        className={`${styles.priority} ${getPriorityClass(task.priority)} ${onPriorityClick ? styles.clickable : ''}`}
        onClick={handlePriorityClick}
        onKeyDown={(e) => handleBadgeKeyDown(e, handlePriorityClick)}
        title={onPriorityClick ? 'Изменить приоритет' : priorityLabel}
        role={onPriorityClick ? 'button' : undefined}
        tabIndex={onPriorityClick ? 0 : undefined}
      >
        <span className={styles.badgeIcon}>{priorityIcon}</span>
        {priorityLabel}
      </span>
    );
  };

  const renderTags = (limit = 4) => {
    if (!showTags || formattedTags.length === 0) return null;

    const visibleTags = formattedTags.slice(0, limit);
    const hiddenCount = formattedTags.length - visibleTags.length;

    return (
      <div className={styles.tags}>
        {visibleTags.map((tag, index) => (
          <span key={`${tag.value}-${index}`} className={styles.tag}>
            #{tag.label}
          </span>
        ))}

        {hiddenCount > 0 && (
          <span className={styles.moreTags}>
            +{hiddenCount}
          </span>
        )}
      </div>
    );
  };

  if (compact) {
    return (
      <>
        <article className={`${styles.cardCompact} ${getCardStateClass()}`}>
          <div className={styles.compactHeader}>
            <div className={styles.compactTitleSection}>
              <div className={styles.taskIcon}>
                <TaskStateIcon size={18} strokeWidth={2} aria-hidden="true" />
              </div>

              <div className={styles.compactTitleContent}>
                <h4 className={styles.compactTitle}>{task.title}</h4>

                {userRole && (
                  <span className={`${styles.userRole} ${getRoleClass(userRole)}`}>
                    {getTaskRoleTranslation(userRole)}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.compactBadges}>
              {renderStatusBadge()}
              {renderPriorityBadge()}
            </div>
          </div>

          {task.description && (
            <p className={styles.compactDescription}>{task.description}</p>
          )}

          {renderTags(3)}

          <div className={styles.compactMeta}>
            {projectId ? (
              <Link to={`/projects/${projectId}`} className={styles.compactMetaLink}>
                <FolderKanban size={14} strokeWidth={2} aria-hidden="true" />
                {task.project?.title || 'Проект не указан'}
              </Link>
            ) : (
              <span>
                <FolderKanban size={14} strokeWidth={2} aria-hidden="true" />
                Проект не указан
              </span>
            )}

            {task.deadline && (
              <span className={overdue ? styles.overdueMeta : ''}>
                <CalendarClock size={14} strokeWidth={2} aria-hidden="true" />
                {formatRelativeTime(task.deadline)}
              </span>
            )}

            <span>
              <Users size={14} strokeWidth={2} aria-hidden="true" />
              {formatRussianCount(assigneesCount, ASSIGNEE_FORMS)}
            </span>
          </div>

          <div className={styles.compactFooter}>
            {showDetailsButton && (
              <Link
                to={`/tasks/${task.id}`}
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
                aria-label="Удалить задачу"
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </article>

        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Удаление задачи"
          message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
          confirmText={isDeleting ? 'Удаление...' : 'Удалить задачу'}
          cancelText="Отмена"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  }

  return (
    <>
      <article className={`${styles.card} ${getCardStateClass()}`}>
        <div className={styles.topLine}>
          <div className={styles.taskIcon}>
            <TaskStateIcon size={22} strokeWidth={2} aria-hidden="true" />
          </div>

          <div className={styles.titleSection}>
            <h3 className={styles.title}>{task.title}</h3>

            <div className={styles.badges}>
              {renderStatusBadge()}
              {renderPriorityBadge()}

              {userRole && (
                <span className={`${styles.userRole} ${getRoleClass(userRole)}`}>
                  {getTaskRoleTranslation(userRole)}
                </span>
              )}

              {overdue && (
                <span className={styles.overdueBadge}>
                  Просрочено
                </span>
              )}
            </div>
          </div>
        </div>

        {task.description ? (
          <p className={styles.description}>{task.description}</p>
        ) : (
          <p className={styles.descriptionMuted}>Описание задачи не указано</p>
        )}

        {renderTags(5)}

        <div className={styles.infoGrid}>
          {projectId ? (
            <Link
              to={`/projects/${projectId}`}
              className={`${styles.infoItem} ${styles.infoLink}`}
            >
              <span className={styles.infoIcon}>
                <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.infoContent}>
                <span className={styles.infoLabel}>Проект</span>
                <span className={styles.infoValue}>{task.project?.title || 'Не указан'}</span>
              </span>

              <ExternalLink
                size={14}
                strokeWidth={2}
                className={styles.infoLinkIcon}
                aria-hidden="true"
              />
            </Link>
          ) : (
            <div className={styles.infoItem}>
              <span className={styles.infoIcon}>
                <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.infoContent}>
                <span className={styles.infoLabel}>Проект</span>
                <span className={styles.infoValue}>Не указан</span>
              </span>
            </div>
          )}

          {groupId ? (
            <Link
              to={`/groups/${groupId}`}
              className={`${styles.infoItem} ${styles.infoLink}`}
            >
              <span className={styles.infoIcon}>
                <Users size={16} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.infoContent}>
                <span className={styles.infoLabel}>Группа</span>
                <span className={styles.infoValue}>{task.group?.name || 'Не указана'}</span>
              </span>

              <ExternalLink
                size={14}
                strokeWidth={2}
                className={styles.infoLinkIcon}
                aria-hidden="true"
              />
            </Link>
          ) : (
            <div className={styles.infoItem}>
              <span className={styles.infoIcon}>
                <Users size={16} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.infoContent}>
                <span className={styles.infoLabel}>Группа</span>
                <span className={styles.infoValue}>Не указана</span>
              </span>
            </div>
          )}

          <div className={styles.infoItem}>
            <span className={styles.infoIcon}>
              <CalendarClock size={16} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.infoContent}>
              <span className={styles.infoLabel}>Начало</span>
              <span className={styles.infoValue}>{formatDate(task.start_date)}</span>
            </span>
          </div>

          <div className={`${styles.infoItem} ${overdue ? styles.overdueInfo : ''}`}>
            <span className={styles.infoIcon}>
              <CalendarClock size={16} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.infoContent}>
              <span className={styles.infoLabel}>Дедлайн</span>
              <span className={styles.infoValue}>
                {formatDate(task.deadline)}
              </span>
            </span>
          </div>
        </div>

        {task.assignees && task.assignees.length > 0 && (
          <div className={styles.assigneesSection}>
            <div className={styles.sectionTitle}>
              <Users size={16} strokeWidth={2} aria-hidden="true" />
              Исполнители
            </div>

            <div className={styles.assigneesList}>
              {task.assignees.slice(0, 4).map((assignee) => {
                const assigneeRole = getUserRoleInGroup(assignee.id);
                const isCurrentUser = assignee.id === currentUserId;

                return (
                  <div
                    key={assignee.id}
                    className={`${styles.assigneeItem} ${isCurrentUser ? styles.currentUser : ''}`}
                  >
                    <div className={styles.assigneeAvatar}>
                      {getAssigneeName(assignee).charAt(0).toUpperCase()}
                    </div>

                    <div className={styles.assigneeInfo}>
                      <span className={styles.assigneeName}>
                        {getAssigneeName(assignee)}
                        {isCurrentUser && <span className={styles.youBadge}>Вы</span>}
                      </span>

                      {assignee.email && (
                        <span className={styles.assigneeEmail}>{assignee.email}</span>
                      )}
                    </div>

                    {assigneeRole && (
                      <span className={`${styles.assigneeRole} ${getRoleClass(assigneeRole)}`}>
                        {getTaskRoleTranslation(assigneeRole)}
                      </span>
                    )}
                  </div>
                );
              })}

              {task.assignees.length > 4 && (
                <div className={styles.moreAssignees}>
                  +{task.assignees.length - 4}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{assigneesCount}</span>
            <span className={styles.statLabel}>
              {getRussianPluralForm(assigneesCount, ASSIGNEE_FORMS)}
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statNumber}>
              {durationDays === null ? '—' : durationDays}
            </span>
            <span className={styles.statLabel}>
              {durationDays === null
                ? 'дней'
                : getRussianPluralForm(durationDays, RUSSIAN_PLURAL_FORMS.DAY)}
            </span>
          </div>
        </div>

        <div className={styles.footer}>
          {showDetailsButton && (
            <Link
              to={`/tasks/${task.id}`}
              className={styles.viewButton}
            >
              Открыть задачу
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
        title="Удаление задачи"
        message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
        confirmText={isDeleting ? 'Удаление...' : 'Удалить задачу'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};