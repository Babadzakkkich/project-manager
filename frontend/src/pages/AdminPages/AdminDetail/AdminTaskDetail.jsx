import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { AdminLayout } from '../AdminLayout';
import {
  formatDate,
  getProjectStatusTranslation,
  getTaskStatusTranslation,
  handleApiError,
} from '../../../utils/helpers';
import { TASK_PRIORITY_TRANSLATIONS } from '../../../utils/constants';
import styles from './AdminDetail.module.css';

const ACTION_LABELS = {
  status_change: 'Изменение статуса',
  priority_change: 'Изменение приоритета',
  update: 'Обновление',
  create: 'Создание',
  assign: 'Назначение',
  unassign: 'Снятие назначения',
};

const normalizeTokenKey = (value, fallback) => String(value || fallback)
  .trim()
  .toLowerCase()
  .replace(/-/g, '_');

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const getStatusClass = (status) => {
  const normalized = normalizeTokenKey(status, 'backlog');
  return styles[`status_${normalized}`] || styles.status_backlog;
};

const getPriorityClass = (priority) => {
  const normalized = normalizeTokenKey(priority, 'medium');
  return styles[`priority_${normalized}`] || styles.priority_medium;
};

const getPriorityLabel = (priority) => {
  const normalized = normalizeTokenKey(priority, 'medium');
  return TASK_PRIORITY_TRANSLATIONS[normalized] || TASK_PRIORITY_TRANSLATIONS[priority] || priority;
};

const formatTag = (tag) => {
  const value = String(tag || '').trim();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
};

const formatHistoryValue = (action, value) => {
  if (!hasValue(value)) return '—';

  const normalized = normalizeTokenKey(value, value);

  if (action === 'status_change') {
    return getTaskStatusTranslation(normalized);
  }

  if (action === 'priority_change') {
    return getPriorityLabel(normalized);
  }

  return String(value);
};

const renderHistoryValue = (entry, value) => {
  if (!hasValue(value)) {
    return <span className={styles.mutedValue}>—</span>;
  }

  if (entry.action === 'status_change') {
    return (
      <span className={`${styles.statusBadge} ${getStatusClass(value)}`}>
        {formatHistoryValue(entry.action, value)}
      </span>
    );
  }

  if (entry.action === 'priority_change') {
    return (
      <span className={`${styles.priorityBadge} ${getPriorityClass(value)}`}>
        {formatHistoryValue(entry.action, value)}
      </span>
    );
  }

  return <span>{formatHistoryValue(entry.action, value)}</span>;
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminTaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError('');

    try {
      const [taskData, historyData] = await Promise.all([
        adminAPI.getTaskById(taskId),
        adminAPI.getTaskHistory(taskId),
      ]);
      setTask(taskData);
      setHistory(historyData);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const handleDelete = async () => {
    if (!task) return;
    setActionLoading(true);
    setError('');

    try {
      await adminAPI.deleteTask(task.id);
      showAdminToast('Задача удалена');
      navigate('/admin/tasks', { replace: true });
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось удалить задачу: ${message}`, 'error');
    } finally {
      setActionLoading(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <AdminLayout
      title={task?.title || 'Просмотр задачи'}
      actions={
        <div className={styles.toolbarActions}>
          <Button variant="secondary" to="/admin/tasks">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            К задачам
          </Button>
          <Button variant="secondary" onClick={loadTask} disabled={loading}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
            Обновить
          </Button>
        </div>
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : !task ? (
        <div className={styles.empty}>Задача не найдена.</div>
      ) : (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>{task.title}</h3>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                Удалить
              </Button>
            </div>
            <div className={styles.panelBody}>
              <p className={styles.description}>{task.description || 'Описание задачи не указано.'}</p>

              <div className={styles.badges} style={{ marginTop: 'var(--space-4)' }}>
                <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>
                  {getTaskStatusTranslation(task.status)}
                </span>
                <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>
                  {getPriorityLabel(task.priority)}
                </span>
                {task.is_overdue && (
                  <span className={styles.overdueBadge}>
                    <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
                    Просрочена
                  </span>
                )}
              </div>

              <div className={styles.grid} style={{ marginTop: 'var(--space-5)' }}>
                <div className={styles.metaCard}><span>ID</span><strong>{task.id}</strong></div>
                <div className={styles.metaCard}><span>Создана</span><strong>{formatDate(task.created_at)}</strong></div>
                <div className={styles.metaCard}><span>Начало</span><strong>{formatDate(task.start_date)}</strong></div>
                <div className={styles.metaCard}><span>Срок</span><strong>{formatDate(task.deadline)}</strong></div>
              </div>

              {task.tags?.length > 0 && (
                <div className={styles.tags} style={{ marginTop: 'var(--space-4)' }}>
                  {task.tags.map((tag) => <span key={tag} className={styles.tag}>{formatTag(tag)}</span>)}
                </div>
              )}
            </div>
          </section>

          <div className={styles.detailGrid}>
            <div className={styles.stack}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Проект</h3>
                </div>
                <div className={styles.sectionBody}>
                  {task.project ? (
                    <Link to={`/admin/projects/${task.project.id}`} className={styles.relationCard}>
                      <div className={styles.relationCardHeader}>
                        <h4 className={styles.relationCardTitle}>{task.project.title}</h4>
                        {task.project.status && (
                          <span className={`${styles.statusBadge} ${getStatusClass(task.project.status)}`}>
                            {getProjectStatusTranslation(task.project.status)}
                          </span>
                        )}
                      </div>
                      <div className={styles.relationMetaGrid}>
                        <span>ID {task.project.id}</span>
                        <span>{task.project.start_date ? formatDate(task.project.start_date) : 'Без даты начала'}</span>
                        <span>{task.project.end_date ? formatDate(task.project.end_date) : 'Без даты завершения'}</span>
                      </div>
                      {task.project.description && (
                        <p className={styles.relationCardText}>{task.project.description}</p>
                      )}
                    </Link>
                  ) : (
                    <div className={styles.emptyInline}>Проект не указан.</div>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Группа</h3>
                </div>
                <div className={styles.sectionBody}>
                  {task.group ? (
                    <Link to={`/admin/groups/${task.group.id}`} className={styles.relationCard}>
                      <div className={styles.relationCardHeader}>
                        <h4 className={styles.relationCardTitle}>{task.group.name}</h4>
                        <span className={styles.badge}>ID {task.group.id}</span>
                      </div>
                      {task.group.description && (
                        <p className={styles.relationCardText}>{task.group.description}</p>
                      )}
                      {task.group.users?.length > 0 && (
                        <div className={styles.relationMetaGrid}>
                          <span>Участников: {task.group.users.length}</span>
                        </div>
                      )}
                    </Link>
                  ) : (
                    <div className={styles.emptyInline}>Группа не указана.</div>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Исполнители</h3>
                </div>
                <div className={styles.sectionBody}>
                  {task.assignees?.length ? (
                    <div className={styles.cardGrid}>
                      {task.assignees.map((user) => (
                        <div key={user.id} className={styles.linkCard}>
                          <h4 className={styles.linkCardTitle}>{user.name || user.login}</h4>
                          <p className={styles.linkCardText}>{user.email}</p>
                          {user.is_blocked
                            ? <span className={styles.overdueBadge}>Заблокирован</span>
                            : <span className={`${styles.statusBadge} ${styles.status_done}`}>Активен</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.empty}>Исполнители не назначены.</div>
                  )}
                </div>
              </section>
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>История изменений</h3>
              </div>
              <div className={styles.tableWrap}>
                {history.length ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Пользователь</th>
                        <th>Действие</th>
                        <th>Было</th>
                        <th>Стало</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDate(entry.created_at)}</td>
                          <td className={styles.primaryCell}>{entry.user?.name || entry.user?.login || `ID ${entry.user_id}`}</td>
                          <td><span className={styles.badge}>{ACTION_LABELS[entry.action] || entry.action}</span></td>
                          <td>{renderHistoryValue(entry, entry.old_value)}</td>
                          <td>{renderHistoryValue(entry, entry.new_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.empty}>История изменений отсутствует.</div>
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
        title="Аварийное удаление задачи"
        message={`Удалить задачу "${task?.title}"?`}
        confirmText="Удалить задачу"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};