import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Users,
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { ProjectCard } from '../../components/ui/ProjectCard';
import { TaskCard } from '../../components/ui/TaskCard';
import { projectsAPI } from '../../services/api/projects';
import { tasksAPI } from '../../services/api/tasks';
import { useAuthContext } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import {
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../utils/helpers';
import { isTaskOverdue } from '../../utils/taskStatus';
import styles from './Workspace.module.css';

const PROJECT_ACTIVE_STATUSES = ['planned', 'in_progress', 'on_hold'];
const PROJECT_DONE_STATUSES = ['completed'];
const TASK_DONE_STATUSES = ['done', 'completed'];
const TASK_CANCELLED_STATUSES = ['cancelled'];

const QUICK_ACTIONS = [
  {
    to: '/groups/create',
    title: 'Создать группу',
    description: 'Добавить команду и распределить роли',
    icon: Users,
  },
  {
    to: '/projects/create',
    title: 'Создать проект',
    description: 'Задать сроки и связать проект с группами',
    icon: FolderKanban,
  },
  {
    to: '/tasks/create',
    title: 'Создать задачу',
    description: 'Назначить исполнителей и дедлайн',
    icon: ClipboardList,
  },
];

const getDateMs = (value) => {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const Workspace = () => {
  const { user } = useAuthContext();
  const { showError } = useNotification();

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);

      const projectsData = await projectsAPI.getMyProjects();
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (err) {
      console.error('Error loading recent projects:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить проекты: ${errorMessage}`);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [showError]);

  const loadTasks = useCallback(async () => {
    try {
      setTasksLoading(true);

      const tasksData = await tasksAPI.getMyTasks();
      setTasks(Array.isArray(tasksData) ? tasksData : []);
    } catch (err) {
      console.error('Error loading recent tasks:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить задачи: ${errorMessage}`);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadProjects(), loadTasks()]);
      setLoading(false);
    };

    loadData();
  }, [loadProjects, loadTasks]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => getDateMs(b.created_at) - getDateMs(a.created_at))
      .slice(0, 3);
  }, [projects]);

  const recentTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => getDateMs(b.created_at) - getDateMs(a.created_at))
      .slice(0, 5);
  }, [tasks]);

  const stats = useMemo(() => {
    const activeProjects = projects.filter(project =>
      PROJECT_ACTIVE_STATUSES.includes(project.status)
    ).length;

    const completedProjects = projects.filter(project =>
      PROJECT_DONE_STATUSES.includes(project.status)
    ).length;

    const activeTasks = tasks.filter(task =>
      !TASK_DONE_STATUSES.includes(task.status) &&
      !TASK_CANCELLED_STATUSES.includes(task.status)
    ).length;

    const overdueTasks = tasks.filter(task =>
      isTaskOverdue(task.deadline, task.status)
    ).length;

    return {
      activeProjects,
      completedProjects,
      activeTasks,
      overdueTasks,
    };
  }, [projects, tasks]);

  const userName = user?.name || user?.login || 'пользователь';

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
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>
            Добро пожаловать, {userName}
          </h1>

          <p className={styles.subtitle}>
            Здесь собраны быстрые действия, последние проекты и актуальные задачи.
            Используйте рабочую область как отправную точку для ежедневной работы.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Button to="/tasks/create" variant="primary" size="medium">
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Создать задачу
          </Button>

          <Button to="/management" variant="secondary" size="medium">
            Открыть доску
            <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </section>

      <section className={styles.statsGrid} aria-label="Краткая сводка">
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

        <article className={styles.statCard}>
          <span className={styles.statValue}>{stats.activeTasks}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.activeTasks, RUSSIAN_PLURAL_FORMS.TASK)} в работе
          </span>
        </article>

        <article className={`${styles.statCard} ${stats.overdueTasks > 0 ? styles.warningCard : ''}`}>
          <span className={styles.statValue}>{stats.overdueTasks}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(stats.overdueTasks, [
              'задача просрочена',
              'задачи просрочены',
              'задач просрочено',
            ])}
          </span>
        </article>
      </section>

      <div className={styles.layoutGrid}>
        <aside className={styles.sidebarColumn}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Быстрые действия</h2>
                <p className={styles.sectionSubtitle}>
                  Создавайте основные сущности без перехода по меню.
                </p>
              </div>
            </div>

            <div className={styles.actionsGrid}>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;

                return (
                  <Link key={action.to} to={action.to} className={styles.actionCard}>
                    <span className={styles.actionIcon}>
                      <Icon size={22} strokeWidth={2} aria-hidden="true" />
                    </span>

                    <span className={styles.actionText}>
                      <span className={styles.actionTitle}>{action.title}</span>
                      <span className={styles.actionDescription}>{action.description}</span>
                    </span>

                    <ArrowRight size={17} strokeWidth={2} className={styles.actionArrow} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>

        <main className={styles.contentColumn}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Последние проекты</h2>
                <p className={styles.sectionSubtitle}>
                  Недавно созданные или обновлённые проектные работы.
                </p>
              </div>

              {projects.length > 0 && (
                <Link to="/projects" className={styles.viewAllLink}>
                  Все проекты
                  <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
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
                    <ProjectCard
                      key={project.id}
                      project={project}
                      showDetailsButton
                      compact
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <FolderKanban size={42} strokeWidth={1.8} aria-hidden="true" />
                  </div>

                  <p className={styles.emptyTitle}>Пока нет проектов</p>
                  <p className={styles.emptyDescription}>
                    Создайте первый проект и свяжите его с рабочими группами.
                  </p>

                  <Button to="/projects/create" variant="primary" size="small">
                    Создать проект
                  </Button>
                </div>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Последние задачи</h2>
                <p className={styles.sectionSubtitle}>
                  Актуальные задачи, отсортированные по времени создания.
                </p>
              </div>

              {tasks.length > 0 && (
                <Link to="/tasks" className={styles.viewAllLink}>
                  Все задачи
                  <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
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
                    <TaskCard
                      key={task.id}
                      task={task}
                      showDetailsButton
                      compact
                      currentUserId={user?.id}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <ClipboardList size={42} strokeWidth={1.8} aria-hidden="true" />
                  </div>

                  <p className={styles.emptyTitle}>Пока нет задач</p>
                  <p className={styles.emptyDescription}>
                    Создайте задачу, назначьте исполнителей и установите срок выполнения.
                  </p>

                  <Button to="/tasks/create" variant="primary" size="small">
                    Создать задачу
                  </Button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};