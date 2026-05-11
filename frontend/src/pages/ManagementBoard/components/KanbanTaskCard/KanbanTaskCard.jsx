import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Tags,
  Users,
} from 'lucide-react';

import { useNotification } from '../../../../hooks/useNotification';
import { useAutoScroll } from '../../../../hooks/useAutoScroll';
import {
  getTaskStatusIcon,
  getTaskPriorityIcon,
  isTaskOverdue,
  getNextStatusOptions,
  getTaskStatusTranslation,
  getTaskPriorityTranslation,
} from '../../../../utils/taskStatus';
import {
  formatRelativeTime,
  truncateText,
} from '../../../../utils/helpers';
import styles from './KanbanTaskCard.module.css';

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getUserInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

const getStatusClass = (status) => {
  const statusClasses = {
    backlog: styles.statusBacklog,
    todo: styles.statusTodo,
    in_progress: styles.statusInProgress,
    review: styles.statusReview,
    done: styles.statusDone,
    completed: styles.statusDone,
    cancelled: styles.statusCancelled,
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

export const KanbanTaskCard = ({
  task,
  onStatusChange,
  onDragStart,
  viewMode,
}) => {
  const { showError } = useNotification();
  const { stopAutoScroll } = useAutoScroll();

  const [isDragging, setIsDragging] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);
  const [hoveredAssignee, setHoveredAssignee] = useState(null);
  const [tagsMenuPosition, setTagsMenuPosition] = useState({ x: 0, y: 0 });

  const statusMenuRef = useRef(null);
  const tagsMenuRef = useRef(null);
  const statusButtonRef = useRef(null);
  const tagsButtonRef = useRef(null);

  const overdue = isTaskOverdue(task.deadline, task.status);
  const isDone = task.status === 'done' || task.status === 'completed';
  const isCancelled = task.status === 'cancelled';

  const nextStatusOptions = useMemo(() => {
    return getNextStatusOptions(task.status);
  }, [task.status]);

  const assigneesToShow = useMemo(() => {
    return Array.isArray(task.assignees) ? task.assignees.slice(0, 3) : [];
  }, [task.assignees]);

  const remainingAssignees = Math.max(
    0,
    (task.assignees?.length || 0) - assigneesToShow.length
  );

  const visibleTags = Array.isArray(task.tags) ? task.tags.slice(0, 2) : [];
  const hiddenTagsCount = Math.max(0, (task.tags?.length || 0) - visibleTags.length);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(event.target) &&
        statusButtonRef.current &&
        !statusButtonRef.current.contains(event.target)
      ) {
        setShowStatusMenu(false);
      }

      if (
        tagsMenuRef.current &&
        !tagsMenuRef.current.contains(event.target) &&
        tagsButtonRef.current &&
        !tagsButtonRef.current.contains(event.target)
      ) {
        setShowTagsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowStatusMenu(false);
      setShowTagsMenu(false);
      setHoveredAssignee(null);
    };

    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const handleDragStart = (event) => {
    setIsDragging(true);
    setShowStatusMenu(false);
    setShowTagsMenu(false);
    setHoveredAssignee(null);

    event.dataTransfer.setData('text/plain', String(task.id));
    event.dataTransfer.effectAllowed = 'move';

    onDragStart(task);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    stopAutoScroll();
  };

  const handleStatusClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setShowStatusMenu((value) => !value);
    setShowTagsMenu(false);
    setHoveredAssignee(null);
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await onStatusChange(task.id, newStatus);
      setShowStatusMenu(false);
    } catch (error) {
      console.error('Error updating task status:', error);
      showError('Не удалось изменить статус задачи');
    }
  };

  const handleTagsClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();

    setTagsMenuPosition({
      x: rect.left,
      y: rect.bottom + 8,
    });

    setShowTagsMenu((value) => !value);
    setShowStatusMenu(false);
    setHoveredAssignee(null);
  };

  const handleAssigneeMouseEnter = (assignee, event) => {
    setHoveredAssignee({
      ...assignee,
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  };

  const handleAssigneeMouseLeave = () => {
    setHoveredAssignee(null);
  };

  return (
    <>
      <article
        className={`${styles.card} ${isDragging ? styles.dragging : ''} ${
          overdue ? styles.overdue : ''
        } ${isDone ? styles.done : ''} ${isCancelled ? styles.cancelled : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        data-view-mode={viewMode}
      >
        <div className={styles.topLine}>
          <span
            className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}
            title={`Приоритет: ${getTaskPriorityTranslation(task.priority)}`}
          >
            <span className={styles.badgeIcon}>
              {getTaskPriorityIcon(task.priority, { size: 13 })}
            </span>
            {getTaskPriorityTranslation(task.priority)}
          </span>

          {overdue && (
            <span className={styles.overdueBadge}>
              Просрочена
            </span>
          )}
        </div>

        <h4 className={styles.title} title={task.title}>
          <Link
            to={`/tasks/${task.id}`}
            onClick={(event) => event.stopPropagation()}
            draggable={false}
          >
            {truncateText(task.title, 64)}
          </Link>
        </h4>

        {task.description && (
          <p className={styles.description}>
            {truncateText(task.description, 92)}
          </p>
        )}

        {task.tags && task.tags.length > 0 && (
          <div className={styles.tags}>
            {visibleTags.map((tag, index) => (
              <span key={`${tag}-${index}`} className={styles.tag}>
                #{tag}
              </span>
            ))}

            {hiddenTagsCount > 0 && (
              <button
                type="button"
                className={styles.moreTags}
                onClick={handleTagsClick}
                ref={tagsButtonRef}
                title="Показать все теги"
              >
                <Tags size={12} strokeWidth={2} aria-hidden="true" />
                +{hiddenTagsCount}
              </button>
            )}
          </div>
        )}

        <div className={styles.metaRow}>
          <div className={styles.assignees}>
            {assigneesToShow.length > 0 ? (
              <>
                <div className={styles.assigneesList}>
                  {assigneesToShow.map((assignee) => (
                    <div
                      key={assignee.id}
                      className={styles.assignee}
                      onMouseEnter={(event) => handleAssigneeMouseEnter(assignee, event)}
                      onMouseLeave={handleAssigneeMouseLeave}
                      title={getUserName(assignee)}
                    >
                      {getUserInitial(assignee)}
                    </div>
                  ))}
                </div>

                {remainingAssignees > 0 && (
                  <span className={styles.moreAssignees}>
                    +{remainingAssignees}
                  </span>
                )}
              </>
            ) : (
              <span className={styles.noAssignees}>
                <Users size={13} strokeWidth={2} aria-hidden="true" />
                Нет исполнителей
              </span>
            )}
          </div>

          {task.deadline && (
            <span className={`${styles.deadline} ${overdue ? styles.deadlineOverdue : ''}`}>
              <CalendarDays size={13} strokeWidth={2} aria-hidden="true" />
              {formatRelativeTime(task.deadline)}
            </span>
          )}
        </div>

        <div className={styles.statusRow}>
          <button
            type="button"
            className={`${styles.statusButton} ${getStatusClass(task.status)}`}
            onClick={handleStatusClick}
            ref={statusButtonRef}
          >
            <span className={styles.badgeIcon}>
              {getTaskStatusIcon(task.status, { size: 13 })}
            </span>

            <span className={styles.statusText}>
              {getTaskStatusTranslation(task.status)}
            </span>

            <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>

          {showStatusMenu && (
            <div className={styles.statusMenu} ref={statusMenuRef}>
              {nextStatusOptions.length > 0 ? (
                nextStatusOptions.map((option) => (
                  <button
                    key={`status-${option.value}`}
                    type="button"
                    className={`${styles.statusOption} ${getStatusClass(option.value)}`}
                    onClick={() => handleStatusChange(option.value)}
                  >
                    <span className={styles.badgeIcon}>
                      {getTaskStatusIcon(option.value, { size: 14 })}
                    </span>

                    <span>{option.label}</span>
                  </button>
                ))
              ) : (
                <div className={styles.emptyStatusMenu}>
                  Нет доступных переходов
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      {showTagsMenu && (
        <div
          className={styles.tagsMenu}
          ref={tagsMenuRef}
          style={{
            left: `${tagsMenuPosition.x}px`,
            top: `${tagsMenuPosition.y}px`,
          }}
        >
          <div className={styles.tagsMenuHeader}>
            Все теги
          </div>

          <div className={styles.tagsMenuList}>
            {task.tags.map((tag, index) => (
              <span key={`${tag}-full-${index}`} className={styles.tagFull}>
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {hoveredAssignee && (
        <div
          className={styles.assigneeTooltip}
          style={{
            left: `${hoveredAssignee.position.x}px`,
            top: `${hoveredAssignee.position.y}px`,
          }}
        >
          <span>{getUserName(hoveredAssignee)}</span>

          {hoveredAssignee.email && (
            <small>{hoveredAssignee.email}</small>
          )}
        </div>
      )}
    </>
  );
};