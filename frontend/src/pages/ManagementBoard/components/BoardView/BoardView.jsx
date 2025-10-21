import React, { useState, useCallback } from 'react';
import { TaskColumn } from '../TaskColumn/TaskColumn';
import { KANBAN_CONFIG, TASK_STATUSES } from '../../../../utils/constants';
import { sortTasksByPosition } from '../../../../utils/taskStatus';
import { useAutoScroll } from '../../../../hooks/useAutoScroll';
import styles from './BoardView.module.css';

export const BoardView = ({
  tasks,
  onTaskStatusChange,
  onBulkUpdate,
  viewMode,
  filters
}) => {
  const [draggedTask, setDraggedTask] = useState(null);
  const { handleDragOver, stopAutoScroll } = useAutoScroll();

  const filterTasks = useCallback((taskList) => {
    let filtered = taskList;

    if (filters.assignee) {
      filtered = filtered.filter(task => 
        task.assignees && task.assignees.some(assignee => assignee.id === parseInt(filters.assignee))
      );
    }

    if (filters.priority) {
      filtered = filtered.filter(task => task.priority === filters.priority);
    }

    if (filters.tags) {
      filtered = filtered.filter(task => 
        task.tags && task.tags.includes(filters.tags)
      );
    }

    return filtered;
  }, [filters]);

  const tasksByStatus = KANBAN_CONFIG.COLUMNS.reduce((acc, column) => {
    const columnTasks = tasks.filter(task => task.status === column.status);
    acc[column.status] = sortTasksByPosition(filterTasks(columnTasks));
    return acc;
  }, {});

  const handleDragStart = (task) => {
    setDraggedTask(task);
  };

  const handleDragOverBoard = (e) => {
    e.preventDefault();
    handleDragOver(e);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    stopAutoScroll();
  };

  const handleDrop = async (newStatus) => {
    if (!draggedTask) return;

    try {
      const tasksInColumn = tasksByStatus[newStatus] || [];
      const maxPosition = tasksInColumn.length > 0 
        ? Math.max(...tasksInColumn.map(t => t.position || 0))
        : 0;
      
      const updates = [{
        task_id: draggedTask.id,
        status: newStatus,
        position: maxPosition + 1000
      }];

      await onBulkUpdate(updates);
    } catch (error) {
      console.error('Error moving task:', error);
    } finally {
      setDraggedTask(null);
      stopAutoScroll();
    }
  };

  const totalTasks = tasks.length;
  const completedTasks = tasksByStatus[TASK_STATUSES.DONE]?.length || 0;
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div 
      className={styles.boardView}
      onDragOver={handleDragOverBoard}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.boardHeader}>
        <div className={styles.headerLeft}>
          <h2 className={styles.boardTitle}>Доска</h2>
          {viewMode && (
            <span className={styles.viewModeBadge}>
              {viewMode === 'team' ? '👥 Командный режим' : '👤 Личный режим'}
            </span>
          )}
        </div>
        
        <div className={styles.boardStats}>
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {progressPercentage}% завершено
            </span>
          </div>
          
          <div className={styles.statsGroup}>
            <span className={styles.stat}>
              Всего: <strong>{totalTasks}</strong>
            </span>
            <span className={styles.stat}>
              Выполнено: <strong>{completedTasks}</strong>
            </span>
            <span className={styles.stat}>
              В работе: <strong>{totalTasks - completedTasks}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className={styles.columnsContainer}>
        {KANBAN_CONFIG.COLUMNS.map(column => (
          <TaskColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.status] || []}
            onTaskStatusChange={onTaskStatusChange}
            onDragStart={handleDragStart}
            onDrop={() => handleDrop(column.status)}
            draggedTask={draggedTask}
            viewMode={viewMode}
          />
        ))}
      </div>

      {draggedTask && (
        <div className={styles.dragHint}>
          Перетащите задачу в нужную колонку
        </div>
      )}
    </div>
  );
};