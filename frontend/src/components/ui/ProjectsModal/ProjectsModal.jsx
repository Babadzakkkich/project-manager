import React, { useState, useMemo, useEffect } from 'react';
import { FilterSort } from '../FilterSort';
import { ProjectCard } from '../ProjectCard';
import { projectsAPI } from '../../../services/api/projects';
import styles from './ProjectsModal.module.css';

export const ProjectsModal = ({
  projects = [],
  isOpen = false,
  onClose,
  title = "Проекты группы"
}) => {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const [projectsWithDetails, setProjectsWithDetails] = useState([]);
  const [loading, setLoading] = useState(false);

  // Опции фильтрации для проектов
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

  // Опции сортировки для проектов
  const sortOptions = [
    { value: 'title_asc', label: 'По названию (А-Я)' },
    { value: 'title_desc', label: 'По названию (Я-А)' },
    { value: 'start_date_desc', label: 'Сначала новые' },
    { value: 'start_date_asc', label: 'Сначала старые' },
    { value: 'end_date_asc', label: 'Ближайшие сроки' },
    { value: 'end_date_desc', label: 'Дальние сроки' }
  ];

  // Загрузка деталей проектов при открытии модального окна
  useEffect(() => {
    const loadProjectDetails = async () => {
      if (!isOpen || projects.length === 0) {
        setProjectsWithDetails([]);
        return;
      }

      setLoading(true);
      try {
        // Загружаем детали каждого проекта с группами
        const projectsDetails = await Promise.all(
          projects.map(async (project) => {
            try {
              // Загружаем полную информацию о проекте с группами
              const projectDetails = await projectsAPI.getById(project.id);
              return projectDetails;
            } catch (error) {
              console.error(`Error loading project ${project.id}:`, error);
              // В случае ошибки возвращаем исходный проект
              return {
                ...project,
                groups: [],
                tasks: []
              };
            }
          })
        );
        
        setProjectsWithDetails(projectsDetails);
      } catch (error) {
        console.error('Error loading project details:', error);
        // В случае общей ошибки используем исходные проекты
        setProjectsWithDetails(projects.map(project => ({
          ...project,
          groups: [],
          tasks: []
        })));
      } finally {
        setLoading(false);
      }
    };

    loadProjectDetails();
  }, [isOpen, projects]);

  // Сброс данных при закрытии модального окна
  useEffect(() => {
    if (!isOpen) {
      setProjectsWithDetails([]);
      setFilters({});
      setSort('');
    }
  }, [isOpen]);

  // Фильтрация и сортировка проектов
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projectsWithDetails];

    // Применяем фильтры
    if (filters.status) {
      result = result.filter(project => project.status === filters.status);
    }

    // Применяем сортировку
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
  }, [projectsWithDetails, filters, sort]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Загрузка проектов...</p>
            </div>
          ) : (
            <>
              <FilterSort
                filters={filterOptions}
                sortOptions={sortOptions}
                selectedFilters={filters}
                selectedSort={sort}
                onFilterChange={setFilters}
                onSortChange={setSort}
                className={styles.filterSort}
              />

              <div className={styles.projectsInfo}>
                <span className={styles.projectsCount}>
                  Найдено проектов: {filteredAndSortedProjects.length}
                </span>
              </div>

              {filteredAndSortedProjects.length === 0 ? (
                <div className={styles.emptyState}>
                  {Object.keys(filters).length > 0 ? (
                    <>
                      <h3>Проекты не найдены</h3>
                      <p>Попробуйте изменить параметры фильтрации</p>
                      <button 
                        onClick={() => setFilters({})}
                        className={styles.clearFiltersButton}
                      >
                        Сбросить фильтры
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>Проектов пока нет</h3>
                      <p>В этой группе еще не создано ни одного проекта</p>
                    </>
                  )}
                </div>
              ) : (
                <div className={styles.projectsGrid}>
                  {filteredAndSortedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      showDetailsButton={true}
                      compact={false}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};