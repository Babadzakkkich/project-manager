import React, { useMemo } from 'react';
import { TASK_PRIORITY_OPTIONS } from '../../../../utils/constants';
import styles from './BoardFilters.module.css';

export const BoardFilters = ({ filters, onFiltersChange, tasks }) => {
  const assigneeOptions = useMemo(() => {
    const assigneeMap = new Map();
    
    tasks.forEach(task => {
      task.assignees?.forEach(assignee => {
        if (!assigneeMap.has(assignee.id)) {
          assigneeMap.set(assignee.id, assignee);
        }
      });
    });
    
    return Array.from(assigneeMap.values()).map(assignee => ({
      value: assignee.id.toString(),
      label: assignee.login || assignee.email || `User ${assignee.id}`
    }));
  }, [tasks]);

  const tagOptions = useMemo(() => {
    const tagSet = new Set();
    
    tasks.forEach(task => {
      task.tags?.forEach(tag => {
        if (tag && typeof tag === 'string') {
          tagSet.add(tag.trim());
        }
      });
    });
    
    return Array.from(tagSet).map(tag => ({
      value: tag,
      label: `#${tag}`
    }));
  }, [tasks]);

  const handleFilterChange = (filterKey, value) => {
    onFiltersChange({
      ...filters,
      [filterKey]: value
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      assignee: '',
      priority: '',
      tags: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <div className={styles.filters}>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>Исполнитель:</label>
        <select
          value={filters.assignee}
          onChange={(e) => handleFilterChange('assignee', e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">Все</option>
          {assigneeOptions.map(option => (
            <option key={`assignee-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>Приоритет:</label>
        <select
          value={filters.priority}
          onChange={(e) => handleFilterChange('priority', e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">Все</option>
          {TASK_PRIORITY_OPTIONS.map(option => (
            <option key={`priority-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>Теги:</label>
        <select
          value={filters.tags}
          onChange={(e) => handleFilterChange('tags', e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">Все</option>
          {tagOptions.map(option => (
            <option key={`tag-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className={styles.clearButton}
        >
          Очистить
        </button>
      )}
    </div>
  );
};