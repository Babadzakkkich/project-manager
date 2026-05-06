import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useNotification } from '../../../../hooks/useNotification';
import { useAuthContext } from '../../../../contexts/AuthContext';
import { groupsAPI } from '../../../../services/api/groups';
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from '../../../../utils/constants';
import { handleApiError, formatDateForInput, getDefaultTaskTags } from '../../../../utils/helpers';
import styles from './QuickTaskForm.module.css';
import { ShieldCheck, X } from 'lucide-react';

export const QuickTaskForm = ({ project, group, onSubmit, onClose }) => {
  const { showError } = useNotification();
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [_usersLoading, setUsersLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  
  const today = formatDateForInput(new Date());
  const defaultTags = getDefaultTaskTags();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: today,
    deadline: ''
  });

  const loadGroupUsers = useCallback(async () => {
    if (!group?.id) return;
    
    try {
      setUsersLoading(true);
      const groupData = await groupsAPI.getById(group.id);
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
  }, [group?.id, user]);

  useEffect(() => {
    loadGroupUsers();
  }, [loadGroupUsers]);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags(prev => [...prev, newTag.trim()]);
      setNewTag('');
      setShowTagInput(false);
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleAddDefaultTag = (tag) => {
    if (!tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      showError('Введите название задачи');
      return;
    }

    if (!formData.start_date) {
      showError('Укажите дату начала задачи');
      return;
    }

    if (isAdminMode && assigneeIds.length === 0) {
      showError('Выберите хотя бы одного исполнителя');
      return;
    }

    setLoading(true);
    try {
      const taskData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        status: formData.status,
        priority: formData.priority,
        start_date: formData.start_date,
        deadline: formData.deadline || null,
        project_id: project.id,
        group_id: group.id,
        tags: tags
      };

      if (isAdminMode && assigneeIds.length > 0) {
        taskData.assignee_ids = assigneeIds;
      }

      await onSubmit(taskData);
    } catch (err) {
      const errorMessage = handleApiError(err);
      showError(`Не удалось создать задачу: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  useEffect(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const formattedDate = formatDateForInput(nextWeek);
    setFormData(prev => ({ ...prev, deadline: formattedDate }));
  }, []);

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Быстрое создание задачи</h2>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.projectInfo}>
            <span className={styles.infoLabel}>Проект:</span>
            <span className={styles.infoValue}>{project?.title}</span>
          </div>
          
          <div className={styles.projectInfo}>
            <span className={styles.infoLabel}>Группа:</span>
            <span className={styles.infoValue}>{group?.name}</span>
          </div>

          {isAdminMode && (
            <div className={styles.adminBadge}>
              <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
              Режим администратора
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Название задачи *</label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Введите название задачи..."
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Описание задачи (необязательно)"
              className={styles.textarea}
              rows="3"
            />
          </div>

          <div className={styles.formGroup}>
            <div className={styles.tagsHeader}>
              <label className={styles.label}>Теги</label>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={() => setShowTagInput(!showTagInput)}
              >
                {showTagInput ? 'Отмена' : '+ Добавить тег'}
              </Button>
            </div>

            {showTagInput && (
              <div className={styles.tagInputSection}>
                <div className={styles.tagInputRow}>
                  <Input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Введите название тега..."
                    className={styles.tagInput}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="small"
                    onClick={handleAddTag}
                    disabled={!newTag.trim()}
                  >
                    Добавить
                  </Button>
                </div>
                
                <div className={styles.suggestedTags}>
                  <span className={styles.suggestedLabel}>Предложенные теги:</span>
                  <div className={styles.defaultTags}>
                    {defaultTags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className={styles.defaultTag}
                        onClick={() => handleAddDefaultTag(tag)}
                        disabled={tags.includes(tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tags.length > 0 && (
              <div className={styles.selectedTags}>
                {tags.map((tag, index) => (
                  <span key={index} className={styles.selectedTag}>
                    #{tag}
                    <button
                      type="button"
                      className={styles.removeTag}
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Удалить тег ${tag}`}
                    >
                      <X size={18} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Статус</label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className={styles.select}
              >
                {TASK_STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Приоритет</label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className={styles.select}
              >
                {TASK_PRIORITY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Дата начала *</label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                min={today}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Срок выполнения</label>
              <Input
                type="date"
                value={formData.deadline}
                onChange={(e) => handleChange('deadline', e.target.value)}
                min={formData.start_date || today}
              />
            </div>
          </div>

          {isAdminMode && availableUsers.length > 0 && (
            <div className={styles.assigneesSection}>
              <div className={styles.assigneesHeader}>
                <label className={styles.label}>Исполнители *</label>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleSelectAllUsers}
                >
                  {assigneeIds.length === availableUsers.length ? 'Снять всех' : 'Выбрать всех'}
                </Button>
              </div>
              
              <div className={styles.usersList}>
                {availableUsers.map((userItem) => (
                  <div 
                    key={userItem.id} 
                    className={`${styles.userItem} ${
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
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={styles.selectedCount}>
                Выбрано: {assigneeIds.length} из {availableUsers.length}
              </div>
            </div>
          )}

          {!isAdminMode && (
            <div className={styles.userInfoCard}>
              <p>Задача будет назначена вам как создателю.</p>
              <p>Только администраторы группы могут назначать задачи другим пользователям.</p>
            </div>
          )}

          <div className={styles.footer}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
            >
              {isAdminMode && assigneeIds.length > 1 
                ? `Создать для ${assigneeIds.length} пользователей` 
                : 'Создать задачу'
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};