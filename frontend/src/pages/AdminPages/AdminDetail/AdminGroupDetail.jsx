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
  const normalized = normalizeTokenKey(status, 'backlog');
  return styles[`status_${normalized}`] || styles.status_backlog;
};
const getPriorityClass = (priority) => {
  const normalized = normalizeTokenKey(priority, 'medium');
  return styles[`priority_${normalized}`] || styles.priority_medium;
};

export const AdminGroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const loadGroup = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getGroupById(groupId);
      setGroup(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const handleDelete = async () => {
    if (!group) return;
    setActionLoading(true);
    setError('');

    try {
      await adminAPI.deleteGroup(group.id);
      navigate('/admin/groups', { replace: true });
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setActionLoading(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <AdminLayout
      title={group?.name || 'Просмотр группы'}
      actions={
        <div className={styles.toolbarActions}>
          <Button variant="secondary" to="/admin/groups">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            К группам
          </Button>
          <Button variant="secondary" onClick={loadGroup} disabled={loading}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
            Обновить
          </Button>
        </div>
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : !group ? (
        <div className={styles.empty}>Группа не найдена.</div>
      ) : (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>{group.name}</h3>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                Удалить
              </Button>
            </div>
            <div className={styles.panelBody}>
              <p className={styles.description}>{group.description || 'Описание группы не указано.'}</p>
              <div className={styles.grid} style={{ marginTop: 'var(--space-5)' }}>
                <div className={styles.metaCard}><span>Участники</span><strong>{formatNumber(group.users_count)}</strong></div>
                <div className={styles.metaCard}><span>Проекты</span><strong>{formatNumber(group.projects_count)}</strong></div>
                <div className={styles.metaCard}><span>Задачи</span><strong>{formatNumber(group.tasks_count)}</strong></div>
                <div className={styles.metaCard}><span>Создана</span><strong>{formatDate(group.created_at)}</strong></div>
              </div>
            </div>
          </section>

          <div className={styles.detailGrid}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Участники</h3>
              </div>
              <div className={styles.tableWrap}>
                {group.users?.length ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Пользователь</th>
                        <th>Email</th>
                        <th>Роль</th>
                        <th>Статус</th>
                        <th>Вступил</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.users.map((user) => (
                        <tr key={user.id}>
                          <td className={styles.primaryCell}>{user.name || user.login}</td>
                          <td>{user.email}</td>
                          <td><span className={styles.badge}>{user.role === 'admin' ? 'Администратор' : 'Участник'}</span></td>
                          <td>{user.is_blocked ? <span className={styles.overdueBadge}>Заблокирован</span> : <span className={`${styles.statusBadge} ${styles.status_done}`}>Активен</span>}</td>
                          <td>{formatDate(user.joined_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.empty}>Участников нет.</div>
                )}
              </div>
            </section>

            <div className={styles.stack}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Проекты</h3>
                </div>
                <div className={styles.sectionBody}>
                  {group.projects?.length ? (
                    <div className={styles.cardGrid}>
                      {group.projects.map((project) => (
                        <Link key={project.id} to={`/admin/projects/${project.id}`} className={styles.linkCard}>
                          <h4 className={styles.linkCardTitle}>{project.title}</h4>
                          <span className={`${styles.statusBadge} ${getStatusClass(project.status)}`}>
                            {getProjectStatusTranslation(project.status)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.empty}>Проектов нет.</div>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Задачи</h3>
                </div>
                <div className={styles.sectionBody}>
                  {group.tasks?.length ? (
                    <div className={styles.cardGrid}>
                      {group.tasks.map((task) => (
                        <Link key={task.id} to={`/admin/tasks/${task.id}`} className={styles.linkCard}>
                          <h4 className={styles.linkCardTitle}>{task.title}</h4>
                          <div className={styles.badges}>
                            <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>{getTaskStatusTranslation(task.status)}</span>
                            <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>{TASK_PRIORITY_TRANSLATIONS[task.priority] || task.priority}</span>
                            {task.is_overdue && <span className={styles.overdueBadge}>Просрочена</span>}
                          </div>
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
        </div>
      )}

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Аварийное удаление группы"
        message={`Удалить группу "${group?.name}"?`}
        confirmText="Удалить группу"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};
