import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';

import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { GroupCard } from '../../../components/ui/GroupCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  formatRussianCount,
  getRussianPluralForm,
  getUserRoleTranslation,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './Groups.module.css';

export const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');

  const { user } = useAuthContext();

  const filterOptions = [
    {
      key: 'role',
      label: 'Роль в группе',
      options: [
        { value: 'super_admin', label: 'Супер-администратор' },
        { value: 'admin', label: 'Администратор' },
        { value: 'member', label: 'Участник' },
      ],
    },
  ];

  const sortOptions = [
    { value: 'name_asc', label: 'По названию (А-Я)' },
    { value: 'name_desc', label: 'По названию (Я-А)' },
    { value: 'created_desc', label: 'Сначала новые' },
    { value: 'created_asc', label: 'Сначала старые' },
    { value: 'users_desc', label: 'По количеству участников' },
    { value: 'projects_desc', label: 'По количеству проектов' },
  ];

  const getUserRoleInGroup = useCallback((group) => {
    if (!user || !group.users) return null;

    const userInGroup = group.users.find((item) => item.id === user.id);
    return userInGroup ? userInGroup.role : null;
  }, [user]);

  const isUserAdminInGroup = useCallback((group) => {
    const role = getUserRoleInGroup(group);
    return role === 'admin' || role === 'super_admin';
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
      await loadGroups();
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
          result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru-RU'));
          break;

        case 'name_desc':
          result.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'ru-RU'));
          break;

        case 'created_desc':
          result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          break;

        case 'created_asc':
          result.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
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

  const hasActiveFilters = Object.keys(filters).some((key) => filters[key]);
  const adminGroupsCount = groups.filter((group) => isUserAdminInGroup(group)).length;
  const projectsCount = groups.reduce((total, group) => total + (group.projects?.length || 0), 0);
  const usersCount = groups.reduce((total, group) => total + (group.users?.length || 0), 0);

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
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>Группы</h1>

          <p className={styles.subtitle}>
            Управляйте рабочими командами, участниками, ролями и связанными проектами.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Button to="/groups/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать группу
          </Button>
        </div>
      </section>

      <section className={styles.statsGrid} aria-label="Сводка по группам">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{groups.length}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(groups.length, RUSSIAN_PLURAL_FORMS.GROUP)} всего
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{adminGroupsCount}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(adminGroupsCount, RUSSIAN_PLURAL_FORMS.GROUP)} с правами администратора
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{projectsCount}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(projectsCount, RUSSIAN_PLURAL_FORMS.PROJECT)} связано
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{usersCount}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(usersCount, RUSSIAN_PLURAL_FORMS.PARTICIPANT)} суммарно
          </span>
        </article>
      </section>

      {(groups.length > 0 || hasActiveFilters) && (
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

      <div className={styles.groupsInfo}>
        <span className={styles.groupsCount}>
          Найдено: {formatRussianCount(filteredAndSortedGroups.length, RUSSIAN_PLURAL_FORMS.GROUP)}
        </span>

        {filters.role && (
          <span className={styles.activeFilter}>
            Роль: {getUserRoleTranslation(filters.role)}
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
                onClick={() => setFilters({})}
                variant="primary"
                size="medium"
              >
                <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
                Сбросить фильтры
              </Button>
            </>
          ) : (
            <>
              <h2>У вас пока нет групп</h2>
              <p>
                Создайте первую группу или дождитесь приглашения от администратора.
              </p>

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
            />
          ))}
        </div>
      )}
    </div>
  );
};