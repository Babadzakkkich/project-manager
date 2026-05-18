import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { AdminLayout } from '../AdminLayout';
import {
  formatDate,
  formatNumber,
  getProjectStatusTranslation,
  getTaskStatusTranslation,
  handleApiError,
} from '../../../utils/helpers';
import { TASK_PRIORITY_TRANSLATIONS } from '../../../utils/constants';
import styles from './AdminDetail.module.css';

const normalizeTokenKey = (value, fallback) => String(value || fallback)
  .trim()
  .toLowerCase()
  .replace(/-/g, '_');

const getStatusClass = (status) => {
  const normalized = normalizeTokenKey(status, 'planned');
  return styles[`status_${normalized}`] || styles.status_planned;
};
const getPriorityClass = (priority) => {
  const normalized = normalizeTokenKey(priority, 'medium');
  return styles[`priority_${normalized}`] || styles.priority_medium;
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getProjectById(projectId);
      setProject(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleDelete = async () => {
    if (!project) return;
    setActionLoading(true);
    setError('');

    try {
      await adminAPI.deleteProject(project.id);
      showAdminToast('Проект удалён');
      navigate('/admin/projects', { replace: true });
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось удалить проект: ${message}`, 'error');
    } finally {
      setActionLoading(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <AdminLayout
      title={project?.title || 'Просмотр проекта'}
      actions={
        <div className={styles.toolbarActions}>
          <Button variant="secondary" to="/admin/projects">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            К проектам
          </Button>
          <Button variant="secondary" onClick={loadProject} disabled={loading}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
            Обновить
          </Button>
        </div>
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : !project ? (
        <div className={styles.empty}>Проект не найден.</div>
      ) : (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>{project.title}</h3>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                Удалить
              </Button>
            </div>
            <div className={styles.panelBody}>
              <p className={styles.description}>{project.description || 'Описание проекта не указано.'}</p>
              <div className={styles.grid} style={{ marginTop: 'var(--space-5)' }}>
                <div className={styles.metaCard}><span>ID</span><strong>{project.id}</strong></div>
                <div className={styles.metaCard}><span>Статус</span><strong>{getProjectStatusTranslation(project.status)}</strong></div>
                <div className={styles.metaCard}><span>Группы</span><strong>{formatNumber(project.groups?.length || 0)}</strong></div>
                <div className={styles.metaCard}><span>Задачи</span><strong>{formatNumber(project.tasks?.length || 0)}</strong></div>
                <div className={styles.metaCard}><span>Начало</span><strong>{formatDate(project.start_date)}</strong></div>
                <div className={styles.metaCard}><span>Окончание</span><strong>{formatDate(project.end_date)}</strong></div>
              </div>
              <div className={styles.badges} style={{ marginTop: 'var(--space-4)' }}>
                <span className={`${styles.statusBadge} ${getStatusClass(project.status)}`}>{getProjectStatusTranslation(project.status)}</span>
              </div>
            </div>
          </section>

          <div className={styles.detailGrid}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Группы</h3>
              </div>
              <div className={styles.sectionBody}>
                {project.groups?.length ? (
                  <div className={styles.cardGrid}>
                    {project.groups.map((group) => (
                      <Link key={group.id} to={`/admin/groups/${group.id}`} className={styles.linkCard}>
                        <h4 className={styles.linkCardTitle}>{group.name}</h4>
                        <p className={styles.linkCardText}>{group.description || 'Описание не указано'}</p>
                        <div className={styles.badges}>
                          <span className={styles.badge}>Участники: {formatNumber(group.users_count)}</span>
                          <span className={styles.badge}>Задачи: {formatNumber(group.tasks_count)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>Группы не связаны.</div>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Задачи</h3>
              </div>
              <div className={styles.sectionBody}>
                {project.tasks?.length ? (
                  <div className={styles.cardGrid}>
                    {project.tasks.map((task) => (
                      <Link key={task.id} to={`/admin/tasks/${task.id}`} className={styles.linkCard}>
                        <h4 className={styles.linkCardTitle}>{task.title}</h4>
                        <div className={styles.badges}>
                          <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>{getTaskStatusTranslation(task.status)}</span>
                          <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>{TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}</span>
                          {task.is_overdue && <span className={styles.overdueBadge}>Просрочена</span>}
                        </div>
                        <p className={styles.linkCardText}>Срок: {formatDate(task.deadline)}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>Задач нет.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Аварийное удаление проекта"
        message={`Удалить проект "${project?.title}"?`}
        confirmText="Удалить проект"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};