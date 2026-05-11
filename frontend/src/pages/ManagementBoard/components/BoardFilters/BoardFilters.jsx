import React, { useMemo } from 'react';

import { TASK_PRIORITY_OPTIONS } from '../../../../utils/constants';
import styles from './BoardFilters.module.css';

const EMPTY_FILTERS = {
  assignee: '',
  priority: '',
  tags: '',
};

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || `Пользователь ${user?.id}`;
};

export const BoardFilters = ({ filters, onFiltersChange, tasks }) => {
  const assigneeOptions = useMemo(() => {
    const assigneeMap = new Map();

    tasks.forEach((task) => {
      task.assignees?.forEach((assignee) => {
        if (!assigneeMap.has(assignee.id)) {
          assigneeMap.set(assignee.id, assignee);
        }
      });
    });

    return Array.from(assigneeMap.values())
      .map((assignee) => ({
        value: String(assignee.id),
        label: getUserName(assignee),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru-RU'));
  }, [tasks]);

  const tagOptions = useMemo(() => {
    const tagSet = new Set();

    tasks.forEach((task) => {
      task.tags?.forEach((tag) => {
        if (tag && typeof tag === 'string') {
          tagSet.add(tag.trim());
        }
      });
    });

    return Array.from(tagSet)
      .filter(Boolean)
      .map((tag) => ({
        value: tag,
        label: `#${tag}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru-RU'));
  }, [tasks]);

  const priorityOptions = useMemo(() => {
    return TASK_PRIORITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }, []);

  const handleFilterChange = (filterKey, value) => {
    onFiltersChange({
      ...filters,
      [filterKey]: value,
    });
  };

  const clearFilter = (filterKey) => {
    onFiltersChange({
      ...filters,
      [filterKey]: '',
    });
  };

  const clearFilters = () => {
    onFiltersChange(EMPTY_FILTERS);
  };

  const getSelectedLabel = (filterKey, value) => {
    if (!value) return '';

    if (filterKey === 'assignee') {
      return assigneeOptions.find((option) => option.value === value)?.label || value;
    }

    if (filterKey === 'priority') {
      return priorityOptions.find((option) => option.value === value)?.label || value;
    }

    if (filterKey === 'tags') {
      return tagOptions.find((option) => option.value === value)?.label || `#${value}`;
    }

    return value;
  };

  const activeFilters = [
    {
      key: 'assignee',
      label: 'Исполнитель',
      value: filters.assignee,
    },
    {
      key: 'priority',
      label: 'Приоритет',
      value: filters.priority,
    },
    {
      key: 'tags',
      label: 'Тег',
      value: filters.tags,
    },
  ].filter((filter) => Boolean(filter.value));

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className={styles.filters}>
      <div className={styles.fields}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="board-filter-assignee">
            Исполнитель
          </label>

          <select
            id="board-filter-assignee"
            value={filters.assignee}
            onChange={(e) => handleFilterChange('assignee', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Все исполнители</option>

            {assigneeOptions.map((option) => (
              <option key={`assignee-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="board-filter-priority">
            Приоритет
          </label>

          <select
            id="board-filter-priority"
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Все приоритеты</option>

            {priorityOptions.map((option) => (
              <option key={`priority-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="board-filter-tags">
            Тег
          </label>

          <select
            id="board-filter-tags"
            value={filters.tags}
            onChange={(e) => handleFilterChange('tags', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Все теги</option>

            {tagOptions.map((option) => (
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
            Сбросить
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className={styles.activeFilters}>
          <span className={styles.activeLabel}>Активно:</span>

          <div className={styles.activeList}>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={styles.activeChip}
                onClick={() => clearFilter(filter.key)}
                title="Убрать фильтр"
              >
                <span>{filter.label}: {getSelectedLabel(filter.key, filter.value)}</span>
                <span className={styles.chipRemove} aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};