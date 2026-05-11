import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useNotification } from '../../../hooks/useNotification';
import {
  formatRussianCount,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import styles from './CreateGroup.module.css';

const MAX_GROUPS = 5;

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
    hideNotification,
  } = useNotification();

  const handleGroupChange = (index, field, value) => {
    const updatedGroups = [...groups];
    updatedGroups[index][field] = value;
    setGroups(updatedGroups);

    const errorKey = `group_${index}_${field}`;

    if (errors[errorKey] || errors.submit) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        delete next.submit;
        return next;
      });
    }
  };

  const addGroup = () => {
    if (groups.length >= MAX_GROUPS) return;
    setGroups((prev) => [...prev, { name: '', description: '' }]);
  };

  const removeGroup = (index) => {
    if (groups.length <= 1) return;

    setGroups((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

    setErrors((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        if (key.startsWith(`group_${index}_`)) {
          delete next[key];
        }
      });

      return next;
    });
  };

  const validateForm = () => {
    const newErrors = {};

    groups.forEach((group, index) => {
      const name = group.name.trim();

      if (!name) {
        newErrors[`group_${index}_name`] = 'Название группы обязательно';
      } else if (name.length < 2) {
        newErrors[`group_${index}_name`] = 'Название должно содержать минимум 2 символа';
      } else if (name.length > 100) {
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
        if (!group.name.trim()) continue;

        try {
          const createdGroup = await groupsAPI.create({
            name: group.name.trim(),
            description: group.description.trim(),
          });

          created.push(createdGroup);
        } catch (error) {
          creationErrors.push(`Группа ${index + 1}: ${handleApiError(error)}`);
        }
      }

      setCreatedGroups(created);

      if (creationErrors.length > 0) {
        const errorMessage = creationErrors.join('; ');

        if (created.length === 0) {
          showError(errorMessage);
          setErrors({ submit: errorMessage });
        } else {
          showSuccess(`Создано ${created.length} из ${groups.length} групп`);
          setErrors({ submit: `Ошибки: ${errorMessage}` });
          setShowContinueModal(true);
        }

        return;
      }

      showSuccess(
        created.length === 1
          ? `Группа "${created[0].name}" успешно создана`
          : `Успешно создано ${created.length} групп`
      );

      setShowContinueModal(true);
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

  const hasEmptyRequiredFields = groups.some((group) => !group.name.trim());

  return (
    <div className={styles.container}>
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
        duration={5000}
      />

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/groups')}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            К группам
          </button>

          <h1 className={styles.title}>Создание групп</h1>

          <p className={styles.subtitle}>
            Создайте одну или несколько групп. Вы автоматически станете администратором
            созданных групп.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formHeader}>
          <div>
            <h2 className={styles.formTitle}>Параметры групп</h2>
            <p className={styles.formSubtitle}>
              Можно создать до {MAX_GROUPS} групп за один раз.
            </p>
          </div>

          <span className={styles.groupCounter}>
            {formatRussianCount(groups.length, RUSSIAN_PLURAL_FORMS.GROUP)}
          </span>
        </div>

        <div className={styles.groupsList}>
          {groups.map((group, index) => (
            <section key={index} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <div>
                  <h3 className={styles.groupNumber}>Группа {index + 1}</h3>
                  <p className={styles.groupHint}>Название обязательно, описание можно добавить позже.</p>
                </div>

                {groups.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => removeGroup(index)}
                    className={styles.removeButton}
                    disabled={loading}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                    Удалить
                  </Button>
                )}
              </div>

              <div className={styles.groupFields}>
                <Input
                  label="Название группы"
                  name={`name_${index}`}
                  type="text"
                  value={group.name}
                  onChange={(e) => handleGroupChange(index, 'name', e.target.value)}
                  error={errors[`group_${index}_name`]}
                  placeholder="Например: Команда разработки"
                  disabled={loading}
                  autoComplete="off"
                  maxLength={100}
                  required
                />

                <div className={styles.textareaGroup}>
                  <label className={styles.label} htmlFor={`description_${index}`}>
                    Описание группы
                  </label>

                  <textarea
                    id={`description_${index}`}
                    name={`description_${index}`}
                    value={group.description}
                    onChange={(e) => handleGroupChange(index, 'description', e.target.value)}
                    placeholder="Кратко опишите назначение группы"
                    disabled={loading}
                    className={`${styles.textarea} ${errors[`group_${index}_description`] ? styles.textareaError : ''}`}
                    rows={4}
                    maxLength={500}
                  />

                  <div className={styles.textareaFooter}>
                    {errors[`group_${index}_description`] ? (
                      <span className={styles.errorMessage}>
                        {errors[`group_${index}_description`]}
                      </span>
                    ) : (
                      <span className={styles.helperText}>
                        Необязательное поле
                      </span>
                    )}

                    <span className={styles.charCount}>
                      {group.description?.length || 0}/500
                    </span>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="medium"
            onClick={addGroup}
            disabled={loading || groups.length >= MAX_GROUPS}
            className={styles.addButton}
          >
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
            Добавить группу
          </Button>

          {groups.length >= MAX_GROUPS && (
            <p className={styles.maxGroupsWarning}>
              Достигнуто максимальное количество групп для одновременного создания.
            </p>
          )}
        </div>

        {errors.submit && (
          <div className={styles.submitError} role="alert">
            {errors.submit}
          </div>
        )}

        <div className={styles.submitActions}>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={() => navigate('/groups')}
            disabled={loading}
          >
            Отмена
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="large"
            loading={loading}
            disabled={hasEmptyRequiredFields}
            className={styles.submitButton}
          >
            {groups.length === 1 ? 'Создать группу' : `Создать ${groups.length} групп`}
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showContinueModal}
        onClose={handleContinueCreating}
        onConfirm={handleNavigateToGroups}
        title="Группы созданы"
        message={
          createdGroups.length === 1
            ? `Группа "${createdGroups[0]?.name}" была успешно создана.`
            : `Успешно создано ${createdGroups.length} групп.`
        }
        confirmText="Перейти к группам"
        cancelText="Создать ещё"
        variant="success"
        isLoading={false}
      />
    </div>
  );
};