import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import styles from './FilterSort.module.css';

export const FilterSort = ({
  filters = [],
  sortOptions = [],
  onFilterChange,
  onSortChange,
  selectedFilters = {},
  selectedSort = '',
  className = ''
}) => {
  const handleFilterChange = (filterKey, value) => {
    onFilterChange({
      ...selectedFilters,
      [filterKey]: value
    });
  };

  const handleSortChange = (value) => {
    onSortChange(value);
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  const hasActiveFilters = Object.keys(selectedFilters).some(key =>
    selectedFilters[key] && selectedFilters[key] !== ''
  );

  const hasFilters = filters.length > 0;
  const hasSort = sortOptions.length > 0;

  if (!hasFilters && !hasSort) {
    return null;
  }

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.headerIcon}>
            <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <span>Параметры отображения</span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className={styles.clearButton}
          >
            <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
            Сбросить
          </button>
        )}
      </div>

      <div className={styles.body}>
        {hasFilters && (
          <div className={styles.filtersSection}>
            <div className={styles.filtersGrid}>
              {filters.map((filter) => (
                <div key={filter.key} className={styles.filterGroup}>
                  <label className={styles.filterLabel}>{filter.label}</label>

                  <select
                    value={selectedFilters[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                    className={styles.filterSelect}
                  >
                    <option value="">Все</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasSort && (
          <div className={styles.sortSection}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Сортировка</label>

              <select
                value={selectedSort}
                onChange={(e) => handleSortChange(e.target.value)}
                className={styles.sortSelect}
              >
                <option value="">По умолчанию</option>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};