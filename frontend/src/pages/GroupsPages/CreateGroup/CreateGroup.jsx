import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useNotification } from '../../../hooks/useNotification';
import { handleApiError } from '../../../utils/helpers';
import plusIcon from '../../../assets/plus_icon.svg';
import styles from './CreateGroup.module.css';

export const CreateGroup = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([{ name: '', description: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [createdGroups, setCreatedGroups] = useState([]);
  const [showContinueModal, setShowContinueModal] = useState(false);

  const { 
    notification, 
    showSuccess, 
    showError, 
    hideNotification 
  } = useNotification();

  const handleGroupChange = (index, field, value) => {
    const updatedGroups = [...groups];
    updatedGroups[index][field] = value;
    setGroups(updatedGroups);
    
    if (errors[`group_${index}_${field}`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`group_${index}_${field}`];
        return newErrors;
      });
    }
  };

  const addGroup = () => {
    setGroups([...groups, { name: '', description: '' }]);
  };

  const removeGroup = (index) => {
    if (groups.length > 1) {
      const updatedGroups = groups.filter((_, i) => i !== index);
      setGroups(updatedGroups);
      
      setErrors(prev => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach(key => {
          if (key.startsWith(`group_${index}_`)) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    groups.forEach((group, index) => {
      if (!group.name.trim()) {
        newErrors[`group_${index}_name`] = 'Название группы обязательно';
      } else if (group.name.length < 2) {
        newErrors[`group_${index}_name`] = 'Название должно содержать минимум 2 символа';
      } else if (group.name.length > 100) {
        newErrors[`group_${index}_name`] = 'Название не должно превышать 100 символов';
      }
      
      if (group.description && group.description.length > 500) {
        newErrors[`group_${index}_description`] = 'Описание не должно превышать 500 символов';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setErrors({});
    setCreatedGroups([]);
    
    try {
      const created = [];
      const creationErrors = [];
      
      for (const [index, group] of groups.entries()) {
        if (group.name.trim()) {
          try {
            const createdGroup = await groupsAPI.create(group);
            created.push(createdGroup);
          } catch (error) {
            const errorMessage = handleApiError(error);
            creationErrors.push(`Группа ${index + 1}: ${errorMessage}`);
          }
        }
      }
      
      setCreatedGroups(created);
      
      if (creationErrors.length > 0) {
        if (created.length === 0) {
          const errorMessage = creationErrors.join('; ');
          showError(errorMessage);
          setErrors({ submit: errorMessage });
        } else {
          const successMessage = `Успешно создано ${created.length} из ${groups.length} групп`;
          const errorMessage = `Ошибки: ${creationErrors.join('; ')}`;
          showSuccess(successMessage);
          setErrors({ submit: errorMessage });
          setShowContinueModal(true);
        }
      } else {
        const successMessage = created.length === 1 
          ? `Группа "${created[0].name}" успешно создана!` 
          : `Успешно создано ${created.length} групп!`;
        showSuccess(successMessage);
        setShowContinueModal(true);
      }
      
    } catch (error) {
      console.error('Error creating groups:', error);
      const errorMessage = handleApiError(error);
      showError(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToGroups = () => {
    navigate('/groups');
  };

  const handleContinueCreating = () => {
    setGroups([{ name: '', description: '' }]);
    setCreatedGroups([]);
    setShowContinueModal(false);
    setErrors({});
  };

  const handleCloseContinueModal = () => {
    setShowContinueModal(false);
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
        <h1 className={styles.title}>Создание групп</h1>
        <p className={styles.subtitle}>
          Создайте одну или несколько групп. Вы автоматически станете администратором созданных групп.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.groupsList}>
          {groups.map((group, index) => (
            <div key={index} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <h3 className={styles.groupNumber}>Группа {index + 1}</h3>
                {groups.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => removeGroup(index)}
                    className={styles.removeButton}
                    disabled={loading}
                  >
                    Удалить
                  </Button>
                )}
              </div>
              
              <div className={styles.groupFields}>
                <Input
                  label="Название группы *"
                  name={`name_${index}`}
                  type="text"
                  value={group.name}
                  onChange={(e) => handleGroupChange(index, 'name', e.target.value)}
                  error={errors[`group_${index}_name`]}
                  placeholder="Введите название группы"
                  disabled={loading}
                  autoComplete="off"
                  maxLength={100}
                />
                
                <div className={styles.textareaGroup}>
                  <label className={styles.label}>Описание группы</label>
                  <textarea
                    name={`description_${index}`}
                    value={group.description}
                    onChange={(e) => handleGroupChange(index, 'description', e.target.value)}
                    placeholder="Введите описание группы (необязательно)"
                    disabled={loading}
                    className={styles.textarea}
                    rows={3}
                    maxLength={500}
                  />
                  {errors[`group_${index}_description`] && (
                    <span className={styles.errorMessage}>
                      {errors[`group_${index}_description`]}
                    </span>
                  )}
                  <div className={styles.charCount}>
                    {group.description?.length || 0}/500
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={addGroup}
            disabled={loading || groups.length >= 5}
            className={styles.addButton}
          >
            <img src={plusIcon} alt="Добавить" className={styles.addIcon} />
            Добавить еще группу
          </Button>
          {groups.length >= 5 && (
            <p className={styles.maxGroupsWarning}>
              Максимальное количество групп для одновременного создания: 5
            </p>
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
            disabled={groups.some(group => !group.name.trim())}
            className={styles.submitButton}
          >
            {groups.length === 1 ? 'Создать группу' : `Создать ${groups.length} групп`}
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showContinueModal}
        onClose={handleCloseContinueModal}
        onConfirm={handleNavigateToGroups}
        title="Группы успешно созданы!"
        message={
          <div className={styles.successModalContent}>
            <div className={styles.successIcon}>✓</div>
            <p>
              {createdGroups.length === 1 
                ? `Группа "${createdGroups[0].name}" была успешно создана.` 
                : `Успешно создано ${createdGroups.length} групп.`
              }
            </p>
            {errors.submit && (
              <div className={styles.partialSuccessInfo}>
                <p>{errors.submit}</p>
              </div>
            )}
            <p className={styles.continueQuestion}>Что вы хотите сделать дальше?</p>
          </div>
        }
        confirmText="Перейти к группам"
        cancelText="Создать еще группы"
        variant="info"
        onCancel={handleContinueCreating}
      />
    </div>
  );
};