import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { Input } from '../../../components/ui/Input';
import { AdminLayout } from '../AdminLayout';
import { formatDate, formatNumber, handleApiError } from '../../../utils/helpers';
import {
  CONFERENCE_ROOM_TYPE_TRANSLATIONS,
  CONFERENCE_ROOM_TYPES,
} from '../../../utils/constants';
import styles from './AdminConferences.module.css';

const ROOM_TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: CONFERENCE_ROOM_TYPES.GROUP, label: CONFERENCE_ROOM_TYPE_TRANSLATIONS.group },
  { value: CONFERENCE_ROOM_TYPES.PROJECT, label: CONFERENCE_ROOM_TYPE_TRANSLATIONS.project },
  { value: CONFERENCE_ROOM_TYPES.TASK, label: CONFERENCE_ROOM_TYPE_TRANSLATIONS.task },
  { value: CONFERENCE_ROOM_TYPES.INSTANT, label: CONFERENCE_ROOM_TYPE_TRANSLATIONS.instant },
];

const ACTIVE_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'true', label: 'Активные' },
  { value: 'false', label: 'Завершённые' },
];

const getRoomTypeLabel = (type) => CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || type || 'Не указан';

const getRelatedObject = (room) => {
  if (room.task) {
    return { label: 'Задача', value: room.task.title, to: `/admin/tasks/${room.task.id}` };
  }

  if (room.project) {
    return { label: 'Проект', value: room.project.title, to: `/admin/projects/${room.project.id}` };
  }

  if (room.group) {
    return { label: 'Группа', value: room.group.name, to: `/admin/groups/${room.group.id}` };
  }

  return { label: 'Связь', value: 'Не указана', to: null };
};

const buildActiveParam = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminConferences = () => {
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState('');
  const [roomType, setRoomType] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [roomToEnd, setRoomToEnd] = useState(null);

  const queryParams = useMemo(() => ({
    q: search.trim(),
    room_type: roomType,
    active: buildActiveParam(activeFilter),
  }), [activeFilter, roomType, search]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getConferences(queryParams);
      setRooms(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    const timeout = setTimeout(loadRooms, 250);
    return () => clearTimeout(timeout);
  }, [loadRooms]);

  const resetFilters = () => {
    setSearch('');
    setRoomType('');
    setActiveFilter('');
  };

  const handleForceEnd = async () => {
    if (!roomToEnd) return;
    setActionLoading(true);
    setError('');

    try {
      await adminAPI.forceEndConference(roomToEnd.id);
      await loadRooms();
      showAdminToast('Созвон завершён');
      setRoomToEnd(null);
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось завершить созвон: ${message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Созвоны системы"
      actions={
        <Button variant="secondary" onClick={loadRooms} disabled={loading}>
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
            placeholder="Название или room name"
          />

          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>Тип</span>
            <select
              className={styles.select}
              value={roomType}
              onChange={(event) => setRoomType(event.target.value)}
            >
              {ROOM_TYPE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>Статус</span>
            <select
              className={styles.select}
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
            >
              {ACTIVE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <Button
            variant="secondary"
            onClick={resetFilters}
            disabled={!search && !roomType && !activeFilter}
          >
            Сбросить
          </Button>
        </aside>

        <main className={styles.content}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.listHeader}>
            <h3>Созвоны</h3>
            <span>{formatNumber(rooms.length)}</span>
          </div>

          {loading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : rooms.length === 0 ? (
            <div className={styles.empty}>Созвоны не найдены.</div>
          ) : (
            <div className={styles.grid}>
              {rooms.map((room) => {
                const related = getRelatedObject(room);

                return (
                  <article key={room.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <h3>{room.title}</h3>
                      <p>{room.room_name}</p>
                    </div>

                    <div className={styles.badgesRow}>
                      <span className={`${styles.statusBadge} ${room.is_active ? styles.statusActive : styles.statusInactive}`}>
                        {room.is_active ? 'Активен' : 'Завершён'}
                      </span>
                      <span className={styles.typeBadge}>{getRoomTypeLabel(room.room_type)}</span>
                    </div>

                    <div className={styles.metaGrid}>
                      <div><span>{related.label}</span><strong>{related.value}</strong></div>
                      <div><span>Создатель</span><strong>{room.creator?.name || room.creator?.login || `ID ${room.created_by}`}</strong></div>
                      <div><span>Участники сейчас</span><strong>{formatNumber(room.active_participants_count)}</strong></div>
                      <div><span>Всего участников</span><strong>{formatNumber(room.participants_count)}</strong></div>
                      <div><span>Начало</span><strong>{formatDate(room.started_at)}</strong></div>
                      <div><span>Завершение</span><strong>{formatDate(room.ended_at)}</strong></div>
                    </div>

                    <div className={styles.cardFooter}>
                      <Button variant="secondary" size="small" to={`/admin/conferences/${room.id}`}>
                        Открыть
                      </Button>
                      {room.is_active && (
                        <Button variant="danger" size="small" onClick={() => setRoomToEnd(room)}>
                          <Square size={14} strokeWidth={2} aria-hidden="true" />
                          Завершить
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <ConfirmationModal
        isOpen={Boolean(roomToEnd)}
        onClose={() => setRoomToEnd(null)}
        onConfirm={handleForceEnd}
        title="Завершение созвона"
        message={`Принудительно завершить созвон "${roomToEnd?.title}"?`}
        confirmText="Завершить созвон"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};