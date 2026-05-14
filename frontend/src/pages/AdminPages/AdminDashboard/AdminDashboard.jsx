import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { AdminLayout } from '../AdminLayout';
import { formatDateTime, formatNumber, handleApiError } from '../../../utils/helpers';
import { ADMIN_AUDIT_ACTION_TRANSLATIONS } from '../../../utils/constants';
import styles from './AdminDashboard.module.css';

const STAT_CARDS = [
  { key: 'users_total', label: 'Пользователи', to: '/admin/users' },
  { key: 'users_blocked', label: 'Заблокированы', to: '/admin/users' },
  { key: 'users_global_admins', label: 'Глобальные админы', to: '/admin/users' },
  { key: 'groups_total', label: 'Группы', to: '/admin/groups' },
  { key: 'projects_total', label: 'Проекты', to: '/admin/projects' },
  { key: 'tasks_total', label: 'Задачи', to: '/admin/tasks' },
  { key: 'tasks_overdue', label: 'Просрочены', to: '/admin/tasks' },
  { key: 'active_conferences_total', label: 'Активные созвоны', to: '/conferences' },
  { key: 'audit_events_total', label: 'События аудита', to: '/admin/audit' },
];

const getActionLabel = (action) => ADMIN_AUDIT_ACTION_TRANSLATIONS[action] || action;

export const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const [statsData, auditData] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getAudit({ limit: 6 }),
      ]);

      setStats(statsData);
      setAudit(auditData);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const criticalCounters = useMemo(() => {
    if (!stats) return [];

    return [
      stats.users_blocked > 0 && `${stats.users_blocked} заблокированных пользователей`,
      stats.tasks_overdue > 0 && `${stats.tasks_overdue} просроченных задач`,
    ].filter(Boolean);
  }, [stats]);

  return (
    <AdminLayout
      title="Сводка системы"
      actions={
        <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
          <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          Обновить
        </Button>
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : (
        <div className={styles.grid}>
          <section className={styles.statsGrid} aria-label="Статистика">
            {STAT_CARDS.map((card) => {
              const value = stats?.[card.key] ?? 0;

              return (
                <Link to={card.to} key={card.key} className={styles.statCard}>
                  <span className={styles.statValue}>{formatNumber(value)}</span>
                  <span className={styles.statLabel}>{card.label}</span>
                </Link>
              );
            })}
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Контроль</h3>
              </div>

              {criticalCounters.length > 0 ? (
                <div className={styles.alertList}>
                  {criticalCounters.map((item) => (
                    <div key={item} className={styles.alertItem}>{item}</div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyInline}>Критичных показателей нет</div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Последние действия</h3>
                <Link to="/admin/audit" className={styles.panelLink}>Все события</Link>
              </div>

              {audit.length === 0 ? (
                <div className={styles.emptyInline}>Событий пока нет</div>
              ) : (
                <div className={styles.auditList}>
                  {audit.map((event) => (
                    <article key={event.id} className={styles.auditItem}>
                      <h4>{getActionLabel(event.action)}</h4>
                      <p>
                        {event.actor?.name || event.actor?.login || 'Администратор'} · {formatDateTime(event.created_at)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
};
