import React, { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../../hooks/useNotification';
import { groupsAPI } from '../../services/api/groups';
import { projectsAPI } from '../../services/api/projects';
import { tasksAPI } from '../../services/api/tasks';
import { BoardView } from './components/BoardView/BoardView';
import { BoardFilters } from './components/BoardFilters/BoardFilters';
import { QuickTaskForm } from './components/QuickTaskForm/QuickTaskForm';
import { Button } from '../../components/ui/Button';
import { handleApiError } from '../../utils/helpers';
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
  const [filters, setFilters] = useState({
    assignee: '',
    priority: '',
    tags: ''
  });

  const loadGroups = useCallback(async () => {
    try {
      const userGroups = await groupsAPI.getMyGroups();
      setGroups(userGroups);
      if (userGroups.length > 0 && !selectedGroup) {
        setSelectedGroup(userGroups[0]);
      }
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить группы: ${errorMessage}`);
    }
  }, [selectedGroup, showError]);

  const loadProjects = useCallback(async () => {
    if (!selectedGroup) return;
    
    try {
      const userProjects = await projectsAPI.getMyProjects();
      const groupProjects = userProjects.filter(project => 
        project.groups.some(group => group.id === selectedGroup.id)
      );
      setProjects(groupProjects);
      if (groupProjects.length > 0 && !selectedProject) {
        setSelectedProject(groupProjects[0]);
      }
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить проекты: ${errorMessage}`);
    }
  }, [selectedGroup, selectedProject, showError]);

  const loadBoardTasks = useCallback(async () => {
    if (!selectedProject || !selectedGroup) return;
    
    setLoading(true);
    try {
      const boardTasks = await tasksAPI.getProjectBoard(
        selectedProject.id,
        selectedGroup.id,
        viewMode
      );
      setTasks(boardTasks);
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось загрузить задачи: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedGroup, viewMode, showError]);

  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      await tasksAPI.updateTaskStatus(taskId, newStatus);
      await loadBoardTasks();
      showSuccess('Статус задачи обновлен');
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить статус: ${errorMessage}`);
    }
  };

  const handleTaskPositionChange = async (taskId, newPosition) => {
    try {
      await tasksAPI.updateTaskPosition(taskId, newPosition);
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
      await tasksAPI.quickCreateTask(taskData);
      setShowQuickTaskForm(false);
      await loadBoardTasks();
      showSuccess('Задача создана');
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
      <div className={styles.controlPanel}>
        <div className={styles.controlsGroup}>
          <div className={styles.controlItem}>
            <label className={styles.controlLabel}>Группа:</label>
            <select 
              value={selectedGroup?.id || ''}
              onChange={(e) => setSelectedGroup(groups.find(g => g.id === parseInt(e.target.value)))}
              className={styles.controlSelect}
            >
              <option value="">Выберите группу</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlItem}>
            <label className={styles.controlLabel}>Проект:</label>
            <select 
              value={selectedProject?.id || ''}
              onChange={(e) => setSelectedProject(projects.find(p => p.id === parseInt(e.target.value)))}
              className={styles.controlSelect}
            >
              <option value="">Выберите проект</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlItem}>
            <label className={styles.controlLabel}>Режим:</label>
            <select 
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className={styles.controlSelect}
            >
              <option value={BOARD_VIEW_MODES.TEAM}>Команда</option>
              <option value={BOARD_VIEW_MODES.PERSONAL}>Личный</option>
            </select>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <BoardFilters 
            filters={filters}
            onFiltersChange={setFilters}
            tasks={tasks}
          />
          
          <Button
            variant="primary"
            onClick={() => setShowQuickTaskForm(true)}
            disabled={!selectedProject || !selectedGroup}
          >
            + Создать задачу
          </Button>
        </div>
      </div>

      <div className={styles.boardArea}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Загрузка доски...</p>
          </div>
        ) : selectedProject && selectedGroup ? (
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
            <div className={styles.emptyIcon}>📋</div>
            <h3>Выберите группу и проект</h3>
            <p>Для отображения доски выберите группу и проект из выпадающих списков выше</p>
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