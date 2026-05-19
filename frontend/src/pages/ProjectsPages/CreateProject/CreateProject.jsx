import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Plus,
  Users,
} from 'lucide-react';

import { projectsAPI } from '../../../services/api/projects';
import { groupsAPI } from '../../../services/api/groups';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Notification } from '../../../components/ui/Notification';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { getAutoProjectStatus } from '../../../utils/projectStatus';
import {
  formatRussianCount,
  getRussianPluralForm,
  handleApiError,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
import {
  FIELD_LIMITS,
  validateOptionalTextField,
  validateTextField,
} from '../../../utils/validation';
import styles from './CreateProject.module.css';

const TITLE_LIMIT = FIELD_LIMITS.PROJECT_TITLE;
const DESCRIPTION_LIMIT = FIELD_LIMITS.PROJECT_DESCRIPTION;

const getTodayInputValue = () => new Date().toISOString().split('T')[0];

const getTomorrowInputValue = () =>
  new Date(Date.now() + 86400000).toISOString().split('T')[0];

export const CreateProject = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const today = useMemo(() => getTodayInputValue(), []);
  const tomorrow = useMemo(() => getTomorrowInputValue(), []);
  const preselectedGroup = location.state?.preselectedGroup;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: today,
    end_date: tomorrow,
    group_ids: [],
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
    hideNotification,
  } = useNotification();

  const loadAvailableGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);

      const groupsData = await groupsAPI.getMyGroups();
      const safeGroups = Array.isArray(groupsData) ? groupsData : [];

      const adminGroups = safeGroups.filter((group) =>
        group.users?.some((groupUser) =>
          groupUser.id === user?.id &&
          groupUser.role === 'admin'
        )
      );

      setAvailableGroups(adminGroups);
    } catch (err) {
      console.error('Error loading groups:', err);
      const errorMessage = handleApiError(err);

      showError('Не удалось загрузить список групп');
      setErrors({ groups: errorMessage });
      setAvailableGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [user?.id, showError]);

  useEffect(() => {
    loadAvailableGroups();
  }, [loadAvailableGroups]);

  useEffect(() => {
    if (!preselectedGroup?.id || availableGroups.length === 0) return;

    const groupExists = availableGroups.some((group) => group.id === preselectedGroup.id);

    if (!groupExists) return;

    setFormData((prev) => {
      if (prev.group_ids.length > 0) return prev;

      return {
        ...prev,
        group_ids: [preselectedGroup.id],
      };
    });
  }, [availableGroups, preselectedGroup]);

  const selectedGroups = useMemo(() => {
    return availableGroups.filter((group) => formData.group_ids.includes(group.id));
  }, [availableGroups, formData.group_ids]);

  const durationDays = useMemo(() => {
    if (!formData.start_date || !formData.end_date) return null;

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return Math.max(0, Math.ceil((end - start) / 86400000));
  }, [formData.start_date, formData.end_date]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name] || errors.submit) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        delete next.submit;
        return next;
      });
    }
  };

  const handleGroupToggle = (groupId) => {
    setFormData((prev) => {
      const isSelected = prev.group_ids.includes(groupId);

      return {
        ...prev,
        group_ids: isSelected
          ? prev.group_ids.filter((id) => id !== groupId)
          : [...prev.group_ids, groupId],
      };
    });

    if (errors.group_ids || errors.submit) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.group_ids;
        delete next.submit;
        return next;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const title = formData.title.trim();

    const titleError = validateTextField(title, {
      label: 'Название проекта',
      min: 2,
      max: TITLE_LIMIT,
    });

    if (titleError) {
      newErrors.title = titleError;
    }

    const descriptionError = validateOptionalTextField(formData.description, {
      label: 'Описание проекта',
      max: DESCRIPTION_LIMIT,
      requireMeaningful: false,
    });

    if (descriptionError) {
      newErrors.description = descriptionError;
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
        title: formData.title.trim(),
        description: formData.description.trim(),
        status: autoStatus,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
      };

      const project = await projectsAPI.create(projectData);

      setCreatedProject(project);
      showSuccess(`Проект "${formData.title}" успешно создан`);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error creating project:', error);
      const errorMessage = handleApiError(error);

      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToProjectDetail = () => {
    if (createdProject?.id) {
      navigate(`/projects/${createdProject.id}`);
      return;
    }

    navigate('/projects');
  };

  const handleContinueCreating = () => {
    setFormData({
      title: '',
      description: '',
      start_date: today,
      end_date: tomorrow,
      group_ids: [],
    });

    setCreatedProject(null);
    setShowSuccessModal(false);
    setErrors({});
  };

  const hasEmptyRequiredFields =
    !formData.title.trim() ||
    !formData.start_date ||
    !formData.end_date ||
    formData.group_ids.length === 0;

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
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            К проектам
          </button>

          <h1 className={styles.title}>Создание проекта</h1>

          <p className={styles.subtitle}>
            Создайте проект, задайте сроки выполнения и прикрепите группы,
            которыми вы управляете.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formHeader}>
          <div>
            <h2 className={styles.formTitle}>Параметры проекта</h2>
            <p className={styles.formSubtitle}>
              Заполните основные сведения и выберите рабочие группы проекта.
            </p>
          </div>

          <span className={styles.formBadge}>
            {formatRussianCount(formData.group_ids.length, RUSSIAN_PLURAL_FORMS.GROUP)}
          </span>
        </div>

        <div className={styles.formBody}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <FolderKanban size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Основная информация</h3>
                <p className={styles.sectionSubtitle}>
                  Название будет отображаться в списках, карточках и уведомлениях.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <Input
                label="Название проекта"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                error={errors.title}
                placeholder="Например: Разработка клиентского портала"
                disabled={loading}
                autoComplete="off"
                maxLength={TITLE_LIMIT}
                helperText={`От 2 до ${TITLE_LIMIT} символов`}
                required
              />

              <div className={styles.textareaGroup}>
                <label className={styles.label} htmlFor="project-description">
                  Описание проекта
                </label>

                <textarea
                  id="project-description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Опишите цель, контекст или ожидаемый результат проекта"
                  disabled={loading}
                  className={`${styles.textarea} ${errors.description ? styles.textareaError : ''}`}
                  rows={5}
                  maxLength={DESCRIPTION_LIMIT}
                />

                <div className={styles.textareaFooter}>
                  {errors.description ? (
                    <span className={styles.errorMessage}>{errors.description}</span>
                  ) : (
                    <span className={styles.helperText}>Необязательное поле</span>
                  )}

                  <span className={styles.charCount}>
                    {formData.description.length}/{DESCRIPTION_LIMIT}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Сроки выполнения</h3>
                <p className={styles.sectionSubtitle}>
                  Статус проекта будет рассчитан автоматически на основе дат.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              <div className={styles.dateFields}>
                <Input
                  label="Дата начала"
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
                  label="Дата окончания"
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

              <div className={styles.dateSummary}>
                <span className={styles.dateSummaryLabel}>Плановая длительность</span>
                <span className={styles.dateSummaryValue}>
                  {durationDays === null
                    ? 'Не рассчитана'
                    : formatRussianCount(durationDays, RUSSIAN_PLURAL_FORMS.DAY)}
                </span>
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Users size={20} strokeWidth={2} aria-hidden="true" />
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Прикреплённые группы</h3>
                <p className={styles.sectionSubtitle}>
                  Выберите группы, которые будут участвовать в проекте.
                </p>
              </div>
            </div>

            <div className={styles.sectionContent}>
              {groupsLoading ? (
                <div className={styles.loadingGroups}>
                  <div className={styles.spinner}></div>
                  <p>Загрузка списка групп...</p>
                </div>
              ) : availableGroups.length === 0 ? (
                <div className={styles.noGroups}>
                  <div className={styles.noGroupsIcon}>
                    <Users size={42} strokeWidth={1.8} aria-hidden="true" />
                  </div>

                  <h4>Нет доступных групп</h4>

                  <p>
                    Для создания проекта нужна хотя бы одна группа, где вы являетесь
                    администратором.
                  </p>

                  <Button
                    to="/groups/create"
                    variant="primary"
                    size="medium"
                  >
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    Создать группу
                  </Button>
                </div>
              ) : (
                <>
                  {errors.group_ids && (
                    <div className={styles.groupError} role="alert">
                      {errors.group_ids}
                    </div>
                  )}

                  <div className={styles.groupsGrid}>
                    {availableGroups.map((group) => {
                      const isSelected = formData.group_ids.includes(group.id);

                      return (
                        <label
                          key={group.id}
                          className={`${styles.groupCard} ${isSelected ? styles.selected : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleGroupToggle(group.id)}
                            className={styles.checkboxInput}
                            disabled={loading}
                          />

                          <span className={styles.checkboxCustom}>
                            {isSelected && (
                              <CheckCircle2 size={18} strokeWidth={2.3} aria-hidden="true" />
                            )}
                          </span>

                          <span className={styles.groupInfo}>
                            <span className={styles.groupName}>{group.name}</span>

                            {group.description ? (
                              <span className={styles.groupDescription}>
                                {group.description}
                              </span>
                            ) : (
                              <span className={styles.groupDescriptionMuted}>
                                Описание группы не указано
                              </span>
                            )}

                            <span className={styles.groupStats}>
                              <span>
                                {formatRussianCount(
                                  group.users?.length || 0,
                                  RUSSIAN_PLURAL_FORMS.PARTICIPANT
                                )}
                              </span>

                              <span>
                                {formatRussianCount(
                                  group.projects?.length || 0,
                                  RUSSIAN_PLURAL_FORMS.PROJECT
                                )}
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className={styles.selectedPanel}>
                    <span className={styles.selectedTitle}>
                      Выбрано: {formatRussianCount(
                        formData.group_ids.length,
                        RUSSIAN_PLURAL_FORMS.GROUP
                      )}
                    </span>

                    {selectedGroups.length > 0 && (
                      <span className={styles.selectedNames}>
                        {selectedGroups.map((group) => group.name).join(', ')}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
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
            disabled={availableGroups.length === 0 || groupsLoading || loading || hasEmptyRequiredFields}
            className={styles.submitButton}
          >
            Создать проект
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={handleContinueCreating}
        onConfirm={handleNavigateToProjectDetail}
        title="Проект создан"
        message={`Проект "${createdProject?.title || formData.title}" успешно создан и прикреплён к ${getRussianPluralForm(formData.group_ids.length, ['выбранной группе', 'выбранным группам', 'выбранным группам'])}.`}
        confirmText="Перейти к проекту"
        cancelText="Создать ещё"
        variant="success"
        isLoading={false}
      />
    </div>
  );
};