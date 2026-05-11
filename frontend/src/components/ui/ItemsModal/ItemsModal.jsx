import React, { useState, useMemo, useEffect } from 'react';
import {
  Inbox,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { FilterSort } from '../FilterSort';
import { ProjectCard } from '../ProjectCard';
import { GroupCard } from '../GroupCard';
import { TaskCard } from '../TaskCard';
import {
  formatRussianCount,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './ItemsModal.module.css';

const ASSIGNEE_FORMS = ['исполнитель', 'исполнителя', 'исполнителей'];

const ITEM_LABELS = {
  projects: {
    singular: 'проект',
    pluralForms: RUSSIAN_PLURAL_FORMS.PROJECT,
    defaultTitle: 'Проекты',
  },
  groups: {
    singular: 'группа',
    pluralForms: RUSSIAN_PLURAL_FORMS.GROUP,
    defaultTitle: 'Группы',
  },
  tasks: {
    singular: 'задача',
    pluralForms: RUSSIAN_PLURAL_FORMS.TASK,
    defaultTitle: 'Задачи',
  },
  users: {
    singular: 'пользователь',
    pluralForms: RUSSIAN_PLURAL_FORMS.USER,
    defaultTitle: 'Пользователи',
  },
};

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
          { value: 'cancelled', label: 'Отменен' },
        ],
      },
    ],
    sortOptions: [
      { value: 'title_asc', label: 'По названию (А-Я)' },
      { value: 'title_desc', label: 'По названию (Я-А)' },
      { value: 'start_date_desc', label: 'Сначала новые' },
      { value: 'start_date_asc', label: 'Сначала старые' },
      { value: 'end_date_asc', label: 'Ближайшие сроки' },
      { value: 'end_date_desc', label: 'Дальние сроки' },
    ],
    renderItem: (item, props) => (
      <ProjectCard
        key={item.id}
        project={item}
        showDetailsButton
        compact={false}
        showDeleteButton={props.showDeleteButton}
        onDelete={props.onDelete ? () => props.onDelete(item.id, item.title) : undefined}
      />
    ),
    emptyMessages: {
      filtered: {
        title: 'Проекты не найдены',
        description: 'Попробуйте изменить параметры фильтрации',
      },
      default: {
        title: 'Проектов пока нет',
        description: 'Здесь еще не создано ни одного проекта',
      },
    },
  },

  groups: {
    filterOptions: [
      {
        key: 'role',
        label: 'Роль в группе',
        options: [
          { value: 'super_admin', label: 'Супер-администратор' },
          { value: 'admin', label: 'Администратор' },
          { value: 'member', label: 'Участник' },
        ],
      },
    ],
    sortOptions: [
      { value: 'name_asc', label: 'По названию (А-Я)' },
      { value: 'name_desc', label: 'По названию (Я-А)' },
      { value: 'created_desc', label: 'Сначала новые' },
      { value: 'created_asc', label: 'Сначала старые' },
      { value: 'users_desc', label: 'По количеству участников' },
      { value: 'projects_desc', label: 'По количеству проектов' },
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
        description: 'Попробуйте изменить параметры фильтрации',
      },
      default: {
        title: 'Групп пока нет',
        description: 'Здесь еще не создано ни одной группы',
      },
    },
  },

  tasks: {
    filterOptions: [
      {
        key: 'status',
        label: 'Статус задачи',
        options: [
          { value: 'backlog', label: 'Бэклог' },
          { value: 'todo', label: 'К выполнению' },
          { value: 'in_progress', label: 'В процессе' },
          { value: 'review', label: 'На проверке' },
          { value: 'done', label: 'Выполнена' },
          { value: 'cancelled', label: 'Отменена' },

          /* Совместимость со старыми значениями, если они где-то остались */
          { value: 'completed', label: 'Завершена' },
          { value: 'planned', label: 'Запланирована' },
          { value: 'on_hold', label: 'Приостановлена' },
        ],
      },
      {
        key: 'priority',
        label: 'Приоритет',
        options: [
          { value: 'low', label: 'Низкий' },
          { value: 'medium', label: 'Средний' },
          { value: 'high', label: 'Высокий' },
          { value: 'urgent', label: 'Срочный' },
        ],
      },
    ],
    sortOptions: [
      { value: 'title_asc', label: 'По названию (А-Я)' },
      { value: 'title_desc', label: 'По названию (Я-А)' },
      { value: 'deadline_asc', label: 'Ближайшие сроки' },
      { value: 'deadline_desc', label: 'Дальние сроки' },
      { value: 'created_desc', label: 'Сначала новые' },
      { value: 'created_asc', label: 'Сначала старые' },
    ],
    renderItem: (item, props) => (
      <TaskCard
        key={item.id}
        task={item}
        showDetailsButton
        compact={false}
        showDeleteButton={props.showDeleteButton}
        currentUserId={props.currentUserId}
        onDelete={props.onDelete ? () => props.onDelete(item.id, item.title) : undefined}
      />
    ),
    emptyMessages: {
      filtered: {
        title: 'Задачи не найдены',
        description: 'Попробуйте изменить параметры фильтрации',
      },
      default: {
        title: 'Задач пока нет',
        description: 'Здесь еще не создано ни одной задачи',
      },
    },
  },

  users: {
    filterOptions: [],
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
            {item.login?.charAt(0).toUpperCase() || '?'}
          </div>

          <div className={styles.userDetails}>
            <div className={styles.userName}>
              {item.name || item.login || 'Пользователь'}
            </div>

            <div className={styles.userMeta}>
              {item.login && <span>@{item.login}</span>}
              {item.email && <span>{item.email}</span>}
            </div>
          </div>
        </div>

        {props.showDeleteButton && props.onDelete && (
          <button
            type="button"
            className={styles.deleteUserButton}
            onClick={() => props.onDelete(item.id, item.login)}
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
            Удалить
          </button>
        )}
      </div>
    ),
    emptyMessages: {
      filtered: {
        title: 'Пользователи не найдены',
        description: 'Попробуйте изменить параметры фильтрации',
      },
      default: {
        title: 'Пользователей пока нет',
        description: 'Здесь еще не добавлено ни одного пользователя',
      },
    },
  },
};

const getItemRole = (item, currentUserId) => {
  if (!currentUserId || !Array.isArray(item.users)) return '';

  const currentUserInGroup = item.users.find((user) => user.id === currentUserId);
  return currentUserInGroup?.role || '';
};

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const compareText = (a = '', b = '') => {
  return String(a || '').localeCompare(String(b || ''), 'ru-RU');
};

export const ItemsModal = ({
  items = [],
  itemType = 'projects',
  isOpen = false,
  onClose,
  title = '',
  currentUserId,
  showDeleteButton = false,
  onDelete,
  customFilterOptions,
  customSortOptions,
  customRenderItem,
  customEmptyMessages,
}) => {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');

  const config = ITEM_CONFIGS[itemType] || ITEM_CONFIGS.projects;
  const itemLabels = ITEM_LABELS[itemType] || ITEM_LABELS.projects;

  const filterOptions = customFilterOptions || config.filterOptions;
  const sortOptions = customSortOptions || config.sortOptions;
  const renderItem = customRenderItem || config.renderItem;
  const emptyMessages = customEmptyMessages || config.emptyMessages;

  useEffect(() => {
    if (!isOpen) {
      setFilters({});
      setSort('');
    }
  }, [isOpen]);

  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    Object.keys(filters).forEach((key) => {
      if (!filters[key]) return;

      result = result.filter((item) => {
        if (key === 'role') {
          return getItemRole(item, currentUserId) === filters[key];
        }

        return item[key] === filters[key];
      });
    });

    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) => compareText(a.title || a.name, b.title || b.name));
          break;

        case 'title_desc':
          result.sort((a, b) => compareText(b.title || b.name, a.title || a.name));
          break;

        case 'name_asc':
          result.sort((a, b) => compareText(a.name || a.title, b.name || b.title));
          break;

        case 'name_desc':
          result.sort((a, b) => compareText(b.name || b.title, a.name || a.title));
          break;

        case 'start_date_desc':
          result.sort((a, b) => getDateMs(b.start_date) - getDateMs(a.start_date));
          break;

        case 'start_date_asc':
          result.sort((a, b) => getDateMs(a.start_date) - getDateMs(b.start_date));
          break;

        case 'end_date_asc':
        case 'deadline_asc':
          result.sort((a, b) =>
            getDateMs(a.end_date || a.deadline) - getDateMs(b.end_date || b.deadline)
          );
          break;

        case 'end_date_desc':
        case 'deadline_desc':
          result.sort((a, b) =>
            getDateMs(b.end_date || b.deadline) - getDateMs(a.end_date || a.deadline)
          );
          break;

        case 'created_desc':
          result.sort((a, b) => getDateMs(b.created_at) - getDateMs(a.created_at));
          break;

        case 'created_asc':
          result.sort((a, b) => getDateMs(a.created_at) - getDateMs(b.created_at));
          break;

        case 'users_desc':
          result.sort((a, b) => (b.users?.length || 0) - (a.users?.length || 0));
          break;

        case 'projects_desc':
          result.sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0));
          break;

        case 'login_asc':
          result.sort((a, b) => compareText(a.login, b.login));
          break;

        case 'login_desc':
          result.sort((a, b) => compareText(b.login, a.login));
          break;

        case 'email_asc':
          result.sort((a, b) => compareText(a.email, b.email));
          break;

        case 'email_desc':
          result.sort((a, b) => compareText(b.email, a.email));
          break;

        default:
          break;
      }
    }

    return result;
  }, [items, filters, sort, currentUserId]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const hasActiveFilters = Object.keys(filters).some(
    (key) => filters[key] && filters[key] !== ''
  );

  const hasDisplayControls =
    items.length > 0 ||
    hasActiveFilters ||
    filterOptions.length > 0 ||
    sortOptions.length > 0;

  const modalTitle = title || itemLabels.defaultTitle;

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="items-modal-title"
      >
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <Inbox size={22} strokeWidth={2} aria-hidden="true" />
            </div>

            <div>
              <h2 id="items-modal-title" className={styles.title}>
                {modalTitle}
              </h2>

              <p className={styles.subtitle}>
                {formatRussianCount(items.length, itemLabels.pluralForms)}
                {hasActiveFilters && ' в исходном списке'}
              </p>
            </div>
          </div>

          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
            type="button"
          >
            <X size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.content}>
          {hasDisplayControls && (
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
            <div className={styles.itemsCount}>
              Найдено: {formatRussianCount(filteredAndSortedItems.length, itemLabels.pluralForms)}
              {hasActiveFilters && (
                <span className={styles.filteredLabel}>отфильтровано</span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className={styles.resetInlineButton}
                onClick={() => setFilters({})}
              >
                <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                Сбросить фильтры
              </button>
            )}
          </div>

          {filteredAndSortedItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Inbox size={42} strokeWidth={1.8} aria-hidden="true" />
              </div>

              {hasActiveFilters ? (
                <>
                  <h3>{emptyMessages.filtered.title}</h3>
                  <p>{emptyMessages.filtered.description}</p>

                  <button
                    type="button"
                    onClick={() => setFilters({})}
                    className={styles.clearFiltersButton}
                  >
                    <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
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
                  onDelete,
                  assigneeForms: ASSIGNEE_FORMS,
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};