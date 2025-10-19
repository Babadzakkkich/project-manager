import React, { useState, useMemo, useEffect } from 'react';
import { FilterSort } from '../FilterSort';
import { ProjectCard } from '../ProjectCard';
import { GroupCard } from '../GroupCard';
import { TaskCard } from '../TaskCard';
import styles from './ItemsModal.module.css';

// Конфигурации для разных типов данных
const ITEM_CONFIGS = {
  projects: {
    filterOptions: [
      {
        key: 'status',
        label: 'Статус проекта',
        options: [
          { value: 'in_progress', label: 'В процессе' },
          { value: 'completed', label: 'Завершен' },
          { value: 'planned', label: 'Запланирован' },
          { value: 'on_hold', label: 'Приостановлен' },
          { value: 'cancelled', label: 'Отменен' }
        ]
      }
    ],
    sortOptions: [
      { value: 'title_asc', label: 'По названию (А-Я)' },
      { value: 'title_desc', label: 'По названию (Я-А)' },
      { value: 'start_date_desc', label: 'Сначала новые' },
      { value: 'start_date_asc', label: 'Сначала старые' },
      { value: 'end_date_asc', label: 'Ближайшие сроки' },
      { value: 'end_date_desc', label: 'Дальние сроки' }
    ],
    renderItem: (item, props) => (
      <ProjectCard
        key={item.id}
        project={item}
        showDetailsButton={true}
        compact={false}
        {...props}
      />
    ),
    emptyMessages: {
      filtered: {
        title: 'Проекты не найдены',
        description: 'Попробуйте изменить параметры фильтрации'
      },
      default: {
        title: 'Проектов пока нет',
        description: 'Здесь еще не создано ни одного проекта'
      }
    }
  },
  groups: {
    filterOptions: [
      {
        key: 'role',
        label: 'Роль в группе',
        options: [
          { value: 'admin', label: 'Администратор' },
          { value: 'member', label: 'Участник' }
        ]
      }
    ],
    sortOptions: [
      { value: 'name_asc', label: 'По названию (А-Я)' },
      { value: 'name_desc', label: 'По названию (Я-А)' },
      { value: 'created_desc', label: 'Сначала новые' },
      { value: 'created_asc', label: 'Сначала старые' },
      { value: 'users_desc', label: 'По количеству участников' },
      { value: 'projects_desc', label: 'По количеству проектов' }
    ],
    renderItem: (item, props) => (
      <GroupCard
        key={item.id}
        group={item}
        currentUserId={props.currentUserId}
        showDeleteButton={props.showDeleteButton}
        onDelete={props.onDelete}
      />
    ),
    emptyMessages: {
      filtered: {
        title: 'Группы не найдены',
        description: 'Попробуйте изменить параметры фильтрации'
      },
      default: {
        title: 'Групп пока нет',
        description: 'Здесь еще не создано ни одной группы'
      }
    }
  },
  tasks: {
    filterOptions: [
      {
        key: 'status',
        label: 'Статус задачи',
        options: [
          { value: 'in_progress', label: 'В процессе' },
          { value: 'completed', label: 'Завершена' },
          { value: 'planned', label: 'Запланирована' },
          { value: 'on_hold', label: 'Приостановлена' },
          { value: 'cancelled', label: 'Отменена' }
        ]
      }
    ],
    sortOptions: [
      { value: 'title_asc', label: 'По названию (А-Я)' },
      { value: 'title_desc', label: 'По названию (Я-А)' },
      { value: 'deadline_asc', label: 'Ближайшие сроки' },
      { value: 'deadline_desc', label: 'Дальние сроки' },
      { value: 'created_desc', label: 'Сначала новые' },
      { value: 'created_asc', label: 'Сначала старые' }
    ],
    renderItem: (item, props) => (
      <TaskCard
        key={item.id}
        task={item}
        showDetailsButton={true}
        {...props}
      />
    ),
    emptyMessages: {
      filtered: {
        title: 'Задачи не найдены',
        description: 'Попробуйте изменить параметры фильтрации'
      },
      default: {
        title: 'Задач пока нет',
        description: 'Здесь еще не создано ни одной задачи'
      }
    }
  },
  users: {
    filterOptions: [], // Убираем фильтрацию для пользователей
    sortOptions: [
      { value: 'login_asc', label: 'По логину (А-Я)' },
      { value: 'login_desc', label: 'По логину (Я-А)' },
      { value: 'email_asc', label: 'По email (А-Я)' },
      { value: 'email_desc', label: 'По email (Я-А)' },
    ],
    renderItem: (item, props) => (
      <div key={item.id} className={styles.userItem}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            {item.login?.charAt(0).toUpperCase()}
          </div>
          <div className={styles.userDetails}>
            <div className={styles.userName}>{item.login}</div>
            <div className={styles.userEmail}>{item.email}</div>
          </div>
        </div>
        {props.showDeleteButton && props.onDelete && (
          <button 
            className={styles.deleteUserButton}
            onClick={() => props.onDelete(item.id, item.login)}
          >
            Удалить
          </button>
        )}
      </div>
    ),
    emptyMessages: {
      filtered: {
        title: 'Пользователи не найдены',
        description: 'Попробуйте изменить параметры фильтрации'
      },
      default: {
        title: 'Пользователей пока нет',
        description: 'Здесь еще не добавлено ни одного пользователя'
      }
    }
  }
};

export const ItemsModal = ({
  items = [],
  itemType = 'projects', // 'projects', 'groups', 'tasks', 'users'
  isOpen = false,
  onClose,
  title = "",
  // Дополнительные пропсы для карточек
  currentUserId,
  showDeleteButton = false,
  onDelete,
  // Кастомные конфигурации (опционально)
  customFilterOptions,
  customSortOptions,
  customRenderItem,
  customEmptyMessages
}) => {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');

  // Получаем конфигурацию для типа данных
  const config = ITEM_CONFIGS[itemType] || ITEM_CONFIGS.projects;
  
  // Используем кастомные настройки если предоставлены
  const filterOptions = customFilterOptions || config.filterOptions;
  const sortOptions = customSortOptions || config.sortOptions;
  const renderItem = customRenderItem || config.renderItem;
  const emptyMessages = customEmptyMessages || config.emptyMessages;

  // Сброс фильтров при закрытии модального окна
  useEffect(() => {
    if (!isOpen) {
      setFilters({});
      setSort('');
    }
  }, [isOpen]);

  // Фильтрация и сортировка элементов
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // Применяем фильтры
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        result = result.filter(item => item[key] === filters[key]);
      }
    });

    // Применяем сортировку
    if (sort) {
      switch (sort) {
        case 'title_asc':
        case 'name_asc':
          result.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
          break;
        case 'title_desc':
        case 'name_desc':
          result.sort((a, b) => (b.title || b.name).localeCompare(a.title || a.name));
          break;
        case 'start_date_desc':
          result.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
          break;
        case 'start_date_asc':
          result.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
          break;
        case 'end_date_asc':
        case 'deadline_asc':
          result.sort((a, b) => new Date(a.end_date || a.deadline) - new Date(b.end_date || b.deadline));
          break;
        case 'end_date_desc':
        case 'deadline_desc':
          result.sort((a, b) => new Date(b.end_date || b.deadline) - new Date(a.end_date || a.deadline));
          break;
        case 'created_desc':
          result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          break;
        case 'created_asc':
          result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          break;
        case 'users_desc':
          result.sort((a, b) => (b.users?.length || 0) - (a.users?.length || 0));
          break;
        case 'projects_desc':
          result.sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0));
          break;
        case 'login_asc':
          result.sort((a, b) => (a.login || '').localeCompare(b.login || ''));
          break;
        case 'login_desc':
          result.sort((a, b) => (b.login || '').localeCompare(a.login || ''));
          break;
        case 'email_asc':
          result.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
          break;
        case 'email_desc':
          result.sort((a, b) => (b.email || '').localeCompare(a.email || ''));
          break;
        default:
          break;
      }
    }

    return result;
  }, [items, filters, sort]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const hasActiveFilters = Object.keys(filters).some(key => 
    filters[key] && filters[key] !== ''
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {(items.length > 0 || hasActiveFilters) && (
            <FilterSort
              filters={filterOptions}
              sortOptions={sortOptions}
              selectedFilters={filters}
              selectedSort={sort}
              onFilterChange={setFilters}
              onSortChange={setSort}
              className={styles.filterSort}
            />
          )}

          <div className={styles.itemsInfo}>
            <span className={styles.itemsCount}>
              Найдено: {filteredAndSortedItems.length}
              {hasActiveFilters && ' (отфильтровано)'}
            </span>
          </div>

          {filteredAndSortedItems.length === 0 ? (
            <div className={styles.emptyState}>
              {hasActiveFilters ? (
                <>
                  <h3>{emptyMessages.filtered.title}</h3>
                  <p>{emptyMessages.filtered.description}</p>
                  <button 
                    onClick={() => setFilters({})}
                    className={styles.clearFiltersButton}
                  >
                    Сбросить фильтры
                  </button>
                </>
              ) : (
                <>
                  <h3>{emptyMessages.default.title}</h3>
                  <p>{emptyMessages.default.description}</p>
                </>
              )}
            </div>
          ) : (
            <div className={itemType === 'users' ? styles.usersGrid : styles.itemsGrid}>
              {filteredAndSortedItems.map((item) =>
                renderItem(item, {
                  currentUserId,
                  showDeleteButton,
                  onDelete: onDelete ? () => onDelete(item.id, item.login) : undefined
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};