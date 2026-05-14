import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import { formatDate, formatNumber, handleApiError } from '../../../utils/helpers';
import styles from './AdminGroups.module.css';

export const AdminGroups = () => {
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupToDelete, setGroupToDelete] = useState(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getGroups({ q: search.trim() });
      setGroups(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(loadGroups, 250);
    return () => clearTimeout(timeout);
  }, [loadGroups]);

  const resetFilters = () => setSearch('');

  const handleDelete = async () => {
    if (!groupToDelete) return;
    setActionLoading(true);

    try {
      await adminAPI.deleteGroup(groupToDelete.id);
      await loadGroups();
      setGroupToDelete(null);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Группы системы"
      actions={
        <Button variant="secondary" onClick={loadGroups} disabled={loading}>
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
          <Button variant="secondary" onClick={resetFilters} disabled={!search}>
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.listHeader}>
            <h3>Группы</h3>
            <span>{formatNumber(groups.length)}</span>
          </div>

          {loading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : groups.length === 0 ? (
            <div className={styles.empty}>Группы не найдены.</div>
          ) : (
            <div className={styles.grid}>
              {groups.map((group) => (
                <article key={group.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3>{group.name}</h3>
                    <p>{group.description || 'Описание не указано'}</p>
                  </div>

                  <div className={styles.metaGrid}>
                    <div><span>Участники</span><strong>{formatNumber(group.users_count)}</strong></div>
                    <div><span>Проекты</span><strong>{formatNumber(group.projects_count)}</strong></div>
                    <div><span>Задачи</span><strong>{formatNumber(group.tasks_count)}</strong></div>
                    <div><span>Создана</span><strong>{formatDate(group.created_at)}</strong></div>
                  </div>

                  <div className={styles.block}>
                    <span>Администраторы</span>
                    {group.admins?.length ? (
                      <div className={styles.badgeList}>
                        {group.admins.map((admin) => (
                          <span key={admin.id} className={styles.badge}>{admin.name || admin.login}</span>
                        ))}
                      </div>
                    ) : (
                      <p>Не найдены</p>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <Button variant="secondary" size="small" to={`/admin/groups/${group.id}`}>
                      Открыть
                    </Button>
                    <Button variant="danger" size="small" onClick={() => setGroupToDelete(group)}>
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
        isOpen={Boolean(groupToDelete)}
        onClose={() => setGroupToDelete(null)}
        onConfirm={handleDelete}
        title="Аварийное удаление группы"
        message={`Удалить группу "${groupToDelete?.name}"?`}
        confirmText="Удалить группу"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};