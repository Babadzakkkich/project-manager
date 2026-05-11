import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';

import { projectsAPI } from '../../../services/api/projects';
import { Button } from '../../../components/ui/Button';
import { FilterSort } from '../../../components/ui/FilterSort';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_STATUS_TRANSLATIONS,
} from '../../../utils/constants';
import {
  formatRussianCount,
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './Projects.module.css';

const ACTIVE_PROJECT_STATUSES = ['planned', 'in_progress', 'on_hold'];
const COMPLETED_PROJECT_STATUSES = ['completed'];
const CANCELLED_PROJECT_STATUSES = ['cancelled'];

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const isProjectOverdue = (project) => {
  if (!project?.end_date) return false;

  if (
    COMPLETED_PROJECT_STATUSES.includes(project.status) ||
    CANCELLED_PROJECT_STATUSES.includes(project.status)
  ) {
    return false;
  }

  const deadline = new Date(project.end_date);
  const today = new Date();

  if (Number.isNaN(deadline.getTime())) return false;

  deadline.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return deadline < today;
};

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
      options: PROJECT_STATUS_OPTIONS,
    },
  ];

  const sortOptions = [
    { value: 'title_asc', label: 'По названию (А-Я)' },
    { value: 'title_desc', label: 'По названию (Я-А)' },
    { value: 'start_date_desc', label: 'Сначала новые' },
    { value: 'start_date_asc', label: 'Сначала старые' },
    { value: 'end_date_asc', label: 'Ближайшие сроки' },
    { value: 'end_date_desc', label: 'Дальние сроки' },
    { value: 'status', label: 'По статусу' },
  ];

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const projectsData = await projectsAPI.getMyProjects();
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setError(handleApiError(err));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDeleteProject = async (projectId) => {
    try {
      await projectsAPI.delete(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(handleApiError(err));
    }
  };

  const getUserRoleInProject = useCallback((project) => {
    if (!user || !project.groups) return 'member';

    for (const group of project.groups) {
      const userInGroup = group.users?.find((groupUser) => groupUser.id === user.id);

      if (userInGroup) {
        return userInGroup.role;
      }
    }

    return 'member';
  }, [user]);

  const isUserAdminInProject = useCallback((project) => {
    const role = getUserRoleInProject(project);
    return role === 'admin' || role === 'super_admin';
  }, [getUserRoleInProject]);

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    if (filters.status) {
      result = result.filter((project) => project.status === filters.status);
    }

    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) =>
            String(a.title || '').localeCompare(String(b.title || ''), 'ru-RU')
          );
          break;

        case 'title_desc':
          result.sort((a, b) =>
            String(b.title || '').localeCompare(String(a.title || ''), 'ru-RU')
          );
          break;

        case 'start_date_desc':
          result.sort((a, b) => getDateMs(b.start_date) - getDateMs(a.start_date));
          break;

        case 'start_date_asc':
          result.sort((a, b) => getDateMs(a.start_date) - getDateMs(b.start_date));
          break;

        case 'end_date_asc':
          result.sort((a, b) => getDateMs(a.end_date) - getDateMs(b.end_date));
          break;

        case 'end_date_desc':
          result.sort((a, b) => getDateMs(b.end_date) - getDateMs(a.end_date));
          break;

        case 'status':
          result.sort((a, b) =>
            String(PROJECT_STATUS_TRANSLATIONS[a.status] || a.status || '')
              .localeCompare(
                String(PROJECT_STATUS_TRANSLATIONS[b.status] || b.status || ''),
                'ru-RU'
              )
          );
          break;

        default:
          break;
      }
    }

    return result;
  }, [projects, filters, sort]);

  const stats = useMemo(() => {
    const activeProjects = projects.filter((project) =>
      ACTIVE_PROJECT_STATUSES.includes(project.status)
    ).length;

    const completedProjects = projects.filter((project) =>
      COMPLETED_PROJECT_STATUSES.includes(project.status)
    ).length;

    const overdueProjects = projects.filter(isProjectOverdue).length;

    const linkedGroups = projects.reduce(
      (total, project) => total + (project.groups?.length || project.groups_count || 0),
      0
    );

    return {
      totalProjects: projects.length,
      activeProjects,
      completedProjects,
      overdueProjects,
      linkedGroups,
    };
  }, [projects]);

  const hasActiveFilters = Object.keys(filters).some((key) => filters[key]);
  const selectedStatusLabel = filters.status
    ? PROJECT_STATUS_TRANSLATIONS[filters.status] || filters.status
    : '';

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
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Не удалось загрузить проекты</h2>
        <p>{error}</p>

        <Button onClick={loadProjects} variant="primary">
          Попробовать снова
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>Проекты</h1>

          <p className={styles.subtitle}>
            Управляйте проектами, сроками, статусами, связанными группами и задачами.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Button to="/projects/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать проект
          </Button>
        </div>
      </section>

      <section className={styles.statsGrid} aria-label="Сводка по проектам">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalProjects}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.totalProjects, RUSSIAN_PLURAL_FORMS.PROJECT)} всего
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{stats.activeProjects}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.activeProjects, RUSSIAN_PLURAL_FORMS.PROJECT)} в работе
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{stats.completedProjects}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.completedProjects, [
              'завершённый проект',
              'завершённых проекта',
              'завершённых проектов',
            ])}
          </span>
        </article>

        <article
          className={`${styles.statCard} ${
            stats.overdueProjects > 0 ? styles.warningCard : ''
          }`}
        >
          <span className={styles.statValue}>{stats.overdueProjects}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.overdueProjects, [
              'проект просрочен',
              'проекта просрочены',
              'проектов просрочено',
            ])}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{stats.linkedGroups}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.linkedGroups, RUSSIAN_PLURAL_FORMS.GROUP)} связано
          </span>
        </article>
      </section>

      {(projects.length > 0 || hasActiveFilters) && (
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

      <div className={styles.projectsInfo}>
        <span className={styles.projectsCount}>
          Найдено: {formatRussianCount(
            filteredAndSortedProjects.length,
            RUSSIAN_PLURAL_FORMS.PROJECT
          )}
        </span>

        {filters.status && (
          <span className={styles.activeFilter}>
            Статус: {selectedStatusLabel}
          </span>
        )}
      </div>

      {filteredAndSortedProjects.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FolderKanban size={42} strokeWidth={1.8} aria-hidden="true" />
          </div>

          {hasActiveFilters ? (
            <>
              <h2>Проекты не найдены</h2>
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
              <h2>У вас пока нет проектов</h2>
              <p>
                Создайте первый проект, укажите сроки и свяжите его с рабочими группами.
              </p>

              <Button to="/projects/create" variant="primary" size="medium">
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Создать проект
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className={styles.projectsGrid}>
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              userRole={getUserRoleInProject(project)}
              showDetailsButton
              showDeleteButton={isUserAdminInProject(project)}
              onDelete={() => handleDeleteProject(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};