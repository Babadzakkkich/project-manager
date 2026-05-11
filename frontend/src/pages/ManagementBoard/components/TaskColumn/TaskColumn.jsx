import React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

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
  viewMode,
}) => {
  const { handleDragOver, stopAutoScroll } = useAutoScroll();

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const statusColor = getTaskStatusColor(column.status);
  const isLimitReached = column.maxTasks && safeTasks.length >= column.maxTasks;

  const handleDragOverColumn = (e) => {
    e.preventDefault();
    handleDragOver(e);
  };

  const handleDropColumn = (e) => {
    e.preventDefault();
    stopAutoScroll();

    if (draggedTask) {
      onDrop();
    }
  };

  const handleDragEnd = () => {
    stopAutoScroll();
  };

  return (
    <section
      className={`${styles.column} ${draggedTask ? styles.dragOver : ''}`}
      style={{ '--column-accent': statusColor }}
      onDragOver={handleDragOverColumn}
      onDrop={handleDropColumn}
      onDragEnd={handleDragEnd}
      aria-label={`Колонка ${column.title}`}
    >
      <header className={styles.columnHeader}>
        <div className={styles.headerTop}>
          <h3 className={styles.title}>{column.title}</h3>

          <span className={styles.taskCount}>
            {safeTasks.length}
          </span>
        </div>

        <div className={styles.headerLine} />
      </header>

      <div className={styles.tasksList}>
        {safeTasks.length === 0 ? (
          <div className={`${styles.emptyColumn} ${draggedTask ? styles.emptyDropReady : ''}`}>
            <div className={styles.emptyIcon}>
              <Inbox size={22} strokeWidth={1.8} aria-hidden="true" />
            </div>

            <p className={styles.emptyText}>Нет задач</p>

            <span className={styles.dropHint}>
              {draggedTask ? 'Отпустите задачу здесь' : 'Перетащите сюда'}
            </span>
          </div>
        ) : (
          safeTasks.map((task) => (
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

      {isLimitReached && (
        <div className={styles.limitWarning}>
          <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
          Лимит: {safeTasks.length}/{column.maxTasks}
        </div>
      )}
    </section>
  );
};