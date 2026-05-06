import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksAPI } from '../../../services/api/tasks';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getTaskStatusTranslation,
  getTaskStatusColor,
  getTaskStatusIcon,
  getTaskPriorityTranslation,
  getTaskPriorityColor,
  getTaskPriorityIcon,
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '../../../utils/taskStatus';
import { 
  TASK_STATUSES, 
  TASK_PRIORITIES 
} from '../../../utils/constants';
import {
  handleApiError,
  formatDateForInput,
  isValidDateRange, 
  getDefaultTaskTags
} from '../../../utils/helpers';
import styles from './CreateTask.module.css';
import { Check, CheckCircle2, ShieldCheck, X } from 'lucide-react';

export const CreateTask = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  
  const today = formatDateForInput(new Date());
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today,
    deadline: '',
    status: TASK_STATUSES.BACKLOG,
    priority: TASK_PRIORITIES.MEDIUM,
    project_id: '',
    group_id: '',
    tags: []
  });
  
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableTags, _setAvailableTags] = useState(getDefaultTaskTags());
  const [customTag, setCustomTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [_usersLoading, setUsersLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const loadAvailableProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const projectsData = await projectsAPI.getMyProjects();
      setAvailableProjects(projectsData);
    } catch (err) {
      console.error('Error loading projects:', err);
      showError('Не удалось загрузить список проектов');
      setErrors(prev => ({ ...prev, projects: 'Не удалось загрузить список проектов' }));
    } finally {
      setProjectsLoading(false);
    }
  }, [showError]);

  const loadGroupUsers = useCallback(async (groupId) => {
    if (!groupId) {
      setAvailableUsers([]);
      return;
    }

    try {
      setUsersLoading(true);
      const groupData = await groupsAPI.getById(groupId);
      setAvailableUsers(groupData.users || []);
      
      const currentUserInGroup = groupData.users?.find(u => u.id === user?.id);
      const isAdmin = currentUserInGroup?.role === 'admin' || currentUserInGroup?.role === 'super_admin';
      setIsAdminMode(isAdmin);
      
      if (!isAdmin && user) {
        setAssigneeIds([user.id]);
      }
    } catch (err) {
      console.error('Error loading group users:', err);
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAvailableProjects();
  }, [loadAvailableProjects]);

  useEffect(() => {
    if (formData.project_id) {
      const selectedProject = availableProjects.find(p => p.id === parseInt(formData.project_id));
      if (selectedProject && selectedProject.groups) {
        setFilteredGroups(selectedProject.groups);
        if (formData.group_id && !selectedProject.groups.some(g => g.id === parseInt(formData.group_id))) {
          setFormData(prev => ({ ...prev, group_id: '' }));
          setAvailableUsers([]);
          setAssigneeIds([]);
          setIsAdminMode(false);
        }
      } else {
        setFilteredGroups([]);
      }
    } else {
      setFilteredGroups([]);
    }
  }, [formData.project_id, formData.group_id, availableProjects]);

  useEffect(() => {
    if (formData.group_id) {
      loadGroupUsers(parseInt(formData.group_id));
    } else {
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
    }
  }, [formData.group_id, loadGroupUsers]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
      
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    };

  const handleAssigneeToggle = (userId) => {
    setAssigneeIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleSelectAllUsers = () => {
    if (assigneeIds.length === availableUsers.length) {
      setAssigneeIds([]);
    } else {
      const allUserIds = availableUsers.map(u => u.id);
      setAssigneeIds(allUserIds);
    }
  };

  const handleTagToggle = (tag) => {
    setFormData(prev => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return {
          ...prev,
          tags: currentTags.filter(t => t !== tag)
        };
      } else {
        return {
          ...prev,
          tags: [...currentTags, tag]
        };
      }
    });
  };

  const handleAddCustomTag = () => {
    if (customTag.trim() && !formData.tags.includes(customTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, customTag.trim()]
      }));
      setCustomTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Название задачи обязательно';
    } else if (formData.title.length < 2) {
      newErrors.title = 'Название должно содержать минимум 2 символа';
    } else if (formData.title.length > 200) {
      newErrors.title = 'Название не должно превышать 200 символов';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    }
    
    if (!formData.deadline) {
      newErrors.deadline = 'Дата окончания обязательна';
    } else {
      const validation = isValidDateRange(formData.start_date, formData.deadline);
      if (!validation.isValid) {
        newErrors.deadline = validation.error;
      }
    }
    
    if (!formData.project_id) {
      newErrors.project_id = 'Выберите проект';
    }
    
    if (!formData.group_id) {
      newErrors.group_id = 'Выберите группу';
    }
    
    if (assigneeIds.length === 0) {
      newErrors.assignees = 'Выберите хотя бы одного исполнителя';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setErrors({});
    
    try {
      let createdTask;
      
      if (isAdminMode && assigneeIds.length > 0) {
        const taskData = {
          ...formData,
          project_id: parseInt(formData.project_id),
          group_id: parseInt(formData.group_id),
          assignee_ids: assigneeIds,
          start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null
        };
        
        createdTask = await tasksAPI.createForUsers(taskData);
      } else {
        const taskData = {
          ...formData,
          project_id: parseInt(formData.project_id),
          group_id: parseInt(formData.group_id),
          start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null
        };
        
        createdTask = await tasksAPI.create(taskData);
      }
      
      setCreatedTask(createdTask);
      const successMessage = isAdminMode && assigneeIds.length > 0 
        ? `Задача "${formData.title}" успешно создана и назначена ${assigneeIds.length} пользователям!`
        : `Задача "${formData.title}" успешно создана!`;
      showSuccess(successMessage);
      setShowSuccessModal(true);
      
    } catch (error) {
      console.error('Error creating task:', error);
      const errorMessage = handleApiError(error);
      showError(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/tasks');
  };

  const handleNavigateToTasks = () => {
    navigate('/tasks');
  };

  const handleNavigateToTaskDetail = () => {
    if (createdTask) {
      navigate(`/tasks/${createdTask.id}`);
    }
  };

  const handleContinueCreating = () => {
    setFormData({
      title: '',
      description: '',
      start_date: today,
      deadline: '',
      status: TASK_STATUSES.BACKLOG,
      priority: TASK_PRIORITIES.MEDIUM,
      project_id: '',
      group_id: '',
      tags: []
    });
    setAssigneeIds([]);
    setCreatedTask(null);
    setShowSuccessModal(false);
    setErrors({});
    setIsAdminMode(false);
    setCustomTag('');
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
  };

  const hasAvailableProjects = availableProjects.length > 0 && !projectsLoading;

  return (
    <div className={styles.container}>
      {/* Уведомление */}
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
          onClick={handleCancel}
          className={styles.backButton}
        >
          ← Назад к задачам
        </Button>
        
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Создание задачи</h1>
          <p className={styles.subtitle}>
            {isAdminMode 
              ? 'Создайте новую задачу и назначьте её участникам группы'
              : 'Создайте новую задачу и прикрепите её к проекту и группе'
            }
          </p>
          {isAdminMode && (
            <div className={styles.adminBadge}>
              <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
              Режим администратора: вы можете назначать задачу любым участникам группы
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Основная информация</h3>
          
          <Input
            label="Название задачи *"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
            error={errors.title}
            placeholder="Введите название задачи"
            disabled={loading}
            autoComplete="off"
            maxLength={200}
          />
          
          <div className={styles.textareaGroup}>
            <label className={styles.label}>Описание задачи</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Опишите детали задачи (необязательно)"
              disabled={loading}
              className={styles.textarea}
              rows={4}
              maxLength={1000}
            />
            <div className={styles.charCount}>
              {formData.description.length}/1000 символов
            </div>
          </div>
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Свойства задачи</h3>
          
          <div className={styles.taskProperties}>
            <div className={styles.propertyGroup}>
              <label className={styles.label}>Статус</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={styles.select}
                disabled={loading}
              >
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className={styles.statusPreview}>
                <span 
                  className={styles.statusBadge}
                  style={{ backgroundColor: getTaskStatusColor(formData.status) }}
                >
                  {getTaskStatusIcon(formData.status)} {getTaskStatusTranslation(formData.status)}
                </span>
              </div>
            </div>

            <div className={styles.propertyGroup}>
              <label className={styles.label}>Приоритет</label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className={styles.select}
                disabled={loading}
              >
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className={styles.priorityPreview}>
                <span 
                  className={styles.priorityBadge}
                  style={{ backgroundColor: getTaskPriorityColor(formData.priority) }}
                >
                  {getTaskPriorityIcon(formData.priority)} {getTaskPriorityTranslation(formData.priority)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.tagsSection}>
            <label className={styles.label}>Теги</label>
            <div className={styles.tagsContainer}>
              <div className={styles.availableTags}>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`${styles.tagButton} ${
                      formData.tags.includes(tag) ? styles.tagSelected : ''
                    }`}
                    onClick={() => handleTagToggle(tag)}
                  >
                    #{tag}
                    {formData.tags.includes(tag) && (
                      <span className={styles.tagCheck}>
                        <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              
              <div className={styles.customTag}>
                <Input
                  placeholder="Добавить свой тег..."
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  className={styles.customTagInput}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleAddCustomTag}
                  disabled={!customTag.trim()}
                >
                  Добавить
                </Button>
              </div>
              
              {formData.tags.length > 0 && (
                <div className={styles.selectedTags}>
                  <span className={styles.selectedTagsLabel}>Выбранные теги:</span>
                  <div className={styles.selectedTagsList}>
                    {formData.tags.map((tag) => (
                      <span key={tag} className={styles.selectedTag}>
                        #{tag}
                        <button
                          type="button"
                          className={styles.removeTag}
                          onClick={() => handleRemoveTag(tag)}
                        >
                          <X size={14} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Сроки выполнения</h3>
          
          <div className={styles.dateFields}>
            <Input
              label="Дата начала *"
              name="start_date"
              type="date"
              value={formData.start_date}
              onChange={handleChange}
              error={errors.start_date}
              disabled={loading}
              min={today}
              required
            />
            
            <Input
              label="Дата окончания *"
              name="deadline"
              type="date"
              value={formData.deadline}
              onChange={handleChange}
              error={errors.deadline}
              disabled={loading}
              min={formData.start_date || today}
              required
            />
          </div>
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Привязка к проекту и группе</h3>
          
          <div className={styles.selectionFields}>
            <div className={styles.selectGroup}>
              <label className={styles.label}>Проект *</label>
              <select
                name="project_id"
                value={formData.project_id}
                onChange={handleChange}
                className={`${styles.select} ${errors.project_id ? styles.error : ''}`}
                disabled={loading || projectsLoading || !hasAvailableProjects}
              >
                <option value="">Выберите проект</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
              {errors.project_id && (
                <span className={styles.errorMessage}>{errors.project_id}</span>
              )}
            </div>

            <div className={styles.selectGroup}>
              <label className={styles.label}>Группа *</label>
              <select
                name="group_id"
                value={formData.group_id}
                onChange={handleChange}
                className={`${styles.select} ${errors.group_id ? styles.error : ''}`}
                disabled={loading || !formData.project_id || filteredGroups.length === 0}
              >
                <option value="">Выберите группу</option>
                {filteredGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              {errors.group_id && (
                <span className={styles.errorMessage}>{errors.group_id}</span>
              )}
              {formData.project_id && filteredGroups.length === 0 && (
                <div className={styles.noGroupsWarning}>
                  В выбранном проекте нет доступных групп
                </div>
              )}
            </div>
          </div>

          {projectsLoading && (
            <div className={styles.loadingProjects}>
              <div className={styles.spinner}></div>
              <p>Загрузка списка проектов...</p>
            </div>
          )}

          {!projectsLoading && availableProjects.length === 0 && (
            <div className={styles.noProjects}>
              <p>У вас нет доступных проектов.</p>
              <p>Создайте проект или попросите администратора добавить вас в существующий.</p>
              <Button 
                to="/projects/create" 
                variant="primary" 
                size="medium"
              >
                Создать проект
              </Button>
            </div>
          )}
        </div>

        {isAdminMode && availableUsers.length > 0 && (
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Назначение исполнителей</h3>
            
            <div className={styles.assigneesSection}>
              <div className={styles.assigneesHeader}>
                <span>Выберите исполнителей задачи:</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleSelectAllUsers}
                >
                  {assigneeIds.length === availableUsers.length ? 'Снять всех' : 'Выбрать всех'}
                </Button>
              </div>
              
              {errors.assignees && (
                <div className={styles.assigneesError}>{errors.assignees}</div>
              )}
              
              <div className={styles.usersGrid}>
                {availableUsers.map((userItem) => (
                  <div 
                    key={userItem.id} 
                    className={`${styles.userCard} ${
                      assigneeIds.includes(userItem.id) ? styles.selected : ''
                    }`}
                    onClick={() => handleAssigneeToggle(userItem.id)}
                  >
                    <div className={styles.userCheckbox}>
                      <input
                        type="checkbox"
                        checked={assigneeIds.includes(userItem.id)}
                        onChange={() => handleAssigneeToggle(userItem.id)}
                        className={styles.checkboxInput}
                      />
                      <span className={styles.checkboxCustom}></span>
                    </div>
                    
                    <div className={styles.userInfo}>
                      <div className={styles.userMain}>
                        <span className={styles.userLogin}>{userItem.login}</span>
                        {userItem.id === user?.id && (
                          <span className={styles.currentUserBadge}>Вы</span>
                        )}
                      </div>
                      <span className={styles.userEmail}>{userItem.email}</span>
                      <span className={styles.userRole}>
                        {userItem.role === 'admin' || userItem.role === 'super_admin' ? 'Администратор' : 'Участник'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={styles.selectedCount}>
                Выбрано исполнителей: {assigneeIds.length} из {availableUsers.length}
              </div>
            </div>
          </div>
        )}

        {!isAdminMode && formData.group_id && (
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Исполнитель</h3>
            <div className={styles.userInfoCard}>
              <p>Задача будет назначена вам как создателю.</p>
              <p>Только администраторы группы могут назначать задачи другим пользователям.</p>
            </div>
          </div>
        )}

        {errors.submit && (
          <div className={styles.submitError}>{errors.submit}</div>
        )}

        <div className={styles.submitActions}>
          <Button 
            type="button"
            variant="secondary" 
            size="large"
            onClick={handleCancel}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            size="large" 
            loading={loading}
            disabled={!hasAvailableProjects || loading}
            className={styles.submitButton}
          >
            {isAdminMode && assigneeIds.length > 1 
              ? `Создать задачу для ${assigneeIds.length} пользователей` 
              : 'Создать задачу'
            }
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={handleCloseSuccessModal}
        onConfirm={handleNavigateToTaskDetail}
        title="Задача успешно создана!"
        message={
          <div className={styles.successModalContent}>
            <div className={styles.successIcon}>
              <CheckCircle2 size={42} strokeWidth={2} aria-hidden="true" />
            </div>
            <p>
              Задача "{formData.title}" была успешно создана.
              {isAdminMode && assigneeIds.length > 0 && ` Назначена ${assigneeIds.length} пользователям.`}
            </p>
            <p className={styles.continueQuestion}>Что вы хотите сделать дальше?</p>
          </div>
        }
        confirmText="Перейти к задаче"
        cancelText="Создать еще задачу"
        variant="info"
        showIcon={false}
        onCancel={handleContinueCreating}
        showThirdButton={true}
        thirdButtonText="К списку задач"
        onThirdButton={handleNavigateToTasks}
      />
    </div>
  );
};