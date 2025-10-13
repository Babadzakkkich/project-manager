import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import plusIcon from '../../../assets/plus_icon.svg';
import styles from './CreateGroup.module.css';

export const CreateGroup = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([{ name: '', description: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const handleGroupChange = (index, field, value) => {
    const updatedGroups = [...groups];
    updatedGroups[index][field] = value;
    setGroups(updatedGroups);
    
    // Очищаем ошибки при изменении
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
      
      // Очищаем ошибки для удаленной группы
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
    
    try {
      // Создаем группы последовательно
      const createdGroups = [];
      for (const group of groups) {
        if (group.name.trim()) {
          const createdGroup = await groupsAPI.create(group);
          createdGroups.push(createdGroup);
        }
      }
      
      setSuccess(true);
      setTimeout(() => {
        navigate('/groups');
      }, 2000);
      
    } catch (error) {
      console.error('Error creating groups:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка при создании групп';
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
          <h2 className={styles.successTitle}>Группы успешно созданы!</h2>
          <p className={styles.successMessage}>
            {groups.length === 1 
              ? 'Группа была успешно создана.' 
              : `Все ${groups.length} групп были успешно созданы.`
            }
          </p>
          <p className={styles.redirectMessage}>
            Вы будете перенаправлены на страницу групп через 2 секунды...
          </p>
          <Button 
            variant="primary" 
            size="large"
            onClick={() => navigate('/groups')}
            className={styles.successButton}
          >
            Перейти к группам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
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
                />
                
                <Input
                  label="Описание группы"
                  name={`description_${index}`}
                  type="text"
                  value={group.description}
                  onChange={(e) => handleGroupChange(index, 'description', e.target.value)}
                  error={errors[`group_${index}_description`]}
                  placeholder="Введите описание группы (необязательно)"
                  disabled={loading}
                  autoComplete="off"
                />
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
            disabled={loading}
            className={styles.addButton}
          >
            <img src={plusIcon} alt="Добавить" className={styles.addIcon} />
            Добавить еще группу
          </Button>
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
            className={styles.submitButton}
          >
            {groups.length === 1 ? 'Создать группу' : `Создать ${groups.length} группу`}
          </Button>
        </div>
      </form>
    </div>
  );
};