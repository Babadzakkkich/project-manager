import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FolderKanban,
  PhoneCall,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react';

import { conferencesAPI } from '../../services/api/conferences';
import { Button } from '../../components/ui/Button';
import { useNotification } from '../../hooks/useNotification';
import {
  CONFERENCE_ROOM_TYPES,
  CONFERENCE_ROOM_TYPE_TRANSLATIONS,
} from '../../utils/constants';
import {
  formatRelativeTime,
  formatRussianCount,
  handleApiError,
} from '../../utils/helpers';
import styles from './Conferences.module.css';

const PARTICIPANT_FORMS = ['участник', 'участника', 'участников'];
const ROOM_FORMS = ['созвон', 'созвона', 'созвонов'];

const ROOM_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'ended', label: 'Завершённые' },
];

const getRoomTypeConfig = (type) => {
  switch (type) {
    case CONFERENCE_ROOM_TYPES.PROJECT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Проект',
        Icon: FolderKanban,
      };

    case CONFERENCE_ROOM_TYPES.GROUP:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Группа',
        Icon: Users,
      };

    case CONFERENCE_ROOM_TYPES.TASK:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Задача',
        Icon: ClipboardList,
      };

    case CONFERENCE_ROOM_TYPES.INSTANT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Мгновенный',
        Icon: Zap,
      };

    default:
      return {
        label: 'Созвон',
        Icon: Video,
      };
  }
};

const getRoomContext = (room) => {
  if (room.project?.title) {
    return {
      label: 'Проект',
      value: room.project.title,
      Icon: FolderKanban,
    };
  }

  if (room.group?.name) {
    return {
      label: 'Группа',
      value: room.group.name,
      Icon: Users,
    };
  }

  if (room.task?.title) {
    return {
      label: 'Задача',
      value: room.task.title,
      Icon: ClipboardList,
    };
  }

  return null;
};

const getCreatorName = (creator) => {
  return creator?.name || creator?.login || creator?.email || 'Неизвестно';
};

const getRoomTime = (room) => {
  if (room.started_at) {
    return formatRelativeTime(room.started_at);
  }

  if (room.created_at) {
    return formatRelativeTime(room.created_at);
  }

  return '—';
};

export const Conferences = () => {
  const navigate = useNavigate();

  const { showError, showSuccess } = useNotification();

  const loadingRoomsRef = useRef(false);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeFilter, setActiveFilter] = useState('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    room_type: CONFERENCE_ROOM_TYPES.INSTANT,
  });

  const loadRooms = useCallback(async ({ initial = false, manual = false } = {}) => {
    if (loadingRoomsRef.current) return;

    loadingRoomsRef.current = true;

    try {
      if (initial) {
        setLoading(true);
      }

      if (manual) {
        setRefreshing(true);
      }

      const availableRooms = await conferencesAPI.getAvailableRooms();
      setRooms(Array.isArray(availableRooms) ? availableRooms : []);
    } catch (err) {
      console.error('Error loading conferences:', err);

      if (initial || manual) {
        showError(`Не удалось загрузить список созвонов: ${handleApiError(err)}`);
      }
    } finally {
      loadingRoomsRef.current = false;

      if (initial) {
        setLoading(false);
      }

      if (manual) {
        setRefreshing(false);
      }
    }
  }, [showError]);

  useEffect(() => {
    loadRooms({ initial: true });

    const intervalId = setInterval(() => {
      loadRooms();
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadRooms]);

  useEffect(() => {
    const handleFocus = () => {
      loadRooms();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadRooms]);

  const counters = useMemo(() => {
    const activeRooms = rooms.filter((room) => room.is_active).length;
    const endedRooms = rooms.filter((room) => !room.is_active).length;
    const participants = rooms.reduce(
      (total, room) => total + (room.participants_count || 0),
      0
    );

    return {
      total: rooms.length,
      active: activeRooms,
      ended: endedRooms,
      participants,
    };
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    if (activeFilter === 'active') {
      return rooms.filter((room) => room.is_active);
    }

    if (activeFilter === 'ended') {
      return rooms.filter((room) => !room.is_active);
    }

    return rooms;
  }, [rooms, activeFilter]);

  const filterCounts = {
    all: counters.total,
    active: counters.active,
    ended: counters.ended,
  };

  const handleRefresh = () => {
    loadRooms({ manual: true });
  };

  const handleCreateInstant = async (event) => {
    event?.preventDefault();

    const title = createForm.title.trim();

    if (!title) {
      showError('Введите название созвона');
      return;
    }

    setCreateLoading(true);

    try {
      const room = await conferencesAPI.createRoom({
        title,
        room_type: CONFERENCE_ROOM_TYPES.INSTANT,
        max_participants: 30,
      });

      setShowCreateModal(false);
      setCreateForm({
        title: '',
        room_type: CONFERENCE_ROOM_TYPES.INSTANT,
      });

      showSuccess('Созвон создан');
      navigate(`/conferences/${room.id}`);
    } catch (err) {
      console.error('Error creating conference:', err);
      showError(`Не удалось создать созвон: ${handleApiError(err)}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinRoom = (roomId) => {
    navigate(`/conferences/${roomId}`);
  };

  const handleCloseCreateModal = () => {
    if (createLoading) return;

    setShowCreateModal(false);
    setCreateForm({
      title: '',
      room_type: CONFERENCE_ROOM_TYPES.INSTANT,
    });
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      handleCloseCreateModal();
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка созвонов...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.toolbar}>
        <div className={styles.toolbarMain}>
          <div className={styles.pageMark}>
            <Radio size={17} strokeWidth={2} aria-hidden="true" />
            Созвоны
          </div>

          <div className={styles.filters}>
            {ROOM_FILTERS.map((filter) => {
              const count = filterCounts[filter.key] || 0;

              return (
                <button
                  key={filter.key}
                  type="button"
                  className={`${styles.filterButton} ${
                    activeFilter === filter.key ? styles.active : ''
                  }`}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  {filter.label}

                  {count > 0 && (
                    <span className={styles.filterCount}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.metaPill}>
            <Video size={15} strokeWidth={2} aria-hidden="true" />
            {formatRussianCount(counters.total, ROOM_FORMS)}
          </div>

          <div className={styles.metaPill}>
            <Users size={15} strokeWidth={2} aria-hidden="true" />
            {formatRussianCount(counters.participants, PARTICIPANT_FORMS)}
          </div>

          <Button
            variant="secondary"
            size="medium"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              strokeWidth={2}
              aria-hidden="true"
            />
            {refreshing ? 'Обновление...' : 'Обновить'}
          </Button>

          <Button
            variant="primary"
            size="medium"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Создать созвон
          </Button>
        </div>
      </section>

      {filteredRooms.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            {activeFilter === 'active' ? (
              <PhoneCall size={46} strokeWidth={1.8} aria-hidden="true" />
            ) : activeFilter === 'ended' ? (
              <CheckCircle2 size={46} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Search size={46} strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <h2>
            {activeFilter === 'active'
              ? 'Нет активных созвонов'
              : activeFilter === 'ended'
                ? 'Нет завершённых созвонов'
                : 'Созвоны не найдены'}
          </h2>

          <p>
            {activeFilter === 'active'
              ? 'Создайте мгновенный созвон или дождитесь, когда созвон начнётся в группе, проекте или задаче.'
              : 'Попробуйте выбрать другой фильтр или обновить список.'}
          </p>

          {activeFilter === 'active' && (
            <Button
              variant="primary"
              size="medium"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Создать созвон
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.roomsList}>
          {filteredRooms.map((room) => {
            const participantsCount = room.participants_count || 0;
            const roomType = getRoomTypeConfig(room.room_type);
            const context = getRoomContext(room);
            const RoomTypeIcon = roomType.Icon;
            const ContextIcon = context?.Icon;

            return (
              <article
                key={room.id}
                className={`${styles.roomCard} ${
                  room.is_active ? styles.activeRoom : styles.endedRoom
                }`}
              >
                <div className={styles.roomMain}>
                  <div className={styles.roomIcon}>
                    <RoomTypeIcon size={22} strokeWidth={2} aria-hidden="true" />
                  </div>

                  <div className={styles.roomText}>
                    <div className={styles.roomBadges}>
                      <span className={styles.roomType}>
                        {roomType.label}
                      </span>

                      <span
                        className={`${styles.statusBadge} ${
                          room.is_active ? styles.statusActive : styles.statusEnded
                        }`}
                      >
                        {room.is_active ? (
                          <Radio size={13} strokeWidth={2.2} aria-hidden="true" />
                        ) : (
                          <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" />
                        )}

                        {room.is_active ? 'Идёт' : 'Завершён'}
                      </span>
                    </div>

                    <h3 className={styles.roomTitle}>
                      {room.title}
                    </h3>

                    <div className={styles.roomMeta}>
                      <span>
                        Создатель: <strong>{getCreatorName(room.creator)}</strong>
                      </span>

                      <span>
                        <Users size={14} strokeWidth={2} aria-hidden="true" />
                        {participantsCount}/{room.max_participants || 30}
                      </span>

                      <span>
                        <Clock3 size={14} strokeWidth={2} aria-hidden="true" />
                        {getRoomTime(room)}
                      </span>
                    </div>

                    {context && (
                      <div className={styles.roomContext}>
                        <ContextIcon size={14} strokeWidth={2} aria-hidden="true" />
                        <span>{context.label}: {context.value}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.roomActions}>
                  {room.is_active ? (
                    <Button
                      variant="primary"
                      size="medium"
                      onClick={() => handleJoinRoom(room.id)}
                      className={styles.joinButton}
                    >
                      <PhoneCall size={16} strokeWidth={2} aria-hidden="true" />
                      Войти
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="medium"
                      disabled
                      className={styles.joinButton}
                    >
                      <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                      Завершён
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div
          className={styles.modalOverlay}
          onClick={handleOverlayClick}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-conference-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="create-conference-title">
                  Создать созвон
                </h2>
              </div>

              <button
                className={styles.closeButton}
                onClick={handleCloseCreateModal}
                type="button"
                disabled={createLoading}
                aria-label="Закрыть окно создания созвона"
              >
                <X size={20} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <form
              className={styles.modalContent}
              onSubmit={handleCreateInstant}
            >
              <div className={styles.formGroup}>
                <label htmlFor="conference-title">
                  Название созвона
                </label>

                <input
                  id="conference-title"
                  type="text"
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Например: Быстрое обсуждение задач"
                  className={styles.input}
                  disabled={createLoading}
                  autoFocus
                />
              </div>

              <div className={styles.modalHint}>
                <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
                Мгновенный созвон не привязывается к проекту, группе или задаче.
              </div>

              <div className={styles.modalActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCloseCreateModal}
                  disabled={createLoading}
                >
                  Отмена
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={createLoading}
                  disabled={!createForm.title.trim() || createLoading}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden="true" />
                  Создать
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};