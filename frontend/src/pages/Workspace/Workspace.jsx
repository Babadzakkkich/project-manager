import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ProjectCard } from '../../components/ui/ProjectCard';
import { TaskCard } from '../../components/ui/TaskCard';
import { projectsAPI } from '../../services/api/projects';
import { tasksAPI } from '../../services/api/tasks';
import { useNotification } from '../../hooks/useNotification';
import { handleApiError } from '../../utils/helpers';
import plusIcon from '../../assets/plus_icon.svg';
import styles from './Workspace.module.css';
import { ClipboardList, FolderOpen } from 'lucide-react';

export const Workspace = () => {
  const { showError } = useNotification();
  
  const [recentProjects, setRecentProjects] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadRecentProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      
      const projects = await projectsAPI.getMyProjects();
      
      const recent = projects
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3);
      
      setRecentProjects(recent);
      
    } catch (err) {
      console.error('Error loading recent projects:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить проекты: ${errorMessage}`);
      setRecentProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [showError]);

  const loadRecentTasks = useCallback(async () => {
    try {
      setTasksLoading(true);
      
      const tasks = await tasksAPI.getMyTasks();
      
      const recent = tasks
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
      
      setRecentTasks(recent);
      
    } catch (err) {
      console.error('Error loading recent tasks:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить задачи: ${errorMessage}`);
    } finally {
      setTasksLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadRecentProjects(), loadRecentTasks()]);
      setLoading(false);
    };

    loadData();
  }, [loadRecentProjects, loadRecentTasks]);

  if (loading) {
    return (
      <div className={styles.workspace}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Загрузка рабочего пространства...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <h1 className={styles.title}>Рабочее пространство</h1>
        <p className={styles.subtitle}>Добро пожаловать в ваш личный кабинет</p>
      </div>

      <div className={styles.container}>
        <div className={styles.leftColumn}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Быстрые действия</h2>
            
            <div className={styles.actionsGrid}>
              <Button
                to="/groups/create"
                variant="action"
                className={styles.actionButton}
              >
                <div className={styles.actionContent}>
                  <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                  <span className={styles.actionText}>Создать группу</span>
                </div>
              </Button>
              
              <Button
                to="/projects/create"
                variant="action"
                className={styles.actionButton}
              >
                <div className={styles.actionContent}>
                  <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                  <span className={styles.actionText}>Создать проект</span>
                </div>
              </Button>
              
              <Button
                to="/tasks/create"
                variant="action"
                className={styles.actionButton}
              >
                <div className={styles.actionContent}>
                  <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                  <span className={styles.actionText}>Создать задачу</span>
                </div>
              </Button>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Быстрые ссылки</h2>
            <div className={styles.quickLinks}>
              <Link to="/groups" className={styles.quickLink}>
                <div className={styles.quickLinkContent}>
                  <span className={styles.quickLinkText}>Мои группы</span>
                  <span className={styles.quickLinkArrow}>→</span>
                </div>
              </Link>
              <Link to="/projects" className={styles.quickLink}>
                <div className={styles.quickLinkContent}>
                  <span className={styles.quickLinkText}>Мои проекты</span>
                  <span className={styles.quickLinkArrow}>→</span>
                </div>
              </Link>
              <Link to="/tasks" className={styles.quickLink}>
                <div className={styles.quickLinkContent}>
                  <span className={styles.quickLinkText}>Мои задачи</span>
                  <span className={styles.quickLinkArrow}>→</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.rightColumn}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Мои проекты</h2>
              {recentProjects.length > 0 && (
                <Link to="/projects" className={styles.viewAllLink}>
                  Посмотреть все →
                </Link>
              )}
            </div>
            
            <div className={styles.recentContent}>
              {projectsLoading ? (
                <div className={styles.loadingState}>
                  <div className={styles.smallSpinner}></div>
                  <span>Загрузка проектов...</span>
                </div>
              ) : recentProjects.length > 0 ? (
                <div className={styles.projectsGrid}>
                  {recentProjects.map((project) => (
                    <div key={project.id} className={styles.projectItem}>
                      <ProjectCard
                        project={project}
                        showDetailsButton={true}
                        compact={true}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <FolderOpen size={48} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <p className={styles.emptyTitle}>Пока нет проектов</p>
                  <p className={styles.emptyDescription}>
                    Создайте свой первый проект, чтобы начать работу
                  </p>
                  <Button
                    to="/projects/create"
                    variant="primary"
                    size="small"
                  >
                    Создать проект
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Мои задачи</h2>
              {recentTasks.length > 0 && (
                <Link to="/tasks" className={styles.viewAllLink}>
                  Посмотреть все →
                </Link>
              )}
            </div>
            
            <div className={styles.recentContent}>
              {tasksLoading ? (
                <div className={styles.loadingState}>
                  <div className={styles.smallSpinner}></div>
                  <span>Загрузка задач...</span>
                </div>
              ) : recentTasks.length > 0 ? (
                <div className={styles.tasksList}>
                  {recentTasks.map((task) => (
                    <div key={task.id} className={styles.taskItem}>
                      <TaskCard
                        task={task}
                        showDetailsButton={true}
                        compact={true}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <ClipboardList size={48} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <p className={styles.emptyTitle}>Пока нет задач</p>
                  <p className={styles.emptyDescription}>
                    Создайте первую задачу для ваших проектов
                  </p>
                  <Button
                    to="/tasks/create"
                    variant="primary"
                    size="small"
                  >
                    Создать задачу
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};