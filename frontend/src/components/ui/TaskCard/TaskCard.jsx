import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getTaskStatusColor, 
  getTaskStatusIcon,
  getTaskPriorityColor,
  getTaskPriorityIcon,
  isTaskOverdue
} from '../../../utils/taskStatus';
import { formatTaskTags } from '../../../utils/helpers';
import { 
  USER_ROLE_TRANSLATIONS,
  TASK_STATUS_TRANSLATIONS,
  TASK_PRIORITY_TRANSLATIONS,
  TASK_STATUSES,
} from '../../../utils/constants';
import styles from './TaskCard.module.css';

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
  onPriorityClick
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showSuccess, showError } = useNotification();

  const formatDate = (dateString) => {
    if (!dateString) return 'Не указано';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusClass = (status) => {
    const statusClasses = {
      [TASK_STATUSES.BACKLOG]: styles.statusBacklog,
      [TASK_STATUSES.TODO]: styles.statusTodo,
      [TASK_STATUSES.IN_PROGRESS]: styles.statusInProgress,
      [TASK_STATUSES.REVIEW]: styles.statusReview,
      [TASK_STATUSES.DONE]: styles.statusDone,
      [TASK_STATUSES.CANCELLED]: styles.statusCancelled
    };
    return statusClasses[status] || styles.statusDefault;
  };

  const getRoleTranslation = (role) => {
    return USER_ROLE_TRANSLATIONS[role] || role;
  };

  const getTaskRoleTranslation = (role) => {
    const taskRoleTranslations = {
      'assignee': 'Исполнитель',
      'viewer': 'Наблюдатель'
    };
    return taskRoleTranslations[role] || getRoleTranslation(role);
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

  const overdue = isTaskOverdue(task.deadline, task.status);

  const getUserRoleInGroup = (userId) => {
    if (!task.group?.users) return null;
    const userInGroup = task.group.users.find(u => u.id === userId);
    return userInGroup?.role || null;
  };

  const statusColor = getTaskStatusColor(task.status);
  const statusIcon = getTaskStatusIcon(task.status);
  
  const priorityColor = getTaskPriorityColor(task.priority);
  const priorityIcon = getTaskPriorityIcon(task.priority);

  const formattedTags = task.tags ? formatTaskTags(task.tags) : [];

  const getCardBackgroundClass = () => {
    if (task.status === TASK_STATUSES.DONE) {
      return styles.cardDone;
    }
    if (overdue) {
      return styles.cardOverdue;
    }
    return '';
  };

  if (compact) {
    return (
      <>
        <div className={`${styles.cardCompact} ${getCardBackgroundClass()}`}>
          <div className={styles.compactHeader}>
            <div className={styles.compactTitleSection}>
              <h4 className={styles.compactTitle}>{task.title}</h4>
              {userRole && (
                <span className={`${styles.userRole} ${styles[userRole]}`}>
                  {getTaskRoleTranslation(userRole)}
                </span>
              )}
            </div>
            <div className={styles.compactBadges}>
              <span 
                className={`${styles.status} ${getStatusClass(task.status)} ${onStatusClick ? styles.clickable : ''}`}
                style={{ backgroundColor: statusColor }}
                onClick={handleStatusClick}
                title={TASK_STATUS_TRANSLATIONS[task.status] || task.status}
              >
                {statusIcon} {TASK_STATUS_TRANSLATIONS[task.status] || task.status}
              </span>
              {showPriority && task.priority && (
                <span 
                  className={`${styles.priority} ${styles[task.priority]} ${onPriorityClick ? styles.clickable : ''}`}
                  style={{ backgroundColor: priorityColor }}
                  onClick={handlePriorityClick}
                  title={TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}
                >
                  {priorityIcon} {TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}
                </span>
              )}
            </div>
          </div>
        
          {showTags && formattedTags.length > 0 && (
            <div className={styles.tags}>
              {formattedTags.slice(0, 3).map((tag, index) => (
                <span key={index} className={styles.tag}>
                  #{tag.label}
                </span>
              ))}
              {formattedTags.length > 3 && (
                <span className={styles.moreTags}>+{formattedTags.length - 3}</span>
              )}
            </div>
          )}
          
          <div className={styles.compactInfo}>
            <div className={styles.compactProject}>
              <span className={styles.infoLabel}>Проект:</span>
              <span className={styles.infoValue}>{task.project?.title || 'Не указан'}</span>
            </div>
            <div className={styles.compactDeadline}>
              <span className={styles.infoLabel}>Срок:</span>
              <span className={`${styles.infoValue} ${overdue ? styles.overdueText : ''}`}>
                {formatDate(task.deadline)}
                {overdue && <span className={styles.overdueIndicator}> ⚠️</span>}
              </span>
            </div>
          </div>
          
          {task.assignees && task.assignees.length > 0 && (
            <div className={styles.assigneesSection}>
              <span className={styles.assigneesLabel}>Исполнители:</span>
              <div className={styles.assigneesList}>
                {task.assignees.slice(0, 2).map(assignee => {
                  const assigneeRole = getUserRoleInGroup(assignee.id);
                  const isCurrentUser = assignee.id === currentUserId;
                  return (
                    <div key={assignee.id} className={`${styles.assignee} ${isCurrentUser ? styles.currentUser : ''}`}>
                      <span className={styles.assigneeName}>
                        {assignee.login || assignee.email}
                        {isCurrentUser && <span className={styles.youBadge}> (Вы)</span>}
                      </span>
                      {assigneeRole && (
                        <span className={`${styles.assigneeRole} ${styles[assigneeRole]}`}>
                          {getTaskRoleTranslation(assigneeRole)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {task.assignees.length > 2 && (
                  <div className={styles.moreAssignees}>
                    +{task.assignees.length - 2} еще
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className={styles.compactFooter}>
            {showDetailsButton && (
              <Link 
                to={`/tasks/${task.id}`} 
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

        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Удаление задачи"
          message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
          confirmText={isDeleting ? "Удаление..." : "Удалить задачу"}
          cancelText="Отмена"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  }

  return (
    <>
      <div className={`${styles.card} ${getCardBackgroundClass()}`}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h3 className={styles.title}>{task.title}</h3>
            {userRole && (
              <span className={`${styles.userRole} ${styles[userRole]}`}>
                {getTaskRoleTranslation(userRole)}
              </span>
            )}
          </div>
          <div className={styles.headerBadges}>
            <span 
              className={`${styles.status} ${getStatusClass(task.status)} ${onStatusClick ? styles.clickable : ''}`}
              style={{ backgroundColor: statusColor }}
              onClick={handleStatusClick}
            >
              {statusIcon} {TASK_STATUS_TRANSLATIONS[task.status] || task.status}
              {overdue && <span className={styles.overdueBadge}>Просрочено</span>}
            </span>
            {showPriority && task.priority && (
              <span 
                className={`${styles.priority} ${styles[task.priority]} ${onPriorityClick ? styles.clickable : ''}`}
                style={{ backgroundColor: priorityColor }}
                onClick={handlePriorityClick}
                title={TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}
              >
                {priorityIcon} {TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}
              </span>
            )}
          </div>
        </div>
        
        {showTags && formattedTags.length > 0 && (
          <div className={styles.tags}>
            {formattedTags.map((tag, index) => (
              <span key={index} className={styles.tag}>
                #{tag.label}
              </span>
            ))}
          </div>
        )}
        
        <div className={styles.projectInfo}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Проект:</span>
            <span className={styles.infoValue}>
              {task.project ? (
                <Link to={`/projects/${task.project.id}`} className={styles.projectLink}>
                  {task.project.title}
                </Link>
              ) : (
                'Не указан'
              )}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Группа:</span>
            <span className={styles.infoValue}>
              {task.group ? (
                <Link to={`/groups/${task.group.id}`} className={styles.groupLink}>
                  {task.group.name}
                </Link>
              ) : (
                'Не указана'
              )}
            </span>
          </div>
        </div>
        
        <div className={styles.dates}>
          <div className={styles.dateItem}>
            <span className={styles.dateLabel}>Начало:</span>
            <span className={styles.dateValue}>
              {formatDate(task.start_date)}
            </span>
          </div>
          <div className={styles.dateItem}>
            <span className={styles.dateLabel}>Срок:</span>
            <span className={`${styles.dateValue} ${overdue ? styles.overdueText : ''}`}>
              {formatDate(task.deadline)}
              {overdue && <span className={styles.overdueIndicator}> ⚠️ Просрочено</span>}
            </span>
          </div>
        </div>
        
        {task.assignees && task.assignees.length > 0 && (
          <div className={styles.assigneesSection}>
            <h4 className={styles.assigneesTitle}>Исполнители:</h4>
            <div className={styles.assigneesList}>
              {task.assignees.map(assignee => {
                const assigneeRole = getUserRoleInGroup(assignee.id);
                const isCurrentUser = assignee.id === currentUserId;
                return (
                  <div key={assignee.id} className={`${styles.assignee} ${isCurrentUser ? styles.currentUser : ''}`}>
                    <div className={styles.assigneeInfo}>
                      <span className={styles.assigneeName}>
                        {assignee.login || assignee.email}
                        {isCurrentUser && <span className={styles.youBadge}> (Вы)</span>}
                      </span>
                      <span className={styles.assigneeEmail}>{assignee.email}</span>
                    </div>
                    {assigneeRole && (
                      <span className={`${styles.assigneeRole} ${styles[assigneeRole]}`}>
                        {getTaskRoleTranslation(assigneeRole)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{task.assignees?.length || 0}</span>
            <span className={styles.statLabel}>исполнителей</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>
              {task.start_date && task.deadline ? 
                Math.ceil((new Date(task.deadline) - new Date(task.start_date)) / (1000 * 60 * 60 * 24)) 
                : '—'
              }
            </span>
            <span className={styles.statLabel}>дней</span>
          </div>
        </div>
        
        <div className={styles.footer}>
          <div className={styles.footerActions}>
            {showDetailsButton && (
              <Link 
                to={`/tasks/${task.id}`} 
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
        title="Удаление задачи"
        message={`Вы уверены, что хотите удалить задачу "${task.title}"? Это действие нельзя отменить.`}
        confirmText={isDeleting ? "Удаление..." : "Удалить задачу"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};