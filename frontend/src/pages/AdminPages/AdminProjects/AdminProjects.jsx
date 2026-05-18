import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import {
  formatDate,
  formatNumber,
  getProjectStatusTranslation,
  handleApiError,
} from '../../../utils/helpers';
import { PROJECT_STATUS_OPTIONS } from '../../../utils/constants';
import styles from './AdminProjects.module.css';

const normalizeTokenKey = (value, fallback) => String(value || fallback)
  .trim()
  .toLowerCase()
  .replace(/-/g, '_');

const getStatusClass = (status) => {
  const normalized = normalizeTokenKey(status, 'planned');
  return styles[`status_${normalized}`] || styles.status_planned;
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminProjects = () => {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);

  const params = useMemo(() => ({ q: search.trim(), status }), [search, status]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getProjects(params);
      setProjects(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    const timeout = setTimeout(loadProjects, 250);
    return () => clearTimeout(timeout);
  }, [loadProjects]);

  const resetFilters = () => {
    setSearch('');
    setStatus('');
  };

  const handleDelete = async () => {
    if (!projectToDelete) return;
    setActionLoading(true);

    try {
      await adminAPI.deleteProject(projectToDelete.id);
      await loadProjects();
      showAdminToast('Проект удалён');
      setProjectToDelete(null);
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось удалить проект: ${message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Проекты системы"
      actions={
        <Button variant="secondary" onClick={loadProjects} disabled={loading}>
          <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          Обновить
        </Button>
      }
    >
      <div className={styles.pageGrid}>
        <aside className={styles.filters}>
          <Input
            label="Поиск"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название или описание"
          />
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Статус</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={styles.select}>
              <option value="">Все статусы</option>
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={resetFilters} disabled={!search && !status}>
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.listHeader}>
            <h3>Проекты</h3>
            <span>{formatNumber(projects.length)}</span>
          </div>

          {loading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : projects.length === 0 ? (
            <div className={styles.empty}>Проекты не найдены.</div>
          ) : (
            <div className={styles.grid}>
              {projects.map((project) => (
                <article key={project.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3>{project.title}</h3>
                    <p>{project.description || 'Описание не указано'}</p>
                  </div>

                  <div className={styles.badgesRow}>
                    <span className={`${styles.statusBadge} ${getStatusClass(project.status)}`}>
                      {getProjectStatusTranslation(project.status)}
                    </span>
                  </div>

                  <div className={styles.metaGrid}>
                    <div><span>Задачи</span><strong>{formatNumber(project.tasks_count)}</strong></div>
                    <div><span>Группы</span><strong>{formatNumber(project.groups?.length || 0)}</strong></div>
                    <div><span>Начало</span><strong>{formatDate(project.start_date)}</strong></div>
                    <div><span>Окончание</span><strong>{formatDate(project.end_date)}</strong></div>
                  </div>

                  <div className={styles.block}>
                    <span>Группы</span>
                    {project.groups?.length ? (
                      <div className={styles.badgeList}>
                        {project.groups.map((group) => (
                          <span key={group.id} className={styles.badge}>{group.name}</span>
                        ))}
                      </div>
                    ) : (
                      <p>Не связаны</p>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <Button variant="secondary" size="small" to={`/admin/projects/${project.id}`}>
                      Открыть
                    </Button>
                    <Button variant="danger" size="small" onClick={() => setProjectToDelete(project)}>
                      <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                      Удалить
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      <ConfirmationModal
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleDelete}
        title="Аварийное удаление проекта"
        message={`Удалить проект "${projectToDelete?.title}"?`}
        confirmText="Удалить проект"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};