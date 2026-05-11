import React, { useCallback, useMemo, useState } from 'react';

import { TaskColumn } from '../TaskColumn/TaskColumn';
import { KANBAN_CONFIG } from '../../../../utils/constants';
import { sortTasksByPosition } from '../../../../utils/taskStatus';
import { useAutoScroll } from '../../../../hooks/useAutoScroll';
import styles from './BoardView.module.css';

export const BoardView = ({
  tasks,
  onTaskStatusChange,
  onBulkUpdate,
  viewMode,
  filters,
}) => {
  const [draggedTask, setDraggedTask] = useState(null);
  const { handleDragOver, stopAutoScroll } = useAutoScroll();

  const safeTasks = useMemo(() => {
    return Array.isArray(tasks) ? tasks : [];
  }, [tasks]);

  const filterTasks = useCallback((taskList) => {
    let filtered = taskList;

    if (filters.assignee) {
      filtered = filtered.filter((task) =>
        task.assignees?.some((assignee) => assignee.id === Number(filters.assignee))
      );
    }

    if (filters.priority) {
      filtered = filtered.filter((task) => task.priority === filters.priority);
    }

    if (filters.tags) {
      filtered = filtered.filter((task) =>
        task.tags?.includes(filters.tags)
      );
    }

    return filtered;
  }, [filters]);

  const tasksByStatus = useMemo(() => {
    return KANBAN_CONFIG.COLUMNS.reduce((acc, column) => {
      const columnTasks = safeTasks.filter((task) => task.status === column.status);

      acc[column.status] = sortTasksByPosition(filterTasks(columnTasks));
      return acc;
    }, {});
  }, [safeTasks, filterTasks]);

  const filteredTasksCount = useMemo(() => {
    return Object.values(tasksByStatus).reduce(
      (total, columnTasks) => total + columnTasks.length,
      0
    );
  }, [tasksByStatus]);

  const hasActiveFilters = Object.values(filters || {}).some(Boolean);

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
        ? Math.max(...tasksInColumn.map((task) => task.position || 0))
        : 0;

      const updates = [{
        task_id: draggedTask.id,
        status: newStatus,
        position: maxPosition + KANBAN_CONFIG.DEFAULT_POSITION_STEP,
      }];

      await onBulkUpdate(updates);
    } catch (error) {
      console.error('Error moving task:', error);
    } finally {
      setDraggedTask(null);
      stopAutoScroll();
    }
  };

  return (
    <div
      className={styles.boardView}
      onDragOver={handleDragOverBoard}
      onDragEnd={handleDragEnd}
      style={{ '--board-columns-count': KANBAN_CONFIG.COLUMNS.length }}
    >
      {hasActiveFilters && (
        <div className={styles.filterResult}>
          Показано задач: <strong>{filteredTasksCount}</strong>
          <span>из {safeTasks.length}</span>
        </div>
      )}

      <div className={styles.columnsContainer}>
        {KANBAN_CONFIG.COLUMNS.map((column) => (
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