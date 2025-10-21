import React from 'react';
import { KanbanTaskCard } from '../KanbanTaskCard/KanbanTaskCard';
import { getTaskStatusColor } from '../../../../utils/taskStatus';
import { useAutoScroll } from '../../../../hooks/useAutoScroll';
import styles from './TaskColumn.module.css';

export const TaskColumn = ({
  column,
  tasks,
  onTaskStatusChange,
  onDragStart,
  onDrop,
  draggedTask,
  viewMode
}) => {
  const { handleDragOver, stopAutoScroll } = useAutoScroll();

  const handleDragOverColumn = (e) => {
    e.preventDefault();
    handleDragOver(e);
  };

  const handleDropColumn = (e) => {
    e.preventDefault();
    stopAutoScroll();
    onDrop();
  };

  const handleDragEnd = () => {
    stopAutoScroll();
  };

  const statusColor = getTaskStatusColor(column.status);

  return (
    <div 
      className={`${styles.column} ${draggedTask ? styles.dragOver : ''}`}
      onDragOver={handleDragOverColumn}
      onDrop={handleDropColumn}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.columnHeader} style={{ borderTopColor: statusColor }}>
        <div className={styles.columnTitle}>
          <h3 className={styles.title}>{column.title}</h3>
          <span className={styles.taskCount}>({tasks.length})</span>
        </div>
        <div 
          className={styles.statusIndicator}
          style={{ backgroundColor: statusColor }}
        />
      </div>

      <div className={styles.tasksList}>
        {tasks.length === 0 ? (
          <div className={styles.emptyColumn}>
            <p className={styles.emptyText}>Нет задач</p>
            <div className={styles.dropHint}>
              Перетащите задачу сюда
            </div>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              onStatusChange={onTaskStatusChange}
              onDragStart={onDragStart}
              viewMode={viewMode}
            />
          ))
        )}
      </div>

      {column.maxTasks && tasks.length >= column.maxTasks && (
        <div className={styles.limitWarning}>
          ⚠️ Лимит задач: {tasks.length}/{column.maxTasks}
        </div>
      )}
    </div>
  );
};