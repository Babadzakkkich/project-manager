import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import { formatDateTime, handleApiError } from '../../../utils/helpers';
import {
  ADMIN_AUDIT_ACTION_TRANSLATIONS,
  ADMIN_TARGET_TYPE_TRANSLATIONS,
} from '../../../utils/constants';
import styles from './AdminAudit.module.css';

const ACTION_OPTIONS = [
  { value: '', label: 'Все действия' },
  ...Object.entries(ADMIN_AUDIT_ACTION_TRANSLATIONS).map(([value, label]) => ({ value, label })),
];

const TARGET_OPTIONS = [
  { value: '', label: 'Все объекты' },
  ...Object.entries(ADMIN_TARGET_TYPE_TRANSLATIONS).map(([value, label]) => ({ value, label })),
];

const getActionLabel = (action) => ADMIN_AUDIT_ACTION_TRANSLATIONS[action] || action;
const getTargetLabel = (targetType) => ADMIN_TARGET_TYPE_TRANSLATIONS[targetType] || targetType;

export const AdminAudit = () => {
  const [events, setEvents] = useState([]);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo(() => ({ action, target_type: targetType, limit }), [action, targetType, limit]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getAudit(params);
      setEvents(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const resetFilters = () => {
    setAction('');
    setTargetType('');
    setLimit(100);
  };

  return (
    <AdminLayout
      title="Журнал аудита"
      actions={
        <Button variant="secondary" onClick={loadAudit} disabled={loading}>
          <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          Обновить
        </Button>
      }
    >
      <div className={styles.pageGrid}>
        <aside className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Действие</label>
            <select value={action} onChange={(event) => setAction(event.target.value)} className={styles.select}>
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Объект</label>
            <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className={styles.select}>
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <Input
            label="Лимит"
            type="number"
            min="1"
            max="500"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />

          <Button variant="secondary" onClick={resetFilters} disabled={!action && !targetType && Number(limit) === 100}>
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>События</h3>
              <span>{events.length}</span>
            </div>

            {loading ? (
              <div className={styles.loading}>Загрузка...</div>
            ) : events.length === 0 ? (
              <div className={styles.empty}>События не найдены.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Администратор</th>
                      <th>Действие</th>
                      <th>Объект</th>
                      <th>ID</th>
                      <th>Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.created_at)}</td>
                        <td>
                          <div className={styles.actorCell}>
                            <div className={styles.actorAvatar}>
                              {(event.actor?.name || event.actor?.login || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <strong>{event.actor?.name || event.actor?.login || 'Неизвестно'}</strong>
                              {event.actor?.email && <span>{event.actor.email}</span>}
                            </div>
                          </div>
                        </td>
                        <td><span className={styles.actionBadge}>{getActionLabel(event.action)}</span></td>
                        <td>{getTargetLabel(event.target_type)}</td>
                        <td>{event.target_id || '-'}</td>
                        <td>
                          <pre className={styles.details}>{JSON.stringify(event.details || {}, null, 2)}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </AdminLayout>
  );
};