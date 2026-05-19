import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Plus,
  ShieldCheck,
  Tag,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useNotification } from '../../../../hooks/useNotification';
import { useAuthContext } from '../../../../contexts/AuthContext';
import { groupsAPI } from '../../../../services/api/groups';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '../../../../utils/constants';
import {
  formatDateForInput,
  formatRussianCount,
  getDefaultTaskTags,
  handleApiError,
  RUSSIAN_CASE_FORMS,
} from '../../../../utils/helpers';
import {
  FIELD_LIMITS,
  validateOptionalTextField,
  validateTaskTag,
  validateTaskTags,
  validateTextField,
} from '../../../../utils/validation';
import styles from './QuickTaskForm.module.css';

const TASK_TITLE_LIMIT = FIELD_LIMITS.TASK_TITLE;
const TASK_DESCRIPTION_LIMIT = FIELD_LIMITS.TASK_DESCRIPTION;
const TAG_LIMIT = FIELD_LIMITS.TASK_TAG;
const TAGS_LIMIT = FIELD_LIMITS.TASK_TAGS;

const ASSIGNEE_FORMS = RUSSIAN_CASE_FORMS.ASSIGNEE.NOMINATIVE;
const USER_GENITIVE_FORMS = RUSSIAN_CASE_FORMS.USER.GENITIVE;

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

const getUserInitial = (user) => {
  return getUserName(user).charAt(0).toUpperCase();
};

const getNextWeekDate = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateForInput(nextWeek);
};

export const QuickTaskForm = ({ project, group, onSubmit, onClose }) => {
  const { showError } = useNotification();
  const { user } = useAuthContext();

  const today = useMemo(() => formatDateForInput(new Date()), []);
  const defaultTags = useMemo(() => getDefaultTaskTags(), []);

  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [availableUsers, setAvailableUsers] = useState([]);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: today,
    deadline: getNextWeekDate(),
  });

  const selectedAssignees = useMemo(() => {
    return availableUsers.filter((userItem) => assigneeIds.includes(userItem.id));
  }, [availableUsers, assigneeIds]);

  const loadGroupUsers = useCallback(async () => {
    if (!group?.id) return;

    try {
      setUsersLoading(true);

      const groupData = await groupsAPI.getById(group.id);
      const groupUsers = Array.isArray(groupData.users) ? groupData.users : [];

      setAvailableUsers(groupUsers);

      const currentUserInGroup = groupUsers.find((groupUser) => groupUser.id === user?.id);
      const isAdmin = currentUserInGroup?.role === 'admin';

      setIsAdminMode(isAdmin);

      if (isAdmin) {
        setAssigneeIds([]);
      } else if (user?.id) {
        setAssigneeIds([user.id]);
      } else {
        setAssigneeIds([]);
      }
    } catch (err) {
      console.error('Error loading group users:', err);
      setAvailableUsers([]);
      setAssigneeIds([]);
      setIsAdminMode(false);
      showError(`Не удалось загрузить участников группы: ${handleApiError(err)}`);
    } finally {
      setUsersLoading(false);
    }
  }, [group?.id, showError, user?.id]);

  useEffect(() => {
    loadGroupUsers();
  }, [loadGroupUsers]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, onClose]);

  const clearFieldError = (fieldName) => {
    if (!errors[fieldName] && !errors.submit) return;

    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next.submit;
      return next;
    });
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    clearFieldError(field);

    if ((field === 'start_date' || field === 'deadline') && errors.deadline) {
      clearFieldError('deadline');
    }
  };

  const handleAddTag = () => {
    const { tag, error } = validateTaskTag(newTag, tags);

    if (!tag) {
      return;
    }

    if (error) {
      setErrors((prev) => ({ ...prev, tags: error, submit: '' }));
      return;
    }

    setTags((prev) => [...prev, tag]);
    setNewTag('');
    setShowTagInput(false);
    clearFieldError('tags');
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
    clearFieldError('tags');
  };

  const handleAddDefaultTag = (tag) => {
    if (tags.includes(tag)) {
      return;
    }

    if (tags.length >= TAGS_LIMIT) {
      setErrors((prev) => ({
        ...prev,
        tags: `Можно добавить не больше ${TAGS_LIMIT} тегов`,
        submit: '',
      }));
      return;
    }

    setTags((prev) => [...prev, tag]);
    clearFieldError('tags');
  };

  const handleAssigneeToggle = (userId) => {
    setAssigneeIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }

      return [...prev, userId];
    });

    clearFieldError('assignees');
  };

  const handleSelectAllUsers = () => {
    if (assigneeIds.length === availableUsers.length) {
      setAssigneeIds([]);
      clearFieldError('assignees');
      return;
    }

    setAssigneeIds(availableUsers.map((userItem) => userItem.id));
    clearFieldError('assignees');
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && !loading) {
      onClose();
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateTextField(formData.title, {
      label: 'Название задачи',
      min: 2,
      max: TASK_TITLE_LIMIT,
    });

    if (titleError) {
      newErrors.title = titleError;
    }

    const descriptionError = validateOptionalTextField(formData.description, {
      label: 'Описание задачи',
      max: TASK_DESCRIPTION_LIMIT,
      requireMeaningful: false,
    });

    if (descriptionError) {
      newErrors.description = descriptionError;
    }

    const tagsError = validateTaskTags(tags);

    if (tagsError) {
      newErrors.tags = tagsError;
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Укажите дату начала задачи';
    }

    if (!formData.deadline) {
      newErrors.deadline = 'Укажите срок выполнения задачи';
    } else if (formData.start_date && formData.deadline < formData.start_date) {
      newErrors.deadline = 'Срок выполнения не может быть раньше даты начала';
    }

    if (!project?.id || !group?.id) {
      newErrors.submit = 'Не выбран проект или группа';
    }

    if (isAdminMode && assigneeIds.length === 0) {
      newErrors.assignees = 'Выберите хотя бы одного исполнителя';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildTaskData = () => {
    const taskData = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      status: formData.status,
      priority: formData.priority,
      start_date: formData.start_date
        ? new Date(formData.start_date).toISOString()
        : null,
      deadline: formData.deadline
        ? new Date(formData.deadline).toISOString()
        : null,
      project_id: project.id,
      group_id: group.id,
      tags,
    };

    if (isAdminMode && assigneeIds.length > 0) {
      taskData.assignee_ids = assigneeIds;
    }

    return taskData;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await onSubmit(buildTaskData());
    } catch (err) {
      const errorMessage = handleApiError(err);
      setErrors({ submit: `Не удалось создать задачу: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Новая задача</h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={loading}
            aria-label="Закрыть"
          >
            <X size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.contextGrid}>
            <div className={styles.contextItem}>
              <span className={styles.contextIcon}>
                <FolderKanban size={18} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.contextText}>
                <span className={styles.contextLabel}>Проект</span>
                <span className={styles.contextValue}>{project?.title || 'Не выбран'}</span>
              </span>
            </div>

            <div className={styles.contextItem}>
              <span className={styles.contextIcon}>
                <Users size={18} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.contextText}>
                <span className={styles.contextLabel}>Группа</span>
                <span className={styles.contextValue}>{group?.name || 'Не выбрана'}</span>
              </span>
            </div>
          </div>

          {isAdminMode && (
            <div className={styles.adminBadge}>
              <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
              Режим администратора
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>
              Название задачи <span>*</span>
            </label>

            <Input
              type="text"
              value={formData.title}
              onChange={(event) => handleChange('title', event.target.value)}
              placeholder="Введите название задачи..."
              required
              autoFocus
              maxLength={TASK_TITLE_LIMIT}
              helperText={`От 2 до ${TASK_TITLE_LIMIT} символов`}
              error={errors.title}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Описание</label>

            <textarea
              value={formData.description}
              onChange={(event) => handleChange('description', event.target.value)}
              placeholder="Описание задачи"
              className={`${styles.textarea} ${errors.description ? styles.textareaError : ''}`}
              rows={3}
              maxLength={TASK_DESCRIPTION_LIMIT}
              disabled={loading}
            />

            <div className={styles.fieldFooter}>
              {errors.description ? (
                <span className={styles.errorMessage}>{errors.description}</span>
              ) : (
                <span className={styles.helperText}>Необязательное поле</span>
              )}

              <span className={styles.charCount}>
                {formData.description.length}/{TASK_DESCRIPTION_LIMIT}
              </span>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Статус</label>

              <select
                value={formData.status}
                onChange={(event) => handleChange('status', event.target.value)}
                className={styles.select}
                disabled={loading}
              >
                {TASK_STATUS_OPTIONS.map((option) => (
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
                onChange={(event) => handleChange('priority', event.target.value)}
                className={styles.select}
                disabled={loading}
              >
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Дата начала <span>*</span>
              </label>

              <Input
                type="date"
                value={formData.start_date}
                onChange={(event) => handleChange('start_date', event.target.value)}
                min={today}
                required
                error={errors.start_date}
                disabled={loading}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Срок выполнения <span>*</span>
              </label>

              <Input
                type="date"
                value={formData.deadline}
                onChange={(event) => handleChange('deadline', event.target.value)}
                min={formData.start_date || today}
                required
                error={errors.deadline}
                disabled={loading}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <div className={styles.tagsHeader}>
              <label className={styles.label}>
                <Tag size={16} strokeWidth={2} aria-hidden="true" />
                Теги
              </label>

              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={() => setShowTagInput((value) => !value)}
                disabled={loading}
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
                    placeholder="Введите название тега..."
                    maxLength={TAG_LIMIT}
                    helperText={`До ${TAG_LIMIT} символов`}
                    error={errors.tags}
                    onChange={(event) => {
                      setNewTag(event.target.value);
                      clearFieldError('tags');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddTag();
                      }
                    }}
                    disabled={loading}
                  />

                  <Button
                    type="button"
                    variant="primary"
                    size="small"
                    onClick={handleAddTag}
                    disabled={!newTag.trim() || tags.length >= TAGS_LIMIT || loading}
                  >
                    Добавить
                  </Button>
                </div>

                <div className={styles.suggestedTags}>
                  <span className={styles.suggestedLabel}>Предложенные:</span>

                  <div className={styles.defaultTags}>
                    {defaultTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={styles.defaultTag}
                        onClick={() => handleAddDefaultTag(tag)}
                        disabled={tags.includes(tag) || tags.length >= TAGS_LIMIT || loading}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {errors.tags && !showTagInput && (
              <div className={styles.inlineError} role="alert">
                {errors.tags}
              </div>
            )}

            {tags.length > 0 && (
              <div className={styles.selectedTags}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.selectedTag}>
                    #{tag}

                    <button
                      type="button"
                      className={styles.removeTag}
                      onClick={() => handleRemoveTag(tag)}
                      disabled={loading}
                      aria-label={`Удалить тег ${tag}`}
                    >
                      <X size={16} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isAdminMode && (
            <div className={styles.assigneesSection}>
              <div className={styles.assigneesHeader}>
                <label className={styles.label}>
                  <UserCheck size={16} strokeWidth={2} aria-hidden="true" />
                  Исполнители <span>*</span>
                </label>

                {availableUsers.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={handleSelectAllUsers}
                    disabled={loading || usersLoading}
                  >
                    {assigneeIds.length === availableUsers.length
                      ? 'Снять всех'
                      : 'Выбрать всех'}
                  </Button>
                )}
              </div>

              {errors.assignees && (
                <div className={styles.inlineError} role="alert">
                  {errors.assignees}
                </div>
              )}

              {usersLoading ? (
                <div className={styles.usersLoading}>
                  Загрузка участников...
                </div>
              ) : availableUsers.length > 0 ? (
                <>
                  <div className={styles.usersList}>
                    {availableUsers.map((userItem) => {
                      const selected = assigneeIds.includes(userItem.id);

                      return (
                        <label
                          key={userItem.id}
                          className={`${styles.userItem} ${selected ? styles.selected : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleAssigneeToggle(userItem.id)}
                            className={styles.checkboxInput}
                            disabled={loading}
                          />

                          <span className={styles.checkboxCustom}>
                            {selected && (
                              <CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />
                            )}
                          </span>

                          <span className={styles.userAvatar}>
                            {getUserInitial(userItem)}
                          </span>

                          <span className={styles.userInfo}>
                            <span className={styles.userMain}>
                              <span className={styles.userLogin}>
                                {getUserName(userItem)}
                              </span>

                              {userItem.id === user?.id && (
                                <span className={styles.currentUserBadge}>Вы</span>
                              )}
                            </span>

                            {userItem.email && (
                              <span className={styles.userEmail}>{userItem.email}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className={styles.selectedCount}>
                    <span>
                      Выбрано: {formatRussianCount(assigneeIds.length, ASSIGNEE_FORMS)}
                    </span>

                    {selectedAssignees.length > 0 && (
                      <span>
                        {selectedAssignees.map((item) => getUserName(item)).join(', ')}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.usersLoading}>
                  В группе нет доступных участников
                </div>
              )}
            </div>
          )}

          {!isAdminMode && (
            <div className={styles.userInfoCard}>
              <p>Задача будет назначена вам как создателю.</p>
              <p>Только администраторы группы могут назначать задачи другим пользователям.</p>
            </div>
          )}

          {errors.submit && (
            <div className={styles.submitError} role="alert">
              {errors.submit}
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
              disabled={loading || usersLoading}
            >
              {isAdminMode && assigneeIds.length > 1
                ? `Создать для ${formatRussianCount(assigneeIds.length, USER_GENITIVE_FORMS)}`
                : 'Создать задачу'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};