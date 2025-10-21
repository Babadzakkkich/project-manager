import React from 'react';
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

  return (
    <div className={`${styles.container} ${className}`}>
      {filters.length > 0 && (
        <div className={styles.filtersSection}>
          <h3 className={styles.sectionTitle}>Фильтры</h3>
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
          
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className={styles.clearButton}
            >
              Очистить фильтры
            </button>
          )}
        </div>
      )}

      {sortOptions.length > 0 && (
        <div className={styles.sortSection}>
          <h3 className={styles.sectionTitle}>Сортировка</h3>
          <div className={styles.sortGroup}>
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
  );
};