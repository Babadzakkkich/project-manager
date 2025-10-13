import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { projectsAPI } from '../../../services/api/projects';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import styles from './Projects.module.css';

export const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const { user } = useAuthContext();

  const filterOptions = [
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
  ];

  const sortOptions = [
    { value: 'title_asc', label: 'По названию (А-Я)' },
    { value: 'title_desc', label: 'По названию (Я-А)' },
    { value: 'start_date_desc', label: 'Сначала новые' },
    { value: 'start_date_asc', label: 'Сначала старые' },
    { value: 'end_date_asc', label: 'Ближайшие сроки' },
    { value: 'end_date_desc', label: 'Дальние сроки' }
  ];

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const projectsData = await projectsAPI.getMyProjects();
      setProjects(projectsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDeleteProject = async (projectId, projectTitle) => {
    if (!window.confirm(`Вы уверены, что хотите удалить проект "${projectTitle}"? Это действие нельзя отменить.`)) {
      return;
    }

    try {
      await projectsAPI.delete(projectId);
      setProjects(prev => prev.filter(project => project.id !== projectId));
    } catch (err) {
      setError('Не удалось удалить проект: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  // Упрощенная функция определения роли
  const getUserRoleInProject = (project) => {
    if (!user || !project.groups) return 'member';
    
    // Проверяем все группы проекта
    for (const group of project.groups) {
      // Если в группе есть пользователи и среди них есть текущий пользователь
      if (group.users && group.users.some(u => u.id === user.id)) {
        const userInGroup = group.users.find(u => u.id === user.id);
        if (userInGroup && userInGroup.role === 'admin') {
          return 'admin';
        }
      }
    }
    
    return 'member';
  };

  // Фильтрация и сортировка
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    // Фильтры
    if (filters.status) {
      result = result.filter(project => project.status === filters.status);
    }

    // Сортировка
    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'title_desc':
          result.sort((a, b) => b.title.localeCompare(a.title));
          break;
        case 'start_date_desc':
          result.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
          break;
        case 'start_date_asc':
          result.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
          break;
        case 'end_date_asc':
          result.sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
          break;
        case 'end_date_desc':
          result.sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
          break;
        default:
          break;
      }
    }

    return result;
  }, [projects, filters, sort]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка проектов...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>Ошибка</h2>
        <p>{error}</p>
        <Button onClick={loadProjects}>Попробовать снова</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Мои проекты</h1>
        <p className={styles.subtitle}>
          Проекты, в которых вы участвуете
        </p>
        <Button 
          to="/projects/create" 
          variant="primary" 
          size="large"
          className={styles.createButton}
        >
          Создать новый проект
        </Button>
      </div>

      {filteredAndSortedProjects.length > 0 && (
        <FilterSort
          filters={filterOptions}
          sortOptions={sortOptions}
          selectedFilters={filters}
          selectedSort={sort}
          onFilterChange={setFilters}
          onSortChange={setSort}
        />
      )}

      {filteredAndSortedProjects.length === 0 ? (
        <div className={styles.emptyState}>
          {Object.keys(filters).length > 0 ? (
            <>
              <h2>Проекты не найдены</h2>
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
              <h2>У вас пока нет проектов</h2>
              <p>Создайте свой первый проект или попросите добавить вас в существующий</p>
              <Button 
                to="/projects/create" 
                variant="primary" 
                size="large"
              >
                Создать первый проект
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={styles.projectsInfo}>
            <span className={styles.projectsCount}>
              Найдено проектов: {filteredAndSortedProjects.length}
            </span>
          </div>
          <div className={styles.projectsGrid}>
            {filteredAndSortedProjects.map((project) => {
              const userRole = getUserRoleInProject(project);
              const isAdmin = userRole === 'admin';
              
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  showDetailsButton={true}
                  compact={false}
                  showDeleteButton={isAdmin}
                  userRole={userRole}
                  onDelete={() => handleDeleteProject(project.id, project.title)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};