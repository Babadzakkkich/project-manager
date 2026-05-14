import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck, UnlockKeyhole, UserCog } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import {
  formatDate,
  formatNumber,
  getSystemRoleTranslation,
  handleApiError,
} from '../../../utils/helpers';
import { useAuthContext } from '../../../contexts/AuthContext';
import styles from './AdminUsers.module.css';

const FILTERS = [
  { value: '', label: 'Все пользователи' },
  { value: 'active', label: 'Активные' },
  { value: 'blocked', label: 'Заблокированные' },
  { value: 'global_admin', label: 'Глобальные администраторы' },
];

export const AdminUsers = () => {
  const { user: currentUser, checkAuth } = useAuthContext();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const requestParams = useMemo(() => {
    const params = { q: search.trim() };

    if (filter === 'active') params.blocked = false;
    if (filter === 'blocked') params.blocked = true;
    if (filter === 'global_admin') params.global_admin = true;

    return params;
  }, [search, filter]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getUsers(requestParams);
      setUsers(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [requestParams]);

  useEffect(() => {
    const timeout = setTimeout(loadUsers, 250);
    return () => clearTimeout(timeout);
  }, [loadUsers]);

  const resetFilters = () => {
    setSearch('');
    setFilter('');
  };

  const closeModal = () => setModal(null);

  const handleBlock = async () => {
    if (!modal?.user) return;
    setActionLoading(true);

    try {
      await adminAPI.blockUser(modal.user.id, 'Блокировка глобальным администратором');
      await loadUsers();
      closeModal();
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!modal?.user) return;
    setActionLoading(true);

    try {
      await adminAPI.unblockUser(modal.user.id);
      await loadUsers();
      closeModal();
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  const handleMakeGlobalAdmin = async () => {
    if (!modal?.user) return;
    setActionLoading(true);

    try {
      await adminAPI.makeGlobalAdmin(modal.user.id);
      await Promise.all([loadUsers(), checkAuth()]);
      closeModal();
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  const getModalConfig = () => {
    if (!modal) return null;

    if (modal.type === 'block') {
      return {
        title: 'Блокировка пользователя',
        message: `Заблокировать пользователя "${modal.user.name || modal.user.login}"?`,
        confirmText: 'Заблокировать',
        variant: 'danger',
        onConfirm: handleBlock,
      };
    }

    if (modal.type === 'unblock') {
      return {
        title: 'Разблокировка пользователя',
        message: `Разблокировать пользователя "${modal.user.name || modal.user.login}"?`,
        confirmText: 'Разблокировать',
        variant: 'success',
        onConfirm: handleUnblock,
      };
    }

    return {
      title: 'Назначение глобального администратора',
      message: `Назначить пользователя "${modal.user.name || modal.user.login}" глобальным администратором?`,
      confirmText: 'Назначить',
      variant: 'warning',
      onConfirm: handleMakeGlobalAdmin,
    };
  };

  const modalConfig = getModalConfig();

  return (
    <AdminLayout
      title="Пользователи системы"
      actions={
        <Button variant="secondary" onClick={loadUsers} disabled={loading}>
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
            placeholder="Логин, имя или email"
          />

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Фильтр</label>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={styles.select}
            >
              {FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <Button variant="secondary" onClick={resetFilters} disabled={!search && !filter}>
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Пользователи</h3>
              <span>{formatNumber(users.length)}</span>
            </div>

            {loading ? (
              <div className={styles.loading}>Загрузка...</div>
            ) : users.length === 0 ? (
              <div className={styles.empty}>Пользователи не найдены.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Роль</th>
                      <th>Статус</th>
                      <th>Создан</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => {
                      const isCurrentUser = item.id === currentUser?.id;
                      const isGlobal = item.system_role === 'global_admin';

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className={styles.userCell}>
                              <div className={styles.avatar}>
                                {(item.name || item.login || '?').slice(0, 1).toUpperCase()}
                              </div>
                              <div className={styles.userText}>
                                <strong>{item.name || item.login}</strong>
                                <span>@{item.login} · {item.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.roleBadge} ${isGlobal ? styles.globalRole : ''}`}>
                              {isGlobal && <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />}
                              {getSystemRoleTranslation(item.system_role)}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.statusBadge} ${item.is_blocked ? styles.blocked : styles.active}`}>
                              {item.is_blocked ? 'Заблокирован' : 'Активен'}
                            </span>
                          </td>
                          <td>{formatDate(item.created_at)}</td>
                          <td>
                            <div className={styles.actionsCell}>
                              {!isGlobal && !isCurrentUser && !item.is_blocked && (
                                <Button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => setModal({ type: 'block', user: item })}
                                >
                                  <LockKeyhole size={14} strokeWidth={2} aria-hidden="true" />
                                  Блокировать
                                </Button>
                              )}

                              {!isGlobal && item.is_blocked && (
                                <Button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => setModal({ type: 'unblock', user: item })}
                                >
                                  <UnlockKeyhole size={14} strokeWidth={2} aria-hidden="true" />
                                  Разблокировать
                                </Button>
                              )}

                              {!isGlobal && (
                                <Button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => setModal({ type: 'makeGlobalAdmin', user: item })}
                                >
                                  <UserCog size={14} strokeWidth={2} aria-hidden="true" />
                                  Назначить админом
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      <ConfirmationModal
        isOpen={Boolean(modalConfig)}
        onClose={closeModal}
        onConfirm={modalConfig?.onConfirm}
        title={modalConfig?.title}
        message={modalConfig?.message}
        confirmText={modalConfig?.confirmText}
        cancelText="Отмена"
        variant={modalConfig?.variant}
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};