import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';

import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { GroupCard } from '../../../components/ui/GroupCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  formatRussianCount,
  getUserRoleTranslation,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './Groups.module.css';

const ROLE_FILTER_OPTIONS = [
  { value: 'admin', label: 'Администратор' },
  { value: 'member', label: 'Участник' },
];

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'По названию (А-Я)' },
  { value: 'name_desc', label: 'По названию (Я-А)' },
  { value: 'created_desc', label: 'Сначала новые' },
  { value: 'created_asc', label: 'Сначала старые' },
  { value: 'users_desc', label: 'Больше участников' },
  { value: 'projects_desc', label: 'Больше проектов' },
];

const compareText = (a = '', b = '') => {
  return String(a || '').localeCompare(String(b || ''), 'ru-RU');
};

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');

  const { user } = useAuthContext();

  const getUserRoleInGroup = useCallback((group) => {
    if (!user || !group.users) return null;

    const userInGroup = group.users.find((item) => item.id === user.id);
    return userInGroup ? userInGroup.role : null;
  }, [user]);

  const isUserAdminInGroup = useCallback((group) => {
    const role = getUserRoleInGroup(group);
    return role === 'admin';
  }, [getUserRoleInGroup]);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const groupsData = await groupsAPI.getMyGroups();
      setGroups(Array.isArray(groupsData) ? groupsData : []);
    } catch (err) {
      console.error('Error loading groups:', err);
      setError(handleApiError(err));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleDeleteGroup = async (groupId) => {
    try {
      await groupsAPI.delete(groupId);
      setGroups((prev) => prev.filter((group) => group.id !== groupId));
    } catch (err) {
      console.error('Error deleting group:', err);
      setError(`Не удалось удалить группу: ${handleApiError(err)}`);
    }
  };

  const filteredAndSortedGroups = useMemo(() => {
    let result = [...groups];

    if (filters.role) {
      result = result.filter((group) => getUserRoleInGroup(group) === filters.role);
    }

    if (sort) {
      switch (sort) {
        case 'name_asc':
          result.sort((a, b) => compareText(a.name, b.name));
          break;

        case 'name_desc':
          result.sort((a, b) => compareText(b.name, a.name));
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

        default:
          break;
      }
    }

    return result;
  }, [groups, filters, sort, getUserRoleInGroup]);

  const hasActiveFilters = Object.keys(filters).some((key) => filters[key] && filters[key] !== '');
  const hasActiveControls = hasActiveFilters || Boolean(sort);
  const showSidebar = groups.length > 0 || hasActiveControls;
  const selectedRoleLabel = filters.role ? getUserRoleTranslation(filters.role) : '';

  const resetControls = () => {
    setFilters({});
    setSort('');
  };

  const renderSelect = ({ label, value, onChange, options, placeholder = 'Все' }) => (
    <label className={styles.controlGroup}>
      <span className={styles.controlLabel}>{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={styles.controlSelect}
      >
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка групп...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Не удалось загрузить группы</h2>
        <p>{error}</p>

        <Button onClick={loadGroups} variant="primary">
          Попробовать снова
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Группы</h1>
          <p className={styles.subtitle}>
            Рабочие команды, роли участников и связанные проекты.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button to="/groups/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать группу
          </Button>
        </div>
      </header>

      <div className={`${styles.workspaceLayout} ${!showSidebar ? styles.workspaceLayoutSingle : ''}`}>
        {showSidebar && (
          <aside className={styles.sidebar} aria-label="Фильтры групп">
            <div className={styles.sidebarHeader}>
              <span>Параметры</span>

              {hasActiveControls && (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={resetControls}
                >
                  <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                  Сбросить
                </button>
              )}
            </div>

            <div className={styles.sidebarBody}>
              <section className={styles.controlsSection}>
                <h2 className={styles.controlsTitle}>Фильтры</h2>

                {renderSelect({
                  label: 'Роль',
                  value: filters.role || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, role: value })),
                  options: ROLE_FILTER_OPTIONS,
                })}
              </section>

              <section className={styles.controlsSection}>
                <h2 className={styles.controlsTitle}>Вид</h2>

                {renderSelect({
                  label: 'Сортировка',
                  value: sort,
                  onChange: setSort,
                  options: SORT_OPTIONS,
                  placeholder: 'По умолчанию',
                })}
              </section>
            </div>
          </aside>
        )}

        <main className={styles.groupsPanel}>
          <div className={styles.listHeader}>
            <span className={styles.listCount}>
              Найдено: {formatRussianCount(filteredAndSortedGroups.length, RUSSIAN_PLURAL_FORMS.GROUP)}
            </span>

            {selectedRoleLabel && (
              <span className={styles.activeFilter}>
                Роль: {selectedRoleLabel}
              </span>
            )}
          </div>

          {filteredAndSortedGroups.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Users size={42} strokeWidth={1.8} aria-hidden="true" />
              </div>

              {hasActiveFilters ? (
                <>
                  <h2>Группы не найдены</h2>
                  <p>Попробуйте изменить параметры фильтрации.</p>

                  <Button
                    onClick={resetControls}
                    variant="primary"
                    size="medium"
                  >
                    <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
                    Сбросить параметры
                  </Button>
                </>
              ) : (
                <>
                  <h2>У вас пока нет групп</h2>
                  <p>Создайте первую группу или дождитесь приглашения от администратора.</p>

                  <Button to="/groups/create" variant="primary" size="medium">
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    Создать группу
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.groupsGrid}>
              {filteredAndSortedGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  currentUserId={user?.id}
                  onDelete={handleDeleteGroup}
                  showDeleteButton={isUserAdminInGroup(group)}
                  compact
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
