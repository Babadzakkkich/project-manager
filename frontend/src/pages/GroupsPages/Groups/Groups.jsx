import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { GroupCard } from '../../../components/ui/GroupCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import { handleApiError, getUserRoleTranslation } from '../../../utils/helpers';
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
        { value: 'admin', label: 'Администратор' },
        { value: 'member', label: 'Участник' }
      ]
    }
  ];

  const sortOptions = [
    { value: 'name_asc', label: 'По названию (А-Я)' },
    { value: 'name_desc', label: 'По названию (Я-А)' },
    { value: 'created_desc', label: 'Сначала новые' },
    { value: 'created_asc', label: 'Сначала старые' },
    { value: 'users_desc', label: 'По количеству участников' },
    { value: 'projects_desc', label: 'По количеству проектов' }
  ];

  const getUserRoleInGroup = useCallback((group) => {
    if (!user || !group.users) return null;
    const userInGroup = group.users.find(u => u.id === user.id);
    return userInGroup ? userInGroup.role : null;
  }, [user]);

  const isUserAdminInGroup = useCallback((group) => {
    const userRole = getUserRoleInGroup(group);
    return userRole === 'admin' || userRole === 'super_admin';
  }, [getUserRoleInGroup]);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError('');
      const groupsData = await groupsAPI.getMyGroups();
      setGroups(groupsData);
    } catch (err) {
      console.error('Error loading groups:', err);
      const errorMessage = handleApiError(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await groupsAPI.delete(groupId);
      await loadGroups();
    } catch (err) {
      console.error('Error deleting group:', err);
      const errorMessage = handleApiError(err);
      setError(`Не удалось удалить группу: ${errorMessage}`);
    }
  };

  const filteredAndSortedGroups = useMemo(() => {
    let result = [...groups];

    if (filters.role) {
      result = result.filter(group => {
        const userRole = getUserRoleInGroup(group);
        return userRole === filters.role;
      });
    }

    if (sort) {
      switch (sort) {
        case 'name_asc':
          result.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name_desc':
          result.sort((a, b) => b.name.localeCompare(a.name));
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
        default:
          break;
      }
    }

    return result;
  }, [groups, filters, sort, getUserRoleInGroup]);

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
        <h2>Ошибка</h2>
        <p>{error}</p>
        <Button onClick={loadGroups}>Попробовать снова</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Мои группы</h1>
        <p className={styles.subtitle}>
          Управляйте группами, в которых вы состоите
        </p>
        <Button 
          to="/groups/create" 
          variant="primary" 
          size="large"
          className={styles.createButton}
        >
          Создать новую группу
        </Button>
      </div>

      {filteredAndSortedGroups.length > 0 && (
        <FilterSort
          filters={filterOptions}
          sortOptions={sortOptions}
          selectedFilters={filters}
          selectedSort={sort}
          onFilterChange={setFilters}
          onSortChange={setSort}
        />
      )}

      {filteredAndSortedGroups.length === 0 ? (
        <div className={styles.emptyState}>
          {Object.keys(filters).length > 0 ? (
            <>
              <h2>Группы не найдены</h2>
              <p>Попробуйте изменить параметры фильтрации</p>
              <Button 
                onClick={() => setFilters({})}
                variant="primary" 
                size="large"
              >
                Сбросить фильтры
              </Button>
            </>
          ) : (
            <>
              <h2>У вас пока нет групп</h2>
              <p>Создайте свою первую группу или попросите администратора добавить вас в существующую</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={styles.groupsInfo}>
            <span className={styles.groupsCount}>
              Найдено групп: {filteredAndSortedGroups.length}
            </span>
            {filters.role && (
              <span className={styles.activeFilter}>
                Фильтр: {getUserRoleTranslation(filters.role)}
              </span>
            )}
          </div>
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
        </>
      )}
    </div>
  );
};