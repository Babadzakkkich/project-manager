import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Filter,
  Kanban,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';

import { useNotification } from '../../hooks/useNotification';
import { groupsAPI } from '../../services/api/groups';
import { projectsAPI } from '../../services/api/projects';
import { tasksAPI } from '../../services/api/tasks';
import { BoardView } from './components/BoardView/BoardView';
import { BoardFilters } from './components/BoardFilters/BoardFilters';
import { QuickTaskForm } from './components/QuickTaskForm/QuickTaskForm';
import { Button } from '../../components/ui/Button';
import {
  formatRussianCount,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../utils/helpers';
import { BOARD_VIEW_MODES } from '../../utils/constants';
import styles from './ManagementBoard.module.css';

export const ManagementBoard = () => {
  const { showError, showSuccess } = useNotification();

  const [groups, setGroups] = useState([]);
  const [projects, setProjects] = useState([]);

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  const [viewMode, setViewMode] = useState(BOARD_VIEW_MODES.TEAM);
  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(false);
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    assignee: '',
    priority: '',
    tags: '',
  });

  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(Boolean).length;
  }, [filters]);

  const hasBoardContext = Boolean(selectedGroup && selectedProject);

  const loadGroups = useCallback(async () => {
    try {
      const userGroups = await groupsAPI.getMyGroups();
      const safeGroups = Array.isArray(userGroups) ? userGroups : [];

      setGroups(safeGroups);

      if (safeGroups.length > 0 && !selectedGroup) {
        setSelectedGroup(safeGroups[0]);
      }
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить группы: ${errorMessage}`);
    }
  }, [selectedGroup, showError]);

  const loadProjects = useCallback(async () => {
    if (!selectedGroup) {
      setProjects([]);
      setSelectedProject(null);
      return;
    }

    try {
      const userProjects = await projectsAPI.getMyProjects();
      const safeProjects = Array.isArray(userProjects) ? userProjects : [];

      const groupProjects = safeProjects.filter((project) =>
        project.groups?.some((group) => group.id === selectedGroup.id)
      );

      setProjects(groupProjects);

      const selectedProjectStillAvailable = groupProjects.some(
        (project) => project.id === selectedProject?.id
      );

      if (selectedProject && !selectedProjectStillAvailable) {
        setSelectedProject(null);
      }

      if (groupProjects.length > 0 && (!selectedProject || !selectedProjectStillAvailable)) {
        setSelectedProject(groupProjects[0]);
      }
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить проекты: ${errorMessage}`);
    }
  }, [selectedGroup, selectedProject, showError]);

  const loadBoardTasks = useCallback(async () => {
    if (!selectedProject || !selectedGroup) {
      setTasks([]);
      return;
    }

    setLoading(true);

    try {
      const boardTasks = await tasksAPI.getProjectBoard(
        selectedProject.id,
        selectedGroup.id,
        viewMode
      );

      setTasks(Array.isArray(boardTasks) ? boardTasks : []);
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить задачи: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedGroup, viewMode, showError]);

  const handleGroupChange = (groupId) => {
    const group = groups.find((item) => item.id === Number(groupId)) || null;

    setSelectedGroup(group);
    setSelectedProject(null);
    setTasks([]);
    setShowFilters(false);
    setFilters({
      assignee: '',
      priority: '',
      tags: '',
    });
  };

  const handleProjectChange = (projectId) => {
    const project = projects.find((item) => item.id === Number(projectId)) || null;

    setSelectedProject(project);
    setTasks([]);
    setShowFilters(false);
    setFilters({
      assignee: '',
      priority: '',
      tags: '',
    });
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setShowFilters(false);
  };

  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      const statusValue = typeof newStatus === 'object' ? newStatus.value : newStatus;

      await tasksAPI.updateTaskStatus(taskId, statusValue);

      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.id === taskId
            ? { ...task, status: statusValue }
            : task
        )
      );

      showSuccess('Статус задачи обновлён');
    } catch (err) {
      console.error('Error updating task status:', err);

      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить статус: ${errorMessage}`);
    }
  };

  const handleTaskPositionChange = async (taskId, newPosition) => {
    try {
      await tasksAPI.updateTaskPosition(taskId, newPosition);

      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.id === taskId
            ? { ...task, position: newPosition }
            : task
        )
      );
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить позицию: ${errorMessage}`);
    }
  };

  const handleBulkUpdate = async (updates) => {
    try {
      await tasksAPI.bulkUpdateTasks(updates);
      await loadBoardTasks();

      showSuccess('Задачи обновлены');
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить задачи: ${errorMessage}`);
    }
  };

  const handleQuickTaskCreate = async (taskData) => {
    try {
      const { assignee_ids, ...baseTaskData } = taskData;

      if (Array.isArray(assignee_ids) && assignee_ids.length > 0) {
        await tasksAPI.createForUsers({
          ...baseTaskData,
          assignee_ids,
        });

        showSuccess(
          assignee_ids.length > 1
            ? `Задача создана для ${assignee_ids.length} пользователей`
            : 'Задача создана и назначена исполнителю'
        );
      } else {
        await tasksAPI.quickCreateTask(baseTaskData);
        showSuccess('Задача создана');
      }

      setShowQuickTaskForm(false);
      await loadBoardTasks();
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось создать задачу: ${errorMessage}`);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadBoardTasks();
  }, [loadBoardTasks]);

  return (
    <div className={styles.managementBoard}>
      <div className={styles.toolbar}>
        <div className={styles.controlsGroup}>
          <div className={styles.controlItem}>
            <label className={styles.controlLabel} htmlFor="board-group">
              Группа
            </label>

            <select
              id="board-group"
              value={selectedGroup?.id || ''}
              onChange={(e) => handleGroupChange(e.target.value)}
              className={styles.controlSelect}
            >
              <option value="">Выберите группу</option>

              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlItem}>
            <label className={styles.controlLabel} htmlFor="board-project">
              Проект
            </label>

            <select
              id="board-project"
              value={selectedProject?.id || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={styles.controlSelect}
              disabled={!selectedGroup}
            >
              <option value="">
                {selectedGroup ? 'Выберите проект' : 'Сначала выберите группу'}
              </option>

              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>

          <div className={`${styles.controlItem} ${styles.modeControl}`}>
            <label className={styles.controlLabel} htmlFor="board-mode">
              Режим
            </label>

            <select
              id="board-mode"
              value={viewMode}
              onChange={(e) => handleViewModeChange(e.target.value)}
              className={styles.controlSelect}
            >
              <option value={BOARD_VIEW_MODES.TEAM}>Команда</option>
              <option value={BOARD_VIEW_MODES.PERSONAL}>Личный</option>
            </select>
          </div>

          <div className={styles.boardMeta}>
            <Kanban size={16} strokeWidth={2} aria-hidden="true" />

            <span>
              {hasBoardContext
                ? formatRussianCount(tasks.length, RUSSIAN_PLURAL_FORMS.TASK)
                : 'Доска не выбрана'}
            </span>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            type="button"
            className={`${styles.filterButton} ${
              showFilters || activeFiltersCount > 0 ? styles.active : ''
            }`}
            onClick={() => setShowFilters((value) => !value)}
            disabled={!hasBoardContext}
          >
            <Filter size={16} strokeWidth={2} aria-hidden="true" />
            Фильтры

            {activeFiltersCount > 0 && (
              <span className={styles.filterCounter}>
                {activeFiltersCount}
              </span>
            )}
          </button>

          <Button
            variant="secondary"
            size="medium"
            onClick={loadBoardTasks}
            disabled={!hasBoardContext || loading}
          >
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
            Обновить
          </Button>

          <Button
            variant="primary"
            size="medium"
            onClick={() => setShowQuickTaskForm(true)}
            disabled={!hasBoardContext}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Создать задачу
          </Button>
        </div>

        {showFilters && hasBoardContext && (
          <div className={styles.filtersPanel}>
            <div className={styles.filtersHeader}>
              <span>Фильтры доски</span>

              <button
                type="button"
                className={styles.closeFiltersButton}
                onClick={() => setShowFilters(false)}
                aria-label="Закрыть фильтры"
              >
                <X size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <BoardFilters
              filters={filters}
              onFiltersChange={setFilters}
              tasks={tasks}
            />
          </div>
        )}
      </div>

      <div className={styles.boardArea}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Загрузка доски...</p>
          </div>
        ) : hasBoardContext ? (
          <BoardView
            tasks={tasks}
            onTaskStatusChange={handleTaskStatusChange}
            onTaskPositionChange={handleTaskPositionChange}
            onBulkUpdate={handleBulkUpdate}
            viewMode={viewMode}
            filters={filters}
          />
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Kanban size={42} strokeWidth={1.8} aria-hidden="true" />
            </div>

            <div>
              <h3>Выберите группу и проект</h3>
              <p>После выбора контекста здесь сразу появится kanban-доска.</p>
            </div>
          </div>
        )}
      </div>

      {showQuickTaskForm && (
        <QuickTaskForm
          project={selectedProject}
          group={selectedGroup}
          onSubmit={handleQuickTaskCreate}
          onClose={() => setShowQuickTaskForm(false)}
        />
      )}
    </div>
  );
};