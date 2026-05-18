import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import {
  formatDate,
  formatNumber,
  getTaskStatusTranslation,
  handleApiError,
} from '../../../utils/helpers';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_PRIORITY_TRANSLATIONS,
  TASK_STATUS_OPTIONS,
} from '../../../utils/constants';
import styles from './AdminTasks.module.css';

const normalizeTokenKey = (value, fallback) => String(value || fallback)
  .trim()
  .toLowerCase()
  .replace(/-/g, '_');

const getStatusClass = (status) => {
  const normalized = normalizeTokenKey(status, 'backlog');
  return styles[`status_${normalized}`] || styles.status_backlog;
};
const getPriorityClass = (priority) => {
  const normalized = normalizeTokenKey(priority, 'medium');
  return styles[`priority_${normalized}`] || styles.priority_medium;
};
const formatTag = (tag) => {
  const value = String(tag || '').trim();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [overdue, setOverdue] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskToDelete, setTaskToDelete] = useState(null);

  const params = useMemo(() => ({
    q: search.trim(),
    status,
    priority,
    overdue,
  }), [search, status, priority, overdue]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getTasks(params);
      setTasks(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    const timeout = setTimeout(loadTasks, 250);
    return () => clearTimeout(timeout);
  }, [loadTasks]);

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setPriority('');
    setOverdue('');
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    setActionLoading(true);

    try {
      await adminAPI.deleteTask(taskToDelete.id);
      await loadTasks();
      showAdminToast('Задача удалена');
      setTaskToDelete(null);
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось удалить задачу: ${message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Задачи системы"
      actions={
        <Button variant="secondary" onClick={loadTasks} disabled={loading}>
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
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Приоритет</label>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className={styles.select}>
              <option value="">Все приоритеты</option>
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Просрочка</label>
            <select value={overdue} onChange={(event) => setOverdue(event.target.value)} className={styles.select}>
              <option value="">Все задачи</option>
              <option value="true">Просроченные</option>
              <option value="false">Без просрочки</option>
            </select>
          </div>

          <Button variant="secondary" onClick={resetFilters} disabled={!search && !status && !priority && !overdue}>
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.listHeader}>
            <h3>Задачи</h3>
            <span>{formatNumber(tasks.length)}</span>
          </div>

          {loading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : tasks.length === 0 ? (
            <div className={styles.empty}>Задачи не найдены.</div>
          ) : (
            <div className={styles.grid}>
              {tasks.map((task) => (
                <article key={task.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3>{task.title}</h3>
                    <p>{task.description || 'Описание не указано'}</p>
                  </div>

                  <div className={styles.badgesRow}>
                    <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>
                      {getTaskStatusTranslation(task.status)}
                    </span>
                    <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>
                      {TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}
                    </span>
                    {task.is_overdue && (
                      <span className={styles.overdueBadge}>
                        <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
                        Просрочена
                      </span>
                    )}
                  </div>

                  <div className={styles.metaGrid}>
                    <div><span>Проект</span><strong>{task.project?.title || 'Не указан'}</strong></div>
                    <div><span>Группа</span><strong>{task.group?.name || 'Не указана'}</strong></div>
                    <div><span>Начало</span><strong>{formatDate(task.start_date)}</strong></div>
                    <div><span>Срок</span><strong>{formatDate(task.deadline)}</strong></div>
                  </div>

                  <div className={styles.block}>
                    <span>Исполнители</span>
                    {task.assignees?.length ? (
                      <div className={styles.badgeList}>
                        {task.assignees.map((assignee) => (
                          <span key={assignee.id} className={styles.badge}>{assignee.name || assignee.login}</span>
                        ))}
                      </div>
                    ) : (
                      <p>Не назначены</p>
                    )}
                  </div>

                  {task.tags?.length > 0 && (
                    <div className={styles.tagsList} aria-label="Теги задачи">
                      {task.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>{formatTag(tag)}</span>
                      ))}
                    </div>
                  )}

                  <div className={styles.cardFooter}>
                    <Button variant="secondary" size="small" to={`/admin/tasks/${task.id}`}>
                      Открыть
                    </Button>
                    <Button variant="danger" size="small" onClick={() => setTaskToDelete(task)}>
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
        isOpen={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleDelete}
        title="Аварийное удаление задачи"
        message={`Удалить задачу "${taskToDelete?.title}"?`}
        confirmText="Удалить задачу"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};