import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FolderKanban,
  Plus,
  RotateCcw,
} from 'lucide-react';

import { projectsAPI } from '../../../services/api/projects';
import { Button } from '../../../components/ui/Button';
import { ProjectCard } from '../../../components/ui/ProjectCard';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_STATUS_TRANSLATIONS,
} from '../../../utils/constants';
import {
  formatRussianCount,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './Projects.module.css';

const SORT_OPTIONS = [
  { value: 'title_asc', label: 'По названию (А-Я)' },
  { value: 'title_desc', label: 'По названию (Я-А)' },
  { value: 'start_date_desc', label: 'Сначала новые' },
  { value: 'start_date_asc', label: 'Сначала старые' },
  { value: 'end_date_asc', label: 'Ближайшие сроки' },
  { value: 'end_date_desc', label: 'Дальние сроки' },
  { value: 'status', label: 'По статусу' },
];

const compareText = (a = '', b = '') => {
  return String(a || '').localeCompare(String(b || ''), 'ru-RU');
};

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');

  const { user } = useAuthContext();

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
    return role === 'admin';
  }, [getUserRoleInProject]);

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    if (filters.status) {
      result = result.filter((project) => project.status === filters.status);
    }

    if (sort) {
      switch (sort) {
        case 'title_asc':
          result.sort((a, b) => compareText(a.title, b.title));
          break;

        case 'title_desc':
          result.sort((a, b) => compareText(b.title, a.title));
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
            compareText(
              PROJECT_STATUS_TRANSLATIONS[a.status] || a.status,
              PROJECT_STATUS_TRANSLATIONS[b.status] || b.status
            )
          );
          break;

        default:
          break;
      }
    }

    return result;
  }, [projects, filters, sort]);

  const hasActiveFilters = Object.keys(filters).some((key) => filters[key] && filters[key] !== '');
  const hasActiveControls = hasActiveFilters || Boolean(sort);
  const showSidebar = projects.length > 0 || hasActiveControls;
  const selectedStatusLabel = filters.status
    ? PROJECT_STATUS_TRANSLATIONS[filters.status] || filters.status
    : '';

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
      <header className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Проекты</h1>
          <p className={styles.subtitle}>
            Проекты, сроки, статусы и связь с рабочими группами.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button to="/projects/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать проект
          </Button>
        </div>
      </header>

      <div className={`${styles.workspaceLayout} ${!showSidebar ? styles.workspaceLayoutSingle : ''}`}>
        {showSidebar && (
          <aside className={styles.sidebar} aria-label="Фильтры проектов">
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
                  label: 'Статус',
                  value: filters.status || '',
                  onChange: (value) => setFilters((prev) => ({ ...prev, status: value })),
                  options: PROJECT_STATUS_OPTIONS,
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

        <main className={styles.projectsPanel}>
          <div className={styles.listHeader}>
            <span className={styles.listCount}>
              Найдено: {formatRussianCount(
                filteredAndSortedProjects.length,
                RUSSIAN_PLURAL_FORMS.PROJECT
              )}
            </span>

            {selectedStatusLabel && (
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
                  <h2>У вас пока нет проектов</h2>
                  <p>Создайте первый проект, укажите сроки и свяжите его с рабочими группами.</p>

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
        </main>
      </div>
    </div>
  );
};
