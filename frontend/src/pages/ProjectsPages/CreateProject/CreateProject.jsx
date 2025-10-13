import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuthContext } from '../../../contexts/AuthContext';
import styles from './CreateProject.module.css';

export const CreateProject = () => {
  const navigate = useNavigate();
  
  // Устанавливаем сегодняшнюю дату по умолчанию для start_date
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today, // Автоматически устанавливаем сегодняшнюю дату
    end_date: '',
    status: 'in_progress',
    group_ids: []
  });
  const [availableGroups, setAvailableGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const { user } = useAuthContext();

  // Загружаем группы, где пользователь является администратором
  const loadAvailableGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const groupsData = await groupsAPI.getMyGroups();
      
      // Фильтруем группы, где пользователь является администратором
      const adminGroups = groupsData.filter(group => 
        group.users?.some(u => u.id === user?.id && u.role === 'admin')
      );
      
      setAvailableGroups(adminGroups);
    } catch (err) {
      console.error('Error loading groups:', err);
      setErrors({ groups: 'Не удалось загрузить список групп' });
    } finally {
      setGroupsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAvailableGroups();
  }, [loadAvailableGroups]);

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

  const handleGroupToggle = (groupId) => {
    setFormData(prev => {
      const isSelected = prev.group_ids.includes(groupId);
      const newGroupIds = isSelected
        ? prev.group_ids.filter(id => id !== groupId)
        : [...prev.group_ids, groupId];
      
      return {
        ...prev,
        group_ids: newGroupIds
      };
    });
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Название проекта обязательно';
    } else if (formData.title.length < 2) {
      newErrors.title = 'Название должно содержать минимум 2 символа';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'Дата начала обязательна';
    } else {
      const startDate = new Date(formData.start_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (startDate < today) {
        newErrors.start_date = 'Дата начала не может быть в прошлом';
      }
    }
    
    if (!formData.end_date) {
      newErrors.end_date = 'Дата окончания обязательна';
    } else {
      const endDate = new Date(formData.end_date);
      const startDate = new Date(formData.start_date);
      
      if (endDate < startDate) {
        newErrors.end_date = 'Дата окончания не может быть раньше даты начала';
      }
    }
    
    if (formData.group_ids.length === 0) {
      newErrors.group_ids = 'Выберите хотя бы одну группу';
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
      const projectData = {
        ...formData,
        // Преобразуем даты в ISO строки
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        status: 'in_progress' // Автоматически устанавливаем статус "В процессе"
      };
      
      await projectsAPI.create(projectData);
      setSuccess(true);
      
      // Перенаправляем на страницу проектов через 2 секунды
      setTimeout(() => {
        navigate('/projects');
      }, 2000);
      
    } catch (error) {
      console.error('Error creating project:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании проекта';
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
          <h2 className={styles.successTitle}>Проект успешно создан!</h2>
          <p className={styles.successMessage}>
            Проект "{formData.title}" был успешно создан.
          </p>
          <p className={styles.redirectMessage}>
            Вы будете перенаправлены на страницу проектов через 2 секунды...
          </p>
          <Button 
            variant="primary" 
            size="large"
            onClick={() => navigate('/projects')}
            className={styles.successButton}
          >
            Перейти к проектам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Создание проекта</h1>
        <p className={styles.subtitle}>
          Создайте новый проект и прикрепите к нему группы, которыми вы управляете
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Основная информация</h3>
          
          <Input
            label="Название проекта *"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
            error={errors.title}
            placeholder="Введите название проекта"
            disabled={loading}
            autoComplete="off"
          />
          
          <div className={styles.textareaGroup}>
            <label className={styles.label}>Описание проекта</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Опишите цели и задачи проекта (необязательно)"
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
              name="end_date"
              type="date"
              value={formData.end_date}
              onChange={handleChange}
              error={errors.end_date}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Прикрепленные группы</h3>
          <p className={styles.sectionSubtitle}>
            Выберите группы, которые будут участвовать в проекте (только группы, где вы являетесь администратором)
          </p>
          
          {groupsLoading ? (
            <div className={styles.loadingGroups}>
              <div className={styles.spinner}></div>
              <p>Загрузка списка групп...</p>
            </div>
          ) : availableGroups.length === 0 ? (
            <div className={styles.noGroups}>
              <p>У вас нет групп, которыми вы управляете.</p>
              <p>Создайте группу или попросите администратора добавить вас в существующую.</p>
              <Button 
                to="/groups/create" 
                variant="primary" 
                size="medium"
              >
                Создать группу
              </Button>
            </div>
          ) : (
            <>
              {errors.group_ids && (
                <div className={styles.groupError}>{errors.group_ids}</div>
              )}
              
              <div className={styles.groupsGrid}>
                {availableGroups.map((group) => (
                  <div 
                    key={group.id} 
                    className={`${styles.groupCard} ${
                      formData.group_ids.includes(group.id) ? styles.selected : ''
                    }`}
                    onClick={() => handleGroupToggle(group.id)}
                  >
                    <div className={styles.groupCheckbox}>
                      <input
                        type="checkbox"
                        checked={formData.group_ids.includes(group.id)}
                        onChange={() => handleGroupToggle(group.id)}
                        className={styles.checkboxInput}
                      />
                      <span className={styles.checkboxCustom}></span>
                    </div>
                    
                    <div className={styles.groupInfo}>
                      <h4 className={styles.groupName}>{group.name}</h4>
                      {group.description && (
                        <p className={styles.groupDescription}>{group.description}</p>
                      )}
                      <div className={styles.groupStats}>
                        <span>{group.users?.length || 0} участников</span>
                        <span>{group.projects?.length || 0} проектов</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={styles.selectedCount}>
                Выбрано групп: {formData.group_ids.length}
              </div>
            </>
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
            disabled={availableGroups.length === 0}
            className={styles.submitButton}
          >
            Создать проект
          </Button>
        </div>
      </form>
    </div>
  );
};