import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksAPI } from '../../../services/api/tasks';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuthContext } from '../../../contexts/AuthContext';
import { getAutoTaskStatus, TASK_STATUSES, getTaskStatusTranslation } from '../../../utils/taskStatus';
import styles from './CreateTask.module.css';

export const CreateTask = () => {
  const navigate = useNavigate();
  
  // Устанавливаем сегодняшнюю дату по умолчанию для start_date
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today,
    deadline: '',
    status: TASK_STATUSES.IN_PROGRESS,
    project_id: '',
    group_id: ''
  });
  
  const [availableProjects, setAvailableProjects] = useState([]);
  const [_availableGroups, setAvailableGroups] = useState([]); // Префикс _ для неиспользуемой переменной
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const { user: _user } = useAuthContext(); // Префикс _ для неиспользуемой переменной

  // Загружаем проекты пользователя
  const loadAvailableProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const projectsData = await projectsAPI.getMyProjects();
      setAvailableProjects(projectsData);
    } catch (err) {
      console.error('Error loading projects:', err);
      setErrors({ projects: 'Не удалось загрузить список проектов' });
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // Загружаем группы пользователя
  const loadAvailableGroups = useCallback(async () => {
    try {
      const groupsData = await groupsAPI.getMyGroups();
      setAvailableGroups(groupsData);
    } catch (err) {
      console.error('Error loading groups:', err);
      setErrors({ groups: 'Не удалось загрузить список групп' });
    }
  }, []);

  useEffect(() => {
    loadAvailableProjects();
    loadAvailableGroups();
  }, [loadAvailableProjects, loadAvailableGroups]);

  // Фильтруем группы при выборе проекта
  useEffect(() => {
    if (formData.project_id) {
      const selectedProject = availableProjects.find(p => p.id === parseInt(formData.project_id));
      if (selectedProject && selectedProject.groups) {
        setFilteredGroups(selectedProject.groups);
        // Сбрасываем выбранную группу если она не входит в проект
        if (formData.group_id && !selectedProject.groups.some(g => g.id === parseInt(formData.group_id))) {
          setFormData(prev => ({ ...prev, group_id: '' }));
        }
      } else {
        setFilteredGroups([]);
      }
    } else {
      setFilteredGroups([]);
    }
  }, [formData.project_id, formData.group_id, availableProjects]); // Добавил formData.group_id в зависимости

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const newFormData = {
        ...prev,
        [name]: value
      };
      
      // Автоматически определяем статус при изменении даты начала
      if (name === 'start_date') {
        newFormData.status = getAutoTaskStatus(value);
      }
      
      return newFormData;
    });
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Название задачи обязательно';
    } else if (formData.title.length < 2) {
      newErrors.title = 'Название должно содержать минимум 2 символа';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    }
    
    if (!formData.deadline) {
      newErrors.deadline = 'Дата окончания обязательна';
    } else {
      const deadline = new Date(formData.deadline);
      const startDate = new Date(formData.start_date);
      
      if (deadline < startDate) {
        newErrors.deadline = 'Дата окончания не может быть раньше даты начала';
      }
    }
    
    if (!formData.project_id) {
      newErrors.project_id = 'Выберите проект';
    }
    
    if (!formData.group_id) {
      newErrors.group_id = 'Выберите группу';
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
      // Подготавливаем данные для отправки
      const taskData = {
        ...formData,
        project_id: parseInt(formData.project_id),
        group_id: parseInt(formData.group_id),
        // Преобразуем даты в ISO строки
        start_date: new Date(formData.start_date).toISOString(),
        deadline: new Date(formData.deadline).toISOString()
      };
      
      await tasksAPI.create(taskData);
      setSuccess(true);
      
      // Перенаправляем на страницу задач через 2 секунды
      setTimeout(() => {
        navigate('/tasks');
      }, 2000);
      
    } catch (error) {
      console.error('Error creating task:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании задачи';
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successContainer}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Задача успешно создана!</h2>
          <p className={styles.successMessage}>
            Задача "{formData.title}" была успешно создана.
          </p>
          <p className={styles.redirectMessage}>
            Вы будете перенаправлены на страницу задач через 2 секунды...
          </p>
          <Button 
            variant="primary" 
            size="large"
            onClick={() => navigate('/tasks')}
            className={styles.successButton}
          >
            Перейти к задачам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Создание задачи</h1>
        <p className={styles.subtitle}>
          Создайте новую задачу и прикрепите её к проекту и группе
        </p>
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
            />
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
              required
            />
          </div>

          <div className={styles.statusInfo}>
            <span className={styles.statusLabel}>Автоматический статус:</span>
            <span className={styles.statusValue}>
              {getTaskStatusTranslation(formData.status)}
            </span>
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
                disabled={loading || projectsLoading}
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

        {errors.submit && (
          <div className={styles.submitError}>{errors.submit}</div>
        )}

        <div className={styles.submitActions}>
          <Button 
            type="button"
            variant="secondary" 
            size="large"
            onClick={() => navigate('/workspace')}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            size="large" 
            loading={loading}
            disabled={availableProjects.length === 0}
            className={styles.submitButton}
          >
            Создать задачу
          </Button>
        </div>
      </form>
    </div>
  );
};