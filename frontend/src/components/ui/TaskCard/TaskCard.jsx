import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { getTaskStatusTranslation } from '../../../utils/taskStatus';
import styles from './TaskCard.module.css';

export const TaskCard = ({
  task,
  showDetailsButton = true,
  compact = false,
  showDeleteButton = false,
  userRole, // Для отображения роли пользователя
  onDelete,
  currentUserId // Добавляем ID текущего пользователя для выделения
}) => {
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
      'assignee': 'Исполнитель',
      'member': 'Участник'
    };
    return roleTranslations[role] || role;
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  // Проверяем, просрочена ли задача
  const isOverdue = () => {
    const deadline = new Date(task.deadline);
    const today = new Date();
    return deadline < today && task.status !== 'completed';
  };

  // Функция для получения роли пользователя в группе задачи
  const getUserRoleInGroup = (userId) => {
    if (!task.group?.users) return null;
    const userInGroup = task.group.users.find(u => u.id === userId);
    return userInGroup?.role || null;
  };

  if (compact) {
    return (
      <div className={`${styles.cardCompact} ${isOverdue() ? styles.overdue : ''}`}>
        <div className={styles.compactHeader}>
          <div className={styles.compactTitleSection}>
            <h4 className={styles.compactTitle}>{task.title}</h4>
            {userRole && (
              <span className={`${styles.userRole} ${styles[userRole]}`}>
                {getRoleTranslation(userRole)}
              </span>
            )}
          </div>
          <span className={`${styles.status} ${getStatusClass(task.status)}`}>
            {getTaskStatusTranslation(task.status)}
          </span>
        </div>
        {task.description && (
          <p className={styles.compactDescription}>{task.description}</p>
        )}
        <div className={styles.compactInfo}>
          <div className={styles.compactProject}>
            <span className={styles.infoLabel}>Проект:</span>
            <span className={styles.infoValue}>{task.project?.title}</span>
          </div>
          <div className={styles.compactDeadline}>
            <span className={styles.infoLabel}>Срок:</span>
            <span className={`${styles.infoValue} ${isOverdue() ? styles.overdueText : ''}`}>
              {formatDate(task.deadline)}
            </span>
          </div>
        </div>
        
        {/* Исполнители с ролями */}
        {task.assignees && task.assignees.length > 0 && (
          <div className={styles.assigneesSection}>
            <span className={styles.assigneesLabel}>Исполнители:</span>
            <div className={styles.assigneesList}>
              {task.assignees.map(assignee => {
                const assigneeRole = getUserRoleInGroup(assignee.id);
                const isCurrentUser = assignee.id === currentUserId;
                return (
                  <div key={assignee.id} className={`${styles.assignee} ${isCurrentUser ? styles.currentUser : ''}`}>
                    <span className={styles.assigneeName}>
                      {assignee.login}
                      {isCurrentUser && <span className={styles.youBadge}> (Вы)</span>}
                    </span>
                    {assigneeRole && (
                      <span className={`${styles.assigneeRole} ${styles[assigneeRole]}`}>
                        {getRoleTranslation(assigneeRole)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {showDetailsButton && (
          <Link 
            to={`/tasks/${task.id}`} 
            className={styles.viewButton}
          >
            Подробнее
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${isOverdue() ? styles.overdue : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>{task.title}</h3>
          {userRole && (
            <span className={`${styles.userRole} ${styles[userRole]}`}>
              {getRoleTranslation(userRole)}
            </span>
          )}
        </div>
        <span className={`${styles.status} ${getStatusClass(task.status)}`}>
          {getTaskStatusTranslation(task.status)}
        </span>
      </div>
      
      {task.description && (
        <p className={styles.description}>{task.description}</p>
      )}
      
      <div className={styles.projectInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Проект:</span>
          <span className={styles.infoValue}>{task.project?.title}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Группа:</span>
          <span className={styles.infoValue}>{task.group?.name}</span>
        </div>
      </div>
      
      <div className={styles.dates}>
        <div className={styles.dateItem}>
          <span className={styles.dateLabel}>Начало:</span>
          <span className={styles.dateValue}>{formatDate(task.start_date)}</span>
        </div>
        <div className={styles.dateItem}>
          <span className={styles.dateLabel}>Срок:</span>
          <span className={`${styles.dateValue} ${isOverdue() ? styles.overdueText : ''}`}>
            {formatDate(task.deadline)}
            {isOverdue() && <span className={styles.overdueBadge}>Просрочено</span>}
          </span>
        </div>
      </div>
      
      {/* Исполнители с ролями */}
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
                      {assignee.login}
                      {isCurrentUser && <span className={styles.youBadge}> (Вы)</span>}
                    </span>
                    <span className={styles.assigneeEmail}>{assignee.email}</span>
                  </div>
                  {assigneeRole && (
                    <span className={`${styles.assigneeRole} ${styles[assigneeRole]}`}>
                      {getRoleTranslation(assigneeRole)}
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
            {Math.ceil((new Date(task.deadline) - new Date(task.start_date)) / (1000 * 60 * 60 * 24))}
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
            >
              Удалить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};