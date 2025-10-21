import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { tasksAPI } from '../../../services/api/tasks';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { GroupCard } from '../../../components/ui/GroupCard';
import { TaskCard } from '../../../components/ui/TaskCard';
import { ItemsModal } from '../../../components/ui/ItemsModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { 
  handleApiError, 
  formatDate,
  formatDateForInput
} from '../../../utils/helpers';
import { 
  getProjectStatusTranslation, 
  getProjectStatusColor,
  PROJECT_STATUS_OPTIONS
} from '../../../utils/projectStatus';
import styles from './ProjectDetail.module.css';

export const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ 
    title: '', 
    description: '', 
    status: '',
    start_date: '',
    end_date: ''
  });
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [availableGroups, setAvailableGroups] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const { user } = useAuthContext();
  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const projectData = await projectsAPI.getById(projectId);
      
      const groupsWithDetails = await Promise.all(
        projectData.groups.map(async (group) => {
          try {
            const fullGroup = await groupsAPI.getById(group.id);
            return fullGroup;
          } catch (err) {
            console.error(`Error loading group ${group.id}:`, err);
            return { ...group, projects: [] };
          }
        })
      );
      
      const tasksWithDetails = await Promise.all(
        projectData.tasks.map(async (task) => {
          try {
            const fullTask = await tasksAPI.getById(task.id);
            return fullTask;
          } catch (err) {
            console.error(`Error loading task ${task.id}:`, err);
            return task;
          }
        })
      );
      
      setProject({
        ...projectData,
        groups: groupsWithDetails,
        tasks: tasksWithDetails
      });
      
      setEditForm({
        title: projectData.title,
        description: projectData.description || '',
        status: projectData.status,
        start_date: projectData.start_date ? formatDateForInput(new Date(projectData.start_date)) : '',
        end_date: projectData.end_date ? formatDateForInput(new Date(projectData.end_date)) : ''
      });
    } catch (err) {
      console.error('Error loading project:', err);
      const errorMessage = handleApiError(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadAvailableGroups = useCallback(async () => {
    try {
      const groupsData = await groupsAPI.getMyGroups();
      
      const adminGroups = groupsData.filter(group => 
        group.users?.some(u => u.id === user?.id && (u.role === 'admin' || u.role === 'super_admin'))
      );
      
      setAvailableGroups(adminGroups);
    } catch (err) {
      console.error('Error loading available groups:', err);
    }
  }, [user]);

  const determineUserRole = useCallback(() => {
    if (!project || !user) return '';
    
    const isAdminInAnyGroup = project.groups.some(group => 
      group.users?.some(u => u.id === user.id && (u.role === 'admin' || u.role === 'super_admin'))
    );
    
    return isAdminInAnyGroup ? 'admin' : 'member';
  }, [project, user]);

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadAvailableGroups();
    }
  }, [loadProject, loadAvailableGroups, projectId]);

  useEffect(() => {
    if (project) {
      const role = determineUserRole();
      setUserRole(role);
    }
  }, [project, determineUserRole]);

  const getDisplayGroups = useCallback(() => {
    if (!project?.groups) return [];
    
    return [...project.groups]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [project?.groups]);

  const getDisplayTasks = useCallback(() => {
    if (!project?.tasks) return [];
    
    return [...project.tasks]
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 3);
  }, [project?.tasks]);

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    try {
      const updateData = {
        ...editForm,
        start_date: editForm.start_date ? new Date(editForm.start_date).toISOString() : null,
        end_date: editForm.end_date ? new Date(editForm.end_date).toISOString() : null
      };
      
      await projectsAPI.update(projectId, updateData);
      
      await loadProject();
      
      setEditing(false);
      showSuccess('Проект успешно обновлен');
    } catch (err) {
      console.error('Error updating project:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось обновить проект: ${errorMessage}`);
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    try {
      await projectsAPI.addGroups(projectId, {
        group_ids: [parseInt(newGroupId)]
      });
      setNewGroupId('');
      setAddingGroup(false);
      await loadProject();
      await loadAvailableGroups();
      showSuccess('Группа успешно добавлена в проект');
    } catch (err) {
      console.error('Error adding group:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось добавить группу: ${errorMessage}`);
    }
  };

  const handleRemoveGroup = async (groupId, groupName) => {
    try {
      await projectsAPI.removeGroups(projectId, {
        group_ids: [groupId]
      });
      
      await loadProject();
      
      showSuccess(`Группа "${groupName}" удалена из проекта`);
    } catch (err) {
      console.error('Error removing group:', err);
      const errorMessage = handleApiError(err);
      
      if (err.response?.status === 400) {
        showError('Не удалось удалить группу из проекта. Возможно, группа уже была удалена или у вас недостаточно прав.');
      } else {
        showError(`Не удалось удалить группу из проекта: ${errorMessage}`);
      }
    }
  };

  const handleDeleteProjectClick = () => {
    setShowDeleteProjectModal(true);
  };

  const handleConfirmDeleteProject = async () => {
    setIsDeletingProject(true);
    try {
      await projectsAPI.delete(projectId);
      showSuccess(`Проект "${project.title}" успешно удален`);
      navigate('/projects');
    } catch (err) {
      console.error('Error deleting project:', err);
      const errorMessage = handleApiError(err);
      showError(`Не удалось удалить проект: ${errorMessage}`);
    } finally {
      setIsDeletingProject(false);
      setShowDeleteProjectModal(false);
    }
  };

  const handleDeleteTask = async (taskId, taskTitle) => {
    try {
      await tasksAPI.delete(taskId);
      
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.filter(task => task.id !== taskId)
      }));
      
      setShowTasksModal(false);
      
      showSuccess(`Задача "${taskTitle}" успешно удалена`);
    } catch (err) {
      console.error('Error deleting task:', err);
      const errorMessage = handleApiError(err);
      
      if (err.response?.status === 403) {
        showError('У вас нет прав для удаления этой задачи');
      } else {
        showError(`Не удалось удалить задачу: ${errorMessage}`);
      }
    }
  };

  const isAdmin = userRole === 'admin';
  const hasAccessToProject = project && project.groups?.some(group => 
    group.users?.some(u => u.id === user?.id)
  );

  const displayGroups = getDisplayGroups();
  const displayTasks = getDisplayTasks();
  const hasMoreGroups = project?.groups && project.groups.length > 3;
  const hasMoreTasks = project?.tasks && project.tasks.length > 3;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка проекта...</p>
      </div>
    );
  }

  if (error || !project || !hasAccessToProject) {
    return (
      <div className={styles.errorContainer}>
        <h2>Ошибка</h2>
        <p>{error || 'Проект не найден или у вас нет доступа'}</p>
        <Button onClick={() => navigate('/projects')}>Вернуться к проектам</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
        duration={5000}
      />

      <div className={styles.header}>
        <Button 
          variant="secondary" 
          onClick={() => navigate('/projects')}
          className={styles.backButton}
        >
          ← Назад к проектам
        </Button>
        
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            {editing ? (
              <form onSubmit={handleUpdateProject} className={styles.editForm}>
                <Input
                  label="Название проекта"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Название проекта"
                  required
                />
                <Input
                  label="Описание проекта"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Описание проекта"
                  multiline
                  rows={4}
                />
                <div className={styles.dateFields}>
                  <Input
                    label="Дата начала"
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm(prev => ({ ...prev, start_date: e.target.value }))}
                    required
                  />
                  <Input
                    label="Дата окончания"
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm(prev => ({ ...prev, end_date: e.target.value }))}
                    required
                  />
                </div>
                <div className={styles.statusSelect}>
                  <label>Статус:</label>
                  <select 
                    value={editForm.status} 
                    onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                  >
                    {PROJECT_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.editActions}>
                  <Button type="submit" variant="primary">Сохранить</Button>
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setEditing(false);
                      setEditForm({
                        title: project.title,
                        description: project.description || '',
                        status: project.status,
                        start_date: project.start_date ? formatDateForInput(new Date(project.start_date)) : '',
                        end_date: project.end_date ? formatDateForInput(new Date(project.end_date)) : ''
                      });
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.titleSection}>
                  <h1 className={styles.title}>{project.title}</h1>
                  <div className={styles.projectBadges}>
                    <div 
                      className={styles.statusBadge}
                      style={{ 
                        backgroundColor: getProjectStatusColor(project.status),
                        color: 'white'
                      }}
                    >
                      {getProjectStatusTranslation(project.status)}
                    </div>
                  </div>
                </div>
                
                {project.description && (
                  <div className={styles.descriptionSection}>
                    <h3 className={styles.descriptionTitle}>Описание</h3>
                    <p className={styles.description}>{project.description}</p>
                  </div>
                )}
                
                <div className={styles.projectMeta}>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Дата начала:</span>
                      <span className={styles.metaValue}>
                        {project.start_date ? formatDate(project.start_date) : 'Не указана'}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Дата окончания:</span>
                      <span className={styles.metaValue}>
                        {project.end_date ? formatDate(project.end_date) : 'Не указана'}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Группы:</span>
                      <span className={styles.metaValue}>{project.groups?.length || 0}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Задачи:</span>
                      <span className={styles.metaValue}>{project.tasks?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {isAdmin && !editing && (
            <div className={styles.headerActions}>
              <Button 
                variant="primary" 
                onClick={() => setEditing(true)}
                className={styles.editButton}
              >
                Редактировать
              </Button>
              <Button 
                variant="danger" 
                onClick={handleDeleteProjectClick}
                className={styles.deleteButton}
                disabled={isDeletingProject}
              >
                {isDeletingProject ? 'Удаление...' : 'Удалить проект'}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Группы проекта</h2>
            <div className={styles.groupsHeaderActions}>
              {isAdmin && (
                <Button 
                  variant="primary" 
                  size="small"
                  onClick={() => setAddingGroup(!addingGroup)}
                >
                  {addingGroup ? 'Отмена' : 'Добавить группу'}
                </Button>
              )}
              {project.groups?.length > 0 && (
                <Button 
                  variant="secondary" 
                  size="small"
                  onClick={() => setShowGroupsModal(true)}
                >
                  Показать все ({project.groups.length})
                </Button>
              )}
            </div>
          </div>

          {addingGroup && (
            <form onSubmit={handleAddGroup} className={styles.addGroupForm}>
              <div className={styles.addGroupFields}>
                <div className={styles.selectGroup}>
                  <label>Выберите группу:</label>
                  <select 
                    value={newGroupId} 
                    onChange={(e) => setNewGroupId(e.target.value)}
                    required
                  >
                    <option value="">Выберите группу</option>
                    {availableGroups
                      .filter(group => !project.groups.some(g => g.id === group.id))
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))
                    }
                  </select>
                </div>
              </div>
              <Button type="submit" variant="primary">Добавить</Button>
            </form>
          )}

          {project.groups?.length > 0 ? (
            <div className={styles.groupsSection}>
              <div className={styles.groupsListCompact}>
                {displayGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    currentUserId={user?.id}
                    showDeleteButton={isAdmin}
                    onDelete={() => handleRemoveGroup(group.id, group.name)}
                  />
                ))}
              </div>
              {hasMoreGroups && (
                <div className={styles.moreItems}>
                  <p>И еще {project.groups.length - 3} групп...</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>В этот проект пока не добавлены группы</p>
              {isAdmin && (
                <p>Добавьте группы, чтобы участники могли работать над задачами проекта</p>
              )}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Задачи проекта</h2>
            <div className={styles.tasksHeaderActions}>
              <Button 
                to={`/tasks/create?projectId=${projectId}`}
                variant="primary" 
                size="small"
              >
                Создать задачу
              </Button>
              {project.tasks?.length > 0 && (
                <Button 
                  variant="secondary" 
                  size="small"
                  onClick={() => setShowTasksModal(true)}
                >
                  Показать все ({project.tasks.length})
                </Button>
              )}
            </div>
          </div>

          {project.tasks?.length > 0 ? (
            <div className={styles.tasksSection}>
              <div className={styles.tasksListCompact}>
                {displayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    currentUserId={user?.id}
                    showDetailsButton={true}
                    compact={true}
                    showDeleteButton={isAdmin}
                    onDelete={() => handleDeleteTask(task.id, task.title)}
                  />
                ))}
              </div>
              {hasMoreTasks && (
                <div className={styles.moreItems}>
                  <p>И еще {project.tasks.length - 3} задач...</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>В этом проекте пока нет задач</p>
              <p>Создайте первую задачу для начала работы над проектом</p>
              <Button 
                to={`/tasks/create?projectId=${projectId}`}
                variant="primary" 
                size="medium"
              >
                Создать первую задачу
              </Button>
            </div>
          )}
        </div>
      </div>

      <ItemsModal
        items={project.groups || []}
        itemType="groups"
        isOpen={showGroupsModal}
        onClose={() => setShowGroupsModal(false)}
        title={`Группы проекта "${project.title}"`}
        currentUserId={user?.id}
        showDeleteButton={isAdmin}
        onDelete={(groupId, groupName) => handleRemoveGroup(groupId, groupName)}
      />

      <ItemsModal
        items={project.tasks || []}
        itemType="tasks"
        isOpen={showTasksModal}
        onClose={() => setShowTasksModal(false)}
        title={`Задачи проекта "${project.title}"`}
        currentUserId={user?.id}
        showDeleteButton={isAdmin}
        onDelete={(taskId, taskTitle) => handleDeleteTask(taskId, taskTitle)}
      />

      <ConfirmationModal
        isOpen={showDeleteProjectModal}
        onClose={() => setShowDeleteProjectModal(false)}
        onConfirm={handleConfirmDeleteProject}
        title="Удаление проекта"
        message={`Вы уверены, что хотите удалить проект "${project.title}"? Это действие нельзя отменить. Все задачи и данные проекта будут потеряны.`}
        confirmText={isDeletingProject ? "Удаление..." : "Удалить проект"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeletingProject}
      />
    </div>
  );
};