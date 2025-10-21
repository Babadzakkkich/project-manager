import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { getAutoProjectStatus } from '../../../utils/projectStatus';
import { handleApiError } from '../../../utils/helpers';
import styles from './CreateProject.module.css';

export const CreateProject = () => {
  const navigate = useNavigate();
  
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today,
    end_date: tomorrow,
    group_ids: []
  });
  const [availableGroups, setAvailableGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdProject, setCreatedProject] = useState(null);
  const { user } = useAuthContext();

  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const loadAvailableGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const groupsData = await groupsAPI.getMyGroups();
      
      const adminGroups = groupsData.filter(group => 
        group.users?.some(u => u.id === user?.id && u.role === 'admin')
      );
      
      setAvailableGroups(adminGroups);
    } catch (err) {
      console.error('Error loading groups:', err);
      showError('Не удалось загрузить список групп');
      setErrors({ groups: 'Не удалось загрузить список групп' });
    } finally {
      setGroupsLoading(false);
    }
  }, [user, showError]);

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
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleGroupToggle = (groupId) => {
    setFormData(prev => {
      const isSelected = prev.group_ids.includes(groupId);
      const newGroupIds = isSelected
        ? prev.group_ids.filter(id => id !== groupId)
        : [...prev.group_ids, groupId];
      
      return { ...prev, group_ids: newGroupIds };
    });
    
    if (errors.group_ids) {
      setErrors(prev => ({ ...prev, group_ids: '' }));
    }
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
    }
    
    if (!formData.end_date) {
      newErrors.end_date = 'Дата окончания обязательна';
    } else if (formData.start_date) {
      const endDate = new Date(formData.end_date);
      const startDate = new Date(formData.start_date);
      
      if (endDate <= startDate) {
        newErrors.end_date = 'Дата окончания должна быть позже даты начала';
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
      const autoStatus = getAutoProjectStatus(formData.start_date, formData.end_date);
      
      const projectData = {
        ...formData,
        status: autoStatus,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
      };
      
      const project = await projectsAPI.create(projectData);
      setCreatedProject(project);
      showSuccess(`Проект "${formData.title}" успешно создан!`);
      setShowSuccessModal(true);
      
    } catch (error) {
      console.error('Error creating project:', error);
      const errorMessage = handleApiError(error);
      showError(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToProjects = () => {
    navigate('/projects');
  };

  const handleNavigateToProjectDetail = () => {
    if (createdProject) {
      navigate(`/projects/${createdProject.id}`);
    }
  };

  const handleContinueCreating = () => {
    setFormData({
      title: '',
      description: '',
      start_date: today,
      end_date: tomorrow,
      group_ids: []
    });
    setCreatedProject(null);
    setShowSuccessModal(false);
    setErrors({});
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
  };

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
              min={today}
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
              min={formData.start_date || today}
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
                        disabled={loading}
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
            onClick={() => navigate('/projects')}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            size="large" 
            loading={loading}
            disabled={availableGroups.length === 0 || loading}
            className={styles.submitButton}
          >
            Создать проект
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={handleCloseSuccessModal}
        onConfirm={handleNavigateToProjectDetail}
        title="Проект успешно создан!"
        message={
          <div className={styles.successModalContent}>
            <div className={styles.successIcon}>✓</div>
            <p>
              Проект "{formData.title}" был успешно создан и прикреплен к {formData.group_ids.length} {formData.group_ids.length === 1 ? 'группе' : 'группам'}.
            </p>
            <p className={styles.continueQuestion}>Что вы хотите сделать дальше?</p>
          </div>
        }
        confirmText="Перейти к проекту"
        cancelText="Создать еще проект"
        variant="info"
        onCancel={handleContinueCreating}
        showThirdButton={true}
        thirdButtonText="К списку проектов"
        onThirdButton={handleNavigateToProjects}
      />
    </div>
  );
};