import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from '../../../../hooks/useNotification';
import { useAutoScroll } from '../../../../hooks/useAutoScroll';
import { 
  getTaskStatusColor,
  getTaskStatusIcon,
  getTaskPriorityColor,
  getTaskPriorityIcon,
  isTaskOverdue,
  getNextStatusOptions
} from '../../../../utils/taskStatus';
import { 
  TASK_STATUS_TRANSLATIONS,
  TASK_PRIORITY_TRANSLATIONS
} from '../../../../utils/constants';
import { formatRelativeTime, truncateText } from '../../../../utils/helpers';
import styles from './KanbanTaskCard.module.css';

export const KanbanTaskCard = ({
  task,
  onStatusChange,
  onDragStart,
}) => {
  const { showError } = useNotification();
  const [isDragging, setIsDragging] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);
  const [hoveredAssignee, setHoveredAssignee] = useState(null);
  const [tagsMenuPosition, setTagsMenuPosition] = useState({ x: 0, y: 0 });
  const { stopAutoScroll } = useAutoScroll();

  const statusMenuRef = useRef(null);
  const tagsMenuRef = useRef(null);
  const statusButtonRef = useRef(null);
  const tagsButtonRef = useRef(null);

  const statusColor = getTaskStatusColor(task.status);
  const statusIcon = getTaskStatusIcon(task.status);
  const priorityColor = getTaskPriorityColor(task.priority);
  const priorityIcon = getTaskPriorityIcon(task.priority);
  const overdue = isTaskOverdue(task.deadline, task.status);
  const nextStatusOptions = getNextStatusOptions(task.status);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target) && 
          statusButtonRef.current && !statusButtonRef.current.contains(event.target)) {
        setShowStatusMenu(false);
      }
      if (tagsMenuRef.current && !tagsMenuRef.current.contains(event.target) && 
          tagsButtonRef.current && !tagsButtonRef.current.contains(event.target)) {
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
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', task.id.toString());
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(task);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    stopAutoScroll();
  };

  const handleStatusClick = (e) => {
    e.stopPropagation();
    setShowStatusMenu(!showStatusMenu);
    setShowTagsMenu(false);
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

  const handlePriorityClick = (e) => {
    e.stopPropagation();
  };

  const handleTagsClick = (e) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    setTagsMenuPosition({
      x: rect.left,
      y: rect.bottom + 5
    });
    setShowTagsMenu(!showTagsMenu);
    setShowStatusMenu(false);
  };

  const handleAssigneeMouseEnter = (assignee, event) => {
    setHoveredAssignee({ 
      ...assignee, 
      position: { 
        x: event.clientX, 
        y: event.clientY 
      } 
    });
  };

  const handleAssigneeMouseLeave = () => {
    setHoveredAssignee(null);
  };

  const assigneesToShow = task.assignees?.slice(0, 3) || [];
  const remainingAssignees = task.assignees?.length - assigneesToShow.length;

  return (
    <>
      <div 
        className={`${styles.card} ${isDragging ? styles.dragging : ''} ${overdue ? styles.overdue : ''} ${task.status === 'done' ? styles.done : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.header}>
          <div 
            className={styles.priorityBadge} 
            style={{ backgroundColor: priorityColor }}
            onClick={handlePriorityClick}
            title={TASK_PRIORITY_TRANSLATIONS[task.priority]}
          >
            {priorityIcon}
          </div>
          <h4 className={styles.title} title={task.title}>
            <Link to={`/tasks/${task.id}`} onClick={(e) => e.stopPropagation()}>
              {truncateText(task.title, 50)}
            </Link>
          </h4>
        </div>

        {task.description && (
          <p className={styles.description}>
            {truncateText(task.description, 100)}
          </p>
        )}

        {task.tags && task.tags.length > 0 && (
          <div className={styles.tags}>
            {task.tags.slice(0, 2).map((tag, index) => (
              <span key={index} className={styles.tag}>
                #{tag}
              </span>
            ))}
            {task.tags.length > 2 && (
              <button 
                className={styles.moreTags}
                onClick={handleTagsClick}
                ref={tagsButtonRef}
                title="Показать все теги"
              >
                +{task.tags.length - 2}
              </button>
            )}
          </div>
        )}

        {assigneesToShow.length > 0 && (
          <div className={styles.assignees}>
            <div className={styles.assigneesList}>
              {assigneesToShow.map(assignee => (
                <div 
                  key={assignee.id} 
                  className={styles.assignee}
                  onMouseEnter={(e) => handleAssigneeMouseEnter(assignee, e)}
                  onMouseLeave={handleAssigneeMouseLeave}
                >
                  <div className={styles.assigneeAvatar}>
                    {assignee.login?.charAt(0).toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
            {remainingAssignees > 0 && (
              <div className={styles.moreAssignees}>
                +{remainingAssignees}
              </div>
            )}
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.dates}>
            {task.deadline && (
              <div className={`${styles.deadline} ${overdue ? styles.overdueText : ''}`}>
                📅 {formatRelativeTime(task.deadline)}
              </div>
            )}
          </div>
          
          <div className={styles.statusSection}>
            <div 
              className={styles.statusBadge}
              style={{ backgroundColor: statusColor }}
              onClick={handleStatusClick}
              ref={statusButtonRef}
            >
              <span className={styles.statusIcon}>{statusIcon}</span>
              <span className={styles.statusText}>
                {TASK_STATUS_TRANSLATIONS[task.status]}
              </span>
            </div>

            {showStatusMenu && (
              <div className={styles.statusMenu} ref={statusMenuRef}>
                {nextStatusOptions.map(option => (
                  <button
                    key={`status-${option.value}`}
                    className={styles.statusOption}
                    style={{ borderLeftColor: option.color }}
                    onClick={() => handleStatusChange(option.value)}
                  >
                    <span className={styles.optionIcon}>
                      {getTaskStatusIcon(option.value)}
                    </span>
                    <span className={styles.optionText}>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showTagsMenu && (
        <div 
          className={styles.tagsMenu} 
          ref={tagsMenuRef}
          style={{
            left: `${tagsMenuPosition.x}px`,
            top: `${tagsMenuPosition.y}px`
          }}
        >
          <div className={styles.tagsMenuHeader}>
            <h4>Все теги задачи</h4>
          </div>
          <div className={styles.tagsList}>
            {task.tags.map((tag, index) => (
              <span key={index} className={styles.tagFull}>
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
            top: `${hoveredAssignee.position.y}px`
          }}
        >
          {hoveredAssignee.login}
          {hoveredAssignee.email && (
            <div className={styles.assigneeEmail}>{hoveredAssignee.email}</div>
          )}
        </div>
      )}
    </>
  );
};